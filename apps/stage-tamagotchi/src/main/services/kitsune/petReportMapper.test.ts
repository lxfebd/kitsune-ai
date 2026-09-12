/**
 * petReportMapper 纯函数映射测试
 *
 * 覆盖:activity 归一化(mainStates 兜底)、completed/error 的可推送事件映射、
 * thinking/executing 的中性映射、结构信号透传(toolName/hasError/errorMessage/activity)。
 */

import { describe, expect, it } from 'vitest'

import {
  mapPetReportToReaction,
  normalizePetReportActivity,
} from './petReportMapper'

describe('normalizePetReportActivity', () => {
  it('透传已知状态', () => {
    expect(normalizePetReportActivity('thinking')).toBe('thinking')
    expect(normalizePetReportActivity('executing')).toBe('executing')
    expect(normalizePetReportActivity('completed')).toBe('completed')
    expect(normalizePetReportActivity('error')).toBe('error')
    expect(normalizePetReportActivity('coding')).toBe('coding')
  })

  it('未知值兜底 idle', () => {
    expect(normalizePetReportActivity('hacking')).toBe('idle')
  })

  it('空值兜底 idle', () => {
    expect(normalizePetReportActivity(undefined)).toBe('idle')
  })
})

describe('mapPetReportToReaction', () => {
  it('completed → happy/celebrate, activity 透传', () => {
    const r = mapPetReportToReaction({
      source: 'zcode',
      activity: 'completed',
      message: '测试全绿',
    })
    expect(r.emotion).toBe('happy')
    expect(r.action).toBe('celebrate')
    expect(r.activity).toBe('completed')
    expect(r.hasError).toBe(false)
  })

  it('error → worried/concern, errorMessage 透传供 crash/timeout 判定', () => {
    const r = mapPetReportToReaction({
      source: 'claude_code',
      activity: 'error',
      tool: 'Bash',
      errorMessage: 'exit code 1',
    })
    expect(r.emotion).toBe('worried')
    expect(r.action).toBe('concern')
    expect(r.hasError).toBe(true)
    expect(r.errorMessage).toBe('exit code 1')
    expect(r.toolName).toBe('Bash')
  })

  it('executing → 中性映射, 不开口', () => {
    const r = mapPetReportToReaction({
      source: 'cursor',
      activity: 'executing',
      tool: 'Edit',
    })
    expect(r.emotion).toBe('neutral')
    expect(r.action).toBe('idle')
    expect(r.activity).toBe('executing')
    expect(r.toolName).toBe('Edit')
    expect(r.hasError).toBe(false)
  })

  it('thinking → 中性映射', () => {
    const r = mapPetReportToReaction({ source: 'trae', activity: 'thinking' })
    expect(r.emotion).toBe('neutral')
    expect(r.activity).toBe('thinking')
  })

  it('message 缺省时按 activity 生成默认文案', () => {
    const r = mapPetReportToReaction({ source: 'zcode', activity: 'executing', tool: 'Bash' })
    expect(r.message).toContain('Bash')
    expect(r.summary).toBe(r.message)
  })

  it('未知 activity 兜底 idle 且中性映射', () => {
    const r = mapPetReportToReaction({ source: 'zcode', activity: 'hacking' as any })
    expect(r.activity).toBe('idle')
    expect(r.emotion).toBe('neutral')
  })

  it('raw 透传原始信号约偶层用（mapReactionToEvent 的 activity 兜底路径）', () => {
    const r = mapPetReportToReaction({ source: 'zcode', activity: 'completed' })
    expect(r.raw).toMatchObject({ activity: 'completed' })
  })
})