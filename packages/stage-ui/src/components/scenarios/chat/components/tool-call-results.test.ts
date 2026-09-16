import type { ChatAssistantMessage } from '../../../../types/chat'

import { describe, expect, it } from 'vitest'

import { createToolCallResultLookup, resolveToolCallBlockState } from './tool-call-results'

describe('tool call result lookup', () => {
  /**
   * @example
   * expect(resolveToolCallBlockState(undefined)).toBe('executing')
   */
  it('marks a tool call without a result as executing', () => {
    expect(resolveToolCallBlockState(undefined)).toBe('executing')
  })

  /**
   * @example
   * expect(resolveToolCallBlockState(result)).toBe('done')
   */
  it('marks a successful tool result as done', () => {
    const message: ChatAssistantMessage = {
      role: 'assistant',
      content: '',
      slices: [
        {
          type: 'tool-call',
          toolCall: {
            toolCallId: 'call-weather',
            toolCallType: 'function',
            toolName: 'weather',
            args: JSON.stringify({ location: 'Tokyo' }),
          },
        },
        {
          type: 'tool-call-result',
          id: 'call-weather',
          result: 'Tokyo is clear with light wind.',
        },
      ],
      tool_results: [],
    }

    const lookup = createToolCallResultLookup(message.slices, message.tool_results)
    const result = lookup.get('call-weather')

    expect(result?.result).toBe('Tokyo is clear with light wind.')
    expect(resolveToolCallBlockState(result)).toBe('done')
  })

  /**
   * @example
   * expect(resolveToolCallBlockState(result)).toBe('error')
   */
  it('pairs a failed tool result with its tool call id', () => {
    const message: ChatAssistantMessage = {
      role: 'assistant',
      content: '',
      slices: [
        {
          type: 'tool-call',
          toolCall: {
            toolCallId: 'call-play-chess',
            toolCallType: 'function',
            toolName: 'play_chess',
            args: JSON.stringify({ mode: 'new', side: 'white' }),
          },
        },
      ],
      tool_results: [
        {
          id: 'call-play-chess',
          isError: true,
          result: 'Focus mode does not accept game-state mutation inputs.',
        },
      ],
    }

    const lookup = createToolCallResultLookup(message.slices, message.tool_results)
    const result = lookup.get('call-play-chess')

    expect(result?.result).toBe('Focus mode does not accept game-state mutation inputs.')
    expect(resolveToolCallBlockState(result)).toBe('error')
  })

  /**
   * executor_run 异步提交：`{ ok: true, accepted: true, done: false }` 表示计划已被
   * 接受但后台 dsh 仍在执行，卡片应保持「进行中」而不是亮绿勾。
   *
   * @example
   * expect(resolveToolCallBlockState(result)).toBe('executing')
   */
  it('marks an async-accepted executor_run result as executing', () => {
    const message: ChatAssistantMessage = {
      role: 'assistant',
      content: '',
      slices: [
        {
          type: 'tool-call',
          toolCall: {
            toolCallId: 'call-executor-run',
            toolCallType: 'function',
            toolName: 'executor_run',
            args: JSON.stringify({ plan: { id: 'plan-1', tasks: [] } }),
          },
        },
      ],
      tool_results: [
        {
          id: 'call-executor-run',
          result: {
            ok: true,
            accepted: true,
            done: false,
            status: { plan: { id: 'plan-1' } },
          },
        },
      ],
    }

    const lookup = createToolCallResultLookup(message.slices, message.tool_results)
    const result = lookup.get('call-executor-run')

    expect(resolveToolCallBlockState(result)).toBe('executing')
  })

  /**
   * 普通 `{ ok: true }` 结果应保持 done，不应被异步判定误伤。
   *
   * @example
   * expect(resolveToolCallBlockState(result)).toBe('done')
   */
  it('keeps plain ok results as done', () => {
    const message: ChatAssistantMessage = {
      role: 'assistant',
      content: '',
      slices: [
        {
          type: 'tool-call',
          toolCall: {
            toolCallId: 'call-widget',
            toolCallType: 'function',
            toolName: 'set_mood',
            args: '{}',
          },
        },
      ],
      tool_results: [
        {
          id: 'call-widget',
          result: { ok: true },
        },
      ],
    }

    const lookup = createToolCallResultLookup(message.slices, message.tool_results)
    const result = lookup.get('call-widget')

    expect(resolveToolCallBlockState(result)).toBe('done')
  })
})
