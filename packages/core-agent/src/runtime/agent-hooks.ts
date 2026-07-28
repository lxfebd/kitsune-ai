import type { ToolMessage } from '@xsai/shared-chat'

import type { AgentHookRegistry, ChatHookRegistry } from '../contracts/hook-types'
import type { ChatStreamEventContext, StreamingAssistantMessage } from '../types/chat'

import { errorMessageFrom } from '@moeru/std'

// NOTICE:
// Default hook timeout to prevent slow hooks from blocking the streaming
// pipeline indefinitely. Hooks that exceed this timeout are treated as failures.
const DEFAULT_HOOK_TIMEOUT_MS = 5000

export function createChatHooks(): ChatHookRegistry {
  const onBeforeMessageComposedHooks: Array<(message: string, context: Omit<ChatStreamEventContext, 'composedMessage'>) => Promise<void>> = []
  const onAfterMessageComposedHooks: Array<(message: string, context: ChatStreamEventContext) => Promise<void>> = []
  const onBeforeSendHooks: Array<(message: string, context: ChatStreamEventContext) => Promise<void>> = []
  const onAfterSendHooks: Array<(message: string, context: ChatStreamEventContext) => Promise<void>> = []
  const onTokenLiteralHooks: Array<(literal: string, context: ChatStreamEventContext) => Promise<void>> = []
  const onTokenSpecialHooks: Array<(special: string, context: ChatStreamEventContext) => Promise<void>> = []
  const onStreamEndHooks: Array<(context: ChatStreamEventContext) => Promise<void>> = []
  const onAssistantResponseEndHooks: Array<(message: string, context: ChatStreamEventContext) => Promise<void>> = []
  const onAssistantMessageHooks: Array<(message: StreamingAssistantMessage, messageText: string, context: ChatStreamEventContext) => Promise<void>> = []
  const onChatTurnCompleteHooks: Array<(chat: { output: StreamingAssistantMessage, outputText: string, toolCalls: ToolMessage[] }, context: ChatStreamEventContext) => Promise<void>> = []

  function onBeforeMessageComposed(cb: (message: string, context: Omit<ChatStreamEventContext, 'composedMessage'>) => Promise<void>) {
    onBeforeMessageComposedHooks.push(cb)
    return () => {
      const index = onBeforeMessageComposedHooks.indexOf(cb)
      if (index >= 0)
        onBeforeMessageComposedHooks.splice(index, 1)
    }
  }

  function onAfterMessageComposed(cb: (message: string, context: ChatStreamEventContext) => Promise<void>) {
    onAfterMessageComposedHooks.push(cb)
    return () => {
      const index = onAfterMessageComposedHooks.indexOf(cb)
      if (index >= 0)
        onAfterMessageComposedHooks.splice(index, 1)
    }
  }

  function onBeforeSend(cb: (message: string, context: ChatStreamEventContext) => Promise<void>) {
    onBeforeSendHooks.push(cb)
    return () => {
      const index = onBeforeSendHooks.indexOf(cb)
      if (index >= 0)
        onBeforeSendHooks.splice(index, 1)
    }
  }

  function onAfterSend(cb: (message: string, context: ChatStreamEventContext) => Promise<void>) {
    onAfterSendHooks.push(cb)
    return () => {
      const index = onAfterSendHooks.indexOf(cb)
      if (index >= 0)
        onAfterSendHooks.splice(index, 1)
    }
  }

  function onTokenLiteral(cb: (literal: string, context: ChatStreamEventContext) => Promise<void>) {
    onTokenLiteralHooks.push(cb)
    return () => {
      const index = onTokenLiteralHooks.indexOf(cb)
      if (index >= 0)
        onTokenLiteralHooks.splice(index, 1)
    }
  }

  function onTokenSpecial(cb: (special: string, context: ChatStreamEventContext) => Promise<void>) {
    onTokenSpecialHooks.push(cb)
    return () => {
      const index = onTokenSpecialHooks.indexOf(cb)
      if (index >= 0)
        onTokenSpecialHooks.splice(index, 1)
    }
  }

  function onStreamEnd(cb: (context: ChatStreamEventContext) => Promise<void>) {
    onStreamEndHooks.push(cb)
    return () => {
      const index = onStreamEndHooks.indexOf(cb)
      if (index >= 0)
        onStreamEndHooks.splice(index, 1)
    }
  }

  function onAssistantResponseEnd(cb: (message: string, context: ChatStreamEventContext) => Promise<void>) {
    onAssistantResponseEndHooks.push(cb)
    return () => {
      const index = onAssistantResponseEndHooks.indexOf(cb)
      if (index >= 0)
        onAssistantResponseEndHooks.splice(index, 1)
    }
  }

  function onAssistantMessage(cb: (message: StreamingAssistantMessage, messageText: string, context: ChatStreamEventContext) => Promise<void>) {
    onAssistantMessageHooks.push(cb)
    return () => {
      const index = onAssistantMessageHooks.indexOf(cb)
      if (index >= 0)
        onAssistantMessageHooks.splice(index, 1)
    }
  }

  function onChatTurnComplete(cb: (chat: { output: StreamingAssistantMessage, outputText: string, toolCalls: ToolMessage[] }, context: ChatStreamEventContext) => Promise<void>) {
    onChatTurnCompleteHooks.push(cb)
    return () => {
      const index = onChatTurnCompleteHooks.indexOf(cb)
      if (index >= 0)
        onChatTurnCompleteHooks.splice(index, 1)
    }
  }

  function clearHooks() {
    onBeforeMessageComposedHooks.length = 0
    onAfterMessageComposedHooks.length = 0
    onBeforeSendHooks.length = 0
    onAfterSendHooks.length = 0
    onTokenLiteralHooks.length = 0
    onTokenSpecialHooks.length = 0
    onStreamEndHooks.length = 0
    onAssistantResponseEndHooks.length = 0
    onAssistantMessageHooks.length = 0
    onChatTurnCompleteHooks.length = 0
  }

  /**
   * Execute hooks with per-hook error isolation.
   *
   * NOTICE:
   * Each hook is wrapped in try-catch to prevent one failed hook from aborting
   * all subsequent hooks. Errors are collected and logged but do not propagate.
   * An optional `onHookError` callback can be provided to observe failures.
   *
   * @param hooks - Array of hook functions to execute
   * @param args - Arguments to pass to each hook
   * @param hookName - Name of the hook group for logging
   */
  async function emitHooksSafely<T extends any[]>(
    hooks: Array<(...args: T) => Promise<void>>,
    args: T,
    hookName: string,
  ): Promise<void> {
    const errors: Error[] = []

    for (const hook of hooks) {
      try {
        // NOTICE:
        // Wrap each hook with a timeout to prevent slow hooks from blocking
        // the streaming pipeline indefinitely.
        const timeoutPromise = new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error(`Hook ${hookName} timed out after ${DEFAULT_HOOK_TIMEOUT_MS}ms`)), DEFAULT_HOOK_TIMEOUT_MS)
        })
        await Promise.race([hook(...args), timeoutPromise])
      }
      catch (error) {
        const err = error instanceof Error ? error : new Error(errorMessageFrom(error) ?? 'Unknown hook error')
        errors.push(err)
        console.warn(`[ChatHooks] ${hookName} hook error:`, err.message)
      }
    }

    // If any hooks failed, log summary but don't throw
    if (errors.length > 0) {
      console.warn(`[ChatHooks] ${errors.length}/${hooks.length} ${hookName} hooks failed`)
    }
  }

  async function emitBeforeMessageComposedHooks(message: string, context: Omit<ChatStreamEventContext, 'composedMessage'>) {
    await emitHooksSafely(onBeforeMessageComposedHooks, [message, context] as const, 'onBeforeMessageComposed')
  }

  async function emitAfterMessageComposedHooks(message: string, context: ChatStreamEventContext) {
    await emitHooksSafely(onAfterMessageComposedHooks, [message, context] as const, 'onAfterMessageComposed')
  }

  async function emitBeforeSendHooks(message: string, context: ChatStreamEventContext) {
    await emitHooksSafely(onBeforeSendHooks, [message, context] as const, 'onBeforeSend')
  }

  async function emitAfterSendHooks(message: string, context: ChatStreamEventContext) {
    await emitHooksSafely(onAfterSendHooks, [message, context] as const, 'onAfterSend')
  }

  async function emitTokenLiteralHooks(literal: string, context: ChatStreamEventContext) {
    await emitHooksSafely(onTokenLiteralHooks, [literal, context] as const, 'onTokenLiteral')
  }

  async function emitTokenSpecialHooks(special: string, context: ChatStreamEventContext) {
    await emitHooksSafely(onTokenSpecialHooks, [special, context] as const, 'onTokenSpecial')
  }

  async function emitStreamEndHooks(context: ChatStreamEventContext) {
    await emitHooksSafely(onStreamEndHooks, [context] as const, 'onStreamEnd')
  }

  async function emitAssistantResponseEndHooks(message: string, context: ChatStreamEventContext) {
    await emitHooksSafely(onAssistantResponseEndHooks, [message, context] as const, 'onAssistantResponseEnd')
  }

  async function emitAssistantMessageHooks(message: StreamingAssistantMessage, messageText: string, context: ChatStreamEventContext) {
    await emitHooksSafely(onAssistantMessageHooks, [message, messageText, context] as const, 'onAssistantMessage')
  }

  async function emitChatTurnCompleteHooks(chat: { output: StreamingAssistantMessage, outputText: string, toolCalls: ToolMessage[] }, context: ChatStreamEventContext) {
    await emitHooksSafely(onChatTurnCompleteHooks, [chat, context] as const, 'onChatTurnComplete')
  }

  return {
    onBeforeMessageComposed,
    onAfterMessageComposed,
    onBeforeSend,
    onAfterSend,
    onTokenLiteral,
    onTokenSpecial,
    onStreamEnd,
    onAssistantResponseEnd,
    onAssistantMessage,
    onChatTurnComplete,
    emitBeforeMessageComposedHooks,
    emitAfterMessageComposedHooks,
    emitBeforeSendHooks,
    emitAfterSendHooks,
    emitTokenLiteralHooks,
    emitTokenSpecialHooks,
    emitStreamEndHooks,
    emitAssistantResponseEndHooks,
    emitAssistantMessageHooks,
    emitChatTurnCompleteHooks,
    clearHooks,
  }
}

export function createAgentHooks<TContext, TAssistantMessage, TToolCall>(): AgentHookRegistry<TContext, TAssistantMessage, TToolCall> {
  const onBeforeMessageComposedHooks: Array<(message: string, context: Omit<TContext, 'composedMessage'>) => Promise<void>> = []
  const onAfterMessageComposedHooks: Array<(message: string, context: TContext) => Promise<void>> = []
  const onBeforeSendHooks: Array<(message: string, context: TContext) => Promise<void>> = []
  const onAfterSendHooks: Array<(message: string, context: TContext) => Promise<void>> = []
  const onTokenLiteralHooks: Array<(literal: string, context: TContext) => Promise<void>> = []
  const onTokenSpecialHooks: Array<(special: string, context: TContext) => Promise<void>> = []
  const onStreamEndHooks: Array<(context: TContext) => Promise<void>> = []
  const onAssistantResponseEndHooks: Array<(message: string, context: TContext) => Promise<void>> = []
  const onAssistantMessageHooks: Array<(message: TAssistantMessage, messageText: string, context: TContext) => Promise<void>> = []
  const onChatTurnCompleteHooks: Array<(chat: { output: TAssistantMessage, outputText: string, toolCalls: TToolCall[] }, context: TContext) => Promise<void>> = []

  function createSubscribe<T>(bucket: T[], cb: T) {
    bucket.push(cb)
    return () => {
      const index = bucket.indexOf(cb)
      if (index >= 0)
        bucket.splice(index, 1)
    }
  }

  function clearHooks() {
    onBeforeMessageComposedHooks.length = 0
    onAfterMessageComposedHooks.length = 0
    onBeforeSendHooks.length = 0
    onAfterSendHooks.length = 0
    onTokenLiteralHooks.length = 0
    onTokenSpecialHooks.length = 0
    onStreamEndHooks.length = 0
    onAssistantResponseEndHooks.length = 0
    onAssistantMessageHooks.length = 0
    onChatTurnCompleteHooks.length = 0
  }

  /**
   * Execute hooks with per-hook error isolation.
   *
   * NOTICE:
   * Each hook is wrapped in try-catch to prevent one failed hook from aborting
   * all subsequent hooks. Errors are collected and logged but do not propagate.
   */
  async function emitHooks<T extends any[]>(hooks: Array<(...args: T) => Promise<void>>, ...args: T) {
    const errors: Error[] = []

    for (const hook of hooks) {
      try {
        await hook(...args)
      }
      catch (error) {
        const err = error instanceof Error ? error : new Error(errorMessageFrom(error) ?? 'Unknown hook error')
        errors.push(err)
        console.warn('[AgentHooks] hook error:', err.message)
      }
    }

    if (errors.length > 0) {
      console.warn(`[AgentHooks] ${errors.length}/${hooks.length} hooks failed`)
    }
  }

  return {
    onBeforeMessageComposed: cb => createSubscribe(onBeforeMessageComposedHooks, cb),
    onAfterMessageComposed: cb => createSubscribe(onAfterMessageComposedHooks, cb),
    onBeforeSend: cb => createSubscribe(onBeforeSendHooks, cb),
    onAfterSend: cb => createSubscribe(onAfterSendHooks, cb),
    onTokenLiteral: cb => createSubscribe(onTokenLiteralHooks, cb),
    onTokenSpecial: cb => createSubscribe(onTokenSpecialHooks, cb),
    onStreamEnd: cb => createSubscribe(onStreamEndHooks, cb),
    onAssistantResponseEnd: cb => createSubscribe(onAssistantResponseEndHooks, cb),
    onAssistantMessage: cb => createSubscribe(onAssistantMessageHooks, cb),
    onChatTurnComplete: cb => createSubscribe(onChatTurnCompleteHooks, cb),

    emitBeforeMessageComposedHooks: (message, context) => emitHooks(onBeforeMessageComposedHooks, message, context),
    emitAfterMessageComposedHooks: (message, context) => emitHooks(onAfterMessageComposedHooks, message, context),
    emitBeforeSendHooks: (message, context) => emitHooks(onBeforeSendHooks, message, context),
    emitAfterSendHooks: (message, context) => emitHooks(onAfterSendHooks, message, context),
    emitTokenLiteralHooks: (literal, context) => emitHooks(onTokenLiteralHooks, literal, context),
    emitTokenSpecialHooks: (special, context) => emitHooks(onTokenSpecialHooks, special, context),
    emitStreamEndHooks: context => emitHooks(onStreamEndHooks, context),
    emitAssistantResponseEndHooks: (message, context) => emitHooks(onAssistantResponseEndHooks, message, context),
    emitAssistantMessageHooks: (message, messageText, context) => emitHooks(onAssistantMessageHooks, message, messageText, context),
    emitChatTurnCompleteHooks: (chat, context) => emitHooks(onChatTurnCompleteHooks, chat, context),
    clearHooks,
  }
}
