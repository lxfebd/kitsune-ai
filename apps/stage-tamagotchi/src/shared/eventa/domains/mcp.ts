// Domain: mcp — eventa IPC 契约按域拆分
import { defineInvokeEventa } from '@moeru/eventa'

export interface ElectronMcpStdioServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  enabled?: boolean
}

export interface ElectronMcpStdioConfigFile {
  mcpServers: Record<string, ElectronMcpStdioServerConfig>
}

export interface ElectronMcpStdioApplyResult {
  path: string
  started: Array<{ name: string }>
  failed: Array<{ name: string, error: string }>
  skipped: Array<{ name: string, reason: string }>
}

export interface ElectronMcpStdioServerRuntimeStatus {
  name: string
  state: 'running' | 'stopped' | 'error'
  command: string
  args: string[]
  pid: number | null
  lastError?: string
}

export interface ElectronMcpStdioRuntimeStatus {
  path: string
  servers: ElectronMcpStdioServerRuntimeStatus[]
  updatedAt: number
}

export interface ElectronMcpToolDescriptor {
  serverName: string
  name: string
  toolName: string
  description?: string
  inputSchema: Record<string, unknown>
}

export interface ElectronMcpCallToolPayload {
  name: string
  arguments?: Record<string, unknown>
}

export interface ElectronMcpCallToolResult {
  content?: Array<Record<string, unknown>>
  structuredContent?: Record<string, unknown>
  toolResult?: unknown
  isError?: boolean
}

export interface ElectronMcpStdioConfigText {
  path: string
  text: string
}

export interface ElectronMcpStdioTestResult {
  ok: boolean
  error?: string
  tools?: string[]
  durationMs: number
}

export interface ElectronMcpStdioTestPayload {
  name: string
  config: ElectronMcpStdioServerConfig
}

export const electronMcpOpenConfigFile = defineInvokeEventa<{ path: string }>('eventa:invoke:electron:mcp:open-config-file')
export const electronMcpApplyAndRestart = defineInvokeEventa<ElectronMcpStdioApplyResult>('eventa:invoke:electron:mcp:apply-and-restart')
export const electronMcpGetRuntimeStatus = defineInvokeEventa<ElectronMcpStdioRuntimeStatus>('eventa:invoke:electron:mcp:get-runtime-status')
export const electronMcpListTools = defineInvokeEventa<ElectronMcpToolDescriptor[]>('eventa:invoke:electron:mcp:list-tools')
export const electronMcpCallTool = defineInvokeEventa<ElectronMcpCallToolResult, ElectronMcpCallToolPayload>('eventa:invoke:electron:mcp:call-tool')
export const electronMcpReadConfigText = defineInvokeEventa<ElectronMcpStdioConfigText>('eventa:invoke:electron:mcp:read-config-text')
export const electronMcpWriteConfigText = defineInvokeEventa<ElectronMcpStdioConfigText, { text: string }>('eventa:invoke:electron:mcp:write-config-text')
export const electronMcpTestServer = defineInvokeEventa<ElectronMcpStdioTestResult, ElectronMcpStdioTestPayload>('eventa:invoke:electron:mcp:test-server')

/** MCP 接入配置模板 — 设置页「MCP 接入」卡片展示用（可序列化，不依赖主进程 node:os） */
export interface ElectronMcpAgentTemplate {
  agentId: string
  label: string
  /** 接入形态：url=HTTP 直连 / stdio=子进程桥 */
  mode: 'url' | 'stdio'
  /** 可直接粘贴的配置 JSON 字符串 */
  config: string
  /** 配置文件名（用户自建时提示） */
  configFile: string
  /** 候选配置文件绝对路径（按优先级） */
  configPaths: string[]
  /** HTTP MCP server 地址（mode=url 时展示） */
  httpUrl?: string
  /** 探测结果：候选路径中是否已存在配置文件（设置页展示「已配置/未配置」） */
  configured: boolean
  /** 探测到的已存在配置文件路径（configured=true 时展示，告诉用户写进了哪个文件） */
  matchedPath?: string
}

export const electronMcpGetAgentTemplates = defineInvokeEventa<ElectronMcpAgentTemplate[]>('eventa:invoke:electron:mcp:get-agent-templates')
