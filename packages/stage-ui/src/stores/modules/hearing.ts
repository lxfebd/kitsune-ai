import type { Span } from '@opentelemetry/api'
import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'
import type { WithUnknown } from '@xsai/shared'
import type { StreamTranscriptionResult, StreamTranscriptionOptions as XSAIStreamTranscriptionOptions } from '@xsai/stream-transcription'

import { errorMessageFrom, tryCatch } from '@moeru/std'
import { errorMessageFromValue, IOAttributes, IOEvents, IOSpanNames, IOSubsystems } from '@kitsune/stage-shared'
import { useLocalStorageManualReset } from '@kitsune/stage-shared/composables'
import { refManualReset } from '@vueuse/core'
import { generateTranscription } from '@xsai/generate-transcription'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'

import vadWorkletUrl from '../../workers/vad/process.worklet?worker&url'

import { activeTurnSpan, startSpan } from '../../composables/use-io-tracer'
import { capturePosthogEvent } from '../analytics/posthog'
import { useSettingsAnalytics } from '../settings/analytics'
import { useProvidersStore } from '../providers'
import { streamAliyunTranscription } from '../providers/aliyun/stream-transcription'
import { streamWebSpeechAPITranscription } from '../providers/web-speech-api'

function errorMessage(err: unknown): string {
  const msg = errorMessageFromValue(err)
  // Browsers hide the real reason (CORS, timeout, DNS, …) behind this generic string.
  if (msg === 'Failed to fetch' || msg === 'Load failed') {
    return `${msg} — check the browser console (Network tab) for the exact reason (e.g. CORS, network timeout, DNS failure).`
  }
  return msg
}

// NOTICE: Realtime transcription intentionally uses `AbortError` as a control-flow signal when the
// current stream session is being stopped on purpose.
//
// This happens in `stopStreamingTranscription()`,
// which aborts the session with one of the DOMException messages below when the user disables the mic,
// the page tears down audio interaction, callbacks are intentionally rebound, or the idle timeout closes
// an inactive stream. Those cases should not be surfaced as provider failures because the session was
// explicitly asked to stop. If a future abort is noisy or unexpected, inspect the abort source first:
// `stopStreamingTranscription()` in this file is the primary origin, and provider-specific teardown
// bridges such as `packages/stage-ui/src/stores/providers/aliyun/stream-transcription.ts` propagate the
// same reason through the transport. Only treat an abort as "expected" if it is one of these known
// shutdown paths; any other `AbortError` should still be investigated as a real lifecycle bug or a
// provider/runtime failure.
function isExpectedStreamStopError(err: unknown): boolean {
  return err instanceof DOMException
    && err.name === 'AbortError'
    && (err.message === 'Stopped' || err.message === 'Aborted' || err.message === 'Closed' || err.message === 'Idle timeout')
}

function haveStreamingCallbacksChanged(
  previous: { onSentenceEnd?: (delta: string) => void, onSpeechEnd?: (text: string) => void } | undefined,
  next: { onSentenceEnd?: (delta: string) => void, onSpeechEnd?: (text: string) => void },
): boolean {
  return (next.onSentenceEnd !== undefined && next.onSentenceEnd !== previous?.onSentenceEnd)
    || (next.onSpeechEnd !== undefined && next.onSpeechEnd !== previous?.onSpeechEnd)
}

export interface StreamTranscriptionFileInputOptions extends Omit<XSAIStreamTranscriptionOptions, 'file' | 'fileName'> {
  file: Blob
  fileName?: string
}

export interface StreamTranscriptionStreamInputOptions extends Omit<XSAIStreamTranscriptionOptions, 'file' | 'fileName'> {
  inputAudioStream: ReadableStream<ArrayBuffer>
}

export type StreamTranscription = (options: WithUnknown<StreamTranscriptionFileInputOptions | StreamTranscriptionStreamInputOptions>) => StreamTranscriptionResult

type GenerateTranscriptionResponse = Awaited<ReturnType<typeof generateTranscription>>
type HearingTranscriptionGenerateResult = GenerateTranscriptionResponse & { mode: 'generate' }
type HearingTranscriptionStreamResult = StreamTranscriptionResult & { mode: 'stream' }
export type HearingTranscriptionResult = HearingTranscriptionGenerateResult | HearingTranscriptionStreamResult

type HearingTranscriptionInput = File | {
  file?: File
  inputAudioStream?: ReadableStream<ArrayBuffer>
}

interface HearingTranscriptionInvokeOptions {
  providerOptions?: Record<string, unknown>
}

export const CONFIDENCE_THRESHOLD_DISABLED = -3

export function filterTranscriptionByConfidence(
  segments: Array<{ text?: string, avg_logprob?: number }>,
  threshold: number,
): string {
  if (!segments.some(s => s?.avg_logprob != null && s?.text != null)) {
    return ''
  }

  return segments.filter(s => (s?.avg_logprob ?? -Infinity) >= threshold).map(s => s?.text ?? '').join('').trim()
}

const STREAM_TRANSCRIPTION_EXECUTORS: Record<string, StreamTranscription> = {
  'aliyun-nls-transcription': streamAliyunTranscription,
  // Web Speech API is handled specially in transcribeForMediaStream since it works directly with MediaStream
}

export function resolveStreamTranscriptionExecutor(providerId: string): StreamTranscription | undefined {
  return STREAM_TRANSCRIPTION_EXECUTORS[providerId]
}

export const useHearingStore = defineStore('hearing-store', () => {
  const providersStore = useProvidersStore()
  const { allAudioTranscriptionProvidersMetadata } = storeToRefs(providersStore)

  // State
  const activeTranscriptionProvider = useLocalStorageManualReset('settings/hearing/active-provider', '')
  const activeTranscriptionModel = useLocalStorageManualReset('settings/hearing/active-model', '')
  const activeCustomModelName = useLocalStorageManualReset('settings/hearing/active-custom-model', '')
  const transcriptionModelSearchQuery = refManualReset<string>('')
  const autoSendEnabled = useLocalStorageManualReset<boolean>('settings/hearing/auto-send-enabled', false)
  const autoSendDelay = useLocalStorageManualReset<number>('settings/hearing/auto-send-delay', 2000) // Default 2 seconds
  const confidenceThreshold = useLocalStorageManualReset<number>('settings/hearing/confidence-threshold', CONFIDENCE_THRESHOLD_DISABLED)
  const verboseJsonNotSupported = ref(false)

  // NOTICE: Auto-select local ASR provider on first run in Electron environment.
  // Uses a separate flag to ensure this only runs once, not on every restart.
  // sherpa-asr (SenseVoice) is preferred for Chinese users as it has much better
  // Chinese recognition (~2% WER) compared to Whisper which may misdetect Chinese as English.
  const autoConfiguredKey = 'settings/hearing/auto-configured-v3'
  if (import.meta.env.RUNTIME_ENVIRONMENT === 'electron' && !localStorage.getItem(autoConfiguredKey)) {
    if (!activeTranscriptionProvider.value || activeTranscriptionProvider.value === 'app-local-audio-transcription') {
      activeTranscriptionProvider.value = 'sherpa-asr'
      // 同时设默认模型，否则 configured 为 false 导致聊天页 ASR 不工作
      //（use-transcriptions.ts 的 startStreaming 在 hearingConfigured=false 时
      //  尝试自动配置 Web Speech API，但 Electron 中不可用，直接 bail）
      if (!activeTranscriptionModel.value) {
        activeTranscriptionModel.value = 'sensevoice'
      }
    }
    localStorage.setItem(autoConfiguredKey, '1')
  }

  watch(activeTranscriptionProvider, () => {
    verboseJsonNotSupported.value = false
    // Reset the selected model when switching providers: models are
    // provider-specific (e.g. a previously selected "mimo-v2.5-asr" from the
    // Xiaomi provider must not linger on "App (Local)").
    activeTranscriptionModel.value = ''
    activeCustomModelName.value = ''
  })

  // Computed properties
  const availableProvidersMetadata = computed(() => allAudioTranscriptionProvidersMetadata.value)

  // Computed properties
  const supportsModelListing = computed(() => {
    return providersStore.getProviderMetadata(activeTranscriptionProvider.value)?.capabilities.listModels !== undefined
  })

  const providerModels = computed(() => {
    return providersStore.getModelsForProvider(activeTranscriptionProvider.value)
  })

  const isLoadingActiveProviderModels = computed(() => {
    return providersStore.isLoadingModels[activeTranscriptionProvider.value] || false
  })

  const activeProviderModelError = computed(() => {
    return providersStore.modelLoadError[activeTranscriptionProvider.value] || null
  })

  async function loadModelsForProvider(provider: string) {
    if (provider && providersStore.getProviderMetadata(provider)?.capabilities.listModels !== undefined) {
      await providersStore.fetchModelsForProvider(provider)
    }
  }

  async function getModelsForProvider(provider: string) {
    if (provider && providersStore.getProviderMetadata(provider)?.capabilities.listModels !== undefined) {
      return providersStore.getModelsForProvider(provider)
    }

    return []
  }

  const configured = computed(() => {
    if (!activeTranscriptionProvider.value)
      return false

    // Web Speech API doesn't strictly need a model selected (it has a default)
    // but we still check to maintain consistency
    if (activeTranscriptionProvider.value === 'browser-web-speech-api') {
      return true // Web Speech API is ready if provider is selected and available
    }

    // App (Local) runs on-device via the bundled Whisper worker and uses a fixed
    // default model, so it is ready as soon as the provider is selected.
    if (activeTranscriptionProvider.value === 'app-local-audio-transcription') {
      return true
    }

    // For OpenAI Compatible providers, check provider config as fallback
    let hasProviderModel = false
    if (activeTranscriptionProvider.value === 'openai-compatible-audio-transcription') {
      const providerConfig = providersStore.getProviderConfig(activeTranscriptionProvider.value)
      hasProviderModel = !!providerConfig?.model
    }

    return !!activeTranscriptionModel.value || hasProviderModel
  })

  function resetState() {
    activeTranscriptionProvider.reset()
    activeTranscriptionModel.reset()
    activeCustomModelName.reset()
    transcriptionModelSearchQuery.reset()
    autoSendEnabled.reset()
    autoSendDelay.reset()
    confidenceThreshold.reset()
  }

  async function transcription(
    providerId: string,
    provider: TranscriptionProviderWithExtraOptions<string, any>,
    model: string,
    input: HearingTranscriptionInput,
    format?: 'json' | 'verbose_json',
    options?: HearingTranscriptionInvokeOptions,
  ): Promise<HearingTranscriptionResult> {
    const normalizedInput = (input instanceof File ? { file: input } : input ?? {}) as {
      file?: File
      inputAudioStream?: ReadableStream<ArrayBuffer>
    }
    const features = providersStore.getTranscriptionFeatures(providerId)
    const streamExecutor = resolveStreamTranscriptionExecutor(providerId)

    // NOTE: Analytics tracking intentionally avoids `useAnalytics()` here.
    // `useAnalytics()` calls `useI18n()` internally, and this function is a
    // Pinia store *action* (not a component `setup`), so calling it throws
    // "Must be called at the top of a `setup` function". We capture the STT
    // events directly via the setup-free `capturePosthogEvent` helper instead.
    const analyticsEnabled = useSettingsAnalytics().analyticsEnabled
    const sttStartedAt = performance.now()
    if (analyticsEnabled) {
      capturePosthogEvent('stt_started', { provider: providerId })
    }

    function emitSucceeded(charCount: number, stream: boolean) {
      if (analyticsEnabled) {
        capturePosthogEvent('stt_succeeded', {
          provider: providerId,
          latency_ms: Math.round(performance.now() - sttStartedAt),
          char_count: charCount,
          stream,
        })
      }
    }
    function emitFailed(err: unknown) {
      if (analyticsEnabled) {
        capturePosthogEvent('stt_failed', { provider: providerId, error_code: (errorMessageFrom(err) ?? 'unknown').slice(0, 64) })
      }
    }

    try {
      if (features.supportsStreamOutput && streamExecutor) {
        // TODO: integrate VAD-driven silence detection to stop and restart realtime sessions based on silence thresholds.
        const request = provider.transcription(model, options?.providerOptions)

        // Stream branches: emit succeeded with char_count=0 once the
        // executor returns successfully — char count is only known by
        // the downstream consumer of the stream, which lives outside
        // this store. Latency here = "time to start of stream".
        if (features.supportsStreamInput && normalizedInput.inputAudioStream) {
          const streamResult = streamExecutor({
            ...request,
            inputAudioStream: normalizedInput.inputAudioStream,
          } as Parameters<typeof streamExecutor>[0])
          emitSucceeded(0, true)
          return {
            mode: 'stream',
            ...streamResult,
          }
        }

        if (!features.supportsStreamInput && normalizedInput.file) {
          const streamResult = streamExecutor({
            ...request,
            file: normalizedInput.file,
          } as Parameters<typeof streamExecutor>[0])
          emitSucceeded(0, true)
          return {
            mode: 'stream',
            ...streamResult,
          }
        }

        if (features.supportsStreamInput && !normalizedInput.inputAudioStream && normalizedInput.file) {
          const streamResult = streamExecutor({
            ...request,
            file: normalizedInput.file,
          } as Parameters<typeof streamExecutor>[0])
          emitSucceeded(0, true)
          return {
            mode: 'stream',
            ...streamResult,
          }
        }

        if (!features.supportsGenerate || !normalizedInput.file) {
          throw new Error('No compatible input provided for streaming transcription.')
        }
      }

      if (!normalizedInput.file) {
        throw new Error('File input is required for transcription.')
      }

      const useVerboseJson = !format && confidenceThreshold.value > CONFIDENCE_THRESHOLD_DISABLED
      const response = await generateTranscription({
        ...provider.transcription(model, options?.providerOptions),
        file: normalizedInput.file,
        responseFormat: useVerboseJson ? 'verbose_json' : format,
      })

      if (useVerboseJson) {
        if (response.segments) {
          verboseJsonNotSupported.value = false
          const filteredText = filterTranscriptionByConfidence(response.segments, confidenceThreshold.value)
          emitSucceeded(filteredText.length, false)
          return {
            mode: 'generate',
            ...response,
            text: filteredText,
          }
        }
        else {
          verboseJsonNotSupported.value = true
          console.warn('[Hearing] Confidence filter is enabled but the provider did not return verbose_json segments. Filtering has no effect.')
        }
      }

      const fallbackText = typeof response.text === 'string' ? response.text : ''
      emitSucceeded(fallbackText.length, false)
      return {
        mode: 'generate',
        ...response,
      }
    }
    catch (err) {
      emitFailed(err)
      throw err
    }
  }

  return {
    activeTranscriptionProvider,
    activeTranscriptionModel,
    availableProvidersMetadata,
    activeCustomModelName,
    transcriptionModelSearchQuery,
    autoSendEnabled,
    autoSendDelay,
    confidenceThreshold,
    verboseJsonNotSupported,

    supportsModelListing,
    providerModels,
    isLoadingActiveProviderModels,
    activeProviderModelError,
    configured,

    transcription,
    loadModelsForProvider,
    getModelsForProvider,
    resetState,
  }
})

export const useHearingSpeechInputPipeline = defineStore('modules:hearing:speech:audio-input-pipeline', () => {
  const error = ref<string>()

  const hearingStore = useHearingStore()
  const { activeTranscriptionProvider, activeTranscriptionModel } = storeToRefs(hearingStore)
  const providersStore = useProvidersStore()
  const streamingSession = shallowRef<{
    audioContext: AudioContext | Record<string, never>
    workletNode: AudioWorkletNode | Record<string, never>
    mediaStreamSource: MediaStreamAudioSourceNode | Record<string, never>
    audioStreamController?: ReadableStreamDefaultController<ArrayBuffer>
    abortController: AbortController
    result?: HearingTranscriptionResult & { recognition?: any }
    idleTimer?: ReturnType<typeof setTimeout>
    providerId?: string
    callbacks?: {
      onSentenceEnd?: (delta: string) => void
      onSpeechEnd?: (text: string) => void
    }
  }>()

  let asrSpan: Span | undefined

  const supportsStreamInput = computed(() => {
    const providerId = activeTranscriptionProvider.value
    if (!providerId)
      return false

    // Web Speech API always supports stream input when available
    if (providerId === 'browser-web-speech-api') {
      return typeof window !== 'undefined'
        && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)
    }

    return providersStore.getTranscriptionFeatures(providerId).supportsStreamInput
  })

  const DEFAULT_SAMPLE_RATE = 16000
  const DEFAULT_STREAM_IDLE_TIMEOUT = 15000

  function float32ToInt16(buffer: Float32Array) {
    const output = new Int16Array(buffer.length)
    for (let i = 0; i < buffer.length; i++) {
      const value = Math.max(-1, Math.min(1, buffer[i]))
      output[i] = value < 0 ? value * 0x8000 : value * 0x7FFF
    }

    return output
  }

  /**
   * 将 Float32Array 音频样本转换为 WAV Blob（16-bit 单声道）。
   */
  function float32ToWavBlob(samples: Float32Array, sampleRate: number): Blob {
    const numSamples = samples.length
    const buffer = new ArrayBuffer(44 + numSamples * 2)
    const view = new DataView(buffer)

    function writeStr(offset: number, str: string): void {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
    }

    writeStr(0, 'RIFF')
    view.setUint32(4, 36 + numSamples * 2, true)
    writeStr(8, 'WAVE')
    writeStr(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * 2, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    writeStr(36, 'data')
    view.setUint32(40, numSamples * 2, true)

    let offset = 44
    for (let i = 0; i < numSamples; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
      offset += 2
    }

    return new Blob([buffer], { type: 'audio/wav' })
  }

  /**
   * VAD 分段批处理转录：用于不支持流式输入的 provider。
   *
   * 当持续的音频流进来时，用能量检测划分语音段，每段结束后拼接成 WAV 文件，
   * 调用 transcribeForRecording 转写。这样本地 provider（sherpa-asr / app-local-whisper）
   * 也能实现"说完一句出一句"的体感。
   *
   * 这不是真 partial（不会边喂边出字），但比"完全不能持续监听"好得多。
   */
  const VAD_ENERGY_THRESHOLD = 0.025
  const VAD_SILENCE_FRAMES = 30   // ~0.96s 静音 = 句尾（30 × 512 samples / 16000Hz）
  const VAD_MIN_SEGMENT_SAMPLES = 8000  // 500ms @16kHz 最小语音段

  async function transcribeWithVadBatch(
    stream: MediaStream,
    providerId: string,
    options?: {
      sampleRate?: number
      providerOptions?: Record<string, unknown>
      onSentenceEnd?: (delta: string) => void
      onSpeechEnd?: (text: string) => void
    },
  ): Promise<void> {
    const sampleRate = options?.sampleRate ?? DEFAULT_SAMPLE_RATE
    const audioContext = new AudioContext({ sampleRate, latencyHint: 'interactive' })
    await audioContext.audioWorklet.addModule(vadWorkletUrl)
    const workletNode = new AudioWorkletNode(audioContext, 'vad-audio-worklet-processor')

    const abortController = new AbortController()
    let idleTimer: ReturnType<typeof setTimeout> | undefined
    const idleTimeout = DEFAULT_STREAM_IDLE_TIMEOUT

    function bumpIdle(): void {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(async () => {
        await stopStreamingTranscription(false, providerId)
      }, idleTimeout)
    }

    // VAD 状态
    let isInSpeech = false
    let silenceFrames = 0
    let segmentChunks: Float32Array[] = []
    let totalSamples = 0

    // 转写队列：同一时间只能转写一段，后续段排队等待
    const segmentQueue: Array<{ chunks: Float32Array[], samples: number }> = []
    let isProcessing = false

    const signal = abortController.signal

    async function drainQueue(): Promise<void> {
      if (signal.aborted) return
      isProcessing = true
      while (segmentQueue.length > 0) {
        if (signal.aborted) break
        const { chunks, samples } = segmentQueue.shift()!
        if (samples < VAD_MIN_SEGMENT_SAMPLES) continue

        const combined = new Float32Array(samples)
        let offset = 0
        for (const chunk of chunks) {
          combined.set(chunk, offset)
          offset += chunk.length
        }

        const wavBlob = float32ToWavBlob(combined, sampleRate)

        try {
          const text = await transcribeForRecording(wavBlob)
          if (text && text.trim()) {
            options?.onSentenceEnd?.(text)
            options?.onSpeechEnd?.(text)
          }
        }
        catch (err) {
          if (isExpectedStreamStopError(err)) return
          console.error('[VAD Batch] Transcription error:', err)
        }
      }
      isProcessing = false
    }

    workletNode.port.onmessage = ({ data }: MessageEvent<{ buffer?: Float32Array }>) => {
      const buffer = data?.buffer
      if (!buffer) return

      // 计算 RMS 能量
      let sum = 0
      for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i]
      const rms = Math.sqrt(sum / buffer.length)

      if (rms > VAD_ENERGY_THRESHOLD) {
        // 语音活动
        isInSpeech = true
        silenceFrames = 0
        segmentChunks.push(buffer)
        totalSamples += buffer.length
        bumpIdle()
      }
      else if (isInSpeech) {
        // 静音（语音段中）
        silenceFrames++
        segmentChunks.push(buffer)
        totalSamples += buffer.length

        if (silenceFrames >= VAD_SILENCE_FRAMES) {
          // 句尾：结束当前语音段，入队转写
          isInSpeech = false
          silenceFrames = 0
          segmentQueue.push({ chunks: segmentChunks.slice(), samples: totalSamples })
          segmentChunks = []
          totalSamples = 0
          if (!isProcessing) {
            void drainQueue()
          }
        }
      }
    }

    const mediaStreamSource = audioContext.createMediaStreamSource(stream)
    mediaStreamSource.connect(workletNode)

    const silentGain = audioContext.createGain()
    silentGain.gain.value = 0
    workletNode.connect(silentGain)
    silentGain.connect(audioContext.destination)

    if (audioContext.state === 'suspended') await audioContext.resume()
    bumpIdle()

    streamingSession.value = {
      audioContext,
      workletNode,
      mediaStreamSource,
      audioStreamController: undefined,
      abortController,
      idleTimer,
      providerId,
      callbacks: {
        onSentenceEnd: options?.onSentenceEnd,
        onSpeechEnd: options?.onSpeechEnd,
      },
    }
  }

  async function createAudioStreamFromMediaStream(stream: MediaStream, sampleRate = DEFAULT_SAMPLE_RATE, onActivity?: () => void) {
    const audioContext = new AudioContext({ sampleRate, latencyHint: 'interactive' })
    await audioContext.audioWorklet.addModule(vadWorkletUrl)
    const workletNode = new AudioWorkletNode(audioContext, 'vad-audio-worklet-processor')

    let audioStreamController: ReadableStreamDefaultController<ArrayBuffer> | undefined
    const audioStream = new ReadableStream<ArrayBuffer>({
      start(controller) {
        audioStreamController = controller
      },
      cancel: () => {
        audioStreamController = undefined
      },
    })

    workletNode.port.onmessage = ({ data }: MessageEvent<{ buffer?: Float32Array }>) => {
      const buffer = data?.buffer
      if (!buffer || !audioStreamController)
        return

      const pcm16 = float32ToInt16(buffer)
      // Clone buffer to avoid retaining underlying ArrayBuffer references
      audioStreamController.enqueue(pcm16.buffer.slice(0))
      onActivity?.()
    }

    const mediaStreamSource = audioContext.createMediaStreamSource(stream)
    mediaStreamSource.connect(workletNode)

    // Sink to avoid feedback/echo
    const silentGain = audioContext.createGain()
    silentGain.gain.value = 0
    workletNode.connect(silentGain)
    silentGain.connect(audioContext.destination)

    return {
      audioContext,
      workletNode,
      mediaStreamSource,
      audioStream,
      get controller() {
        return audioStreamController
      },
    }
  }

  async function stopStreamingTranscription(abort?: boolean, disposeProviderId?: string) {
    const session = streamingSession.value
    if (!session)
      return

    if (asrSpan) {
      asrSpan.setAttribute(IOAttributes.ASRAbort, !!abort)
      asrSpan.end()
      asrSpan = undefined
    }

    // Special handling for Web Speech API
    if (session.providerId === 'browser-web-speech-api') {
      const reason = new DOMException(abort ? 'Aborted' : 'Stopped', 'AbortError')
      if (!session.abortController.signal.aborted) {
        session.abortController.abort(reason)
      }

      const result = session.result as any
      if (result?.recognition) {
        try {
          result.recognition.stop()
        }
        catch (err) {
          console.warn('Error stopping Web Speech API recognition:', err)
        }
      }

      if (session.idleTimer)
        clearTimeout(session.idleTimer)

      streamingSession.value = undefined

      if (session.result?.mode === 'stream') {
        try {
          const text = await session.result.text
          return text
        }
        catch (err) {
          if (isExpectedStreamStopError(err))
            return

          error.value = errorMessage(err)
          console.error('Error getting transcription result:', error.value)
        }
      }

      return
    }

    const reason = new DOMException(abort ? 'Aborted' : 'Stopped', 'AbortError')
    if (!session.abortController.signal.aborted) {
      session.abortController.abort(reason)
    }

    if (abort)
      session.audioStreamController?.error(reason)
    else
      session.audioStreamController?.close()

    await tryCatch(() => {
      session.mediaStreamSource.disconnect()
      session.workletNode.port.onmessage = null
      session.workletNode.disconnect()
    })
    await tryCatch(() => session.audioContext.close())

    if (session.idleTimer)
      clearTimeout(session.idleTimer)

    streamingSession.value = undefined

    if (session.result?.mode === 'stream') {
      try {
        const text = await session.result.text

        if (disposeProviderId) {
          await providersStore.disposeProviderInstance(disposeProviderId)
        }

        return text
      }
      catch (err) {
        if (isExpectedStreamStopError(err))
          return

        error.value = errorMessage(err)
        console.error('Error generating transcription:', error.value)
      }
    }

    const text = session.result?.text
    if (disposeProviderId)
      await providersStore.disposeProviderInstance(disposeProviderId)

    return text
  }

  async function transcribeForMediaStream(stream: MediaStream, options?: {
    sampleRate?: number
    providerOptions?: Record<string, unknown>
    idleTimeoutMs?: number
    onSentenceEnd?: (delta: string) => void
    onSpeechEnd?: (text: string) => void
  }) {
    activeTurnSpan.value?.end()
    const turnSpan = startSpan(IOSpanNames.InteractionTurn)
    activeTurnSpan.value = turnSpan
    asrSpan = startSpan(IOSpanNames.SpeechRecognition, turnSpan, {
      [IOAttributes.Subsystem]: IOSubsystems.ASR,
      [IOAttributes.GenAIRequestModel]: activeTranscriptionProvider.value ?? '',
    })

    console.info('[Hearing Pipeline] transcribeForMediaStream called', {
      supportsStreamInput: supportsStreamInput.value,
      hasStream: !!stream,
      providerId: activeTranscriptionProvider.value,
      hasCallbacks: !!(options?.onSentenceEnd || options?.onSpeechEnd),
    })

    if (!supportsStreamInput.value) {
      const providerId = activeTranscriptionProvider.value
      if (!providerId) {
        error.value = '请先在设置中配置语音识别 Provider'
        console.warn('[Hearing Pipeline] No transcription provider selected')
        return
      }

      // 降级到 VAD 分段批处理：本地 provider（sherpa-asr / app-local-whisper）
      // 不支持流式输入，但可以通过 VAD 划分语音段、逐段转写，实现"说完一句出一句"
      console.info('[Hearing Pipeline] Provider does not support stream input, falling back to VAD-batched transcription', { providerId })
      error.value = undefined
      try {
        await transcribeWithVadBatch(stream, providerId, {
          sampleRate: options?.sampleRate,
          providerOptions: options?.providerOptions,
          onSentenceEnd: options?.onSentenceEnd,
          onSpeechEnd: options?.onSpeechEnd,
        })
      }
      catch (err) {
        if (isExpectedStreamStopError(err)) return
        error.value = errorMessage(err)
        console.error('[Hearing Pipeline] VAD-batched transcription error:', error.value)
      }
      return
    }

    error.value = undefined

    try {
      const providerId = activeTranscriptionProvider.value
      if (!providerId) {
        error.value = 'No transcription provider selected'
        console.error('[Hearing Pipeline] No transcription provider selected')
        return
      }

      console.info('[Hearing Pipeline] Using provider:', providerId)

      // Special handling for Web Speech API - it works directly with MediaStream
      if (providerId === 'browser-web-speech-api') {
        // Check if Web Speech API is available
        const isAvailable = typeof window !== 'undefined'
          && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)

        if (!isAvailable) {
          error.value = 'Web Speech API is not available in this browser'
          console.error('Web Speech API is not available')
          return
        }

        // Check if session already exists and reuse it
        const existingSession = streamingSession.value
        if (existingSession && existingSession.providerId === 'browser-web-speech-api') {
          const nextCallbacks = {
            onSentenceEnd: options?.onSentenceEnd,
            onSpeechEnd: options?.onSpeechEnd,
          }
          // For Web Speech API, if callbacks are provided and different, we need to restart
          // because recognition instance callbacks are set once and can't be changed
          const hasNewCallbacks = haveStreamingCallbacksChanged(existingSession.callbacks, nextCallbacks)

          if (hasNewCallbacks) {
            console.info('Web Speech API: New callbacks provided, restarting session to use them')
            await stopStreamingTranscription(false, existingSession.providerId)
            // Continue to create new session below
            // Note: stopStreamingTranscription already clears streamingSession.value and waits for async cleanup
          }
          else {
            // No new callbacks - just bump idle timer and reuse existing session
            const idleTimeout = options?.idleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT
            if (existingSession.idleTimer) {
              clearTimeout(existingSession.idleTimer)
              existingSession.idleTimer = setTimeout(async () => {
                await stopStreamingTranscription(false, existingSession.providerId)
              }, idleTimeout)
            }

            console.info('Web Speech API session already active, reusing existing session (no callback changes)')
            return
          }
        }

        // Auto-select default model if not selected
        if (!activeTranscriptionModel.value) {
          // Try to get models for the provider and select the first one
          const models = await providersStore.getModelsForProvider(providerId)
          if (models.length > 0) {
            activeTranscriptionModel.value = models[0].id
            console.info('Auto-selected Web Speech API model:', models[0].id)
          }
          else {
            // Fallback to default model ID
            activeTranscriptionModel.value = 'web-speech-api'
            console.info('Auto-selected Web Speech API default model')
          }
        }

        const abortController = new AbortController()

        // Get provider config for language settings
        const providerConfig = providersStore.getProviderConfig(providerId) || {}
        const language = (options?.providerOptions?.language as string)
          || (providerConfig.language as string)
          || 'en-US'

        // Web Speech API in continuous mode should run indefinitely - no idle timeout
        // Only stop when explicitly requested (e.g., microphone disabled)
        const idleTimeout = options?.idleTimeoutMs ?? 0 // 0 = disabled
        let idleTimer: ReturnType<typeof setTimeout> | undefined
        const bumpIdle = () => {
          if (idleTimeout > 0) {
            if (idleTimer)
              clearTimeout(idleTimer)
            idleTimer = setTimeout(async () => {
              await stopStreamingTranscription(false, providerId)
            }, idleTimeout)
          }
        }

        const result = streamWebSpeechAPITranscription(stream, {
          language,
          continuous: (options?.providerOptions?.continuous as boolean) ?? (providerConfig.continuous as boolean) ?? true,
          interimResults: (options?.providerOptions?.interimResults as boolean) ?? (providerConfig.interimResults as boolean) ?? true,
          maxAlternatives: (options?.providerOptions?.maxAlternatives as number) ?? (providerConfig.maxAlternatives as number) ?? 1,
          abortSignal: abortController.signal,
          onSentenceEnd: (delta) => {
            bumpIdle() // Bump idle timer on activity (only if enabled)
            if (asrSpan)
              asrSpan.addEvent(IOEvents.ASRSentenceEnd, { [IOAttributes.ASRText]: delta })
            // Call the options callback
            options?.onSentenceEnd?.(delta)
          },
          onSpeechEnd: (text) => {
            if (asrSpan) {
              asrSpan.setAttribute(IOAttributes.ASRText, text)
              asrSpan.end()
              asrSpan = undefined
            }
            // Call the options callback
            options?.onSpeechEnd?.(text)
          },
        })

        // Store session info for cleanup
        const recognitionInstance = (result as any).recognition
        streamingSession.value = {
          audioContext: {} as AudioContext, // Not used for Web Speech API
          workletNode: {} as AudioWorkletNode, // Not used for Web Speech API
          mediaStreamSource: {} as MediaStreamAudioSourceNode, // Not used for Web Speech API
          audioStreamController: undefined,
          abortController,
          result: { ...result, mode: 'stream' as const, recognition: recognitionInstance },
          idleTimer,
          providerId,
          callbacks: {
            onSentenceEnd: options?.onSentenceEnd,
            onSpeechEnd: options?.onSpeechEnd,
          },
        } as any // Type assertion needed because recognition is extra

        // Initial idle timer (only if enabled)
        bumpIdle()

        // Stream out text deltas
        if (result.textStream) {
          void (async () => {
            try {
              const reader = result.textStream.getReader()

              while (true) {
                const { done } = await reader.read()
                if (done)
                  break
                // onSentenceEnd is already called from the recognition.onresult handler
                // Note: onSpeechEnd is called from web-speech-api/index.ts recognition.onend handler
                // (line 332 for non-continuous mode, line 271 for errors)
                // We don't call it here to avoid duplicate calls
              }
            }
            catch (err) {
              if (!isExpectedStreamStopError(err))
                console.error('Error reading text stream:', err)
            }
          })()
        }

        return
      }

      const provider = await providersStore.getProviderInstance<TranscriptionProviderWithExtraOptions<string, any>>(providerId)
      if (!provider) {
        throw new Error('Failed to initialize speech provider')
      }

      const idleTimeout = options?.idleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT

      // If a session exists, reuse it unless new callbacks are provided.
      // The stream reader captures callbacks at creation time, so updated callbacks
      // require restarting the session to create a new reader.
      const existingSession = streamingSession.value
      if (existingSession) {
        const hasNewCallbacks = haveStreamingCallbacksChanged(existingSession.callbacks, {
          onSentenceEnd: options?.onSentenceEnd,
          onSpeechEnd: options?.onSpeechEnd,
        })

        if (hasNewCallbacks) {
          console.info('[Hearing Pipeline] New callbacks provided, restarting session')
          await stopStreamingTranscription(false, existingSession.providerId)
          // Fall through to create a new session with updated callbacks
        }
        else {
          // No callback changes: refresh idle timer and reuse session
          if (existingSession.idleTimer) {
            clearTimeout(existingSession.idleTimer)
            existingSession.idleTimer = setTimeout(async () => {
              await stopStreamingTranscription(false, existingSession.providerId)
            }, idleTimeout)
          }
          return
        }
      }

      const abortController = new AbortController()
      let idleTimer: ReturnType<typeof setTimeout> | undefined
      const bumpIdle = () => {
        if (idleTimer)
          clearTimeout(idleTimer)
        idleTimer = setTimeout(async () => {
          await stopStreamingTranscription(false, providerId)
        }, idleTimeout)
      }

      const session = await createAudioStreamFromMediaStream(
        stream,
        options?.sampleRate ?? DEFAULT_SAMPLE_RATE,
        () => bumpIdle(),
      )

      if (session.audioContext.state === 'suspended')
        await session.audioContext.resume()

      bumpIdle()

      const model = activeTranscriptionModel.value
      const result = await hearingStore.transcription(
        providerId,
        provider,
        model,
        { inputAudioStream: session.audioStream },
        undefined,
        {
          providerOptions: {
            abortSignal: abortController.signal,
            ...options?.providerOptions,
          },
        },
      )

      streamingSession.value = {
        audioContext: session.audioContext,
        workletNode: session.workletNode,
        mediaStreamSource: session.mediaStreamSource,
        audioStreamController: session.controller,
        abortController,
        result,
        idleTimer,
        providerId,
        callbacks: {
          onSentenceEnd: options?.onSentenceEnd,
          onSpeechEnd: options?.onSpeechEnd,
        },
      }

      // Stream out text deltas to caller without tearing down the session.
      if (result.mode === 'stream' && result.textStream) {
        void (async () => {
          // Capture callbacks from the session at the time the reader is created
          // This prevents cross-session leakage if the session is restarted before
          // this reader finishes (e.g., when navigating between pages or callbacks change)
          const sessionCallbacks = {
            onSentenceEnd: streamingSession.value?.callbacks?.onSentenceEnd,
            onSpeechEnd: streamingSession.value?.callbacks?.onSpeechEnd,
          }

          let fullText = ''
          try {
            const reader = result.textStream.getReader()

            while (true) {
              const { done, value } = await reader.read()
              if (done)
                break
              if (value) {
                fullText += value
                if (asrSpan)
                  asrSpan.addEvent(IOEvents.ASRSentenceEnd, { [IOAttributes.ASRText]: value })
                // Use captured callbacks to avoid cross-session leakage
                sessionCallbacks.onSentenceEnd?.(value)
              }
            }
          }
          catch (err) {
            if (!isExpectedStreamStopError(err))
              console.error('Error reading text stream:', err)
          }
          finally {
            if (asrSpan) {
              asrSpan.setAttribute(IOAttributes.ASRText, fullText)
              asrSpan.end()
              asrSpan = undefined
            }
            // Use captured callbacks to avoid cross-session leakage
            sessionCallbacks.onSpeechEnd?.(fullText)
          }
        })()
      }
    }
    catch (err) {
      if (isExpectedStreamStopError(err))
        return

      error.value = errorMessage(err)
      console.error('Error generating transcription:', error.value)
    }
  }

  async function transcribeForRecording(recording: Blob | null | undefined) {
    error.value = undefined

    if (!recording)
      return

    try {
      if (recording.size > 0) {
        const providerId = activeTranscriptionProvider.value
        const provider = await providersStore.getProviderInstance<TranscriptionProviderWithExtraOptions<string, any>>(providerId)
        if (!provider) {
          throw new Error('Failed to initialize speech provider')
        }

        // Get model from configuration or use default
        const model = activeTranscriptionModel.value
        const result = await hearingStore.transcription(
          providerId,
          provider,
          model,
          new File([recording], 'recording.wav'),
        )
        const text = result.mode === 'stream' ? await result.text : result.text

        console.log('[Hearing Pipeline] ASR 识别完成', {
          providerId,
          mode: result.mode,
          text: text,
          textLength: text?.length ?? 0,
          isBlank: !text || !text.trim(),
        })

        if (!text || !text.trim()) {
          error.value = 'No transcription result returned from provider'
          console.warn('[Hearing Pipeline] ASR 返回空结果')
          return
        }

        console.log('[Hearing Pipeline] ASR 最终文本:', text)
        return text
      }
    }
    catch (err) {
      error.value = errorMessage(err)
      console.error('Error generating transcription:', error.value)
    }
  }

  return {
    error,

    transcribeForRecording,
    transcribeForMediaStream,
    stopStreamingTranscription,
    supportsStreamInput,
  }
})
