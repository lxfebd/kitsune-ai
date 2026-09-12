/**
 * mcpActivityTracker 纯函数测试
 *
 * 覆盖:活动记录/查询、idle/stopped 明确清除、TTL 过期回落、注入 clock 的可测性。
 */

import { describe, expect, it } from 'vitest'

import { McpActivityTracker, MCP_ACTIVITY_TTL_MS } from './mcpActivityTracker'

/** 注入可变假时钟，让测试不依赖真实时间 */
function createTracker(ttlMs: number) {
  let t = 0
  const tracker = new McpActivityTracker({ ttlMs, now: () => t })
  return {
    tracker,
    advance: (ms: number) => { t += ms },
    now: () => t,
  }
}

describe('McpActivityTracker', () => {
  it('记录活动后该来源判定为活跃', () => {
    const { tracker, advance } = createTracker(3 * 60_000)
    tracker.touch('trae', 'executing')
    advance(10_000)
    expect(tracker.isActive('trae')).toBe(true)
  })

  it('idle 明确停止 → 清除记录并回落空闲', () => {
    const { tracker } = createTracker(3 * 60_000)
    tracker.touch('trae', 'executing')
    tracker.touch('trae', 'idle')
    expect(tracker.isActive('trae')).toBe(false)
  })

  it('stopped 明确停止 → 回落空闲', () => {
    const { tracker } = createTracker(3 * 60_000)
    tracker.touch('workbuddy', 'building')
    tracker.touch('workbuddy', 'stopped')
    expect(tracker.isActive('workbuddy')).toBe(false)
  })

  it('超过 TTL 的旧活动过期 → 回落空闲（惰性清理）', () => {
    const { tracker, advance } = createTracker(1_000)
    tracker.touch('zcode', 'executing')
    expect(tracker.isActive('zcode')).toBe(true)
    advance(1_000) // 刚好满 TTL
    expect(tracker.isActive('zcode')).toBe(false)
    expect(tracker.size).toBe(0)
  })

  it('TTL 窗口内的新活动保持活跃', () => {
    const { tracker, advance } = createTracker(1_000)
    tracker.touch('trae', 'executing')
    advance(500) // 距上次 500ms，仍在窗口内
    tracker.touch('trae', 'completed')
    expect(tracker.isActive('trae')).toBe(true)
  })

  it('从无记录的来源判定为不活跃', () => {
    const { tracker } = createTracker(3 * 60_000)
    expect(tracker.isActive('cursor')).toBe(false)
  })

  it('默认 TTL 对齐文件嗅探窗口（180s）', () => {
    expect(MCP_ACTIVITY_TTL_MS).toBe(3 * 60_000)
  })

  it('clear() 清空所有来源', () => {
    const { tracker } = createTracker(3 * 60_000)
    tracker.touch('trae', 'executing')
    tracker.touch('zcode', 'thinking')
    tracker.clear()
    expect(tracker.size).toBe(0)
    expect(tracker.isActive('trae')).toBe(false)
  })
})