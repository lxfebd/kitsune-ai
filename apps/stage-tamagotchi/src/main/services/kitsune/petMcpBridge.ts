/**
 * 桌宠桥 — 主进程侧（内部编排层）
 *
 * ── 职责边界 ──
 * 本文件是「外部接入层」与「内部编排层（overseer）」之间的桥：
 *   - 在主进程起一个仅监听 127.0.0.1 的 HTTP server（独立端口，不经 channel-server WS 6121）
 *   - POST /pet-reaction    — 接收 MCP 子进程 POST 过来的监工契约 → overseer.triggerPetReaction
 *   - GET  /overseer/events — SSE 事件流：浏览器 view（无 Electron IPC 桥）订阅监工事件
 *   - GET  /overseer/stats  — 统计快照（JSON）
 *   - GET  /overseer/status — 状态快照（JSON）
 *
 * 仅绑定 localhost，拒绝外部网络流量；不做鉴权（127.0.0.1 本地回环 + 白名单在 overseer 侧复用）。
 */

import { type Server as HttpServer, createServer } from 'node:http'
import { useLogg } from '@guiiai/logg'

import type { OverseerEvent, OverseerStats, OverseerStatus } from '../../../shared/eventa'

import { petReactionResultSchema } from './petContract'

export interface PetMcpBridge {
  start: () => void
  stop: () => void
  port: number
}

interface BridgeEventEntry {
  event: OverseerEvent
  pushed: boolean
}

/**
 * @param onReaction 收到 MCP 子进程转发来的契约后回调（由 overseer 注入 triggerPetReaction）
 * @param getStats 统计快照（浏览器 SSE 端点用）
 * @param getStatus 状态快照（浏览器 SSE 端点用）
 * @param onEvent 订阅监工事件流（浏览器 SSE 端点用），返回退订函数
 * @param port 监听端口，默认 6122（独立于内部 WS 6121）
 */
export function createPetMcpBridge(params: {
  onReaction: (contract: unknown) => Promise<{ status: 'queued' | 'filtered', reason?: string }>,
  /** 新增 MCP 上报通道：收到 pet_report 上报后回调（overseer 侧节流+映射） */
  onPetReport?: (report: unknown) => Promise<{ status: 'queued' | 'filtered', reason?: string }>,
  getStats?: () => OverseerStats,
  getStatus?: () => OverseerStatus,
  onEvent?: (handler: (entry: BridgeEventEntry) => void) => () => void,
  port?: number,
}): PetMcpBridge {
  const log = useLogg('main/pet-mcp-bridge').useGlobalConfig()
  const port = params.port ?? 6122
  let server: HttpServer | null = null

  // SSE 客户端连接表：仅浏览器事件流用
  const sseClients = new Set<import('node:http').ServerResponse>()

  const unsubscribe = params.onEvent?.((entry) => {
    const line = `data: ${JSON.stringify({ event: entry.event, pushed: entry.pushed })}\n\n`
    for (const res of sseClients) {
      try {
        res.write(line)
      }
      catch {
        sseClients.delete(res)
      }
    }
  })

  const writeJson = (res: import('node:http').ServerResponse, statusCode: number, body: unknown) => {
    res.setHeader('Content-Type', 'application/json')
    res.statusCode = statusCode
    res.end(JSON.stringify(body))
  }

  const start = () => {
    if (server) return
    server = createServer((req, res) => {
      const url = req.url ?? ''

      // GET /overseer/events — SSE 事件流
      if (req.method === 'GET' && url === '/overseer/events') {
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.flushHeaders()
        sseClients.add(res)
        req.on('close', () => sseClients.delete(res))
        return
      }

      // GET /overseer/stats — 统计快照
      if (req.method === 'GET' && url === '/overseer/stats') {
        res.setHeader('Access-Control-Allow-Origin', '*')
        if (!params.getStats) {
          writeJson(res, 404, { error: 'stats unavailable' })
          return
        }
        writeJson(res, 200, params.getStats())
        return
      }

      // GET /overseer/status — 状态快照
      if (req.method === 'GET' && url === '/overseer/status') {
        res.setHeader('Access-Control-Allow-Origin', '*')
        if (!params.getStatus) {
          writeJson(res, 404, { error: 'status unavailable' })
          return
        }
        writeJson(res, 200, params.getStatus())
        return
      }

      // POST /pet-report — MCP 活动上报契约（pet_report 工具 / stdio 子进程转发）
      if (req.method === 'POST' && url === '/pet-report') {
        const onPetReport = params.onPetReport
        if (!onPetReport) {
          writeJson(res, 404, { error: 'pet-report unavailable' })
          return
        }
        let body = ''
        req.on('data', (chunk) => {
          body += chunk
        })
        req.on('end', async () => {
          let result
          try {
            const report = body ? JSON.parse(body) : undefined
            result = await onPetReport(report)
          }
          catch {
            result = { status: 'filtered' as const, reason: 'invalid-payload' as const }
          }
          const payload = petReactionResultSchema.parse(result)
          writeJson(res, 200, payload)
        })
        return
      }

      // POST /pet-reaction — MCP 子进程契约（保持原协议）
      if (req.method !== 'POST' || url !== '/pet-reaction') {
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
        writeJson(res, 200, payload)
      })
    })

    // 仅绑定 localhost，拒绝外部网络流量
    server.listen(port, '127.0.0.1', () => {
      log.log(`pet-mcp-bridge: listening on 127.0.0.1:${port}`)
    })
  }

  const stop = () => {
    if (server) {
      for (const res of sseClients)
        res.end()
      sseClients.clear()
      unsubscribe?.()
      server.close()
      server = null
    }
  }

  return { start, stop, port }
}
