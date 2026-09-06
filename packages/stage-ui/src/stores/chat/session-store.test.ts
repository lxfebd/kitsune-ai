import type { ChatSessionMeta, ChatSessionRecord, ChatSessionsIndex } from '../../types/chat-session'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

// Refs the store reads through the mocked `useAuthStore` / `usePersonaStore`.
// Tests mutate these to simulate auth and card swaps.
const userIdRef = ref<string>('local')
const activeCardIdRef = ref<string>('default')
const systemPromptRef = ref<string>('')

const getIndexMock = vi.fn<(uid: string) => Promise<ChatSessionsIndex | null>>()
const saveIndexMock = vi.fn<(idx: ChatSessionsIndex) => Promise<void>>()
const getSessionMock = vi.fn<(id: string) => Promise<ChatSessionRecord | null>>()
const saveSessionMock = vi.fn<(id: string, rec: ChatSessionRecord) => Promise<void>>()
const deleteSessionRepoMock = vi.fn<(id: string) => Promise<void>>()
const getOutboxMock = vi.fn<(uid: string) => Promise<any[]>>()
const dropOutboxForSessionMock = vi.fn<(uid: string, id: string) => Promise<void>>()
const getTombstonesMock = vi.fn<(uid: string) => Promise<string[]>>()
const removeTombstonesMock = vi.fn<(uid: string, ids: string[]) => Promise<void>>()

vi.mock('pinia', async () => {
  const actual = await vi.importActual<typeof import('pinia')>('pinia')
  return {
    ...actual,
    storeToRefs: (store: any) => store,
  }
})

vi.mock('../auth', () => ({
  useAuthStore: () => ({ userId: userIdRef }),
}))

vi.mock('../modules/persona', () => ({
  usePersonaStore: () => ({
    activeCardId: activeCardIdRef,
    systemPrompt: systemPromptRef,
  }),
}))

vi.mock('../../database/repos/chat-sessions.repo', () => ({
  chatSessionsRepo: {
    getIndex: (uid: string) => getIndexMock(uid),
    saveIndex: (idx: ChatSessionsIndex) => saveIndexMock(idx),
    getSession: (id: string) => getSessionMock(id),
    saveSession: (id: string, rec: ChatSessionRecord) => saveSessionMock(id, rec),
    deleteSession: (id: string) => deleteSessionRepoMock(id),
    getOutbox: (uid: string) => getOutboxMock(uid),
    enqueueOutbox: vi.fn().mockResolvedValue(undefined),
    dequeueOutbox: vi.fn().mockResolvedValue(undefined),
    updateOutboxEntries: vi.fn().mockResolvedValue(undefined),
    dropOutboxForSession: (uid: string, id: string) => dropOutboxForSessionMock(uid, id),
    getTombstones: (uid: string) => getTombstonesMock(uid),
    addTombstone: vi.fn().mockResolvedValue(undefined),
    removeTombstones: (uid: string, ids: string[]) => removeTombstonesMock(uid, ids),
  },
}))

vi.mock('../../libs/auth', () => ({
  getAuthToken: vi.fn().mockResolvedValue('test-token'),
}))

vi.mock('../../libs/auth-fetch', () => ({
  authedFetch: vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }),
}))

vi.mock('../../libs/server', () => ({
  SERVER_URL: 'http://test',
}))

// Inert chat-sync surface. The store doesn't drive any cloud writes in these
// tests (anonymous user for one, deferred index for the other), so noops are
// sufficient. We keep `extractMessageText` realistic so message previews work.
vi.mock('../../libs/chat-sync', () => ({
  applyCreateActions: vi.fn().mockResolvedValue([]),
  reconcileLocalAndRemote: vi.fn().mockReturnValue({ adopt: [], claim: [], create: [] }),
  createCloudChatMapper: () => ({
    listChats: vi.fn().mockResolvedValue([]),
    deleteChat: vi.fn().mockResolvedValue(undefined),
  }),
  createChatWsClient: () => ({
    status: () => 'idle' as const,
    connect: vi.fn(),
    disconnect: vi.fn(),
    destroy: vi.fn(),
    sendMessages: vi.fn().mockResolvedValue({ ok: true }),
    pullMessages: vi.fn().mockResolvedValue({ messages: [], maxSeq: 0 }),
    onNewMessages: () => () => {},
    onStatusChange: () => () => {},
  }),
  extractMessageText: (m: any) => (typeof m?.content === 'string' ? m.content : ''),
  isCloudSyncableMessage: () => false,
  mergeCloudMessagesIntoLocal: () => ({ dirty: false, messages: [], maxSeq: 0 }),
}))

const { useChatSessionStore } = await import('./session-store')

beforeEach(() => {
  setActivePinia(createPinia())
  userIdRef.value = 'local'
  activeCardIdRef.value = 'default'
  systemPromptRef.value = ''

  getIndexMock.mockReset().mockResolvedValue(null)
  saveIndexMock.mockReset().mockResolvedValue(undefined)
  getSessionMock.mockReset().mockResolvedValue(null)
  saveSessionMock.mockReset().mockResolvedValue(undefined)
  deleteSessionRepoMock.mockReset().mockResolvedValue(undefined)
  getOutboxMock.mockReset().mockResolvedValue([])
  dropOutboxForSessionMock.mockReset().mockResolvedValue(undefined)
  getTombstonesMock.mockReset().mockResolvedValue([])
  removeTombstonesMock.mockReset().mockResolvedValue(undefined)
})

async function flushMicrotasks(rounds = 8) {
  for (let i = 0; i < rounds; i++)
    await Promise.resolve()
}

describe('chat-session-store · loadSession vs concurrent deleteSession', () => {
  // ROOT CAUSE:
  //
  // loadSession kicks off `chatSessionsRepo.getSession(id)` and writes the
  // returned record back into reactive state on resolve. If `deleteSession(id)`
  // runs synchronously between the getSession() call and its resolution, the
  // post-await `sessionMetas.value[sessionId] = stored.meta` write resurrects
  // the deleted entry — and `loadedSessions.add(id)` then short-circuits every
  // future loadSession retry, locking the resurrection in.
  //
  // The drawer's batch loadSession + per-row trash button is the production
  // path that hits this race.
  //
  // We fix this by re-checking `sessionMetas.value[sessionId]` inside
  // loadSession after the await; if the session is gone, skip the write-back
  // and skip `loadedSessions.add` so a subsequent (legitimate) load can retry.
  it('does not resurrect a session deleted while loadSession was awaiting IDB', async () => {
    const meta: ChatSessionMeta = {
      sessionId: 'sess-1',
      userId: 'local',
      characterId: 'default',
      createdAt: 1,
      updatedAt: 1,
    }

    let resolveGet: ((rec: ChatSessionRecord | null) => void) | undefined
    getSessionMock.mockImplementation((id: string) => {
      if (id === 'sess-1') {
        return new Promise<ChatSessionRecord | null>((resolve) => {
          resolveGet = resolve
        })
      }
      return Promise.resolve(null)
    })

    userIdRef.value = 'local'
    const store = useChatSessionStore()

    // Inject sess-1 into sessionMetas without going through createSession
    // (which would also pre-mark it loaded and short-circuit our test).
    store.applyRemoteSnapshot({
      activeSessionId: '',
      sessionMessages: {},
      sessionMetas: { 'sess-1': meta },
      index: null,
    })
    expect(store.sessionMetas['sess-1']).toBeDefined()

    // Start loadSession (don't await). getSession is now pending.
    const loadPromise = store.loadSession('sess-1')
    await flushMicrotasks()
    expect(resolveGet).toBeDefined()

    // Delete the session. In-memory clear is synchronous; IDB delete enqueues.
    await store.deleteSession('sess-1')
    expect(store.sessionMetas['sess-1']).toBeUndefined()

    // Resolve getSession with the stale stored record.
    resolveGet!({ meta, messages: [{ role: 'user', content: 'hi', id: 'm1' } as any] })
    await loadPromise
    await flushMicrotasks()

    // Without the fix, sess-1 reappears here.
    expect(store.sessionMetas['sess-1']).toBeUndefined()
  })
})
