import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Message } from '@xsai/shared-chat'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useChatOrchestratorStore } from './chat'

vi.hoisted(() => {
  ;(globalThis as any).window = {
    location: {
      origin: 'http://localhost',
    },
  }
})

const ioTracerMocks = vi.hoisted(() => {
  const activeTurnSpan = { value: undefined as any }
  const startSpanMock = vi.fn((name: string) => ({
    name,
    addEvent: vi.fn(),
    end: vi.fn(),
    setAttribute: vi.fn(),
  }))
  return { activeTurnSpan, startSpanMock }
})

const llmStreamMock = vi.fn()
const ingestContextMessageMock = vi.fn()
const getContextsSnapshotMock = vi.fn()
const createMinecraftContextMock = vi.fn()

const activeSessionIdRef = ref('session-1')
const streamingMessageRef = ref<any>({ role: 'assistant', content: '', slices: [], tool_results: [] })
const sessionMessages: Record<string, any[]> = {}

// Persona card mock — provides soul/identity used by the fallback path of
// getSystemPromptSupplement when no cached persona prompt is available.
const personaCardMock = {
  extensions: {
    kitsune: {
      modules: {
        persona: {
          soul: 'I am Yachiyo, a cheerful companion.',
          identity: 'My identity is an idol AI partner.',
        },
      },
    },
  },
}

vi.mock('pinia', async () => {
  const actual = await vi.importActual<typeof import('pinia')>('pinia')
  return {
    ...actual,
    storeToRefs: (store: any) => store,
  }
})

vi.mock('../composables', () => ({
  useAnalytics: () => ({
    trackFirstMessage: vi.fn(),
    trackMessageSendStarted: vi.fn(),
    trackLlmRequestStarted: vi.fn(),
    trackLlmFirstToken: vi.fn(),
    trackAssistantResponseRendered: vi.fn(),
    trackMessageRound: vi.fn(),
  }),
}))

vi.mock('../composables/use-io-tracer', () => ({
  activeTurnSpan: ioTracerMocks.activeTurnSpan,
  startSpan: ioTracerMocks.startSpanMock,
}))

vi.mock('./chat/context-providers', () => ({
  createMinecraftContext: () => createMinecraftContextMock(),
}))

vi.mock('./chat/context-store', () => ({
  useChatContextStore: () => ({
    ingestContextMessage: ingestContextMessageMock,
    getContextsSnapshot: getContextsSnapshotMock,
  }),
}))

vi.mock('./chat/session-store', () => ({
  useChatSessionStore: () => ({
    activeSessionId: activeSessionIdRef,
    sessionMessages,
    ensureSession: (sessionId: string) => {
      sessionMessages[sessionId] ??= [{ role: 'system', content: 'system prompt', createdAt: 1, id: 'system' }]
    },
    appendSessionMessage: (sessionId: string, message: any) => {
      sessionMessages[sessionId] ??= []
      sessionMessages[sessionId].push(message)
    },
    getSessionMessages: (sessionId: string) => sessionMessages[sessionId] ?? [],
    persistSessionMessages: vi.fn(),
    getSessionGeneration: () => 1,
    forkSession: vi.fn(),
  }),
}))

vi.mock('./chat/stream-store', () => ({
  useChatStreamStore: () => ({
    streamingMessage: streamingMessageRef,
  }),
}))

vi.mock('./llm', () => ({
  useLLM: () => ({
    stream: llmStreamMock,
  }),
}))

vi.mock('./llm-toolset-prompts', () => ({
  useLlmToolsetPromptsStore: () => ({
    activeToolsetPrompt: '',
  }),
}))

vi.mock('./modules/active-model', () => ({
  useActiveModelStore: () => ({
    activeProvider: ref('mock-provider'),
  }),
}))

vi.mock('./modules/persona', () => ({
  usePersonaStore: () => ({
    activeCard: personaCardMock,
  }),
}))

vi.mock('./modules/artistry-autonomous', () => ({
  useAutonomousArtistryStore: () => ({
    runArtistTask: vi.fn(),
  }),
}))

vi.mock('./devtools/context-observability', () => ({
  useContextObservabilityStore: () => ({
    recordLifecycle: vi.fn(),
    capturePromptProjection: vi.fn(),
  }),
}))

const provider = {
  chat: () => ({ baseURL: 'https://example.com/' }),
} as unknown as ChatProvider

/**
 * Extracts the system message text from composed messages sent to the LLM,
 * flattening array content parts into a single string.
 */
function extractSystemText(messages: Message[]): string {
  const systemMessage = messages.find(m => m.role === 'system') as any
  if (!systemMessage)
    return ''
  const content = systemMessage.content
  return typeof content === 'string' ? content : content.map((p: any) => p.text ?? '').join('')
}

describe('persona prompt caching (Task 12)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    llmStreamMock.mockReset()
    ingestContextMessageMock.mockReset()
    getContextsSnapshotMock.mockReset()
    getContextsSnapshotMock.mockReturnValue({})
    createMinecraftContextMock.mockReset()
    createMinecraftContextMock.mockReturnValue(undefined)
    ioTracerMocks.activeTurnSpan.value = undefined
    activeSessionIdRef.value = 'session-1'
    streamingMessageRef.value = { role: 'assistant', content: '', slices: [], tool_results: [] }

    for (const key of Object.keys(sessionMessages))
      delete sessionMessages[key]
    sessionMessages['session-1'] = [{ role: 'system', content: 'system prompt', createdAt: 1, id: 'system' }]
  })

  it('isPersonaCacheValid returns false before any prompt is cached', () => {
    const store = useChatOrchestratorStore()
    expect(store.isPersonaCacheValid('session-1')).toBe(false)
  })

  it('setCachedPersonaPrompt makes isPersonaCacheValid true for the same session', () => {
    const store = useChatOrchestratorStore()
    store.setCachedPersonaPrompt('Persona prompt from backend', 'session-1')
    expect(store.isPersonaCacheValid('session-1')).toBe(true)
  })

  it('isPersonaCacheValid returns false for a different session', () => {
    const store = useChatOrchestratorStore()
    store.setCachedPersonaPrompt('Persona prompt from backend', 'session-1')
    expect(store.isPersonaCacheValid('session-2')).toBe(false)
  })

  it('falls back to soul/identity when no cached persona prompt is present', async () => {
    let composedMessages: Message[] = []
    llmStreamMock.mockImplementation(async (_model: string, _chatProvider: ChatProvider, messages: Message[], options: any) => {
      composedMessages = messages
      await options.onStreamEvent({ type: 'text-delta', text: 'hi' })
      await options.onStreamEvent({ type: 'finish', finishReason: 'stop' })
    })

    const store = useChatOrchestratorStore()
    await store.ingest('hello', { model: 'gpt-test', chatProvider: provider })

    const systemText = extractSystemText(composedMessages)
    expect(systemText).toContain('I am Yachiyo, a cheerful companion.')
    expect(systemText).toContain('My identity is an idol AI partner.')
  })

  it('uses cached persona prompt in system message when cache is valid', async () => {
    let composedMessages: Message[] = []
    llmStreamMock.mockImplementation(async (_model: string, _chatProvider: ChatProvider, messages: Message[], options: any) => {
      composedMessages = messages
      await options.onStreamEvent({ type: 'text-delta', text: 'hi' })
      await options.onStreamEvent({ type: 'finish', finishReason: 'stop' })
    })

    const store = useChatOrchestratorStore()
    const personaPrompt = 'Persona Profile: yachiyo\nActive persona mode: rational (style: concise)'
    store.setCachedPersonaPrompt(personaPrompt, 'session-1')

    await store.ingest('debug this error', { model: 'gpt-test', chatProvider: provider })

    const systemText = extractSystemText(composedMessages)
    expect(systemText).toContain(personaPrompt)
  })
})
