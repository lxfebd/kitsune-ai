// Domain: plugin lifecycle — 插件宿主生命周期广播
import { defineEventa } from '@moeru/eventa'

/**
 * 插件生命周期事件载荷。
 *
 * - `load-failed` — 插件启动/加载失败（manifest 缺失、入口报错等）
 * - `degraded` — 插件能力降级（capability 上报 degraded 状态）
 * - `unloaded` — 插件被卸载（供渲染层知晓，桌面宠不打扰）
 */
export type PluginLifecycleKind = 'load-failed' | 'degraded' | 'unloaded'

export interface PluginLifecycleEventPayload {
  kind: PluginLifecycleKind
  extensionId: string
  /** 失败或降级的原因描述（错误信息/能力 key）。 */
  reason?: string
  updatedAt: number
}

/** 插件宿主生命周期广播 — 桌宠感知"插件坏了"、设置页感知状态变化。 */
export const electronPluginLifecycleEvent = defineEventa<PluginLifecycleEventPayload>(
  'eventa:event:electron:plugins:lifecycle',
)
