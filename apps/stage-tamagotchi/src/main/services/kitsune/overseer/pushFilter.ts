/**
 * Overseer 推送过滤策略 — 决定监控事件是否应推送到渲染进程驱动桌宠。
 *
 * 策略：
 * 1. 白名单：仅重大事件（权限请求 / 任务结束 / 失败 / 崩溃 / 超时）推送；
 *    普通编辑事件（status_update）仅更新内部状态，不推送。
 * 2. 去抖：相同 key（事件类型 + 工具标识）在窗口内仅推送第一次，
 *    避免高频抖动（如连续权限请求、连续编译失败）刷屏。
 * 3. 反向任务推送（task:execute）不走此策略，由调用方直接下发。
 */

import { EventType, PUSHABLE_EVENTS, type OverseerEvent } from './eventSchema'

const DEBOUNCE_WINDOW_MS = 5_000

export class PushFilter {
  private lastPushedAt = new Map<string, number>()

  /** 事件是否应当推送桌宠；同 key 在去抖窗口内仅返回 true 一次 */
  shouldPush(event: OverseerEvent): boolean {
    if (!PUSHABLE_EVENTS.has(event.type))
      return false

    const key = `${event.type}:${event.source}`
    const now = event.timestamp
    const last = this.lastPushedAt.get(key)
    if (last !== undefined && now - last < DEBOUNCE_WINDOW_MS)
      return false

    this.lastPushedAt.set(key, now)
    return true
  }

  /** 反向任务推送专用 — 绕过白名单与去抖，立即下发 */
  shouldPushTaskExecute(): boolean {
    return true
  }

  /** 清除去抖记录（停用 / 重置时调用） */
  reset(): void {
    this.lastPushedAt.clear()
  }
}

/** 判断事件是否为不应推送的普通状态更新 */
export function isStatusUpdate(event: OverseerEvent): boolean {
  return event.type === EventType.StatusUpdate
}
