/**
 * 桌宠 MCP Server — 主进程内嵌 HTTP 版
 *
 * ── 职责边界 ──
 * 与 petMcpServerChild（stdio 子进程）并列的第二接入方式：
 *   - petMcpServerChild：宿主 spawn 子进程，走 stdio（Claude Desktop/Cursor/Trae 老版本适用）
 *   - 本文件：主进程内嵌 node:http server，走 Streamable HTTP（Claude Code 等支持
 *     URL 直连的 agent 配置里写一个 localhost URL 即可，换机零路径依赖）
 *
 * 地址 http://127.0.0.1:6123/mcp（PORT 可由 PET_MCP_PORT 覆盖），仅绑 localhost。
 * 不依赖任何本机 agent 安装路径 —— 这是「换台电脑开发环境不一样」不再 GG 的核心。
 *
 * ── 工具集 ──
 *   pet_report       活动型上报（thinking/executing/completed/error…），高频，自动节流
 *   triggerReaction  事件型闲聊（celebrate/critique/warn/…），低频桌宠开口
 * 两个工具都走进程内回调直达 overseer（unlike stdio 版需要 HTTP 转发到 petMcpBridge），
 * 因此不重复校验/不限流 —— 业务校验都在 overseer 侧单一入口完成。
 *
 * ── 多会话 ──
 * StreamableHTTPServerTransport 单实例是单 session 的：stateful 模式下第二次
 * initialize 会被 400 拒。所以每个会话（GET 建立 SSE）新建一对 transport+Server，
 * 工具 handler 用共享闭包（onPetReport / onPetReaction 为同一份回调），
 * 状态天然汇聚到同一条监听管线。会话数极低（单用户 1-2 个 agent 同时在线）。
 */

import { createServer } from 'node:http'
import type { Server as HttpServer, IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { useLogg } from '@guiiai/logg'

import {
  petReactionContractSchema,
  petReactionResultSchema,
  petReportContractSchema,
  TYPE_SELECTION_GUIDE,
} from './petContract'
import type { PetReactionResult } from './petContract'

const DEFAULT_PORT = 6123

export interface PetMcpHttpServer {
  start: () => Promise<void>
  stop: () => Promise<void>
  port: number
}

interface Session {
  transport: StreamableHTTPServerTransport
  close: () => Promise<void>
}

/**
 * @param onPetReport 收到 pet_report 上报后回调（overseer 侧负责节流 + 映射 + 入事件流）
 * @param onPetReaction 收到 triggerReaction 后回调（overseer 侧 triggerPetReaction：校验/白名单/限流/演出）
 * @param port 监听端口，默认 6123（PET_MCP_PORT 环境变量可覆盖）
 */
export function createPetMcpHttpServer(params: {
  onPetReport: (report: unknown) => Promise<PetReactionResult>
  onPetReaction: (contract: unknown) => Promise<PetReactionResult>
  port?: number
}): PetMcpHttpServer {
  const log = useLogg('main/pet-mcp-http-server').useGlobalConfig()
  const port = Number(process.env.PET_MCP_PORT ?? params.port ?? DEFAULT_PORT)
  let server: HttpServer | null = null

  // 活跃会话：sessionId → { transport, close }
  const sessions = new Map<string, Session>()

  // ── 工具 handler（共享闭包，所有会话共用同一份回调） ──

  const toolDescription = `
pet_report：让监工知道此刻正在做什么。高频信号（每次思考/工具调用/完成/失败都可调），
            桌宠据此更新状态但不会每次开口说话。
triggerReaction：有意义的时刻让桌宠对人开口（构建通过/PR 合并/发现问题/卡住求助）。
            低频。不要每次文件保存都调。

${TYPE_SELECTION_GUIDE}`

  /**
   * 派生工具 inputSchema。petReportContractSchema 是普通 z.object → 顶层已有 type:'object'；
   * petReactionContractSchema 是被 z.discriminatedUnion 包住的 6 型契约 → toJSONSchema()
   * 输出 { $schema, oneOf } 没有顶层 type。而 SDK 的 ListToolsResultSchema 强制
   * inputSchema.type === 'object'（类型上 z.literal('object')），缺了 listTools 直接校验不过。
   * 这里统一补一个顶层 type:'object'（JSON Schema 2020-12 允许 type 与 oneOf 并列，语义不变）。
   */
  function asToolInputSchema(schema: { toJSONSchema(): unknown }): Record<string, unknown> {
    const json = schema.toJSONSchema() as Record<string, unknown>
    if (json.type === 'object') return json
    return { ...json, type: 'object' }
  }

  const inputSchemas = {
    petReport: asToolInputSchema(petReportContractSchema),
    triggerReaction: asToolInputSchema(petReactionContractSchema),
  }

  function createSessionServer() {
    const sessionServer = new Server(
      { name: 'proj-kitsune:pet-http', version: '0.1.0' },
      { capabilities: { tools: {} } },
    )

    sessionServer.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'pet_report',
          description: '上报当前活动状态（thinking/executing/completed/error…）给桌宠监工。',
          inputSchema: inputSchemas.petReport,
        },
        {
          name: 'triggerReaction',
          description: toolDescription,
          inputSchema: inputSchemas.triggerReaction,
        },
      ],
    }))

    sessionServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      if (name === 'pet_report') {
        const parsed = petReportContractSchema.safeParse(args ?? {})
        if (!parsed.success) {
          return callError(petReactionResultSchema.parse({ status: 'filtered', reason: 'invalid-payload' }))
        }
        const result = await params.onPetReport(parsed.data)
        return callOk(result)
      }

      if (name === 'triggerReaction') {
        const parsed = petReactionContractSchema.safeParse(args ?? {})
        if (!parsed.success) {
          return callError(petReactionResultSchema.parse({ status: 'filtered', reason: 'invalid-payload' }))
        }
        const result = await params.onPetReaction(parsed.data)
        return callOk(result)
      }

      return callError({ status: 'filtered', reason: 'invalid-payload', error: `unknown tool: ${name}` })
    })

    return sessionServer
  }

  // ── HTTP 请求处理 ──

  /**
   * 新建一个 transport + Server 对，并（在 initialize 处理的同时）注册进 sessions。
   *
   * sessionId 只在 transport 收到 initialize 消息时才生成，且生成后 SDK 立即同步回调
   * onsessioninitialized —— 因此用构造回调注册，而不是在 await transport.handleRequest()
   * 之后读 sessionId：后者对 SSE 流式响应（GET 建流 / initialize 流式返回）永不 resolve，
   * 注册永远执行不到，后续带 Mcp-Session-Id 的请求会路由到未初始化 transport → 400。
   */
  function newSessionTransport(): {
    transport: StreamableHTTPServerTransport
    sessionServer: ReturnType<typeof createSessionServer>
  } {
    const sessionServer = createSessionServer()
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        sessions.set(sid, {
          transport,
          close: async () => {
            try { await transport.close() } catch { /* 忽略关闭错误 */ }
            try { await sessionServer.close() } catch { /* 忽略关闭错误 */ }
          },
        })
        transport.onclose = () => sessions.delete(sid)
      },
    })
    return { transport, sessionServer }
  }

  const handleRequest = async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? ''
    if (url !== '/mcp') {
      res.statusCode = 404
      res.end()
      return
    }

    // 已有会话续传：按 Mcp-Session-Id 路由到已建 transport（GET=resume SSE，POST=发消息）
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    const session = sessionId ? sessions.get(sessionId) : undefined
    if (session) {
      await session.transport.handleRequest(req, res)
      return
    }

    // 新会话（GET 建 SSE 流 / POST 首连 initialize）：一次性 transport。
    // 不 await —— SSE 流式响应的 handleRequest 在流关闭前不会 resolve，SDK 内部
    // 在收到 initialize 时已同步注册 session（onsessioninitialized），无需等返回。
    const { transport, sessionServer } = newSessionTransport()
    await sessionServer.connect(transport)
    void transport.handleRequest(req, res).catch((err) => {
      log.error('[pet-mcp-http] transport.handleRequest 失败:', err instanceof Error ? err.message : String(err))
    })
  }

  const start = async () => {
    if (server) return

    // 幂等：若端口被占用（上次未释放干净）或 listen 失败,抛错让上层知道
    await new Promise<void>((resolve, reject) => {
      server = createServer(async (req, res) => {
        // 注意：不要在请求到达时监听 req('data')/消费 body —— StreamableHTTPServerTransport
        // 内部经 @hono/node-server 会把 IncomingMessage 转成 Web Request 并读取 body，
        // 提前 attach data 监听会把流置为 flowing 模式导致 body 丢失（-32700 Invalid JSON）。
        // 请求体大小由契约字段 z.string().max() 与 transport 内部解析兜底。
        try {
          await handleRequest(req, res)
        }
        catch (err) {
          log.error('[pet-mcp-http] 请求处理失败:', err instanceof Error ? err.message : String(err))
          if (!res.writableEnded) {
            res.statusCode = 500
            res.end()
          }
        }
      })

      server.once('error', (err: Error) => reject(err))
      server.listen(port, '127.0.0.1', () => {
        log.log(`pet-mcp-http: listening on http://127.0.0.1:${port}/mcp`)
        resolve()
      })
    })
  }

  const stop = async () => {
    if (!server) return
    for (const session of sessions.values()) {
      await session.close()
    }
    sessions.clear()
    await new Promise<void>((resolve, reject) => {
      server!.close((err) => (err ? reject(err) : resolve()))
    })
    server = null
    log.log('[pet-mcp-http] 已停止')
  }

  return { start, stop, port }
}

function callOk(result: PetReactionResult) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
  }
}

function callError(result: PetReactionResult & { error?: string }) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    isError: true,
  }
}