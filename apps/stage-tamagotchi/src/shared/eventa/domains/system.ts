// Domain: system — eventa IPC 契约按域拆分
import { defineInvokeEventa } from '@moeru/eventa'

export interface SystemCapabilities {
  cpuModel: string
  physicalCores: number
  logicalCores: number
  totalMemoryGB: number
  gpu: { vendor: string, model: string, vramMB: number } | null
  isLowSpec: boolean
}
export const electronGetSystemCapabilities = defineInvokeEventa<SystemCapabilities>(
  'eventa:invoke:electron:get-system-capabilities',
)
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

export const electronLogLevelGet = defineInvokeEventa<LogLevel>('eventa:invoke:electron:log-level:get')
export const electronLogLevelSet = defineInvokeEventa<LogLevel, { level: LogLevel }>('eventa:invoke:electron:log-level:set')

// Permission whitelist — Task 10.9 的契约定义。
// Overseer 修正动作首次确认后，用户可勾选「此类修正自动执行」加入白名单，
// key 形如 `${source}:${assertion.type}`（例如 `trae:compile_success`）。
// NOTICE: handler 由 Task 10 的 overseer/permission.ts 模块注册；当前主进程未实现，
// 调用方需自行容错（UI 默认走 mock 数据 + 提示后端未就绪）。
