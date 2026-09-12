// Domain: vision — eventa IPC 契约按域拆分
import { defineInvokeEventa, defineEventa } from '@moeru/eventa'

export interface VisionServiceStatus {
  running: boolean
  intervalMs: number
  lastCapture: number | null
  lastError?: string
}

/** 主进程每完成一次截屏后通过此事件把帧下发到渲染进程。 */
export interface VisionFrameCapturedPayload {
  /** JPEG data URL，可直接喂给 visionOrchestratorStore.processCapture。 */
  imageDataUrl: string
  /** desktopCapturer 返回的源 id（screen:0 / window:xxx），用作 processCapture 的 sourceId。 */
  sourceId: string
  /** 截屏时间戳。 */
  capturedAt: number
}

export const electronVisionStart = defineInvokeEventa<VisionServiceStatus, { intervalMs?: number }>('eventa:invoke:electron:vision:start')
export const electronVisionStop = defineInvokeEventa<VisionServiceStatus>('eventa:invoke:electron:vision:stop')
export const electronVisionStatus = defineInvokeEventa<VisionServiceStatus>('eventa:invoke:electron:vision:status')
export const electronVisionFrameCaptured = defineEventa<VisionFrameCapturedPayload>('eventa:event:electron:vision:frame-captured')

// Permission confirm — 首次修正弹窗确认流程（主 → 渲染 → 主）。
// 白名单本身复用上方 PermissionWhitelistEntry 契约，此处仅定义弹窗交互。
/** 主 → 渲染：首次修正弹窗，展示 diff 与摘要请用户确认 */
export interface VisionCheckRequestPayload {
  requestId: string
  imageDataUrl: string
  expectedDescription: string
}

export interface VisionCheckResult {
  requestId: string
  passed: boolean
  reason: string
}

export const electronOverseerVisionCheck = defineEventa<VisionCheckRequestPayload>('eventa:event:electron:overseer:vision-check')
export const electronOverseerVisionCheckResult = defineInvokeEventa<VisionCheckResult, VisionCheckResult>('eventa:invoke:electron:overseer:vision-check-result')

// Overseer correction — 任务推送 → 延迟截屏 → 对比预期 → 修正建议 → 再推送 的联动入口
