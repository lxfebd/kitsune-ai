// Domain: sidecar — eventa IPC 契约按域拆分
import { defineInvokeEventa, defineEventa } from '@moeru/eventa'

export type SidecarState = 'stopped' | 'starting' | 'running' | 'stopping' | 'error' | 'degraded'

export interface SidecarStatus {
  id: string
  state: SidecarState
  pid: number | null
  restartCount: number
  lastError?: string
  updatedAt: number
}

export interface SidecarHealth {
  id: string
  healthy: boolean
  state: SidecarState
  pid: number | null
  reason?: string
}

/** 启动 sidecar 的可序列化配置（IPC 传输用，不含回调函数）。 */
export interface SidecarStartPayload {
  id: string
  /** 已知 id 可省略，由后端按 SIDECAR_DEFAULT_CONFIGS 解析；未知 id 必填。 */
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
}

export const electronSidecarStart = defineInvokeEventa<SidecarStatus, SidecarStartPayload>('eventa:invoke:electron:sidecar:start')
export const electronSidecarStop = defineInvokeEventa<SidecarStatus, { id: string }>('eventa:invoke:electron:sidecar:stop')
export const electronSidecarStatus = defineInvokeEventa<SidecarStatus[]>('eventa:invoke:electron:sidecar:status')
export const electronSidecarHealth = defineInvokeEventa<SidecarHealth, { id: string }>('eventa:invoke:electron:sidecar:health')
export const electronSidecarStatusChanged = defineEventa<SidecarStatus>('eventa:event:electron:sidecar:status-changed')

// ComfyUI — 本地图像生成服务，进程由 SidecarService 管理，API 通信走 HTTP
