/**
 * 桌宠 MCP 桥 — 主进程侧（内部编排层）
 *
 * ── 职责边界 ──
 * 本文件是「外部接入层（MCP Server 子进程）」与「内部编排层（overseer）」之间的桥：
 *   - 在主进程起一个仅监听 127.0.0.1 的 HTTP server（独立端口，不经 channel-server WS 6121）
 *   - 接收 MCP 子进程 POST 过来的监工契约
 *   - 交给 overseer.triggerPetReaction 完成 校验 → 限流 → 人格化点评 → 演出
 *
 * 外部走 MCP（stdio，宿主决定启停），内部走 overseer，两者在此桥接。
 * 不污染 6121 内部 IPC，不开无鉴权宽端口（仅 localhost + 来源白名单由 overseer 侧 PushFilter 复用）。
 */

import { type Server as HttpServer, createServer } from 'node:http'
import { useLogg } from '@guiiai/logg'

import { petReactionResultSchema } from './petContract'

export interface PetMcpBridge {
  start: () => void
  stop: () => void
  port: number
}

/**
 * @param onReaction 收到 MCP 子进程转发来的契约后回调（由 overseer 注入 triggerPetReaction）
 * @param port 监听端口，默认 6122（独立于内部 WS 6121）
 */
export function createPetMcpBridge(params: {
  onReaction: (contract: unknown) => Promise<{ status: 'queued' | 'filtered', reason?: string }>,
  port?: number,
}): PetMcpBridge {
  const log = useLogg('main/pet-mcp-bridge').useGlobalConfig()
  const port = params.port ?? 6122
  let server: HttpServer | null = null

  const start = () => {
    if (server) return
    server = createServer(async (req, res) => {
      // 仅接受 POST /pet-reaction，且仅 127.0.0.1（createServer 默认绑定地址由 listen 决定）
      if (req.method !== 'POST' || req.url !== '/pet-reaction') {
        res.statusCode = 404
        res.end()
        return
      }

      let body = ''
      req.on('data', (chunk) => {
        body += chunk
      })
      req.on('end', async () => {
        let result
        try {
          const contract = body ? JSON.parse(body) : undefined
          result = await params.onReaction(contract)
        }
        catch {
          result = { status: 'filtered' as const, reason: 'invalid-payload' as const }
        }
        const payload = petReactionResultSchema.parse(result)
        res.setHeader('Content-Type', 'application/json')
        res.statusCode = 200
        res.end(JSON.stringify(payload))
      })
    })

    // 仅绑定 localhost，拒绝外部网络流量
    server.listen(port, '127.0.0.1', () => {
      log.log(`pet-mcp-bridge: listening on 127.0.0.1:${port}`)
    })
  }

  const stop = () => {
    if (server) {
      server.close()
      server = null
    }
  }

  return { start, stop, port }
}
