// Domain: connectors — eventa IPC 契约按域拆分
import { defineInvokeEventa, defineEventa } from '@moeru/eventa'

export type ConnectorType = 'vscode' | 'trae' | 'idea' | 'unknown'

export interface ConnectorInfo {
  id: string
  type: ConnectorType
  name: string
  peerId: string
  connectedAt: number
  lastContext: unknown
  lastContextAt: number | null
}

export interface ConnectorTask {
  type: string
  payload?: Record<string, unknown>
}

export interface ConnectorSendTaskResult {
  ok: boolean
  error?: string
  /** 本次下发的 taskId — 插件回执 task:result 按此匹配（executor 用它等待回执） */
  taskId?: string
}

export const electronConnectorList = defineInvokeEventa<ConnectorInfo[]>('eventa:invoke:electron:connector:list')
export const electronConnectorStatus = defineInvokeEventa<ConnectorInfo | null, { id: string }>('eventa:invoke:electron:connector:status')
export const electronConnectorSendTask = defineInvokeEventa<ConnectorSendTaskResult, { id: string, task: ConnectorTask }>('eventa:invoke:electron:connector:send-task')
export const electronConnectorChanged = defineEventa<ConnectorInfo[]>('eventa:event:electron:connector:changed')

// Connector task result — IDE 执行任务后通过 WebSocket 回传结果
export interface ConnectorTaskResult {
  taskId: string
  success: boolean
  error?: string
}
export const electronConnectorTaskResult = defineEventa<ConnectorTaskResult>(
  'eventa:event:electron:connector:task-result',
)

// Sidecar — 本地子进程（GPT-SoVITS 等）通过 stdin/stdout 管道通信
