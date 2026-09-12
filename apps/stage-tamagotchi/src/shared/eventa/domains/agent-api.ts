// Domain: agent-api — eventa IPC 契约按域拆分
import { defineInvokeEventa, defineEventa } from '@moeru/eventa'

export type AgentApiProvider = 'cloud_code' | 'opencode' | 'trae_builder'

/** Agent 运行时状态。pending=已推送未确认，running=Agent 反馈执行中，succeeded/failed=终态。 */
export type AgentTaskState = 'pending' | 'running' | 'succeeded' | 'failed'

export interface AgentConfig {
  id: string
  /** 对接的 Agent 类型，决定 API 端点形状与鉴权方式。 */
  provider: AgentApiProvider
  /** 用户可读名称，渲染进程展示用。 */
  name: string
  /** API 基础地址，例如 https://api.example.com。留空时按 provider 取内置默认。 */
  baseUrl?: string
  /** 是否已配置密钥（不暴露密钥本身）。 */
  hasKey: boolean
  /** 密钥明文（仅已配置时存在；安全场景可能不暴露）。 */
  key?: string
  /** 是否启用任务推送。 */
  enabled: boolean
  /** 密钥是否以明文落盘（safeStorage 不可用时降级）。前端应据此向用户告警。 */
  plaintextFallback?: boolean
}

export interface AgentTaskPayload {
  /** 任务标题或自然语言指令，由调用方组织。 */
  prompt: string
  /** 可选上下文附件（文件路径、片段等），由 Agent 自行解释。 */
  context?: Record<string, unknown>
}

export interface AgentTaskResult {
  taskId: string
  agentId: string
  state: AgentTaskState
  /** Agent 返回的产出文本或错误信息。 */
  output?: string
  /** 截屏校验建议（Trae Builder 模式联动屏幕监控产出）。 */
  visionHint?: string
  timestamp: number
}

export interface AgentApiSendTaskResult {
  ok: boolean
  /** 远端 Agent 分配的任务 id（推送成功时返回）。 */
  remoteTaskId?: string
  error?: string
}

export const electronAgentApiList = defineInvokeEventa<AgentConfig[]>('eventa:invoke:electron:agent-api:list')
export const electronAgentApiSendTask = defineInvokeEventa<AgentApiSendTaskResult, { id: string, task: AgentTaskPayload }>('eventa:invoke:electron:agent-api:send-task')
export const electronAgentApiSetKey = defineInvokeEventa<AgentConfig, { id: string, provider: AgentApiProvider, name?: string, baseUrl?: string, key: string, enabled?: boolean }>('eventa:invoke:electron:agent-api:set-key')
export const electronAgentApiResult = defineEventa<AgentTaskResult>('eventa:event:electron:agent-api:result')

// Log level — 运行时调整 @guiiai/logg 全局日志级别，环境适配中心用此控制日志详细度
