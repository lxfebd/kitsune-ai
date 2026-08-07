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
import { zodToJsonSchema } from 'zod-to-json-schema'

import {
  petReactionContractSchema,
  petReactionResultSchema,
  TYPE_SELECTION_GUIDE,
} from './petContract'

const TOOL_NAME = 'triggerReaction'

// 主进程 petMcpBridge 监听的 localhost 端口（仅 127.0.0.1，独立于此内部 6121 WS）
const BRIDGE_PORT = Number(process.env.PET_MCP_BRIDGE_PORT ?? 6122)
const BRIDGE_URL = `http://127.0.0.1:${BRIDGE_PORT}/pet-reaction`

const TOOL_DESCRIPTION = `当你完成了一个有意义的动作（构建成功、PR 合并、代码审查发现问题、用户卡住求助）时，调用此工具让桌宠对用户做出人格化回应。
不要在每次文件保存、每次光标移动时调用。
判断标准：这件事值不值得一个角色开口说话？

${TYPE_SELECTION_GUIDE}`

const server = new Server(
  { name: 'proj-kitsune:pet-reaction', version: '0.1.0' },
  { capabilities: { tools: {} } },
)

// 派生 inputSchema：zod 单一真源 → JSON Schema（顶层 type:object，MCP 兼容）
const inputSchema = zodToJsonSchema(petReactionContractSchema as any, { target: 'draft-7' as any }) as Record<string, unknown>

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: TOOL_NAME,
      description: TOOL_DESCRIPTION,
      inputSchema,
    },
  ],
}))

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
    const res = await fetch(BRIDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    })
    const result = petReactionResultSchema.parse(await res.json())
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    }
  }
  catch {
    // 主进程桥不可达（桌宠没开 / 端口没起）→ 视为桌宠忙
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
