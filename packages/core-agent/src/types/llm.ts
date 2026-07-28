import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { CommonContentPart, CompletionToolCall, CompletionToolResult, Message, Tool } from '@xsai/shared-chat'

export interface FinishEvent {
  type: 'finish'
  finishReason?: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens?: number
  }
}

export type StreamEvent
  = | { type: 'text-delta', text: string }
    | { type: 'reasoning-delta', text: string }
    | FinishEvent
    | ({ type: 'tool-call' } & Omit<CompletionToolCall, 'type'>)
    | (CompletionToolResult & { type: 'tool-error' })
    | { type: 'tool-result', toolCallId: string, result?: string | CommonContentPart[] }
    | { type: 'error', error: unknown }

/**
 * Cached compatibility entry with optional TTL support.
 * When `timestamp` is present, the entry expires after COMPATIBILITY_CACHE_TTL.
 */
export interface CachedCompatibility {
  value: boolean
  timestamp?: number
}

export interface StreamOptions {
  abortSignal?: AbortSignal
  headers?: Record<string, string>
  onStreamEvent?: (event: StreamEvent) => void | Promise<void>
  toolsCompatibility?: Map<string, boolean | CachedCompatibility>
  supportsTools?: boolean
  waitForTools?: boolean
  captureToolErrors?: boolean
  tools?: Tool[] | ((options?: { signal?: AbortSignal }) => Promise<Tool[] | undefined>)
  /**
   * Per-model runtime cache of whether the provider accepts content-part arrays
   * (e.g. `[{type:'text',...},{type:'image_url',...}]`) for `messages[].content`.
   *
   * Some OpenAI-compatible providers (notably Rust/serde-strict gateways) only
   * deserialize `content` as a plain string and reject arrays with HTTP 400
   * `Failed to deserialize the JSON body into the target type: messages[N]:
   * invalid type: sequence, expected a string`. When a stream surfaces such an
   * error we set the entry to `false` for the model key and force-flatten on
   * the next attempt.
   *
   * Mirrors {@link toolsCompatibility} for the tool-calling capability.
   *
   * NOTICE: 原项目历史链接，待 Kitsune 仓库确定后更新
   * See: https://github.com/moeru-ai/airi/issues/1500
   */
  contentArrayCompatibility?: Map<string, boolean | CachedCompatibility>
  supportsContentArray?: boolean
}

export type BuiltinToolsResolver = (model: string, chatProvider: ChatProvider) => Promise<Tool[]>

export interface StreamFromOptions {
  model: string
  chatProvider: ChatProvider
  messages: Message[]
  options?: StreamOptions
  builtinToolsResolver?: BuiltinToolsResolver
}
