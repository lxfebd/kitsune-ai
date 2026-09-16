import type { ChatAssistantMessage, ChatSlices, ChatSlicesToolCallResult } from '../../../../types/chat'

/**
 * Creates a lookup from tool-call id to its latest result slice.
 *
 * Use when:
 * - Rendering assistant messages with separate `tool-call` and `tool-call-result` data
 * - Streaming messages store tool results on `tool_results` instead of inline slices
 *
 * Expects:
 * - Tool call ids use `toolCall.toolCallId`
 * - Tool result ids use `id`
 *
 * Returns:
 * - A map keyed by tool call id, preferring inline result slices over stored results
 */
export function createToolCallResultLookup(
  slices: ChatSlices[],
  toolResults: ChatAssistantMessage['tool_results'] = [],
): Map<string, ChatSlicesToolCallResult> {
  const resultMap = new Map<string, ChatSlicesToolCallResult>()

  for (const result of toolResults) {
    resultMap.set(result.id, {
      type: 'tool-call-result',
      ...result,
    })
  }

  for (const slice of slices) {
    if (slice.type === 'tool-call-result') {
      resultMap.set(slice.id, slice)
    }
  }

  return resultMap
}

/**
 * Resolves the visual state for a tool call block from its result.
 *
 * Use when:
 * - Tool call UI needs to show success or failure without replacing the assistant message
 *
 * Expects:
 * - Missing result means the call is still running
 *
 * Returns:
 * - `executing` for missing results, `error` for failed results, or `done` for successful results
 */
/**
 * 判断工具结果是否为「异步提交成功但尚未执行完成」。
 *
 * 执行器类的工具（executor_run / coordinator_delegate）返回的是
 * `{ ok: true, accepted: true, done: false }`：
 * 计划已被接受、后台 dsh 正在执行，调用方需要轮询 executor_status 才能看到终态。
 * 这种结果在 UI 上应表现为「进行中」而非「已完成」，否则卡片会在 dsh 真正跑完前
 * 就亮起绿勾，用户以为任务瞬间完成、看不到执行过程。
 *
 * 判定规则：`accepted: true` 且未显式标记 `done: true`（含 done 字段缺失的情况，
 * 如早期版本只返回「执行已开始，进度见执行面板」）都视为执行中。
 */
function isAsyncAcceptedIncompleteResult(result: ChatSlicesToolCallResult): boolean {
  const value = result.result
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return false

  const record = value as unknown as Record<string, unknown>
  return record.ok === true && record.accepted === true && record.done !== true
}

export function resolveToolCallBlockState(result: ChatSlicesToolCallResult | undefined): 'executing' | 'done' | 'error' {
  if (!result) {
    return 'executing'
  }

  if (result.isError)
    return 'error'

  if (isAsyncAcceptedIncompleteResult(result))
    return 'executing'

  return 'done'
}
