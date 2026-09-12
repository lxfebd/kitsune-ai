/**
 * 桌宠 MCP Server — 子进程入口（被宿主 spawn）
 *
 * ── 职责边界 ──
 * 本文件是「外部接入层」：由宿主（Claude Desktop / Cursor / Windsurf / Trae）
 * 在 MCP 配置里 spawn 为子进程，通过 stdio（stdin/stdout）与宿主通信。
 * 安全模型由宿主决定（宿主决定要不要启动你），比"任何本地进程连 6121"严格。
 *
 * 它不持有任何业务逻辑：只暴露一个 tool `triggerReaction`，
 * 收到调用后把事件通过 HTTP POST 转发给主进程的 petMcpBridge（localhost 专端口），
 * 由主进程的 overseer 完成 校验 → 限流 → 人格化点评 → 演出。
 *
 * ── 单一真源 ──
 * tool 的 inputSchema 由 petContract.ts 的 zod schema 经 zodToJsonSchema 派生，
 * 不手写第二份 JSON Schema。
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

import {
  petReactionContractSchema,
  petReactionResultSchema,
  TYPE_SELECTION_GUIDE,
} from './petContract'

const TOOL_NAME = 'triggerReaction'

// 主进程 petMcpBridge 监听的 localhost 端口（仅 127.0.0.1，独立于此内部 6121 WS）
const BRIDGE_PORT = Number(process.env.PET_MCP_BRIDGE_PORT ?? 6122)
const BRIDGE_URL = `http://127.0.0.1:${BRIDGE_PORT}/pet-reaction`
// 桥转发超时：主进程卡死时宿主的 MCP 调用也要能及时失败（pet-busy），而非无限挂起
const BRIDGE_FETCH_TIMEOUT_MS = Number(process.env.PET_MCP_BRIDGE_TIMEOUT_MS ?? 10_000)

const TOOL_DESCRIPTION = `当你完成了一个有意义的动作（构建成功、PR 合并、代码审查发现问题、用户卡住求助）时，调用此工具让桌宠对用户做出人格化回应。
不要在每次文件保存、每次光标移动时调用。
判断标准：这件事值不值得一个角色开口说话？

${TYPE_SELECTION_GUIDE}`

const server = new Server(
  { name: 'proj-kitsune:pet-reaction', version: '0.1.0' },
  { capabilities: { tools: {} } },
)

// 派生 inputSchema：zod 单一真源 → JSON Schema（顶层 type:object，MCP 兼容）。
// ⚠️ 用 zod4 原生 toJSONSchema() 而非 zod-to-json-schema@3.25.2：
//   zod-to-json-schema 3.25.2 在 zod 4.3.6 下对任何 schema 都输出 {}（连简单
//   z.object 都空）——MCP tool 的 inputSchema 会变成空对象，agent 模型看不到
//   参数必填提示。zod4 原生 toJSONSchema 能正确产出 discriminatedUnion 的
//   oneOf + required 字段，零额外依赖。
const inputSchema = petReactionContractSchema.toJSONSchema() as unknown as Record<string, unknown>

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: TOOL_NAME,
      description: TOOL_DESCRIPTION,
      inputSchema,
    },
  ],
}))

/**
 * 转发一次 reaction 到主进程桥；带超时，超时/桥不可达时抛错（调用方收敛为 pet-busy）。
 * 抽成独立函数便于单测（本文件入口自执行，整模块 import 会真实连 stdio）。
 */
export async function forwardToBridge(
  payload: unknown,
  url: string = BRIDGE_URL,
  timeoutMs: number = BRIDGE_FETCH_TIMEOUT_MS,
): Promise<{ content: Array<{ type: string, text: string }>, isError?: boolean }> {
  const controller = new AbortController()
  const bridgeTimer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    return {
      content: [{ type: 'text', text: JSON.stringify(petReactionResultSchema.parse(await res.json())) }],
    }
  }
  finally {
    clearTimeout(bridgeTimer)
  }
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== TOOL_NAME) {
    return {
      content: [{ type: 'text', text: `unknown tool: ${request.params.name}` }],
      isError: true,
    }
  }

  const parsed = petReactionContractSchema.safeParse(request.params.arguments ?? {})
  if (!parsed.success) {
    const result = petReactionResultSchema.parse({ status: 'filtered', reason: 'invalid-payload' })
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      isError: true,
    }
  }

  // 转发给主进程 petMcpBridge（独立 localhost 端口，不经 6121 内部 WS）
  try {
    return await forwardToBridge(parsed.data)
  }
  catch {
    // 主进程桥不可达（桌宠没开 / 端口没起 / 转发超时）→ 视为桌宠忙
    const result = petReactionResultSchema.parse({ status: 'filtered', reason: 'pet-busy' })
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      isError: true,
    }
  }
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch(() => {
  // stdio 已被 MCP 占用，错误只能静默退出，避免污染协议流
  process.exit(1)
})
