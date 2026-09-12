/**
 * Overseer 事件 schema — 主进程侧入口。
 *
 * 权威类型定义在 shared/eventa（IPC 契约所有方，见 electronOverseerEvent），
 * 此处重新导出供主进程逻辑消费，并补充推送白名单策略常量。
 */

export {
  type OverseerEvent,
  OverseerEventType,
  OverseerSeverity,
  type OverseerStats,
  type OverseerStatus,
} from '../../../../shared/eventa'

import { OverseerEventType, OverseerSeverity } from '../../../../shared/eventa'

/** 事件类型别名，保持主进程调用简洁 */
export const EventType = OverseerEventType
/** 严重等级别名 */
export const Severity = OverseerSeverity

/** 推送白名单 — 这些事件会触发桌宠反应；status_update 仅更新内部状态不推送 */
export const PUSHABLE_EVENTS: ReadonlySet<OverseerEventType> = new Set([
  OverseerEventType.PermissionRequest,
  OverseerEventType.TaskEnd,
  OverseerEventType.TaskFailed,
  OverseerEventType.CompileFailed,
  OverseerEventType.TestFailed,
  OverseerEventType.ProcessCrash,
  OverseerEventType.Timeout,
  // 工具级活动信号（thinking/executing/coding）— 桌宠/事件流可见任务进度
  OverseerEventType.ToolInvocation,
  // 操作指导 — 重复失败命中内置规则，桌宠给用户修复步骤
  OverseerEventType.Guidance,
])
