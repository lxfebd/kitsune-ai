import type { ChatOrchestratorRuntimeState, ChatOrchestratorSendOptions, StreamEvent, StreamOptions } from '@kitsune/core-agent'
import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Message } from '@xsai/shared-chat'

import type { ChatHistoryItem } from '../types/chat'

import { createChatOrchestratorRuntime } from '@kitsune/core-agent'
import { IOAttributes, IOEvents, IOSpanNames, IOSubsystems } from '@kitsune/stage-shared'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { ref, toRaw, watch } from 'vue'

import { useAnalytics } from '../composables'
import { activeTurnSpan, startSpan } from '../composables/use-io-tracer'

import { createMinecraftContext } from './chat/context-providers'
import { useChatContextStore } from './chat/context-store'
import { useChatSessionStore } from './chat/session-store'
import { useChatStreamStore } from './chat/stream-store'
import { useContextObservabilityStore } from './devtools/context-observability'
import { useLLM } from './llm'
import { usePersonaStore } from './modules/persona'
import { useAutonomousArtistryStore } from './modules/artistry-autonomous'
import { useActiveModelStore } from './modules/active-model'

interface ForkOptions {
  fromSessionId?: string
  atIndex?: number
  reason?: string
  hidden?: boolean
}

type ProviderHistoryMessage = Exclude<ChatHistoryItem, { role: 'error' }>

function toProviderHistory(messages: ChatHistoryItem[]): Message[] {
  return messages.filter((message): message is ProviderHistoryMessage => message.role !== 'error')
}

function isTextDelta(event: StreamEvent): event is Extract<StreamEvent, { type: 'text-delta' }> {
  return event.type === 'text-delta'
}

export type { QueuedSendSnapshot, ChatOrchestratorSendOptions as SendOptions } from '@kitsune/core-agent'

export const useChatOrchestratorStore = defineStore('chat-orchestrator', () => {
  const llmStore = useLLM()
  const activeModelStore = useActiveModelStore()
  const artistryAutonomousStore = useAutonomousArtistryStore()
  const { activeProvider } = storeToRefs(activeModelStore)
  const {
    trackFirstMessage,
    trackMessageSendStarted,
    trackLlmRequestStarted,
    trackLlmFirstToken,
    trackAssistantResponseRendered,
    trackMessageRound,
  } = useAnalytics()

  const chatSession = useChatSessionStore()
  const chatStream = useChatStreamStore()
  const chatContext = useChatContextStore()
  const cardStore = usePersonaStore()
  const contextObservability = useContextObservabilityStore()
  const { activeSessionId } = storeToRefs(chatSession)
  const { streamingMessage } = storeToRefs(chatStream)

  const sending = ref(false)
  const pendingQueuedSendCount = ref(0)

  // Persona prompt 缓存 — 由 chat-sync.ts 异步预热，getSystemPromptSupplement 同步读取
  let cachedPersonaPrompt: string | null = null
  let cachedPersonaSessionId: string | null = null
  let cachedPersonaTs = 0
  const PERSONA_CACHE_TTL = 60_000 // 60 秒缓存

  let ownedActiveTurnSpan: typeof activeTurnSpan.value

  // 工具提示词不再注入到系统提示词中
  // 工具定义通过 tools 参数传给 LLM，不放在 system prompt 中
  // 这样可以避免模型把工具指令输出到回复中

  async function streamWithStageAdapters(
    model: string,
    chatProvider: ChatProvider,
    messages: Message[],
    options?: StreamOptions,
  ) {
    let llmTextLength = 0

    const hadExistingTurn = !!activeTurnSpan.value
    if (!hadExistingTurn) {
      const turnSpan = startSpan(IOSpanNames.InteractionTurn)
      activeTurnSpan.value = turnSpan
      ownedActiveTurnSpan = turnSpan
    }

    const llmSpan = startSpan(IOSpanNames.LLMInference, activeTurnSpan.value, {
      [IOAttributes.Subsystem]: IOSubsystems.LLM,
      [IOAttributes.GenAIRequestModel]: model,
    })
    const llmRequestTs = performance.now()
    let llmFirstTokenEmitted = false

    try {
      await llmStore.stream(model, chatProvider, messages, {
        ...options,
        onStreamEvent: async (event: StreamEvent) => {
          if (isTextDelta(event)) {
            if (!llmFirstTokenEmitted) {
              llmFirstTokenEmitted = true
              llmSpan.addEvent(IOEvents.LLMFirstToken, {
                [IOAttributes.LLM_TTFT]: performance.now() - llmRequestTs,
              })
            }
            llmTextLength += event.text.length
          }

          await options?.onStreamEvent?.(event)
        },
      })

      llmSpan.setAttribute(IOAttributes.LLMTextLength, llmTextLength)
    }
    finally {
      llmSpan.end()
    }
  }

  function syncRuntimeState(state: ChatOrchestratorRuntimeState) {
    sending.value = state.sending
    pendingQueuedSendCount.value = state.pendingQueuedSendCount
  }

  function settleOwnedActiveTurnSpan() {
    if (!ownedActiveTurnSpan)
      return

    ownedActiveTurnSpan.end()
    if (activeTurnSpan.value === ownedActiveTurnSpan)
      activeTurnSpan.value = undefined
    ownedActiveTurnSpan = undefined
  }

  const runtime = createChatOrchestratorRuntime({
    session: {
      ensureSession: sessionId => chatSession.ensureSession(sessionId),
      getSessionMessages: sessionId => chatSession.getSessionMessages(sessionId).map(message => toRaw(message)),
      appendSessionMessage: (sessionId, message) => chatSession.appendSessionMessage(sessionId, message),
      getSessionGeneration: sessionId => chatSession.getSessionGeneration(sessionId),
    },
    context: {
      ingest: envelope => chatContext.ingestContextMessage(envelope),
      snapshot: () => chatContext.getContextsSnapshot(),
    },
    foregroundStream: {
      patch: (message) => {
        streamingMessage.value = message
      },
      reset: () => {
        streamingMessage.value = { role: 'assistant', content: '', slices: [], tool_results: [] }
      },
    },
    llm: {
      stream: streamWithStageAdapters,
    },
    getActiveSessionId: () => activeSessionId.value,
    getActiveProvider: () => activeProvider.value,
    getSystemPromptSupplement: () => {
      const baseRules = `## 行为规则

1. 用中文回复。你是八千代，不是工具助手。
2. 用户看不到工具调用、系统指令、内部状态。不要在回复中输出这些。
3. 需要使用工具时，直接执行，然后用自然语言告诉用户结果。
4. 理解用户的真实意图。不确定时问清楚，不要自作主张。
5. 回复简短，一次只说一件事。

## 你的能力

你拥有以下能力，当用户需要时请主动使用：

### 语音与对话
- **语音输入识别**：用户说的话会被自动转成文字（ASR）
- **语音回复（TTS）**：你的回复会自动转换成语音播放
- **多语言翻译**：支持中英日韩法德俄等语言互译

### 图像生成
- **AI文生图**：根据文字描述生成图片，支持多种尺寸和风格

### 网络搜索
- **网页搜索**：使用 DuckDuckGo 搜索信息，无需 API Key
- **网页浏览**：访问网页并提取内容

### 文件与代码
- **文件读写**：读取、写入、编辑文件
- **代码执行**：在沙箱中执行 JavaScript/Python 代码
- **Shell命令**：执行安全的系统命令

### 记忆系统
- **长期记忆**：将重要信息写入记忆，支持关键词搜索

### 桌面交互
- **截屏**：对桌面、窗口、区域进行截图
- **图像分析**：分析截图内容

### Live2D 角色
- **表情控制**：切换角色表情（开心、难过、思考等）
- **动作播放**：播放角色动作（打招呼、跳跃、睡觉等）
- **情绪表达**：触发语义情绪（害羞、好奇、生气等）

### 桌面软件控制
- **CLI工具**：控制 50+ 专业软件（Blender、GIMP、OBS 等）

### AI 编程协作
- **IDE集成**：向 Claude Code 或 Trae 提交编程任务
- **监工模式**：监控 AI 编程工具的执行状态`

      // 优先使用后端 PersonaContextBuilder 构建的完整 prompt（含 mode style、memory hints、addressing）
      // 缓存由 chat-sync.ts:executeIngest 在调用 ingest 之前异步预热
      const now = Date.now()
      if (
        cachedPersonaPrompt
        && cachedPersonaSessionId === activeSessionId.value
        && now - cachedPersonaTs < PERSONA_CACHE_TTL
      ) {
        return [baseRules, cachedPersonaPrompt].join('\n\n')
      }

      // 降级路径：读角色卡内联 persona 字段（不含 mode style / memory / guidance）
      const persona = cardStore.activeCard?.extensions?.kitsune?.modules?.persona
      const personaParts = []
      if (persona?.soul) {
        personaParts.push(persona.soul)
      }
      if (persona?.identity) {
        personaParts.push(persona.identity)
      }

      return [baseRules, ...personaParts].join('\n\n')
    },
    runtimeContextProviders: [
      createMinecraftContext,
    ],
    createId: nanoid,
    unwrapMessage: message => toRaw(message),
    onStateChange: syncRuntimeState,
    onSendSettled: settleOwnedActiveTurnSpan,
    onTrackFirstMessage: trackFirstMessage,
    onMessageSendStarted: ({ source, model }) => trackMessageSendStarted({
      source,
      model,
    }),
    onLlmRequestStarted: ({ model, provider, hasVoice }) => trackLlmRequestStarted({
      model,
      provider,
      has_voice: hasVoice,
    }),
    onLlmFirstToken: ({ model, ttfbMs }) => trackLlmFirstToken({
      model,
      ttfb_ms: ttfbMs,
    }),
    onAssistantResponseRendered: ({ model, latencyMs }) => trackAssistantResponseRendered({
      model,
      latency_ms: latencyMs,
    }),
    onMessageRound: ({ durationMs, hasVoice, model }) => trackMessageRound({
      duration_ms: durationMs,
      has_voice: hasVoice,
      model,
    }),
    onLifecycle: record => contextObservability.recordLifecycle(record),
    onPromptProjection: payload => contextObservability.capturePromptProjection(payload),
    onUserTurnReady: ({ messageText, sessionMessages }) => {
      const autonomousTarget = cardStore.activeCard?.extensions?.kitsune?.modules?.artistry?.autonomousTarget || 'user'
      if (autonomousTarget === 'user')
        void artistryAutonomousStore.runArtistTask(messageText, toProviderHistory(sessionMessages))
    },
    onAssistantTurnReady: ({ messageText, sessionMessages }) => {
      const artistry = cardStore.activeCard?.extensions?.kitsune?.modules?.artistry
      if (artistry?.autonomousEnabled && artistry?.autonomousTarget === 'assistant')
        void artistryAutonomousStore.runArtistTask(messageText, toProviderHistory(sessionMessages))
    },
  })

  watch(sending, (next) => {
    if (runtime.getSending() !== next)
      runtime.setSending(next)
  })

  async function ingest(
    sendingMessage: string,
    options: ChatOrchestratorSendOptions,
    targetSessionId?: string,
  ) {
    return runtime.ingest(sendingMessage, options, targetSessionId)
  }

  async function ingestOnFork(
    sendingMessage: string,
    options: ChatOrchestratorSendOptions,
    forkOptions?: ForkOptions,
  ) {
    const baseSessionId = forkOptions?.fromSessionId ?? activeSessionId.value
    if (!forkOptions)
      return ingest(sendingMessage, options, baseSessionId)

    const forkSessionId = await chatSession.forkSession({
      fromSessionId: baseSessionId,
      atIndex: forkOptions.atIndex,
      reason: forkOptions.reason,
      hidden: forkOptions.hidden,
    })
    return ingest(sendingMessage, options, forkSessionId || baseSessionId)
  }

  function cancelPendingSends(sessionId?: string) {
    runtime.cancelPendingSends(sessionId)
  }

  function getPendingQueuedSendSnapshot() {
    return runtime.getPendingQueuedSendSnapshot()
  }

  return {
    // ——— Persona prompt 缓存 ———
    setCachedPersonaPrompt(prompt: string, sessionId: string) {
      cachedPersonaPrompt = prompt
      cachedPersonaSessionId = sessionId
      cachedPersonaTs = Date.now()
    },

    /** 检查 persona 缓存是否对指定 session 仍有效（60s TTL） */
    isPersonaCacheValid(sessionId: string): boolean {
      const now = Date.now()
      return !!cachedPersonaPrompt
        && cachedPersonaSessionId === sessionId
        && now - cachedPersonaTs < PERSONA_CACHE_TTL
    },

    sending,
    pendingQueuedSendCount,

    ingest,
    ingestOnFork,
    cancelPendingSends,
    getPendingQueuedSendSnapshot,

    clearHooks: runtime.hooks.clearHooks,

    emitBeforeMessageComposedHooks: runtime.hooks.emitBeforeMessageComposedHooks,
    emitAfterMessageComposedHooks: runtime.hooks.emitAfterMessageComposedHooks,
    emitBeforeSendHooks: runtime.hooks.emitBeforeSendHooks,
    emitAfterSendHooks: runtime.hooks.emitAfterSendHooks,
    emitTokenLiteralHooks: runtime.hooks.emitTokenLiteralHooks,
    emitTokenSpecialHooks: runtime.hooks.emitTokenSpecialHooks,
    emitStreamEndHooks: runtime.hooks.emitStreamEndHooks,
    emitAssistantResponseEndHooks: runtime.hooks.emitAssistantResponseEndHooks,
    emitAssistantMessageHooks: runtime.hooks.emitAssistantMessageHooks,
    emitChatTurnCompleteHooks: runtime.hooks.emitChatTurnCompleteHooks,

    onBeforeMessageComposed: runtime.hooks.onBeforeMessageComposed,
    onAfterMessageComposed: runtime.hooks.onAfterMessageComposed,
    onBeforeSend: runtime.hooks.onBeforeSend,
    onAfterSend: runtime.hooks.onAfterSend,
    onTokenLiteral: runtime.hooks.onTokenLiteral,
    onTokenSpecial: runtime.hooks.onTokenSpecial,
    onStreamEnd: runtime.hooks.onStreamEnd,
    onAssistantResponseEnd: runtime.hooks.onAssistantResponseEnd,
    onAssistantMessage: runtime.hooks.onAssistantMessage,
    onChatTurnComplete: runtime.hooks.onChatTurnComplete,
  }
})
