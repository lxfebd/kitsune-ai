// Domain: doctor — eventa IPC 契约按域拆分
import { defineInvokeEventa } from '@moeru/eventa'

export type DoctorCategory = 'config' | 'connectivity' | 'sidecar' | 'permissions' | 'ports' | 'tls' | 'resources' | 'overseer' | 'plugins' | 'network' | 'gpu' | 'tts' | 'desktop' | 'sandbox' | 'comfyui'
export type DoctorLevel = 'PASS' | 'WARN' | 'FAIL' | 'INFO'
export type FixLevel = 'FIXED' | 'MANUAL'

/**
 * Structured repair data filled by check functions and consumed by fixOne,
 * replacing fragile regex parsing of the `detail` string.
 */
export interface DoctorFixPayload {
  /** Filled when a sidecar is unhealthy; fixOne uses it to call sidecar.restart. */
  sidecarId?: string
  /** Filled when a directory is missing; fixOne uses it to call mkdir. */
  dirPath?: string
  /** Filled when overseer tools are not running (reserved; fixOne currently returns MANUAL). */
  toolIds?: string[]
}

export interface DoctorResult {
  category: DoctorCategory
  level: DoctorLevel
  detail: string
  /** FAIL 级别必须附带修复建议；PASS/WARN/INFO 可选 */
  suggestion?: string
  /** Structured repair data consumed by fixOne; avoids regex-parsing `detail`. */
  fixPayload?: DoctorFixPayload
}

export interface FixResult {
  category: DoctorCategory
  /** FIXED 表示已自动修复，MANUAL 表示需要人工介入 */
  level: FixLevel
  detail: string
}

export const electronDoctorRun = defineInvokeEventa<DoctorResult[]>('eventa:invoke:electron:doctor:run')
export const electronDoctorFix = defineInvokeEventa<FixResult[]>('eventa:invoke:electron:doctor:fix')
export const electronDoctorStatus = defineInvokeEventa<DoctorResult[] | null>('eventa:invoke:electron:doctor:status')

// Agent API — 直接对接开放 API 的 Agent（Cloud Code / OpenCode / Trae Builder 等），无需连接器
