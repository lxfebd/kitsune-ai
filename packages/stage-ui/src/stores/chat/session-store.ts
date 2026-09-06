import type { ChatHistoryItem } from '../../types/chat'
import type { ChatSessionMeta, ChatSessionRecord, ChatSessionsExport, ChatSessionsIndex } from '../../types/chat-session'

import { errorMessageFrom } from '@moeru/std'
import { cloneDeep } from 'es-toolkit'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

import { chatSessionsRepo } from '../../database/repos/chat-sessions.repo'

// 清理旧消息中的时间戳前缀（格式：[YYYY-MM-DD HH:MM] 或 #user [YYYY-MM-DD HH:MM]）
const TIMESTAMP_REGEX = /^(?:#user\s*)?\[\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\]\s*/
function stripTimestampPrefix(content: string): string {
  if (typeof content !== 'string')
    return content
  return content.replace(TIMESTAMP_REGEX, '')
}
import { capturePosthogEvent } from '../analytics/posthog'
import { usePersonaStore } from '../modules/persona'
import { mergeLoadedSessionMessages } from './session-message-merge'

export const useChatSessionStore = defineStore('chat-session', () => {
  // Login/cloud sync has been removed; sessions are always local-only.
  const userId = ref('local')
  const { activeCardId, systemPrompt } = storeToRefs(usePersonaStore())

  const activeSessionId = ref<string>('')
  const sessionMessages = ref<Record<string, ChatHistoryItem[]>>({})
  const sessionMetas = ref<Record<string, ChatSessionMeta>>({})
  const sessionGenerations = ref<Record<string, number>>({})
  const index = ref<ChatSessionsIndex | null>(null)

  const ready = ref(false)
  const isReady = computed(() => ready.value)
  const initializing = ref(false)
  let initializePromise: Promise<void> | null = null
  let ensureActivePromise: Promise<void> | null = null
  let ensureActiveEpoch = 0

  let persistQueue = Promise.resolve()
  const loadedSessions = new Set<string>()
  const loadingSessions = new Map<string, Promise<void>>()

  // I know this nu uh, better than loading all language on rehypeShiki
  const codeBlockSystemPrompt = '- For any programming code block, always specify the programming language that supported on @shikijs/rehype on the rendered markdown, eg. ```python ... ```\n'
  const mathSyntaxSystemPrompt = '- For any math equation, use LaTeX format, eg: $ x^3 $, always escape dollar sign outside math equation\n'

  function getCurrentUserId() {
    return userId.value || 'local'
  }

  function getCurrentCharacterId() {
    return activeCardId.value || 'default'
  }

  /**
   * Append a write task to the persist queue. Tasks always run sequentially
   * regardless of whether prior tasks rejected — but rejections propagate to
   * the awaiting caller AND are surfaced via console for debugging. The
   * previous `then(task, task)` form silently swallowed prior rejections by
   * running the next task as the rejection handler, which masked IDB
   * failures from the local persistence tracking that depends on them.
   */
  function enqueuePersist<T>(task: () => Promise<T>): Promise<T> {
    const next = persistQueue.then(task)
    // Keep the queue alive after a rejection but log it so silent IDB
    // failures (quota, corruption) surface during dev.
    persistQueue = next.then(
      () => undefined,
      (err) => {
        console.warn('[chat-session] persist task failed:', errorMessageFrom(err))
      },
    )
    return next
  }

  function snapshotMessages(messages: ChatHistoryItem[]) {
    return cloneDeep(messages)
  }

  function ensureSessionMessageIds(sessionId: string) {
    const current = sessionMessages.value[sessionId] ?? []
    let changed = false
    const next = current.map((message) => {
      if (message.id)
        return message
      changed = true
      return {
        ...message,
        id: nanoid(),
      }
    })

    if (changed)
      sessionMessages.value[sessionId] = next

    return next
  }

  function generateInitialMessageFromPrompt(prompt: string) {
    const content = codeBlockSystemPrompt + mathSyntaxSystemPrompt + prompt

    return {
      role: 'system',
      content,
      id: nanoid(),
      createdAt: Date.now(),
    } satisfies ChatHistoryItem
  }

  function generateInitialMessage() {
    return generateInitialMessageFromPrompt(systemPrompt.value)
  }

  function ensureGeneration(sessionId: string) {
    if (sessionGenerations.value[sessionId] === undefined)
      sessionGenerations.value[sessionId] = 0
  }

  async function loadIndexForUser(currentUserId: string) {
    const stored = await chatSessionsRepo.getIndex(currentUserId)
    index.value = stored ?? {
      userId: currentUserId,
      characters: {},
    }
    // Hydrate `sessionMetas` from the index so consumers like the sessions
    // drawer can list every owned session without having to `loadSession`
    // each one (which would pull every messages payload from IndexedDB).
    // Existing entries win to preserve any in-memory mutations the store
    // performed before the index landed.
    if (index.value) {
      for (const character of Object.values(index.value.characters)) {
        for (const [sessionId, meta] of Object.entries(character.sessions)) {
          if (!sessionMetas.value[sessionId])
            sessionMetas.value[sessionId] = meta
        }
      }
    }
  }

  function getCharacterIndex(characterId: string) {
    if (!index.value)
      return null
    return index.value.characters[characterId] ?? null
  }

  async function persistIndex() {
    if (!index.value)
      return
    const snapshot = cloneDeep(index.value)
    await enqueuePersist(() => chatSessionsRepo.saveIndex(snapshot))
  }

  async function persistSession(sessionId: string) {
    await enqueuePersist(async () => {
      const meta = sessionMetas.value[sessionId]
      if (!meta)
        return

      const messages = snapshotMessages(ensureSessionMessageIds(sessionId))
      const now = Date.now()
      const updatedMeta = {
        ...meta,
        updatedAt: now,
      }

      sessionMetas.value[sessionId] = updatedMeta
      const characterIndex = index.value?.characters[meta.characterId]
      if (characterIndex)
        characterIndex.sessions[sessionId] = updatedMeta

      const record: ChatSessionRecord = {
        meta: updatedMeta,
        messages,
      }

      await chatSessionsRepo.saveSession(sessionId, record)

      if (index.value) {
        const snapshot = cloneDeep(index.value)
        await chatSessionsRepo.saveIndex(snapshot)
      }
    })
  }

  function persistSessionMessages(sessionId: string) {
    void persistSession(sessionId)
  }

  function replaceSessionMessages(sessionId: string, next: ChatHistoryItem[], options?: { persist?: boolean }) {
    sessionMessages.value[sessionId] = next

    if (options?.persist !== false)
      void persistSession(sessionId)
  }

  function setSessionMessages(sessionId: string, next: ChatHistoryItem[]) {
    replaceSessionMessages(sessionId, next)
  }

  function appendSessionMessage(sessionId: string, message: ChatHistoryItem) {
    ensureSession(sessionId)
    replaceSessionMessages(sessionId, [
      ...(sessionMessages.value[sessionId] ?? []),
      message,
    ])
  }

  /**
   * Hydrate a single session's messages from IDB into memory. Idempotent —
   * subsequent calls for the same id are no-ops.
   *
   * Use when:
   * - The drawer is opening, the user is switching to a session, or any
   *   caller needs the full message list (not just the meta record).
   *
   * Expects:
   * - `sessionId` exists either in `sessionMetas` or in IDB.
   *
   * Returns:
   * - Resolves once the session is in memory. On IDB error, removes the id
   *   from the loading map so subsequent calls can retry rather than wedge
   *   on a stale promise. Errors are intentionally not rethrown — the
   *   failing session is simply absent from local state and the next
   *   loadSession call will retry.
   */
  async function loadSession(sessionId: string) {
    if (loadedSessions.has(sessionId)) {
      return
    }
    if (loadingSessions.has(sessionId)) {
      await loadingSessions.get(sessionId)
      return
    }

    const loadPromise = (async () => {
      try {
        const stored = await chatSessionsRepo.getSession(sessionId)
        // Re-check existence: `deleteSession` (or `clearInMemoryState` on a
        // user swap) may have run while we were awaiting IDB. Without this
        // guard, the post-await write resurrects the deleted entry and
        // `loadedSessions.add` then short-circuits every future legitimate
        // load — locking the resurrection in. The drawer's batch
        // loadSession + per-row trash button hits this race in production.
        if (!sessionMetas.value[sessionId])
          return
        if (stored) {
          // 清理旧消息中的时间戳前缀，避免模型输出对话历史
          const cleanedMessages = stored.messages.map((msg) => {
            if (msg.role === 'user' && typeof msg.content === 'string') {
              return { ...msg, content: stripTimestampPrefix(msg.content) }
            }
            return msg
          })

          const currentMessages = sessionMessages.value[sessionId] ?? []
          const mergedMessages = mergeLoadedSessionMessages(cleanedMessages, currentMessages)

          sessionMetas.value[sessionId] = stored.meta
          replaceSessionMessages(sessionId, mergedMessages, { persist: false })
          ensureGeneration(sessionId)

          if (mergedMessages !== stored.messages)
            await persistSession(sessionId)
        }
        loadedSessions.add(sessionId)
      }
      catch (err) {
        // Do NOT add to loadedSessions on failure — the next call should
        // retry rather than fast-return on stale "already loaded" state.
        console.warn('[chat-session] loadSession failed for', sessionId, errorMessageFrom(err))
      }
    })()

    loadingSessions.set(sessionId, loadPromise)
    try {
      await loadPromise
    }
    finally {
      // Always drain the loading map so a transient failure does not leave
      // a permanent wedge entry.
      loadingSessions.delete(sessionId)
    }
  }

  /**
   * Mint a new session for `characterId`, optionally seeding it with messages
   * and / or a title. Persists the new session and its index entry.
   *
   * Use when:
   * - The drawer's "+ New" button fires, the active card changes and the
   *   user has no session for that card yet, or `forkSession` needs a new
   *   destination.
   *
   * Expects:
   * - The store is initialized (or being initialized via `initialize()`).
   *
   * Returns:
   * - The new session id. When `setActive` is not `false` the session is
   *   also made the active one.
   */
  async function createSession(characterId: string, options?: { setActive?: boolean, messages?: ChatHistoryItem[], title?: string }) {
    const currentUserId = getCurrentUserId()
    const sessionId = nanoid()
    const now = Date.now()
    const meta: ChatSessionMeta = {
      sessionId,
      userId: currentUserId,
      characterId,
      title: options?.title,
      createdAt: now,
      updatedAt: now,
    }

    const initialMessages = options?.messages?.length ? cloneDeep(options.messages) : [generateInitialMessage()]

    sessionMetas.value[sessionId] = meta
    replaceSessionMessages(sessionId, initialMessages, { persist: false })
    loadedSessions.add(sessionId)
    ensureGeneration(sessionId)

    if (!index.value)
      index.value = { userId: currentUserId, characters: {} }

    const characterIndex = index.value.characters[characterId] ?? {
      activeSessionId: sessionId,
      sessions: {},
    }
    characterIndex.sessions[sessionId] = meta
    if (options?.setActive !== false)
      characterIndex.activeSessionId = sessionId
    index.value.characters[characterId] = characterIndex

    const record: ChatSessionRecord = { meta, messages: initialMessages }
    await enqueuePersist(() => chatSessionsRepo.saveSession(sessionId, record))
    await persistIndex()

    if (options?.setActive !== false)
      activeSessionId.value = sessionId

    return sessionId
  }

  /**
   * Permanently remove a session from the local index + IDB.
   *
   * Use when:
   * - The user explicitly chooses "delete" from the sessions drawer.
   *
   * Expects:
   * - The caller does not need to pre-confirm: this method is destructive.
   *   When the deleted session is the active one, the store falls back to
   *   another session for the same character or creates a fresh one.
   */
  async function deleteSession(sessionId: string) {
    const meta = sessionMetas.value[sessionId]
    if (!meta)
      return

    // Snapshot count before the in-memory wipe below zeroes it out.
    const messageCount = (sessionMessages.value[sessionId] ?? []).length
    capturePosthogEvent('chat_session_deleted', {
      session_id: sessionId,
      message_count: messageCount,
    })

    const wasActive = activeSessionId.value === sessionId
    const characterId = meta.characterId

    delete sessionMetas.value[sessionId]
    delete sessionMessages.value[sessionId]
    delete sessionGenerations.value[sessionId]
    loadedSessions.delete(sessionId)
    loadingSessions.delete(sessionId)

    if (index.value) {
      const characterIndex = index.value.characters[characterId]
      if (characterIndex) {
        delete characterIndex.sessions[sessionId]
        if (characterIndex.activeSessionId === sessionId)
          characterIndex.activeSessionId = ''
      }
    }

    await enqueuePersist(() => chatSessionsRepo.deleteSession(sessionId))
    await persistIndex()

    // If the deleted session was active, pick another for the same
    // character or mint a fresh one so the chat surface never lands on an
    // empty void.
    if (wasActive) {
      const characterIndex = index.value?.characters[characterId]
      const fallbackId = characterIndex
        ? Object.keys(characterIndex.sessions).find(id => sessionMetas.value[id])
        : undefined
      if (fallbackId) {
        activeSessionId.value = fallbackId
        if (characterIndex)
          characterIndex.activeSessionId = fallbackId
        await loadSession(fallbackId)
        await persistIndex()
      }
      else {
        await createSession(characterId, { setActive: true })
      }
    }
  }

  /**
   * Load the per-user index, pick (or mint) the active session for the
   * current character, and hydrate it into memory. Reentrant: concurrent
   * callers share a single in-flight promise so a rapid `[userId, characterId]`
   * change burst does not produce duplicate sessions.
   */
  async function ensureActiveSessionForCharacter(): Promise<void> {
    if (ensureActivePromise)
      return ensureActivePromise
    const myEpoch = ensureActiveEpoch
    const isStaleEpoch = () => myEpoch !== ensureActiveEpoch
    ensureActivePromise = (async () => {
      const currentUserId = getCurrentUserId()
      const characterId = getCurrentCharacterId()

      if (!index.value || index.value.userId !== currentUserId)
        await loadIndexForUser(currentUserId)
      if (isStaleEpoch())
        return

      const characterIndex = getCharacterIndex(characterId)
      if (!characterIndex) {
        await createSession(characterId)
        return
      }

      if (!characterIndex.activeSessionId) {
        await createSession(characterId)
        return
      }

      activeSessionId.value = characterIndex.activeSessionId
      await loadSession(characterIndex.activeSessionId)
      if (isStaleEpoch())
        return
      ensureSession(characterIndex.activeSessionId)
    })()
    try {
      await ensureActivePromise
    }
    finally {
      // Only release the slot if we still own it. A user swap mid-flight
      // bumps the epoch and `clearInMemoryState` already nulled the slot —
      // a fresh hydrate may now own it and unconditional null would clobber
      // the new owner.
      if (myEpoch === ensureActiveEpoch)
        ensureActivePromise = null
    }
  }

  async function initialize() {
    if (ready.value) {
      return
    }
    if (initializePromise) {
      return initializePromise
    }
    initializing.value = true
    initializePromise = (async () => {
      await ensureActiveSessionForCharacter()
      ready.value = true
    })()

    try {
      await initializePromise
    }
    finally {
      initializePromise = null
      initializing.value = false
    }
  }

  function ensureSession(sessionId: string) {
    ensureGeneration(sessionId)
    if (!sessionMessages.value[sessionId] || sessionMessages.value[sessionId].length === 0) {
      replaceSessionMessages(sessionId, [generateInitialMessage()], { persist: false })
    }
    else {
      // 更新系统消息为最新版本（避免旧的复杂指令残留）
      const currentMessages = sessionMessages.value[sessionId]
      const systemMessageIndex = currentMessages.findIndex(msg => msg.role === 'system')
      if (systemMessageIndex >= 0) {
        const newSystemMessage = generateInitialMessage()
        const updatedMessages = [...currentMessages]
        updatedMessages[systemMessageIndex] = { ...newSystemMessage, id: currentMessages[systemMessageIndex].id }
        replaceSessionMessages(sessionId, updatedMessages, { persist: false })
      }
    }
  }

  function hasKnownSession(sessionId: string) {
    return !!sessionMetas.value[sessionId]
      || !!Object.values(index.value?.characters ?? {}).some(character => character.sessions[sessionId])
  }

  const messages = computed<ChatHistoryItem[]>({
    get: () => {
      if (!activeSessionId.value) {
        return []
      }
      if (!loadedSessions.has(activeSessionId.value) && !sessionMessages.value[activeSessionId.value] && hasKnownSession(activeSessionId.value)) {
        return []
      }
      return sessionMessages.value[activeSessionId.value] ?? []
    },
    set: (value) => {
      if (!activeSessionId.value)
        return
      replaceSessionMessages(activeSessionId.value, value)
    },
  })

  function setActiveSession(sessionId: string) {
    activeSessionId.value = sessionId

    const characterId = getCurrentCharacterId()
    const characterIndex = index.value?.characters[characterId]
    if (characterIndex) {
      characterIndex.activeSessionId = sessionId
      void persistIndex()
    }

    if (ready.value) {
      void loadSession(sessionId)
    }
    else if (!hasKnownSession(sessionId)) {
      ensureSession(sessionId)
    }
  }

  function applyRemoteSnapshot(snapshot: {
    activeSessionId: string
    sessionMessages: Record<string, ChatHistoryItem[]>
    sessionMetas: Record<string, ChatSessionMeta>
    index?: ChatSessionsIndex | null
  }) {
    activeSessionId.value = snapshot.activeSessionId
    sessionMessages.value = cloneDeep(snapshot.sessionMessages)
    sessionMetas.value = cloneDeep(snapshot.sessionMetas)
    if (snapshot.index !== undefined) {
      index.value = cloneDeep(snapshot.index)
    }
    sessionGenerations.value = Object.fromEntries(
      Object.keys(snapshot.sessionMessages).map(sessionId => [sessionId, sessionGenerations.value[sessionId] ?? 0]),
    )
    loadedSessions.clear()
    for (const sessionId of Object.keys(snapshot.sessionMessages)) {
      loadedSessions.add(sessionId)
    }
  }

  function getSnapshot() {
    return {
      activeSessionId: activeSessionId.value,
      sessionMessages: cloneDeep(sessionMessages.value),
      sessionMetas: cloneDeep(sessionMetas.value),
      index: cloneDeep(index.value),
    }
  }

  function cleanupMessages(sessionId = activeSessionId.value) {
    ensureGeneration(sessionId)
    sessionGenerations.value[sessionId] += 1
    setSessionMessages(sessionId, [generateInitialMessage()])
  }

  function getAllSessions() {
    return cloneDeep(sessionMessages.value)
  }

  async function resetAllSessions() {
    const currentUserId = getCurrentUserId()
    const characterId = getCurrentCharacterId()
    const sessionIds = new Set<string>()

    if (index.value?.userId === currentUserId) {
      for (const character of Object.values(index.value.characters)) {
        for (const sessionId of Object.keys(character.sessions))
          sessionIds.add(sessionId)
      }
    }

    for (const sessionId of sessionIds)
      await enqueuePersist(() => chatSessionsRepo.deleteSession(sessionId))

    sessionMessages.value = {}
    sessionMetas.value = {}
    sessionGenerations.value = {}
    loadedSessions.clear()
    loadingSessions.clear()

    index.value = {
      userId: currentUserId,
      characters: {},
    }

    await createSession(characterId)
  }

  function getSessionMessages(sessionId: string) {
    ensureSession(sessionId)
    return sessionMessages.value[sessionId] ?? []
  }

  function getSessionGeneration(sessionId: string) {
    ensureGeneration(sessionId)
    return sessionGenerations.value[sessionId] ?? 0
  }

  function bumpSessionGeneration(sessionId: string) {
    ensureGeneration(sessionId)
    sessionGenerations.value[sessionId] += 1
    return sessionGenerations.value[sessionId]
  }

  function getSessionGenerationValue(sessionId?: string) {
    const target = sessionId ?? activeSessionId.value
    return getSessionGeneration(target)
  }

  async function forkSession(options: { fromSessionId: string, atIndex?: number, reason?: string, hidden?: boolean }) {
    const characterId = getCurrentCharacterId()
    await loadSession(options.fromSessionId)
    const parentMessages = getSessionMessages(options.fromSessionId)
    const forkIndex = options.atIndex ?? parentMessages.length
    const nextMessages = parentMessages.slice(0, forkIndex)
    return await createSession(characterId, { setActive: false, messages: nextMessages })
  }

  async function exportSessions(): Promise<ChatSessionsExport> {
    if (!ready.value)
      await initialize()

    if (!index.value) {
      return {
        format: 'chat-sessions-index:v1',
        index: { userId: getCurrentUserId(), characters: {} },
        sessions: {},
      }
    }

    const sessions: Record<string, ChatSessionRecord> = {}
    for (const character of Object.values(index.value.characters)) {
      for (const sessionId of Object.keys(character.sessions)) {
        const stored = await chatSessionsRepo.getSession(sessionId)
        if (stored) {
          sessions[sessionId] = stored
          continue
        }
        const meta = sessionMetas.value[sessionId]
        const messages = sessionMessages.value[sessionId]
        if (meta && messages)
          sessions[sessionId] = { meta, messages }
      }
    }

    return {
      format: 'chat-sessions-index:v1',
      index: cloneDeep(index.value),
      sessions: cloneDeep(sessions),
    }
  }

  async function importSessions(payload: ChatSessionsExport) {
    if (payload.format !== 'chat-sessions-index:v1')
      return

    index.value = cloneDeep(payload.index)
    sessionMessages.value = {}
    sessionMetas.value = {}
    sessionGenerations.value = {}
    loadedSessions.clear()
    loadingSessions.clear()

    await enqueuePersist(() => chatSessionsRepo.saveIndex(cloneDeep(payload.index)))

    for (const [sessionId, record] of Object.entries(payload.sessions)) {
      sessionMetas.value[sessionId] = cloneDeep(record.meta)
      sessionMessages.value[sessionId] = cloneDeep(record.messages)
      ensureGeneration(sessionId)
      await enqueuePersist(() => chatSessionsRepo.saveSession(sessionId, {
        meta: cloneDeep(record.meta),
        messages: cloneDeep(record.messages),
      }))
    }

    await ensureActiveSessionForCharacter()
  }

  watch(activeCardId, () => {
    if (!ready.value)
      return
    void ensureActiveSessionForCharacter()
  })

  return {
    ready,
    isReady,
    initialize,

    activeSessionId,
    messages,

    setActiveSession,
    applyRemoteSnapshot,
    getSnapshot,
    cleanupMessages,
    getAllSessions,
    resetAllSessions,

    ensureSession,
    setSessionMessages,
    appendSessionMessage,
    persistSessionMessages,
    getSessionMessages,
    sessionMessages,
    sessionMetas,
    getSessionGeneration,
    bumpSessionGeneration,
    getSessionGenerationValue,

    forkSession,
    exportSessions,
    importSessions,
    createSession,
    loadSession,
    deleteSession,
  }
})
