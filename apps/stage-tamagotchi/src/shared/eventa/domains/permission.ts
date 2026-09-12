// Domain: permission — eventa IPC 契约按域拆分
import { defineInvokeEventa, defineEventa } from '@moeru/eventa'

export interface PermissionWhitelistEntry {
  key: string
  /** 白名单来源事件类型，便于按类型批量管理。 */
  assertionType?: string
  /** 来源工具或进程标识。 */
  source?: string
  createdAt: number
}

export const electronPermissionWhitelistList = defineInvokeEventa<PermissionWhitelistEntry[]>('eventa:invoke:electron:permission-whitelist:list')
export const electronPermissionWhitelistRemove = defineInvokeEventa<{ removed: number }, { key: string }>('eventa:invoke:electron:permission-whitelist:remove')
export const electronPermissionWhitelistClear = defineInvokeEventa<{ cleared: number }>('eventa:invoke:electron:permission-whitelist:clear')

// Vision — 屏幕监控常驻服务（主进程定时截屏 → 推送 frame 到渲染进程走 visionOrchestratorStore.processCapture）
export interface PermissionConfirmPayload {
  taskId: string
  source: string
  assertionType: string
  diff: string
  summary: string
  /** 高风险操作标记 — 高风险时弹窗显示红色警告，且禁用自动执行按钮 */
  highRisk?: boolean
}

/** 渲染 → 主：用户确认结果，approved=false 时跳过本次修正 */
export interface PermissionConfirmResult {
  taskId: string
  approved: boolean
  /** 用户勾选「此类修正自动执行」时为 true，主进程据此加入白名单 */
  addToWhitelist: boolean
}

export const electronPermissionConfirm = defineEventa<PermissionConfirmPayload>('eventa:event:electron:permission:confirm')
export const electronPermissionResult = defineInvokeEventa<PermissionConfirmResult, PermissionConfirmResult>('eventa:invoke:electron:permission:result')

// Vision check — 任务推送后主进程发起的视觉对比请求（主 → 渲染 → 主）
// 主进程截屏后把图与 expectedDescription 发给渲染进程的 vision orchestrator，
// 渲染进程推理后通过 invoke 回传结果，主进程用 requestId 关联请求与响应。
