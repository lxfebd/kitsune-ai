import { manager } from './mcpClient.js'

// ToolBridge 引用（由 server.js 注入）
let _toolBridge = null

export function setToolBridge(toolBridge) {
  _toolBridge = toolBridge
}

/**
 * MCP Tool Bridge — 将MCP Server的工具桥接到本地 ToolRegistry
 *
 * 工作原理：
 * 1. 从 McpClientManager 获取所有已发现的MCP工具
 * 2. 为每个MCP工具生成一个本地adapter函数
 * 3. 这些函数通过 mcp::{server}::{tool} 命名注册到ToolRegistry
 * 4. AI Agent调用时自动转发到对应的MCP Server
 */

// 缓存当前生成的adapter集合
let cachedAdapters = {}
let lastRefreshTime = 0
const REFRESH_INTERVAL_MS = 30000 // 30秒缓存

/**
 * 刷新MCP工具adapter列表
 * 返回 { adapterName: function } 的对象，可直接展开到BUILTIN_ADAPTERS
 */
export function refreshAdapters(force = false) {
  const now = Date.now()
  if (!force && (now - lastRefreshTime < REFRESH_INTERVAL_MS)) {
    return cachedAdapters
  }

  const tools = manager.getAllTools()
  const adapters = {}

  for (const tool of tools) {
    const adapterKey = tool.fullName // e.g., "mcp::filesystem::read_file"
    const serverName = tool.serverName
    const toolName = tool.toolName

    // 为每个MCP工具创建闭包adapter
    adapters[adapterKey] = async (args = {}) => {
      try {
        const result = await manager.callTool(tool.fullName, args)

        // NOTICE:
        // MCP content array can contain multiple types: text, image, resource.
        // We handle each type appropriately instead of only extracting `text`.
        let outputText = ''
        if (Array.isArray(result?.content)) {
          outputText = result.content.map((c) => {
            if (c.type === 'text') return c.text || ''
            if (c.type === 'image') return `[Image: ${c.mimeType || 'unknown'}]`
            if (c.type === 'resource') return `[Resource: ${c.uri || 'unknown'}]`
            return c.text || ''
          }).join('\n')
        }
        else if (typeof result === 'string') {
          outputText = result
        }
        else if (result?.content) {
          outputText = typeof result.content === 'string'
            ? result.content
            : JSON.stringify(result.content)
        }
        else {
          outputText = JSON.stringify(result)
        }

        // 标记是否出错
        const isError = result?.isError === true
        if (isError) {
          return JSON.stringify({
            success: false,
            error: outputText,
            source: `mcp:${serverName}`,
            tool: toolName,
          })
        }

        return JSON.stringify({
          success: true,
          data: outputText,
          source: `mcp:${serverName}`,
          tool: toolName,
        })
      }
      catch (err) {
        return JSON.stringify({
          success: false,
          error: err.message || String(err),
          source: `mcp:${serverName}`,
          tool: toolName,
        })
      }
    }

    // 附加元信息供tools.yaml生成使用
    adapters[adapterKey]._meta = {
      serverName,
      toolName,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }
  }

  cachedAdapters = adapters
  lastRefreshTime = now

  console.log(`[MCP Bridge] Refreshed: ${Object.keys(adapters).length} MCP tool adapters`)

  // 自动注册到 ToolBridge（如果有引用）
  try {
    if (_toolBridge && typeof _toolBridge.refreshMcpTools === 'function') {
      _toolBridge.refreshMcpTools(adapters)
    }
  }
  catch { /* toolBridge可能还没初始化 */ }

  return adapters
}

/**
 * 获取MCP工具的tools.yaml定义片段
 * 用于动态注册或生成配置
 */
export function getToolDefinitions() {
  refreshAdapters(true) // 强制刷新

  const definitions = []
  for (const [key, adapter] of Object.entries(cachedAdapters)) {
    if (!adapter._meta) continue
    definitions.push({
      name: key,
      type: 'local',
      adapter: key,
      description: adapter._meta.description,
      side_effect_level: 'write', // MCP工具可能有副作用，保守标记
      requires_lock: false,
      input_schema: adapter._meta.inputSchema || {
        type: 'object',
        properties: {},
        additionalProperties: true,
      },
      _source: 'mcp',
    })
  }
  return definitions
}

export function getManager() {
  return manager
}
