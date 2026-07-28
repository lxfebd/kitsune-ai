import type { WebSocketEventInputs } from '@kitsune/server-sdk'
import type { ChatHistoryItem, ChatSlices, StreamingAssistantMessage } from '@kitsune/stage-ui/types/chat'
import type { ChatSessionMeta } from '@kitsune/stage-ui/types/chat-session'
import type { ChatProvider } from '@xsai-ext/providers/utils'

import { defineInvoke } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { errorMessageFromValue } from '@kitsune/stage-shared'
import { getElectronEventaContext } from '@kitsune/electron-vueuse'
import { ContextUpdateStrategy } from '@kitsune/server-sdk'
import { extractMessageText } from '@kitsune/stage-ui/libs/chat-sync/wire-message'
import { useChatContextStore } from '@kitsune/stage-ui/stores/chat/context-store'
import { useChatOrchestratorStore } from '@kitsune/stage-ui/stores/chat'
import { useChatMaintenanceStore } from '@kitsune/stage-ui/stores/chat/maintenance'
import { useChatSessionStore } from '@kitsune/stage-ui/stores/chat/session-store'
import { useChatStreamStore } from '@kitsune/stage-ui/stores/chat/stream-store'
import { useActiveModelStore } from '@kitsune/stage-ui/stores/modules/active-model'
import { useProvidersStore } from '@kitsune/stage-ui/stores/providers'
import { defineStore, storeToRefs } from 'pinia'
import { ref, toRaw, watch } from 'vue'

import {
  electronMemoryExtractAndSave,
  electronMemorySearchForChat,
  electronPersonaBuildContext,
} from '../../shared/eventa'
import { desktopAutomationTools } from './tools/builtin/desktop-automation'
import { imageJournalTools } from './tools/builtin/image-journal'
import { weatherTools } from './tools/builtin/weather'
import { widgetsTools } from './tools/builtin/widgets'

type ChatSyncMode = 'inactive' | 'authority' | 'follower'
type ToolsetId = 'widgets' | 'artistry' | 'automation'

interface AttachmentPayload {
  type: 'image'
  data: string
  mimeType: string
}

interface SessionSnapshotPayload {
  activeSessionId: string
  sessionMessages: Record<string, ChatHistoryItem[]>
  sessionMetas: Record<string, ChatSessionMeta>
}

interface StreamSnapshotPayload {
  sending: boolean
  streamingMessage: StreamingAssistantMessage
}

/**
 * 流式期间的增量 patch：仅包含 streaming 过程中高频变化的字段。
 *
 * 与完整 `StreamSnapshotPayload` 相比，不携带 `tool_results`、`categorization`、
 * `context`、`createdAt`、`id` 等低频或不变字段，减少每 token 同步的数据量。
 * 接收方通过 `applyStreamPatch` 合并到既有 `streamingMessage`，需先收到一次
 * 完整 `stream-snapshot` 作为基线。
 */
interface StreamPatchPayload {
  sending: boolean
  content: StreamingAssistantMessage['content']
  slices: ChatSlices[]
}

interface IngestCommandPayload {
  text: string
  attachments?: AttachmentPayload[]
  input?: WebSocketEventInputs
  sessionId?: string
  toolset?: ToolsetId
}

interface SpotlightIngestPayload {
  text: string
}

interface SpotlightIngestResult {
  sessionId: string
  visibleText: string
}

interface ChatCommandMessage<C extends string = string, P = unknown> {
  type: 'command'
  authorityId?: string
  requestId: string
  senderId: string
  command: C
  payload: P
}

interface RetryCommandPayload {
  sessionId?: string
  index: number
}

type ChatResponsePayload
  = | { ok: true, result?: SpotlightIngestResult }
    | { ok: false, error?: string }

type ChatSyncMessage
  = | { type: 'authority-announcement', authorityId: string, sentAt: number }
    | { type: 'request-snapshot', requestId: string, senderId: string }
    | { type: 'session-snapshot', authorityId: string, snapshot: SessionSnapshotPayload }
    | { type: 'stream-snapshot', authorityId: string, snapshot: StreamSnapshotPayload }
    | { type: 'stream-patch', authorityId: string, patch: StreamPatchPayload }
    | ChatCommandMessage<'ingest', IngestCommandPayload>
    | ChatCommandMessage<'spotlight-ingest', SpotlightIngestPayload>
    | ChatCommandMessage<'retry', RetryCommandPayload>
    | ChatCommandMessage<'cleanup', { sessionId?: string }>
    | ChatCommandMessage<'delete-message', { sessionId?: string, messageId?: string, index?: number }>
    | ({ type: 'response', requestId: string, authorityId: string } & ChatResponsePayload)

interface PendingRequest {
  resolve: (result?: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

const CHAT_SYNC_CHANNEL_NAME = 'kitsune:stage-tamagotchi:chat-sync'
const AUTHORITY_HEARTBEAT_INTERVAL_MS = 1000
const REQUEST_TIMEOUT_MS = 30000
const SPOTLIGHT_REQUEST_TIMEOUT_MS = 5 * 60 * 1000

function createRequestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function getRetryText(message: ChatHistoryItem | undefined): string | null {
  if (!message || message.role !== 'user')
    return null

  if (typeof message.content === 'string') {
    const text = message.content.trim()
    return text || null
  }

  if (!Array.isArray(message.content))
    return null

  const text = message.content.reduce<string[]>((texts, part) => {
    if (part.type !== 'text')
      return texts

    const value = part.text?.trim()
    if (value)
      texts.push(value)

    return texts
  }, []).join('\n\n')

  return text || null
}

function resolveRetrySourceIndex(messages: ChatHistoryItem[], index: number): number {
  const targetMessage = messages[index]
  if (!targetMessage)
    return -1

  if (targetMessage.role === 'user')
    return index

  if (targetMessage.role === 'assistant' || targetMessage.role === 'error') {
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      if (messages[cursor]?.role === 'user')
        return cursor
    }
  }

  return -1
}

function previewChatSyncPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') {
    return payload
  }

  const record = payload as Record<string, unknown>
  const text = typeof record.text === 'string' ? record.text : undefined

  return {
    ...record,
    text: text && text.length > 160 ? `${text.slice(0, 160)}...` : text,
    attachments: Array.isArray(record.attachments)
      ? `[${record.attachments.length} attachment(s)]`
      : record.attachments,
  }
}

function logChatSyncError(message: string, error: unknown, details: Record<string, unknown>) {
  console.error(`[chat-sync] ${message}`, {
    ...details,
    error,
    errorMessage: errorMessageFromValue(error),
  })
}

export const useChatSyncStore = defineStore('stage-tamagotchi:chat-sync', () => {
  const instanceId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  const mode = ref<ChatSyncMode>('inactive')
  const authorityId = ref<string | null>(null)

  const chatSession = useChatSessionStore()
  const chatStream = useChatStreamStore()
  const chatContext = useChatContextStore()
  const chatOrchestrator = useChatOrchestratorStore()
  const { cleanupMessages } = useChatMaintenanceStore()
  const providersStore = useProvidersStore()
  const activeModelStore = useActiveModelStore()
  const { activeProvider, activeModel } = storeToRefs(activeModelStore)
  const { activeSessionId, sessionMessages, sessionMetas } = storeToRefs(chatSession)
  const { streamingMessage } = storeToRefs(chatStream)
  const { sending } = storeToRefs(chatOrchestrator)

  const pendingRequests = new Map<string, PendingRequest>()
  const stopSyncWatchers: Array<() => void> = []
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined
  let channel: BroadcastChannel | null = null

  /** 记忆 IPC 调用 — 仅在 authority 模式下使用 */
  let memoryIpc: {
    extractAndSave: (payload: { userMessage: string, assistantMessage: string, sessionId: string }) => Promise<{ saved: number }>
    searchForChat: (payload: { query: string, sessionId: string }) => Promise<Array<{ content: string }>>
  } | null = null

  function ensureMemoryIpc() {
    if (memoryIpc)
      return
    if (typeof window !== 'undefined' && window.electron?.ipcRenderer) {
      const context = getElectronEventaContext()
      memoryIpc = {
        extractAndSave: defineInvoke(context, electronMemoryExtractAndSave),
        searchForChat: defineInvoke(context, electronMemorySearchForChat),
      }
    }
  }

  function post(message: ChatSyncMessage) {
    channel?.postMessage(message)
  }

  function buildSessionSnapshot(): SessionSnapshotPayload {
    return chatSession.getSnapshot()
  }

  /**
   * 构建流式期间的增量 patch。
   *
   * 仅提取 `content` 与 `slices` 的当前值引用，不做深拷贝。
   * `BroadcastChannel.postMessage` 会通过结构化克隆算法向接收方传递独立副本，
   * 因此这里无需手动序列化；原实现用 `JSON.parse(JSON.stringify(...))` 会造成
   * 双重序列化（先 JSON round-trip，再由 postMessage 结构化克隆），在 streaming
   * 期间每 token 触发时产生显著开销。
   *
   * 接收方需先收到一次 `buildFullSnapshot` 作为基线，再通过 `applyStreamPatch` 合并。
   */
  // NOTICE: toRaw() is required here for the same reason as in
  // buildFullSnapshot — streamingMessage.value is a Vue reactive Proxy.
  // BroadcastChannel.postMessage uses structured clone internally, which
  // cannot clone Proxy objects (throws DataCloneError). toRaw() unwraps
  // the proxy to a plain object before postMessage does its own clone.
  function buildStreamPatch(): StreamPatchPayload {
    const message = toRaw(streamingMessage.value)
    return {
      sending: sending.value,
      content: message.content,
      slices: message.slices,
    }
  }

  /**
   * 构建完整流式快照，用于初始同步（如 follower 首次请求 snapshot、authority 启动）。
   *
   * 使用 `structuredClone` 替代 `JSON.parse(JSON.stringify(...))`：
   * - 性能略优于 JSON round-trip；
   * - 能正确处理 JSON 无法表达的运行时值（如 `Date`、`Map`、`Set`、循环引用）。
   *
   * NOTICE: `toRaw` 必须在 `structuredClone` 之前调用。`streamingMessage` 来自
   * `ref()`（deep reactive），`.value` 是 Vue 响应式 Proxy。`structuredClone`
   * 无法克隆 Proxy（抛出 DataCloneError），`toRaw` 解包为原始普通对象后克隆即可正常工作。
   * 与 `stream-store.ts` 的 `toRaw(streamingMessage.value)` 用法一致。
   *
   * 注意：`postMessage` 仍会对返回值再做一次结构化克隆，这里的 `structuredClone`
   * 主要用于语义明确——表示这是完整深拷贝，调用方可在同进程内独立持有该快照。
   */
  function buildFullSnapshot(): StreamSnapshotPayload {
    return {
      sending: sending.value,
      streamingMessage: structuredClone(toRaw(streamingMessage.value)) as StreamingAssistantMessage,
    }
  }

  function broadcastAuthorityAnnouncement() {
    if (mode.value !== 'authority')
      return

    post({
      type: 'authority-announcement',
      authorityId: instanceId,
      sentAt: Date.now(),
    })
  }

  function broadcastSessionSnapshot() {
    if (mode.value !== 'authority')
      return

    post({
      type: 'session-snapshot',
      authorityId: instanceId,
      snapshot: buildSessionSnapshot(),
    })
  }

  /**
   * 流式期间高频广播增量 patch（仅 content + slices）。
   *
   * 由精确 watch 在 `content` 或 `slices.length` 变化时触发，
   * 替代原 deep watch + 完整 snapshot 的方案，避免每 token 全量深拷贝。
   */
  function broadcastStreamPatch() {
    if (mode.value !== 'authority')
      return

    post({
      type: 'stream-patch',
      authorityId: instanceId,
      patch: buildStreamPatch(),
    })
  }

  /**
   * 广播完整流式快照，用于初始同步（authority 启动、follower 首次拉取）。
   *
   * 发送完整 `streamingMessage`，使 follower 建立基线，后续可通过 `stream-patch` 增量合并。
   */
  function broadcastStreamSnapshot() {
    if (mode.value !== 'authority')
      return

    post({
      type: 'stream-snapshot',
      authorityId: instanceId,
      snapshot: buildFullSnapshot(),
    })
  }

  function stopWatchers() {
    while (stopSyncWatchers.length > 0) {
      const stop = stopSyncWatchers.pop()
      stop?.()
    }
  }

  function clearHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = undefined
    }
  }

  function registerAuthorityWatchers() {
    stopSyncWatchers.push(
      // session 相关快照仍需 deep watch：sessionMessages/sessionMetas 是嵌套结构，
      // 内部消息增删与字段修改都需要同步给 follower。
      watch([activeSessionId, sessionMessages, sessionMetas], () => {
        broadcastSessionSnapshot()
      }, { deep: true, immediate: true }),
      // 流式同步改为精确 watch：仅监听 `sending`、`content`、`slices.length` 三个原始值。
      //
      // 原 `watch([sending, streamingMessage], { deep: true })` 会在 streamingMessage
      // 任意嵌套属性变化时触发，且每次触发都对 streamingMessage 做全量深拷贝，
      // streaming 期间（30-60 次/秒 token 拼接）造成严重性能负担。
      //
      // streaming 期间的主要变化是 `content` 字符串拼接（每个 token 产生新字符串）
      // 与 `slices` 新增条目（`slices.length` 变化）；slice 内部 text 修改伴随 content
      // 变化触发，无需单独监听。因此监听这三个原始值即可覆盖 streaming 高频路径，
      // 并通过 `broadcastStreamPatch` 发送轻量增量 patch。
      watch(
        () => [sending.value, streamingMessage.value.content, streamingMessage.value.slices.length],
        () => {
          broadcastStreamPatch()
        },
        { immediate: true },
      ),
    )

    broadcastAuthorityAnnouncement()
    clearHeartbeat()
    heartbeatTimer = setInterval(() => {
      broadcastAuthorityAnnouncement()
    }, AUTHORITY_HEARTBEAT_INTERVAL_MS)
  }

  function applySessionSnapshot(snapshot: SessionSnapshotPayload) {
    const localActiveSessionId = activeSessionId.value
    const shouldPreserveLocalActiveSession = mode.value === 'follower'
      && !!localActiveSessionId
      && !!snapshot.sessionMessages[localActiveSessionId]

    chatSession.applyRemoteSnapshot({
      ...snapshot,
      activeSessionId: shouldPreserveLocalActiveSession
        ? localActiveSessionId
        : snapshot.activeSessionId,
    })
  }

  function applyStreamSnapshot(snapshot: StreamSnapshotPayload) {
    chatOrchestrator.sending = snapshot.sending
    chatStream.streamingMessage = snapshot.streamingMessage
  }

  /**
   * 将增量 patch 合并到本地 `streamingMessage`。
   *
   * 仅更新 `content` 与 `slices`，保留 `role`、`tool_results`、`categorization`、
   * `createdAt`、`id` 等字段不变——这些字段在 streaming 期间不会高频变化，
   * 已通过初始 `stream-snapshot` 建立基线。
   *
   * `chatStream.streamingMessage` 在 stream-store 中初始化为非 null 空对象，
   * 因此 `current` 总是可用；即便 follower 尚未收到完整 snapshot，直接写入
   * content/slices 也是安全的（空对象本身可作为基线）。
   */
  function applyStreamPatch(patch: StreamPatchPayload) {
    chatOrchestrator.sending = patch.sending
    const current = chatStream.streamingMessage
    current.content = patch.content
    current.slices = patch.slices
  }

  function resolveTools(toolset?: ToolsetId) {
    const toolsetRegistry: Record<string, () => Promise<Array<Record<string, unknown>>>> = {
      widgets: async () => {
        const [w, we] = await Promise.all([widgetsTools(), weatherTools()])
        return [...w, ...we]
      },
      artistry: async () => {
        const [ai, wi, we] = await Promise.all([
          imageJournalTools(),
          widgetsTools(),
          weatherTools(),
        ])
        return [...ai, ...wi, ...we]
      },
      automation: async () => {
        const [d, w, we] = await Promise.all([
          desktopAutomationTools(),
          widgetsTools(),
          weatherTools(),
        ])
        return [...d, ...w, ...we]
      },
    }

    if (toolset && toolsetRegistry[toolset]) {
      return toolsetRegistry[toolset]
    }

    return undefined
  }

  function readNewAssistantVisibleText(sessionId: string, fromIndex: number): string {
    const assistant = chatSession.getSessionMessages(sessionId)
      .slice(fromIndex)
      .reverse()
      .find(message => message.role === 'assistant')
    return assistant ? extractMessageText(assistant) : ''
  }

  async function executeIngest(payload: IngestCommandPayload): Promise<void> {
    const providerId = activeProvider.value
    const modelId = activeModel.value
    if (!providerId || !modelId) {
      throw new Error('No active chat provider or model configured')
    }

    const chatProvider = await providersStore.getProviderInstance<ChatProvider>(providerId)
    if (!chatProvider) {
      throw new Error(`Failed to resolve chat provider "${providerId}"`)
    }

    const sessionId = payload.sessionId || activeSessionId.value

    // Task 7: Persona context 预热 — 在 ingest 之前异步获取，供 getSystemPromptSupplement 同步读取
    // 缓存 60s 有效期内跳过 IPC，避免每次消息都重复构建
    try {
      if (!chatOrchestrator.isPersonaCacheValid(sessionId)) {
        if (window.electron?.ipcRenderer) {
          const personaContext = getElectronEventaContext()
          const buildPersonaContext = defineInvoke(personaContext, electronPersonaBuildContext)
          const personaResult = await buildPersonaContext({ sessionId, input: payload.text })
          if (personaResult?.prompt) {
            chatOrchestrator.setCachedPersonaPrompt(personaResult.prompt, sessionId)
          }
        }
      }
    }
    catch (err) {
      console.error('[persona] Failed to build persona context:', err)
    }

    // Task 11: 记忆检索 — 发送前检索相关记忆并注入上下文
    ensureMemoryIpc()
    if (memoryIpc) {
      try {
        const memories = await memoryIpc.searchForChat({ query: payload.text, sessionId })
        if (memories.length > 0) {
          const memoryText = memories.map(m => m.content).join('\n')
          const memoryId = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
          chatContext.ingestContextMessage({
            id: memoryId,
            contextId: 'memory',
            strategy: ContextUpdateStrategy.ReplaceSelf,
            text: `以下是相关的历史记忆：\n${memoryText}`,
            createdAt: Date.now(),
          })
        }
      }
      catch (err) {
        console.error('[memory] Failed to search memory:', err)
      }
    }

    await chatOrchestrator.ingest(payload.text, {
      model: modelId,
      chatProvider,
      attachments: payload.attachments,
      input: payload.input,
      tools: resolveTools(payload.toolset),
    }, sessionId)

    // Task 10: 记忆写入 — 流式完成后提取对话中的记忆并保存
    if (memoryIpc) {
      try {
        const assistantMessage = readNewAssistantVisibleText(sessionId, Math.max(0, chatSession.getSessionMessages(sessionId).length - 2))
        if (assistantMessage) {
          await memoryIpc.extractAndSave({
            userMessage: payload.text,
            assistantMessage,
            sessionId,
          })
        }
      }
      catch (err) {
        console.error('[memory] Failed to extract and save memory:', err)
      }
    }
  }

  async function executeSpotlightIngest(payload: SpotlightIngestPayload): Promise<SpotlightIngestResult> {
    // NOTICE: `chatOrchestrator.ingest()` returns void; remove this snapshot
    // read once ingest returns `{ sessionId, visibleText }`.
    const sessionId = activeSessionId.value
    const previousMessageCount = chatSession.getSessionMessages(sessionId).length

    await executeIngest({
      text: payload.text,
      toolset: 'artistry',
      sessionId,
    })

    const visibleText = readNewAssistantVisibleText(sessionId, previousMessageCount)
    if (!visibleText.trim())
      throw new Error('Spotlight returned an empty response')

    return {
      sessionId,
      visibleText,
    }
  }

  async function executeRetry(payload: RetryCommandPayload) {
    const sessionId = payload.sessionId || activeSessionId.value
    const currentMessages = chatSession.getSessionMessages(sessionId)
    const sourceIndex = resolveRetrySourceIndex(currentMessages, payload.index)
    if (sourceIndex < 0)
      throw new Error('Retry target has no retriable source message')

    const text = getRetryText(currentMessages[sourceIndex])
    if (!text)
      throw new Error('Retry target has no retriable user message')

    const nextMessages = currentMessages.slice(0, sourceIndex)
    chatSession.setSessionMessages(sessionId, nextMessages)

    await executeIngest({
      text,
      sessionId,
      toolset: 'widgets',
    })
  }

  function executeDeleteMessage(payload: { sessionId?: string, messageId?: string, index?: number }) {
    const sessionId = payload.sessionId || activeSessionId.value
    const nextMessages = chatSession.getSessionMessages(sessionId).filter((message, index) => {
      if (payload.messageId)
        return message.id !== payload.messageId
      if (payload.index !== undefined)
        return index !== payload.index
      return true
    })

    chatSession.setSessionMessages(sessionId, nextMessages)
  }

  function appendIngestErrorMessage(payload: IngestCommandPayload, message: string) {
    const sessionId = payload.sessionId || activeSessionId.value
    const nextMessages = [
      ...chatSession.getSessionMessages(sessionId),
      {
        role: 'error',
        content: message,
      } satisfies ChatHistoryItem,
    ]
    chatSession.setSessionMessages(sessionId, nextMessages)
  }

  function authorityCommandMeta(message: { requestId: string, senderId: string, command: string, payload: unknown }) {
    return {
      mode: mode.value,
      authorityId: authorityId.value,
      requestId: message.requestId,
      senderId: message.senderId,
      command: message.command,
      payload: previewChatSyncPayload(message.payload),
    }
  }

  async function handleCommand(message: Extract<ChatSyncMessage, { type: 'command' }>) {
    if (mode.value !== 'authority')
      return

    const respond = (response: ChatResponsePayload) => {
      post({
        type: 'response',
        requestId: message.requestId,
        authorityId: instanceId,
        ...response,
      })
    }

    try {
      switch (message.command) {
        case 'ingest':
          await executeIngest(message.payload)
          break
        case 'spotlight-ingest':
          respond({ ok: true, result: await executeSpotlightIngest(message.payload) })
          return
        case 'retry':
          await executeRetry(message.payload)
          break
        case 'cleanup':
          cleanupMessages(message.payload.sessionId)
          break
        case 'delete-message':
          executeDeleteMessage(message.payload)
          break
      }

      respond({ ok: true })
    }
    catch (error) {
      const errorMessage = errorMessageFrom(error) ?? 'Unknown chat sync command failure'

      logChatSyncError('command failed', error, authorityCommandMeta(message))

      if (message.command === 'ingest') {
        appendIngestErrorMessage(message.payload, errorMessage)
      }
      else if (message.command === 'spotlight-ingest') {
        appendIngestErrorMessage({
          text: message.payload.text,
          toolset: 'artistry',
          sessionId: activeSessionId.value,
        }, errorMessage)
      }

      respond({ ok: false, error: errorMessage })
    }
  }

  function takePendingRequest(requestId: string): PendingRequest | undefined {
    const pending = pendingRequests.get(requestId)
    if (!pending)
      return undefined

    clearTimeout(pending.timeout)
    pendingRequests.delete(requestId)
    return pending
  }

  function settleResponse(message: Extract<ChatSyncMessage, { type: 'response' }>) {
    const pending = takePendingRequest(message.requestId)
    if (!pending)
      return

    if (message.ok) {
      pending.resolve('result' in message ? message.result : undefined)
      return
    }

    pending.reject(new Error(message.error ?? 'Remote chat command failed'))
  }

  function handleMessage(event: MessageEvent<ChatSyncMessage>) {
    const message = event.data
    if (!message)
      return

    switch (message.type) {
      case 'authority-announcement':
        authorityId.value = message.authorityId
        if (mode.value === 'follower')
          post({ type: 'request-snapshot', requestId: createRequestId(), senderId: instanceId })
        return
      case 'request-snapshot':
        if (mode.value === 'authority')
          broadcastSessionSnapshot()
        return
      case 'session-snapshot':
        if (mode.value !== 'follower')
          return
        authorityId.value = message.authorityId
        applySessionSnapshot(message.snapshot)
        return
      case 'stream-snapshot':
        if (mode.value !== 'follower')
          return
        authorityId.value = message.authorityId
        applyStreamSnapshot(message.snapshot)
        return
      case 'stream-patch':
        if (mode.value !== 'follower')
          return
        authorityId.value = message.authorityId
        applyStreamPatch(message.patch)
        return
      case 'command':
        void handleCommand(message)
        return
      case 'response':
        settleResponse(message)
    }
  }

  function attachChannel() {
    if (channel)
      return

    channel = new BroadcastChannel(CHAT_SYNC_CHANNEL_NAME)
    channel.addEventListener('message', handleMessage as unknown as EventListener)
  }

  function detachChannel() {
    if (!channel)
      return

    channel.removeEventListener('message', handleMessage as unknown as EventListener)
    channel.close()
    channel = null
  }

  function resetPendingRequests() {
    for (const pending of pendingRequests.values()) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('Chat sync channel disposed'))
    }
    pendingRequests.clear()
  }

  function initialize(nextMode: Exclude<ChatSyncMode, 'inactive'>) {
    if (mode.value === nextMode && channel)
      return

    dispose()
    attachChannel()
    mode.value = nextMode
    authorityId.value = nextMode === 'authority' ? instanceId : authorityId.value

    if (nextMode === 'authority') {
      registerAuthorityWatchers()
      broadcastSessionSnapshot()
      broadcastStreamSnapshot()
      return
    }

    post({ type: 'request-snapshot', requestId: createRequestId(), senderId: instanceId })
  }

  function dispatch<T>(
    message: Extract<ChatSyncMessage, { type: 'command' }>,
    timeoutMs: number = REQUEST_TIMEOUT_MS,
    timeoutError: () => Error = () => new Error('Timed out waiting for chat authority response'),
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(message.requestId)
        const error = timeoutError()
        logChatSyncError('command timed out waiting for authority response', error, authorityCommandMeta(message))
        reject(error)
      }, timeoutMs)

      pendingRequests.set(message.requestId, {
        resolve: result => resolve(result as T),
        reject,
        timeout,
      })
      post(message)
    })
  }

  async function requestIngest(payload: IngestCommandPayload) {
    if (mode.value === 'authority') {
      await executeIngest(payload)
      return
    }

    return await dispatch<void>({
      type: 'command',
      requestId: createRequestId(),
      senderId: instanceId,
      command: 'ingest',
      payload,
    })
  }

  async function requestSpotlightIngest(payload: SpotlightIngestPayload) {
    if (mode.value === 'authority')
      return executeSpotlightIngest(payload)

    return dispatch<SpotlightIngestResult>({
      type: 'command',
      requestId: createRequestId(),
      senderId: instanceId,
      command: 'spotlight-ingest',
      payload,
    }, SPOTLIGHT_REQUEST_TIMEOUT_MS, () => new Error('Spotlight response timed out'))
  }

  async function requestRetry(payload: RetryCommandPayload) {
    if (mode.value === 'authority') {
      await executeRetry(payload)
      return
    }

    return await dispatch<void>({
      type: 'command',
      requestId: createRequestId(),
      senderId: instanceId,
      command: 'retry',
      payload,
    })
  }

  async function requestCleanup(sessionId?: string) {
    if (mode.value === 'authority') {
      cleanupMessages(sessionId)
      return
    }

    return await dispatch<void>({
      type: 'command',
      requestId: createRequestId(),
      senderId: instanceId,
      command: 'cleanup',
      payload: { sessionId },
    })
  }

  async function requestDeleteMessage(payload: { sessionId?: string, messageId?: string, index?: number }) {
    if (mode.value === 'authority') {
      executeDeleteMessage(payload)
      return
    }

    return await dispatch<void>({
      type: 'command',
      requestId: createRequestId(),
      senderId: instanceId,
      command: 'delete-message',
      payload,
    })
  }

  function dispose() {
    stopWatchers()
    clearHeartbeat()
    resetPendingRequests()
    detachChannel()
    mode.value = 'inactive'
    authorityId.value = null
  }

  return {
    authorityId,
    mode,
    initialize,
    dispose,
    requestIngest,
    requestSpotlightIngest,
    requestRetry,
    requestCleanup,
    requestDeleteMessage,
  }
})
