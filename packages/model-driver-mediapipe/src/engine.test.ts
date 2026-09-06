import { describe, expect, it } from 'vitest'

import { createStats, createScheduler } from './engine'

import type { MocapConfig } from './types'

describe('createStats', () => {
  it('returns 0 on first tick', () => {
    const stats = createStats()
    expect(stats.tick(1000)).toBe(0)
  })

  it('calculates smoothed fps', () => {
    const stats = createStats()
    stats.tick(1000)
    const fps = stats.tick(1033) // ~30fps
    expect(fps).toBeGreaterThan(25)
    expect(fps).toBeLessThan(35)
  })

  it('smooths fps over time', () => {
    const stats = createStats()
    stats.tick(0)
    stats.tick(100) // 10fps
    stats.tick(200) // 10fps
    const fps = stats.tick(300)
    expect(fps).toBeGreaterThan(8)
    expect(fps).toBeLessThan(12)
  })

  it('handles zero dt gracefully', () => {
    const stats = createStats()
    stats.tick(1000)
    expect(stats.tick(1000)).toBe(0)
  })
})

describe('createScheduler', () => {
  const defaultConfig: MocapConfig = {
    enabled: { pose: true, hands: true, face: true },
    hz: { pose: 30, hands: 30, face: 30 },
  } as MocapConfig

  it('plans all enabled jobs on first run', () => {
    const scheduler = createScheduler(defaultConfig)
    const jobs = scheduler.plan(1000)
    expect(jobs).toEqual(expect.arrayContaining(['pose', 'hands', 'face']))
    expect(jobs).toHaveLength(3)
  })

  it('skips jobs that ran recently', () => {
    const scheduler = createScheduler(defaultConfig)
    scheduler.plan(1000)
    const jobs = scheduler.plan(1010) // 10ms later, 30hz = 33ms interval
    expect(jobs).toHaveLength(0)
  })

  it('runs jobs after interval', () => {
    const scheduler = createScheduler(defaultConfig)
    scheduler.plan(1000)
    const jobs = scheduler.plan(1034) // 34ms later, past 33ms interval
    expect(jobs).toEqual(expect.arrayContaining(['pose', 'hands', 'face']))
  })

  it('respects per-job hz settings', () => {
    const config: MocapConfig = {
      enabled: { pose: true, hands: true, face: true },
      hz: { pose: 10, hands: 60, face: 5 },
    } as MocapConfig
    const scheduler = createScheduler(config)

    scheduler.plan(1000)
    // At 1017ms: pose (100ms interval) not ready, hands (16.67ms interval) ready, face (200ms) not ready
    const jobs = scheduler.plan(1017)
    expect(jobs).toContain('hands')
    expect(jobs).not.toContain('pose')
    expect(jobs).not.toContain('face')
  })

  it('skips disabled jobs', () => {
    const config: MocapConfig = {
      enabled: { pose: false, hands: true, face: false },
      hz: { pose: 30, hands: 30, face: 30 },
    } as MocapConfig
    const scheduler = createScheduler(config)

    const jobs = scheduler.plan(1000)
    expect(jobs).toEqual(['hands'])
  })

  it('skips jobs with zero hz', () => {
    const config: MocapConfig = {
      enabled: { pose: true, hands: true, face: true },
      hz: { pose: 0, hands: 30, face: 0 },
    } as MocapConfig
    const scheduler = createScheduler(config)

    const jobs = scheduler.plan(1000)
    expect(jobs).toEqual(['hands'])
  })

  it('updates config dynamically', () => {
    const scheduler = createScheduler(defaultConfig)
    scheduler.plan(1000)

    scheduler.updateConfig({
      enabled: { pose: false, hands: false, face: true },
      hz: { pose: 30, hands: 30, face: 60 },
    } as MocapConfig)

    const jobs = scheduler.plan(1017)
    expect(jobs).toEqual(['face'])
  })
})
