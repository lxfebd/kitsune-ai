import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { executeDesktopWait } from './desktop-automation'

describe('executeDesktopWait per-round budget', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('caps each vision inference round at the remaining budget, so the whole wait never exceeds timeout', async () => {
    const timeout = 5000
    // 用 2s 的内部定时器模拟每轮视觉推理耗时；剩余预算充足时完整跑完，
    // 预算不足时会提前把整轮终止（等待超时返回）。
    const findElement = vi.fn().mockImplementation(async (_desc: string) => {
      await new Promise(resolve => setTimeout(resolve, 2000))
      return { found: false, elements: [] }
    })

    const resultPromise = executeDesktopWait(
      { description: '加载完成', timeout, interval: 500 },
      { findElement },
    )

    // 第 1 轮：视觉推理 2s → 预算 5000
    await vi.advanceTimersByTimeAsync(2000)
    // interval 500ms → 时间 2500
    await vi.advanceTimersByTimeAsync(500)
    // 第 2 轮：剩余预算 = 5000-2500 = 2500，推理 2s → 时间 4500
    await vi.advanceTimersByTimeAsync(2000)
    // interval 500ms → 时间 5000，达到 timeout 上界，循环终止
    await vi.advanceTimersByTimeAsync(1000)

    const result = await resultPromise
    expect(result.ok).toBe(false)
    expect(result.found).toBe(false)
    expect(result.error).toContain('等待超时')
    // 预算 5000 / (推理2s+间隔0.5s) ≈ 2 轮
    expect(result.attempts).toBe(2)
    // 轮内预算递减：首轮完整 5000，次轮只剩 2500
    expect(findElement.mock.calls[0]?.[1]).toBe(5000)
    expect(findElement.mock.calls[1]?.[1]).toBe(2500)
  })

  it('returns immediately when an element is found', async () => {
    const findElement = vi.fn().mockImplementation(async (_desc: string, budget: number) => {
      expect(budget).toBe(10000)
      return { found: true, elements: [{ label: 'ok', confidence: 0.9, x: 1, y: 2 }] }
    })

    const result = await executeDesktopWait(
      { description: '登录框' },
      { findElement },
    )

    expect(result.ok).toBe(true)
    expect(result.found).toBe(true)
    expect(result.attempts).toBe(1)
  })

  it('caps the first round budget even when timeout is very large', async () => {
    const findElement = vi.fn().mockImplementation(async (_desc: string) => {
      await new Promise(resolve => setTimeout(resolve, 1000))
      return { found: false, elements: [] }
    })

    const timeout = 60_000
    const resultPromise = executeDesktopWait(
      { description: '加载', timeout, interval: 1000 },
      { findElement },
    )

    // 第 1 轮：推理 1s → 首轮预算 = 完整 60000
    await vi.advanceTimersByTimeAsync(1000)
    expect(findElement.mock.calls[0]?.[1]).toBe(60_000)
    // interval 1s → 时间 2000
    await vi.advanceTimersByTimeAsync(1000)
    // 第 2 轮预算 = 60000-2000 = 58000
    expect(findElement.mock.calls[1]?.[1]).toBe(58_000)

    // 跑完剩余时间，避免悬挂
    await vi.advanceTimersByTimeAsync(120_000)
    const result = await resultPromise
    expect(result.ok).toBe(false)
  })
})