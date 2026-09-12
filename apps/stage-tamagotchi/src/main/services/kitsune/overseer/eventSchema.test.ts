/**
 * eventSchema 测试 — 推送白名单策略的断言保护。
 *
 * 操作指导（guidance）依赖白名单放行才能到达渲染层卡片：
 * 这里锁定「Guidance 可推送」，防止未来重构误删白名单条目而静默失联。
 */
import { describe, expect, it } from 'vitest'

import { EventType, PUSHABLE_EVENTS, Severity } from './eventSchema'
import { PushFilter } from './pushFilter'

describe('eventSchema PUSHABLE_EVENTS', () => {
  it('失败类事件+工具级活动信号+guidance 全部可推送', () => {
    const expected = new Set([
      EventType.PermissionRequest,
      EventType.TaskEnd,
      EventType.TaskFailed,
      EventType.CompileFailed,
      EventType.TestFailed,
      EventType.ProcessCrash,
      EventType.Timeout,
      EventType.ToolInvocation,
      EventType.Guidance,
    ])
    expect(PUSHABLE_EVENTS).toEqual(expected)
  })

  it('status_update 不进白名单（仅更新内部状态）', () => {
    expect(PUSHABLE_EVENTS.has(EventType.StatusUpdate)).toBe(false)
  })

  it('guidance 事件能穿透 PushFilter 去抖推送到渲染层（重复失败计数不受白名单拦截）', () => {
    const pushFilter = new PushFilter()
    const guidanceEvent = {
      id: 'g1',
      type: EventType.Guidance,
      source: 'zcode',
      timestamp: 1_000,
      severity: Severity.Warn,
      data: { suggestion: '编辑前未读取文件', steps: ['先 Read 目标文件'] },
    }
    // 白名单放行 + 去抖允许
    expect(pushFilter.shouldPush(guidanceEvent)).toBe(true)
  })

  it('非白名单事件（status_update）即使多次也不会触发推送', () => {
    const pushFilter = new PushFilter()
    const statusEvent = {
      id: 's1',
      type: EventType.StatusUpdate,
      source: 'zcode',
      timestamp: 1_000,
      severity: Severity.Info,
      data: {},
    }
    expect(pushFilter.shouldPush(statusEvent)).toBe(false)
  })

  it('同 key（type:source）在去抖窗口内仅推送第一次', () => {
    const pushFilter = new PushFilter()
    const makeEvent = (id: string, ts: number) => ({
      id,
      type: EventType.Guidance,
      source: 'zcode',
      timestamp: ts,
      severity: Severity.Warn,
      data: { steps: [] },
    })
    expect(pushFilter.shouldPush(makeEvent('a', 1_000))).toBe(true)
    // 5s 窗口内第二次 → 去抖拦截（这不影响计数，计数在白名单之前）
    expect(pushFilter.shouldPush(makeEvent('b', 1_100))).toBe(false)
    // 窗口外（≥5s 后）→ 再次放行
    expect(pushFilter.shouldPush(makeEvent('c', 6_000))).toBe(true)
  })
})