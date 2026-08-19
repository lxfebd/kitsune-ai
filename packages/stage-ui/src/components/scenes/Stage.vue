<script setup lang="ts">
import type { Live2DLipSync, Live2DLipSyncOptions } from '@kitsune/model-driver-lipsync'
import type { Profile } from '@kitsune/model-driver-lipsync/shared/wlipsync'
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'
import type { UnElevenLabsOptions } from 'unspeech'

import type { EmotionPayload } from '../../constants/emotions'
import type { StageTtsSession } from '../../libs/speech/tts-session'
import type { VoicePackSnapshot } from '../../stores/modules/persona'
import type { VoiceInfo } from '../../stores/providers'

import { sleep } from '@moeru/std'
import { createLive2DLipSync } from '@kitsune/model-driver-lipsync'
import { wlipsyncProfile } from '@kitsune/model-driver-lipsync/shared/wlipsync'
import { createPlaybackManager, createSpeechPipeline, normalizeActPayload } from '@kitsune/pipelines-audio'
import { Live2DScene, useLive2dParams } from '@kitsune/stage-ui-live2d'
import { createEmotionIntentFromLegacy } from '@kitsune/stage-ui-live2d/composables/live2d'
import { SpineScene } from '@kitsune/stage-ui-spine'
import { ThreeScene } from '@kitsune/stage-ui-three'
import { animations } from '@kitsune/stage-ui-three/assets/vrm'
import { usePetEmotionStore } from '../../stores/chat/emotion-pet'
import { Callout } from '@kitsune/ui'
import { useBroadcastChannel } from '@vueuse/core'
// import { createTransformers } from '@xsai-transformers/embed'
// import embedWorkerURL from '@xsai-transformers/embed/worker?worker&url'
// import { embed } from '@xsai/embed'
import { generateSpeech } from '@xsai/generate-speech'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import { useSettingsLive2d } from '../../../../stage-ui-live2d/src/composables/live2d/live2d'
import { useDuckDb } from '../../composables/use-duck-db'
import { useIOTraceBridge } from '../../composables/use-io-trace-bridge'
import { initIOTracer } from '../../composables/use-io-tracer'
import { useSpeechPipelineAnalytics } from '../../composables/use-speech-pipeline-analytics'
import { Emotion, EMOTION_EmotionMotionName_value, EMOTION_VRMExpressionName_value, EmotionThinkMotionName } from '../../constants/emotions'
import { createStageTtsSession } from '../../libs/speech/tts-session'
import { useAudioContext, useSpeakingStore } from '../../stores/audio'
import { useBackgroundStore } from '../../stores/background'
import { useChatOrchestratorStore } from '../../stores/chat'
import { useLlmStreamingControlStore } from '../../stores/llm-streaming-control'
import { usePersonaStore } from '../../stores/modules'
import { useSpeechStore, voicePackForSpeechProvider } from '../../stores/modules/speech'
import { useProvidersStore } from '../../stores/providers'
import { useSettings } from '../../stores/settings'
import { useSpeechOutputControlStore } from '../../stores/speech-output-control'
import { useSpeechRuntimeStore } from '../../stores/speech-runtime'

const props = withDefaults(defineProps<{
  cursorPosition?: { x: number, y: number }
  enableOrbitControls?: boolean
  paused?: boolean
}>(), {
  enableOrbitControls: true,
  paused: false,
})

const componentState = defineModel<'pending' | 'loading' | 'mounted'>('state', { default: 'pending' })

const { getDb } = useDuckDb()
// const transformersProvider = createTransformers({ embedWorkerURL })

const vrmViewerRef = ref<InstanceType<typeof ThreeScene>>()
const live2dSceneRef = ref<InstanceType<typeof Live2DScene>>()
const spineSceneRef = ref<InstanceType<typeof SpineScene>>()

const settingsStore = useSettings()
const {
  stageModelRenderer,
  stageViewControlsEnabled,
  stageModelSelectedUrl,
  stageModelSelected,
  themeColorsHue,
  themeColorsHueDynamic,

} = storeToRefs(settingsStore)
const {
  live2dShadowEnabled,
  live2dMaxFps,
  live2dRenderScale,
} = storeToRefs(useSettingsLive2d())
const {
  spinePremultipliedAlpha,
  spineDefaultMixDuration,
  spineIdleAnimationEnabled,
  spineMaxFps,
  spineRenderScale,
  vrmMaxFps,
} = storeToRefs(settingsStore)
const { mouthOpenSize, nowSpeaking } = storeToRefs(useSpeakingStore())
const { audioContext } = useAudioContext()
const currentAudioSource = ref<AudioBufferSourceNode>()

// 流式播放器 — 用于 GPT-SoVITS 逐 chunk 解码播放。
// key = `${intentId}:${segmentId}`，tts() 推入 chunk，playFunction 启动播放。
interface StreamingPlayer {
  start: () => void
  push: (buf: AudioBuffer) => void
  finish: () => void
  done: Promise<void>
  stop: () => void
}

function createStreamingPlayer(signal: AbortSignal): StreamingPlayer {
  const queue: AudioBuffer[] = []
  const scheduledSources = new Set<AudioBufferSourceNode>()
  let started = false
  let ended = false
  let nextStartTime = 0
  let lastSource: AudioBufferSourceNode | null = null
  let resolveDone!: () => void
  const done = new Promise<void>((r) => { resolveDone = r })

  function connectSource(source: AudioBufferSourceNode) {
    source.connect(audioContext!.destination)
    if (audioAnalyser.value)
      source.connect(audioAnalyser.value)
    if (lipSyncNode.value)
      source.connect(lipSyncNode.value)
  }

  function stop() {
    for (const s of scheduledSources) {
      try { s.stop(); s.disconnect() } catch {}
    }
    scheduledSources.clear()
    queue.length = 0
    if (!ended) { ended = true; resolveDone() }
  }

  signal.addEventListener('abort', stop, { once: true })

  /** 预调度队列中所有 chunk — 用精确的 start(when) 消除 onended 链式间隙。 */
  function scheduleAll() {
    if (signal.aborted) { stop(); return }
    while (queue.length > 0) {
      const buf = queue.shift()!
      const source = audioContext!.createBufferSource()
      source.buffer = buf
      connectSource(source)

      // 精确调度：nextStartTime 逐块累加，块与块零间隙衔接。
      const when = Math.max(nextStartTime, audioContext!.currentTime + 0.01)
      source.start(when)
      nextStartTime = when + buf.duration

      scheduledSources.add(source)
      lastSource = source
      source.onended = () => {
        scheduledSources.delete(source)
        if (currentAudioSource.value === source) currentAudioSource.value = undefined
        if (ended && source === lastSource) resolveDone()
      }
      currentAudioSource.value = source
    }
  }

  return {
    start() {
      if (started) return
      started = true
      if (audioContext!.state === 'suspended') audioContext!.resume().catch(() => {})
      nextStartTime = audioContext!.currentTime + 0.01
      scheduleAll()
    },
    push(buf: AudioBuffer) {
      queue.push(buf)
      if (started) scheduleAll()
    },
    finish() {
      ended = true
      // 若尚无任何 chunk 被调度（空段），直接完成。
      if (started && !lastSource) resolveDone()
    },
    done,
    stop,
  }
}

const streamingPlayers = new Map<string, StreamingPlayer>()
const { latestStopRequest } = storeToRefs(useSpeechOutputControlStore())

const { onBeforeMessageComposed, onBeforeSend, onTokenLiteral, onTokenSpecial, onStreamEnd, onAssistantResponseEnd } = useChatOrchestratorStore()
const chatHookCleanups: Array<() => void> = []
// WORKAROUND: clear previous handlers on unmount to avoid duplicate calls when this component remounts.
//             We keep per-hook disposers instead of wiping the global chat hooks to play nicely with
//             cross-window broadcast wiring.

const providersStore = useProvidersStore()
const live2dStore = useLive2dParams()
const showStage = ref(true)
const viewUpdateCleanups: Array<() => void> = []

// Caption + Presentation broadcast channels
type CaptionChannelEvent
  = | { type: 'caption-speaker', text: string }
    | { type: 'caption-assistant', text: string }
const { post: postCaption } = useBroadcastChannel<CaptionChannelEvent, CaptionChannelEvent>({ name: 'kitsune-caption-overlay' })
const assistantCaption = ref('')

type PresentEvent
  = | { type: 'assistant-reset' }
    | { type: 'assistant-append', text: string }
const { post: postPresent } = useBroadcastChannel<PresentEvent, PresentEvent>({ name: 'kitsune-chat-present' })

viewUpdateCleanups.push(live2dStore.onShouldUpdateView(async () => {
  // Model.vue's modelSrcRef watcher handles the actual reload when the URL
  // changes. We only need to ensure the store has the latest model URL
  // without tearing down the entire scene (which caused "Loading..." flashes).
  await settingsStore.updateStageModel()
}))

const audioAnalyser = ref<AnalyserNode>()
const lipSyncStarted = ref(false)
const lipSyncLoopId = ref<number>()
const live2dLipSync = ref<Live2DLipSync>()
const live2dLipSyncOptions: Live2DLipSyncOptions = { mouthUpdateIntervalMs: 50, mouthLerpWindowMs: 50 }

function resetAssistantSpeechSurface(source: string) {
  nowSpeaking.value = false
  mouthOpenSize.value = 0
  assistantCaption.value = ''

  try {
    postCaption({ type: 'caption-assistant', text: '' })
  }
  catch (error) {
    console.warn(`[Stage] Failed to post caption reset for ${source} (channel may be closed)`, { error })
  }

  try {
    postPresent({ type: 'assistant-reset' })
  }
  catch (error) {
    console.warn(`[Stage] Failed to post present reset for ${source} (channel may be closed)`, { error })
  }
}

const { activeCard } = storeToRefs(usePersonaStore())
const speechStore = useSpeechStore()
const { ssmlEnabled, activeSpeechProvider, activeSpeechModel, activeSpeechVoice, pitch } = storeToRefs(speechStore)
const activeCardId = computed(() => activeCard.value?.name ?? 'default')
const speechRuntimeStore = useSpeechRuntimeStore()
const backgroundStore = useBackgroundStore()
const { activeBackgroundUrl } = storeToRefs(backgroundStore)

const { currentMotion } = storeToRefs(useLive2dParams())

// 桌宠情绪队列 — 从 usePetEmotionStore 读取，由 chat 流信号或 executor 事件桥接器推入
const petEmotionStore = usePetEmotionStore()
let processingEmotion = false
watch(petEmotionStore.queue, async () => {
  if (processingEmotion) return
  processingEmotion = true
  try {
    while (petEmotionStore.queue.length > 0) {
      const emotion = petEmotionStore.dequeue()
      if (!emotion) break
      if (stageModelRenderer.value === 'vrm') {
        const value = EMOTION_VRMExpressionName_value[emotion.name]
        if (value) {
          await vrmViewerRef.value!.setExpression(value, emotion.intensity)
        }
      }
      else if (stageModelRenderer.value === 'live2d') {
        currentMotion.value = { group: EMOTION_EmotionMotionName_value[emotion.name] }
        // Drive Soullink Emotion Engine for VAD-based continuous emotion
        const bridge = live2dSceneRef.value?.soullinkBridge
        if (bridge) {
          const intent = createEmotionIntentFromLegacy(emotion.name, emotion.intensity)
          bridge.triggerIntent(intent)
        }
      }
      else if (stageModelRenderer.value === 'spine') {
        spineSceneRef.value?.setEmotion(emotion.name, emotion.intensity)
      }
    }
  }
  finally {
    processingEmotion = false
  }
}, { deep: true })

const streamingControl = useLlmStreamingControlStore()

function toStageEmotionPayload(payload: { name: string, intensity: number }): EmotionPayload | undefined {
  switch (payload.name) {
    case 'happy':
      return { name: Emotion.Happy, intensity: payload.intensity }
    case 'sad':
      return { name: Emotion.Sad, intensity: payload.intensity }
    case 'angry':
      return { name: Emotion.Angry, intensity: payload.intensity }
    case 'think':
      return { name: Emotion.Think, intensity: payload.intensity }
    case 'surprised':
      return { name: Emotion.Surprise, intensity: payload.intensity }
    case 'awkward':
      return { name: Emotion.Awkward, intensity: payload.intensity }
    case 'question':
      return { name: Emotion.Question, intensity: payload.intensity }
    case 'curious':
      return { name: Emotion.Curious, intensity: payload.intensity }
    case 'neutral':
      return { name: Emotion.Neutral, intensity: payload.intensity }
    default:
      return undefined
  }
}

chatHookCleanups.push(streamingControl.onSignal(async (signal) => {
  if (signal.type === 'act') {
    const act = normalizeActPayload(signal.payload)
    if (act.motion && stageModelRenderer.value === 'live2d') {
      currentMotion.value = { group: act.motion }
    }
    if (act.emotion) {
      const emotion = toStageEmotionPayload(act.emotion)
      if (!emotion)
        return

      // eslint-disable-next-line no-console
      console.debug('emotion detected', emotion)
      petEmotionStore.enqueue(emotion)
    }
    return
  }

  if (signal.type === 'delay') {
    // eslint-disable-next-line no-console
    console.debug('delay detected', signal.seconds)
    await sleep(signal.seconds * 1000)
  }
}))

// Play special token: plugin CALL, delay, or emotion.
async function playSpecialToken(
  special: string,
  options?: {
    turnId?: string
    intentId?: string
    streamId?: string
  },
) {
  await streamingControl.dispatchWith(special, {
    turnId: options?.turnId,
    intentId: options?.intentId,
    streamId: options?.streamId,
  })
}
const lipSyncNode = ref<AudioNode>()

async function playFunction(item: Parameters<Parameters<typeof createPlaybackManager<AudioBuffer>>[0]['play']>[0], signal: AbortSignal): Promise<void> {
  // 流式播放器检测：GPT-SoVITS 逐 chunk 播放优先。
  // tts() 已通过 streamingPlayers 推送了该 segment 的音频 chunk，
  // playFunction 在此启动播放器并等待所有 chunk 播完。
  const playerKey = `${item.intentId}:${item.segmentId}`
  const streamingPlayer = streamingPlayers.get(playerKey)
  if (streamingPlayer) {
    streamingPlayers.delete(playerKey)
    setupAnalyser()
    await setupLipSync()
    streamingPlayer.start()
    // 播放管理器 signal 与 intent signal 是两个独立控制器：
    // 监听前者，播放器在 overflow/steal 中断时也能停止。
    const onPlaybackAbort = () => streamingPlayer.stop()
    signal.addEventListener('abort', onPlaybackAbort, { once: true })
    try {
      await streamingPlayer.done
    }
    finally {
      signal.removeEventListener('abort', onPlaybackAbort)
    }
    return
  }

  if (!audioContext || !item.audio)
    return

  // Ensure audio context is resumed (browsers suspend it by default until user interaction)
  if (audioContext.state === 'suspended') {
    try {
      await audioContext.resume()
    }
    catch {
      return
    }
  }

  if (stageModelRenderer.value === 'live2d' && !lipSyncStarted.value) {
    // NOTICE: Playback can be triggered by non-chat speech intents, so initialize
    // the wLipSync graph here before connecting the AudioBufferSourceNode.
    setupAnalyser()
    await setupLipSync()
  }

  const source = audioContext.createBufferSource()
  currentAudioSource.value = source
  source.buffer = item.audio

  source.connect(audioContext.destination)
  if (audioAnalyser.value)
    source.connect(audioAnalyser.value)
  if (lipSyncNode.value)
    source.connect(lipSyncNode.value)

  return new Promise<void>((resolve) => {
    let settled = false
    const resolveOnce = () => {
      if (settled)
        return
      settled = true
      resolve()
    }

    const stopPlayback = () => {
      try {
        source.stop()
        source.disconnect()
      }
      catch {}
      if (currentAudioSource.value === source)
        currentAudioSource.value = undefined
      resolveOnce()
    }

    if (signal.aborted) {
      stopPlayback()
      return
    }

    signal.addEventListener('abort', stopPlayback, { once: true })
    source.onended = () => {
      signal.removeEventListener('abort', stopPlayback)
      stopPlayback()
    }

    try {
      source.start(0)
    }
    catch {
      stopPlayback()
    }
  })
}

const playbackManager = createPlaybackManager<AudioBuffer>({
  play: playFunction,
  maxVoices: 1,
  maxVoicesPerOwner: 1,
  overflowPolicy: 'queue',
  ownerOverflowPolicy: 'steal-oldest',
})

function createVoicePackVoice(voicePack: VoicePackSnapshot): VoiceInfo {
  return {
    id: voicePack.voiceId,
    name: voicePack.name,
    description: voicePack.name,
    previewURL: '',
    languages: [{ code: 'en', title: 'English' }],
    provider: activeSpeechProvider.value,
    gender: 'neutral',
  }
}

const speechPipeline = createSpeechPipeline<AudioBuffer>({
  tts: async (request, signal) => {
    if (signal.aborted)
      return null

    if (activeSpeechProvider.value === 'speech-noop')
      return null

    if (!activeSpeechProvider.value)
      return null

    const provider = await providersStore.getProviderInstance(activeSpeechProvider.value) as SpeechProviderWithExtraOptions<string, UnElevenLabsOptions>
    if (!provider) {
      console.error('Failed to initialize speech provider')
      return null
    }

    if (!request.text && !request.special)
      return null

    const providerConfig = providersStore.getProviderConfig(activeSpeechProvider.value)

    // For OpenAI Compatible providers, always use provider config for model and voice
    // since these are manually configured in provider settings
    let model = activeSpeechModel.value
    let voice = activeSpeechVoice.value

    if (activeSpeechProvider.value === 'openai-compatible-audio-speech') {
      // Always prefer provider config for OpenAI Compatible (user configured it there)
      if (providerConfig?.model) {
        model = providerConfig.model as string
      }
      else {
        // Fallback to default if not in provider config
        model = 'tts-1'
        console.warn('[Speech Pipeline] OpenAI Compatible: No model in provider config, using default', { providerConfig })
      }

      if (providerConfig?.voice) {
        voice = {
          id: providerConfig.voice as string,
          name: providerConfig.voice as string,
          description: providerConfig.voice as string,
          previewURL: '',
          languages: [{ code: 'en', title: 'English' }],
          provider: activeSpeechProvider.value,
          gender: 'neutral',
        }
      }
      else {
        // Fallback to default if not in provider config
        voice = {
          id: 'alloy',
          name: 'alloy',
          description: 'alloy',
          previewURL: '',
          languages: [{ code: 'en', title: 'English' }],
          provider: activeSpeechProvider.value,
          gender: 'neutral',
        }
        console.warn('[Speech Pipeline] OpenAI Compatible: No voice in provider config, using default', { providerConfig })
      }
    }

    const voicePack = voicePackForSpeechProvider(activeSpeechProvider.value, activeCard.value?.extensions.kitsune.modules.speech.voicePack)
    if (voicePack) {
      model = voicePack.ttsModelId
      if (!voice || voice.id !== voicePack.voiceId)
        voice = createVoicePackVoice(voicePack)
    }

    // GPT-SoVITS 降级：model/voice 未配置时使用默认值
    if (activeSpeechProvider.value === 'gpt-sovits') {
      if (!model)
        model = 'gpt-sovits'
      if (!voice) {
        const voiceId = speechStore.activeSpeechVoiceId || 'default'
        voice = {
          id: voiceId,
          name: voiceId,
          description: 'GPT-SoVITS default voice',
          previewURL: '',
          languages: [{ code: 'zh', title: 'Chinese' }],
          provider: 'gpt-sovits',
          gender: 'neutral',
        }
      }
    }

    if (!model || !voice)
      return null

    try {
      const speechRequest = speechStore.resolveVoicePackSpeechInput({
        text: request.text,
        voice,
        providerConfig: {
          ...providerConfig,
          pitch: ssmlEnabled.value ? pitch.value : undefined,
        },
        params: voicePack?.params,
        voicePack,
        forceSSML: ssmlEnabled.value,
        supportsSSML: speechStore.supportsSSML,
        supportsAdapterProsody: false,
      })

      // GPT-SoVITS 在 Electron 下走流式 IPC：逐 OGG chunk decodeAudioData 并推入
      // 流式播放器，实现边合成边播放（首包延迟意义上）。非 Electron 环境回退 HTTP REST。
      if (activeSpeechProvider.value === 'gpt-sovits' && (window as Window & { electron?: object }).electron) {
        try {
          const { createContext } = await import('@moeru/eventa/adapters/electron/renderer')
          const { defineStreamInvoke } = await import('@moeru/eventa')
          const { electronTtsStream } = await import('@kitsune/stage-shared')
          const ipcRenderer = (window as Window & { electron?: { ipcRenderer?: unknown } }).electron?.ipcRenderer
          if (ipcRenderer) {
            const { context } = createContext(ipcRenderer as Parameters<typeof createContext>[0])
            const streamInvoke = defineStreamInvoke(context, electronTtsStream)
            const stream = streamInvoke({ text: speechRequest.input, voice: voice.id })

            // 每个 segment 一个流式播放器；playFunction 收到该 segment 时启动播放。
            const playerKey = `${request.intentId}:${request.segmentId}`
            const player = createStreamingPlayer(signal)
            streamingPlayers.set(playerKey, player)

            const reader = stream.getReader()
            // 后台持续读取 chunk → 并行解码 → 按序推入播放器
            void (async () => {
              try {
                // 并行解码缓冲区：key=sequence，value=正在解码的 Promise
                // 解码完成后按序 push，避免 OGG decodeAudioData 乱序问题
                const pending = new Map<number, Promise<AudioBuffer>>()
                let seq = 0
                let nextPush = 0

                async function flushOrdered() {
                  while (pending.has(nextPush)) {
                    const p = pending.get(nextPush)!
                    pending.delete(nextPush)
                    if (!signal.aborted) {
                      const buf = await p
                      player.push(buf)
                    }
                    nextPush++
                  }
                }

                while (true) {
                  const { done, value } = await reader.read()
                  if (done) break
                  if (value.type === 'chunk') {
                    const idx = seq++
                    if (value.format === 'pcm-int16') {
                      // raw PCM 直通：int16 → float32 → AudioBuffer（同步，零开销）
                      const decodePromise = Promise.resolve().then(() => {
                        const int16 = new Int16Array(value.data)
                        const float32 = new Float32Array(int16.length)
                        for (let i = 0; i < int16.length; i++)
                          float32[i] = int16[i] / 32768
                        const buf = audioContext.createBuffer(1, float32.length, value.sampleRate)
                        buf.getChannelData(0).set(float32)
                        return buf
                      })
                      pending.set(idx, decodePromise)
                    }
                    else {
                      // OGG 格式：decodeAudioData 异步解码
                      const d = value.data
                      pending.set(idx, audioContext.decodeAudioData(d))
                    }
                    await flushOrdered()
                  }
                  if (value.type === 'end') break
                }
                // 等待剩余的解码任务完成，按序推入
                while (nextPush < seq) {
                  await flushOrdered()
                  if (pending.size === 0) break
                  // 等待下一个解码完成
                  const p = pending.get(nextPush)
                  if (p) { const buf = await p; if (!signal.aborted) player.push(buf); nextPush++ }
                  else { await new Promise(r => setTimeout(r, 5)) }
                }
                player.finish()
              }
              catch (e) {
                console.warn('[Speech Pipeline] 流式解码失败', e)
                player.finish()
              }
            })()

            // 返回占位 AudioBuffer（1 样本静音），让 pipeline 走正常 timeline 调度，
            // playFunction 检测到 streamingPlayers 后改为等待流式播放器播放完成。
            const placeholder = audioContext.createBuffer(1, 1, 32000)
            return placeholder
          }
        }
        catch (e) {
          console.warn('[Speech Pipeline] 流式 IPC 回退到 HTTP REST', e)
        }
        // 流式 IPC 不可用时回退到 HTTP REST
      }

      const res = await generateSpeech({
        ...provider.speech(model, speechRequest.providerConfig),
        input: speechRequest.input,
        voice: voice.id,
      })

      if (signal.aborted || !res || res.byteLength === 0)
        return null

      const audioBuffer = await audioContext.decodeAudioData(res)
      return audioBuffer
    }
    catch (err) {
      // Surface the error with context. Pipeline still drops the segment
      // (returning null) so the conversation keeps going, but operators see
      // the failure in devtools instead of silent truncation.
      if (!signal.aborted) {
        console.error('[Speech Pipeline] tts() failed', {
          provider: activeSpeechProvider.value,
          model,
          voice: voice?.id,
          error: err,
        })
      }
      return null
    }
  },
  playback: playbackManager,
})

initIOTracer()
useIOTraceBridge(speechPipeline)
useSpeechPipelineAnalytics()
void speechRuntimeStore.registerHost(speechPipeline)

speechPipeline.on('onSpecial', (segment) => {
  if (segment.special) {
    void playSpecialToken(segment.special, {
      turnId: segment.turnId,
      intentId: segment.intentId,
      streamId: segment.streamId,
    })
  }
})

speechPipeline.on('onTurnEnd', (turnId) => {
  streamingControl.completeTurn(turnId)
})

speechPipeline.on('onTurnCancel', ({ turnId }) => {
  streamingControl.cancelTurn(turnId)
})

playbackManager.onEnd(() => {
  nowSpeaking.value = false
  mouthOpenSize.value = 0
})

playbackManager.onStart(({ item }) => {
  nowSpeaking.value = true
  // NOTICE: postCaption and postPresent may throw errors if the BroadcastChannel is closed
  // (e.g., when navigating away from the page). We wrap these in try-catch to prevent
  // breaking playback when the channel is unavailable.
  assistantCaption.value += ` ${item.text}`
  try {
    postCaption({ type: 'caption-assistant', text: item.text })
  }
  catch {
    // BroadcastChannel may be closed - don't break playback
  }
  try {
    postPresent({ type: 'assistant-append', text: item.text })
  }
  catch {
    // BroadcastChannel may be closed - don't break playback
  }
})

function startLipSyncLoop() {
  if (lipSyncLoopId.value)
    return

  const tick = () => {
    if (!nowSpeaking.value || !live2dLipSync.value) {
      mouthOpenSize.value = 0
    }
    else {
      mouthOpenSize.value = live2dLipSync.value.getMouthOpen()
    }
    lipSyncLoopId.value = requestAnimationFrame(tick)
  }

  lipSyncLoopId.value = requestAnimationFrame(tick)
}

function stopLipSyncLoop() {
  if (lipSyncLoopId.value) {
    cancelAnimationFrame(lipSyncLoopId.value)
    lipSyncLoopId.value = undefined
  }

  mouthOpenSize.value = 0
}

function resetLive2dLipSync() {
  stopLipSyncLoop()

  try {
    lipSyncNode.value?.disconnect()
  }
  catch {

  }

  lipSyncNode.value = undefined
  live2dLipSync.value = undefined
  lipSyncStarted.value = false
}

function syncLipSyncLoop() {
  if (stageModelRenderer.value === 'live2d' && !props.paused && lipSyncStarted.value) {
    startLipSyncLoop()
    return
  }

  stopLipSyncLoop()
}

// 保存隐藏前 lip sync RAF 是否在运行，避免 visible 后错误启动
let lipSyncWasRunningBeforeHidden = false

// 页面隐藏时暂停 lip sync RAF，visible 时若之前在运行则恢复
function handleLipSyncVisibilityChange() {
  if (document.hidden) {
    lipSyncWasRunningBeforeHidden = !!lipSyncLoopId.value
    stopLipSyncLoop()
  }
  else {
    if (lipSyncWasRunningBeforeHidden) {
      startLipSyncLoop()
      lipSyncWasRunningBeforeHidden = false
    }
  }
}

async function setupLipSync() {
  if (stageModelRenderer.value !== 'live2d') {
    resetLive2dLipSync()
    return
  }

  if (lipSyncStarted.value)
    return

  try {
    const lipSync = await createLive2DLipSync(audioContext, wlipsyncProfile as Profile, live2dLipSyncOptions)
    live2dLipSync.value = lipSync
    lipSyncNode.value = lipSync.node
    await audioContext.resume()
    lipSyncStarted.value = true
    syncLipSyncLoop()
  }
  catch (error) {
    resetLive2dLipSync()
    console.error('Failed to setup Live2D lip sync', error)
  }
}

function setupAnalyser() {
  if (!audioAnalyser.value) {
    audioAnalyser.value = audioContext.createAnalyser()
  }
}

// One TTS session per LLM intent. Login and official streaming providers
// have been removed, so only the segmenter-based REST adapter is used.
let currentSession: StageTtsSession | null = null

function stopSpeechOutput(reason: string) {
  currentSession?.cancel(reason)
  currentSession = null
  speechPipeline.stopAll(reason)
  playbackManager.stopAll(reason)
  resetAssistantSpeechSurface(reason)
}

function openTtsSession(): StageTtsSession {
  // Login and official streaming providers have been removed; always use
  // the segmenter-based REST path.
  return createStageTtsSession<AudioBuffer>({
    transport: 'rest',
    streaming: () => null,
    audioContext,
    playbackManager,
    openIntent: opts => speechRuntimeStore.openIntent(opts),
    intentOptions: () => ({
      ownerId: activeCardId.value,
      priority: 'normal',
      behavior: 'queue',
    }),
  })
}

watch(latestStopRequest, (request) => {
  if (!request)
    return

  stopSpeechOutput(request.reason)
})

chatHookCleanups.push(onBeforeMessageComposed(async () => {
  playbackManager.stopAll('new-message')

  setupAnalyser()
  await setupLipSync()
  resetAssistantSpeechSurface('new-message')

  currentSession?.cancel('new-message')
  currentSession = openTtsSession()
}))

chatHookCleanups.push(onBeforeSend(async () => {
  currentMotion.value = { group: EmotionThinkMotionName }
}))

chatHookCleanups.push(onTokenLiteral(async (literal) => {
  currentSession?.appendText(literal)
}))

chatHookCleanups.push(onTokenSpecial(async (special) => {
  currentSession?.appendSpecial(special)
}))

chatHookCleanups.push(onStreamEnd(async () => {
  currentSession?.finishInput()
}))

chatHookCleanups.push(onAssistantResponseEnd(async (_message) => {
  currentSession?.end()
  // Streaming sessions null-out via the onDone hook; segmenter sessions
  // stay around until the next `onBeforeMessageComposed` cancels them
  // (the segmenter pipeline's IntentHandle.end is idempotent and
  // ResourceMessages still arrive after end() — clearing here would
  // race with the pipeline's own cleanup). Keep the ref pointing at
  // the just-ended session; it costs nothing and the next message
  // replaces it.
  // const res = await embed({
  //   ...transformersProvider.embed('Xenova/nomic-embed-text-v1'),
  //   input: message,
  // })

  // await db.value?.execute(`INSERT INTO memory_test (vec) VALUES (${JSON.stringify(res.embedding)});`)
}))

// Mid-session provider / voice / model swaps would otherwise keep feeding
// tokens to the OLD adapter (segmenter for the new provider, or stale ws
// for the streaming provider). Cancel the active session so the next LLM
// token after the swap falls through `currentSession?.` cleanly (silent
// drop is acceptable — we don't try to fork-replay text into a new
// adapter with potentially different voice/model).
watch(
  [activeSpeechProvider, () => activeSpeechVoice.value?.id, activeSpeechModel],
  ([provider, voiceId, model], [prevProvider, prevVoiceId, prevModel]) => {
    if (!currentSession)
      return
    if (provider === prevProvider && voiceId === prevVoiceId && model === prevModel)
      return
    console.warn('[Speech Pipeline] provider/voice/model changed mid-session, tearing down', {
      provider,
      prevProvider,
      voiceId,
      prevVoiceId,
      model,
      prevModel,
    })
    currentSession.cancel('provider-or-voice-changed')
    currentSession = null
  },
)

// Resume audio context on first user interaction (browser requirement)
let audioContextResumed = false
function resumeAudioContextOnInteraction() {
  if (audioContextResumed || !audioContext)
    return
  audioContextResumed = true
  audioContext.resume().catch(() => {
    // Ignore errors - audio context will be resumed when needed
  })
}

// Add event listeners for user interaction
if (typeof window !== 'undefined') {
  const events = ['click', 'touchstart', 'keydown']
  events.forEach((event) => {
    window.addEventListener(event, resumeAudioContextOnInteraction, { once: true, passive: true })
  })
}

onMounted(async () => {
  await getDb() // stub for future update
  document.addEventListener('visibilitychange', handleLipSyncVisibilityChange)
})

watch([stageModelRenderer, () => props.paused], ([renderer]) => {
  if (renderer === 'godot') {
    componentState.value = 'mounted'
  }

  if (renderer !== 'live2d') {
    resetLive2dLipSync()
    return
  }

  syncLipSyncLoop()
}, { immediate: true })

function canvasElement() {
  if (stageModelRenderer.value === 'live2d')
    return live2dSceneRef.value?.canvasElement()

  else if (stageModelRenderer.value === 'vrm')
    return vrmViewerRef.value?.canvasElement()

  else if (stageModelRenderer.value === 'spine')
    return spineSceneRef.value?.canvasElement()
}

function readRenderTargetRegionAtClientPoint(clientX: number, clientY: number, radius: number) {
  if (stageModelRenderer.value !== 'vrm')
    return null

  return vrmViewerRef.value?.readRenderTargetRegionAtClientPoint?.(clientX, clientY, radius) ?? null
}

async function captureFrame() {
  const charBlob = await (stageModelRenderer.value === 'live2d'
    ? live2dSceneRef.value?.captureFrame()
    : stageModelRenderer.value === 'vrm'
      ? vrmViewerRef.value?.captureFrame()
      : spineSceneRef.value?.captureFrame())

  if (!activeBackgroundUrl.value || !charBlob)
    return charBlob

  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx)
      return charBlob

    // Load background image
    const bgImg = new Image()
    bgImg.crossOrigin = 'anonymous'
    bgImg.src = activeBackgroundUrl.value
    await new Promise((resolve, reject) => {
      bgImg.onload = resolve
      bgImg.onerror = reject
    })

    // Load character frame
    const charImg = await createImageBitmap(charBlob)

    // Match canvas size to the captured frame (respects DPI/Render Scale)
    canvas.width = charImg.width
    canvas.height = charImg.height

    // Draw background with "cover" logic
    const scale = Math.max(canvas.width / bgImg.width, canvas.height / bgImg.height)
    const w = bgImg.width * scale
    const h = bgImg.height * scale
    const x = (canvas.width - w) / 2
    const y = (canvas.height - h) / 2

    ctx.drawImage(bgImg, x, y, w, h)

    // Draw character on top
    ctx.drawImage(charImg, 0, 0)

    return new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  }
  catch (error) {
    console.error('[Stage] Failed to composite photo with background:', error)
    return charBlob // Fallback to character-only
  }
}

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleLipSyncVisibilityChange)
  resetLive2dLipSync()
  chatHookCleanups.forEach(dispose => dispose?.())
  viewUpdateCleanups.forEach(dispose => dispose?.())
  // Tear down any in-flight TTS session (segmenter or streaming) and
  // drain playback. Without this, a still-open streaming ws keeps
  // feeding sentences into a playbackManager whose listeners still
  // mutate component refs (caption / nowSpeaking). Codex review: HIGH
  // #1 + MEDIUM #5.
  currentSession?.cancel('unmount')
  currentSession = null
  playbackManager.stopAll('unmount')
})

defineExpose({
  canvasElement,
  captureFrame,
  readRenderTargetRegionAtClientPoint,
})
</script>

<template>
  <div relative h-full w-full>
    <!-- Scene Background Layer -->
    <div
      v-if="activeBackgroundUrl"
      :class="[
        'absolute left-0 top-0 z-0 h-full w-full',
        'transition-opacity duration-500',
      ]"
      :style="{
        backgroundImage: `url(${activeBackgroundUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }"
    />

    <div relative h-full w-full>
      <Live2DScene
        v-if="stageModelRenderer === 'live2d' && showStage"
        ref="live2dSceneRef"
        v-model:state="componentState"
        min-w="50% <lg:full" min-h="100 sm:100"
        h-full w-full flex-1
        :model-src="stageModelSelectedUrl"
        :model-id="stageModelSelected"
        :cursor-position="cursorPosition"
        :mouth-open-size="mouthOpenSize"
        :now-speaking="nowSpeaking"
        :paused="paused"
        :theme-colors-hue="themeColorsHue"
        :theme-colors-hue-dynamic="themeColorsHueDynamic"
        :live2d-shadow-enabled="live2dShadowEnabled"
        :live2d-max-fps="live2dMaxFps"
        :live2d-render-scale="live2dRenderScale"
      />
      <ThreeScene
        v-if="stageModelRenderer === 'vrm' && showStage"
        ref="vrmViewerRef"
        v-model:state="componentState"
        min-w="50% <lg:full" min-h="100 sm:100" h-full w-full flex-1
        :model-src="stageModelSelectedUrl"
        :cursor-position="cursorPosition"
        :idle-animation="animations.idleLoop.toString()"
        :paused="paused"
        :show-axes="stageViewControlsEnabled"
        :enable-orbit-controls="props.enableOrbitControls"
        :current-audio-source="currentAudioSource"
        :max-fps="vrmMaxFps"
        @error="console.error"
      />
      <SpineScene
        v-if="stageModelRenderer === 'spine' && showStage"
        ref="spineSceneRef"
        v-model:state="componentState"
        min-w="50% <lg:full" min-h="100 sm:100"
        h-full w-full flex-1
        :model-src="stageModelSelectedUrl"
        :model-id="stageModelSelected"
        :paused="paused"
        :premultiplied-alpha="spinePremultipliedAlpha"
        :default-mix-duration="spineDefaultMixDuration"
        :idle-animation-enabled="spineIdleAnimationEnabled"
        :max-fps="spineMaxFps"
        :render-scale="spineRenderScale"
      />
      <div
        v-if="stageModelRenderer === 'godot'"
        :class="[
          'h-full w-full',
          'flex items-center justify-center',
          'px-4 py-6',
        ]"
      >
        <div
          :class="[
            'w-96 max-w-full',
            'min-h-32',
            'flex items-center justify-center',
          ]"
        >
          <Callout label="Godot Stage (Experimental)">
            <p>Godot Stage (experimental) is running...</p>
          </Callout>
        </div>
      </div>
    </div>
  </div>
</template>
