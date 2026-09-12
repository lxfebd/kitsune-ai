/**
 * Overseer 编排层 — mapReactionToEvent 活动信号映射单测。
 * 感知层上报 activity（thinking/executing/completed/error）时，
 * 必须映射为可推送的细粒度事件，而不是一律 status_update 被 PushFilter 吞掉。
 */
import { describe, expect, it } from 'vitest'

import { OverseerEventType } from '../../../../shared/eventa'
import { mapReactionToEvent } from './index'

import type { PetReaction } from '@kitsune/overseer'
import type { OverseerEvent } from '../../../../shared/eventa'

function eventData<T extends { toolName?: unknown, summary?: unknown, errorMessage?: unknown }>(event: OverseerEvent): T {
  return event.data as T
}

function baseReaction(overrides: Partial<PetReaction & { activity?: string }> = {}): PetReaction & { activity?: string } {
  return {
    type: 'supervisor_reaction',
    source: 'zcode',
    emotion: 'focused',
    action: 'watch',
    message: 'ZCode 执行工具中: Bash',
    summary: 'ZCode 执行工具 Bash',
    timestamp: Date.now(),
    toolName: 'Bash',
    hasError: false,
    ...overrides,
  }
}

describe('mapReactionToEvent — 活动信号映射', () => {
  it('activity=executing 映射为 ToolInvocation（可推送）', () => {
    const event = mapReactionToEvent(baseReaction({ activity: 'executing' }))
    expect(event.type).toBe(OverseerEventType.ToolInvocation)
    expect(event.source).toBe('zcode')
    expect(eventData(event).toolName).toBe('Bash')
    expect(eventData(event).summary).toContain('ZCode')
  })

  it('activity=completed 映射为 TaskEnd（生命周期）', () => {
    const event = mapReactionToEvent(baseReaction({ activity: 'completed', emotion: 'happy' }))
    expect(event.type).toBe(OverseerEventType.TaskEnd)
    expect(event.category).toBe('lifecycle')
  })

  it('activity=error 映射为 TaskFailed（诊断，含 errorMessage）', () => {
    const event = mapReactionToEvent(baseReaction({
      activity: 'error',
      hasError: true,
      errorMessage: '工具执行失败 (errorCount=1)',
    }))
    expect(event.type).toBe(OverseerEventType.TaskFailed)
    expect(event.category).toBe('diagnostic')
    expect(event.severity).toBe('error')
    expect(eventData(event).errorMessage).toContain('errorCount=1')
  })

  it('activity=thinking 映射为 ToolInvocation', () => {
    const event = mapReactionToEvent(baseReaction({ activity: 'thinking', emotion: 'curious' }))
    expect(event.type).toBe(OverseerEventType.ToolInvocation)
  })

  it('无 activity 时保持关键词兜底（status_update）', () => {
    const event = mapReactionToEvent(baseReaction({ message: '普通状态更新', activity: undefined }))
    expect(event.type).toBe(OverseerEventType.StatusUpdate)
  })

  it('hasError 结构化信号优先于 activity（崩溃/超时等精确归类）', () => {
    const event = mapReactionToEvent(baseReaction({
      hasError: true,
      errorMessage: 'crash',
      message: '崩溃退出',
      activity: 'error',
    }))
    // 兜底关键词含 crash → ProcessCrash，结构化 activity=error 只用于无 errorMessage 场景
    expect(event.type).toBe(OverseerEventType.ProcessCrash)
  })
})
