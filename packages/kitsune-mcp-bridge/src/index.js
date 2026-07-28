/**
 * @kitsune/mcp-bridge — MCP Server 工具桥接模块
 *
 * 将 MCP (Model Context Protocol) Server 的工具动态注册到本地 ToolRegistry，
 * 使 AI Agent 能够透明地调用外部 MCP Server 提供的工具。
 *
 * 主要组件：
 * - McpClientManager: 管理所有 MCP Server 连接的生命周期
 * - McpServerInstance: 单个 MCP Server 连接实例（stdio/SSE）
 * - McpConfigStore: MCP 服务器配置的持久化存储
 * - mcpToolBridge: 将 MCP 工具桥接到本地 ToolRegistry
 */

export { McpClientManager, manager } from './mcpClient.js'
export { McpServerInstance } from './mcpServerInstance.js'
export { McpConfigStore } from './mcpConfigStore.js'
export { refreshAdapters, getToolDefinitions, setToolBridge, getManager } from './mcpToolBridge.js'
