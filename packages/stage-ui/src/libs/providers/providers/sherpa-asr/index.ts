/**
 * Sherpa-ASR Provider — 本地 ASR 引擎（SenseVoice/Paraformer/Whisper）
 *
 * 通过 Electron IPC 调用 main 进程的 sherpa-onnx WASM 进行语音识别。
 * 复用现有的 custom fetch 拦截模式，对 hearing pipeline 完全透明。
 *
 * 内存管线流程：
 *   File/Blob → decodeAudioToMono16k() → Float32Array
 *   → IPC invoke (structured clone) → main 进程 sherpa-onnx
 *   → text + emotion → Response JSON → hearing store
 */

import { isStageTamagotchi } from '@kitsune/stage-shared'
import { defineInvoke, defineInvokeEventa } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { z } from 'zod'

import { decodeAudioToMono16k } from '../../../audio/decode'
import { mapSenseVoiceEmotion } from '../../../inference/sensevoice-emotion-map'
import { defineProvider } from '../registry'

// ---------------------------------------------------------------------------
// Eventa IPC contract (must match shared/eventa/index.ts tag)
// ---------------------------------------------------------------------------

const electronAsrTranscribe = defineInvokeEventa<
  { text: string, lang?: string, emotion?: string, event?: string },
  { audioSamples: Float32Array, sampleRate: number }
>('eventa:invoke:electron:asr:transcribe')

// Module-level singleton — eventa context lives for the renderer lifetime.
// NOTICE:
// Raw ipcRenderer.invoke() cannot reach handlers registered via defineInvokeHandler()
// because eventa routes through ipcRenderer.send('eventa-message', ...) instead of
// native ipcMain.handle(). Using eventa's renderer context bridges the gap.
let invokeTranscribe: ((input: { audioSamples: Float32Array, sampleRate: number }) => Promise<{ text: string, lang?: string, emotion?: string, event?: string }>) | undefined

// ---------------------------------------------------------------------------
// Provider config
// ---------------------------------------------------------------------------

const sherpaAsrConfigSchema = z.object({
  apiKey: z
    .string()
    .optional()
    .default('local'),
})

type SherpaAsrConfig = z.input<typeof sherpaAsrConfigSchema>

// ---------------------------------------------------------------------------
// Provider definition
// ---------------------------------------------------------------------------

export const providerSherpaAsr = defineProvider<SherpaAsrConfig>({
  id: 'sherpa-asr',
  order: 1,
  name: 'Local ASR (SenseVoice)',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.sherpa-asr.title'),
  description: 'Local speech recognition powered by SenseVoice/Paraformer via sherpa-onnx. Fast, accurate Chinese ASR with emotion detection.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.sherpa-asr.description'),
  tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'],
  icon: 'i-solar:cpu-bold-duotone',
  isAvailableBy: isStageTamagotchi,
  requiresCredentials: false,

  createProviderConfig: () => sherpaAsrConfigSchema,

  createProvider(_config) {
    return {
      transcription: (model: string) => ({
        // dummy URL — 实际请求被 custom fetch 拦截，不会发起 HTTP
        baseURL: 'http://sherpa-asr/v1/',
        model,
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          // 非 Electron 环境降级：抛出错误提示用户
          const ipcRenderer = (window as Window & { electron?: { ipcRenderer?: any } }).electron?.ipcRenderer
          if (!ipcRenderer) {
            return new Response(
              JSON.stringify({ error: 'Sherpa-ASR requires Electron runtime' }),
              { status: 503, headers: { 'Content-Type': 'application/json' } },
            )
          }

          // 1. 从 FormData 提取音频文件
          const request = input instanceof Request ? input : new Request(input, init)
          const formData = await request.formData()
          const file = formData.get('file')

          if (!(file instanceof Blob)) {
            throw new Error('Sherpa-ASR: audio file is required')
          }

          console.log('[Sherpa-ASR] 开始识别音频', {
            fileSize: file.size,
            fileType: file.type,
            fileName: file instanceof File ? file.name : 'unknown',
          })

          // 2. 解码为 16kHz mono Float32Array（复用现有 decodeAudioToMono16k）
          const audioFloat32 = await decodeAudioToMono16k(file)

          console.log('[Sherpa-ASR] 音频解码完成', {
            originalSize: file.size,
            decodedSamples: audioFloat32.length,
            durationSeconds: (audioFloat32.length / 16000).toFixed(2),
          })

          // 3. 通过 eventa IPC 发送到 main 进程（内存管线，structured clone 传输 Float32Array）
          //    必须使用 eventa 的 defineInvoke 而非原生 ipcRenderer.invoke()，
          //    因为 main 进程通过 defineInvokeHandler 注册 handler，
          //    只响应 eventa-message 通道，不响应原生 ipcMain.handle 通道。
          if (!invokeTranscribe) {
            const { context } = createContext(ipcRenderer)
            invokeTranscribe = defineInvoke(context, electronAsrTranscribe)
            console.log('[Sherpa-ASR] Eventa IPC 上下文已创建')
          }

          console.log('[Sherpa-ASR] 发送音频到 main 进程...')
          const startTime = Date.now()
          // NOTICE:
          // 直接发送 Float32Array：Electron IPC 的 structured clone 会保留类型化数组，
          // 无需 `Array.from()` 转成 number[]（那会产生整段音频的 JS number 拷贝，
          // 且 main 侧还得 `new Float32Array()` 再拷回去）。零拷贝传输降低 GC 压力。
          const result = await invokeTranscribe({
            audioSamples: audioFloat32,
            sampleRate: 16000,
          })
          const duration = Date.now() - startTime

          console.log('[Sherpa-ASR] 识别结果', {
            text: result.text,
            textLength: result.text?.length ?? 0,
            lang: result.lang,
            emotion: result.emotion,
            event: result.event,
            processingTimeMs: duration,
          })

          // 4. 情感检测：如果返回了 emotion，触发桌宠表情切换
          if (result.emotion) {
            try {
              const { usePetEmotionStore } = await import('../../../../stores/chat/emotion-pet')
              const { Emotion } = await import('../../../../constants/emotions')
              const mapped = mapSenseVoiceEmotion(result.emotion)
              if (mapped && mapped !== Emotion.Neutral) {
                const petEmotionStore = usePetEmotionStore()
                petEmotionStore.enqueue({ name: mapped, intensity: 0.8 })
              }
            }
            catch {
              // 情感检测失败不影响转录结果，静默忽略
            }
          }

          // 5. 返回标准 OpenAI transcription 格式的 Response
          return new Response(
            JSON.stringify({ text: result.text }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        },
      }),
    }
  },

  capabilities: {
    transcription: {
      protocol: 'http',
      generateOutput: true,
      streamOutput: false,
      streamInput: false,
    },
  },

  extraMethods: {
    async listModels() {
      return [
        {
          id: 'sensevoice',
          name: 'SenseVoice（中文最优）',
          provider: 'sherpa-asr',
          description: 'SenseVoice-Small: 234M params, ~2% WER on Chinese, emotion + event detection',
        },
        {
          id: 'paraformer',
          name: 'Paraformer（最快）',
          provider: 'sherpa-asr',
          description: 'Paraformer-Small: 68M params, ~2.8% WER on Chinese, ultra-low latency',
        },
        {
          id: 'whisper',
          name: 'Whisper（降级）',
          provider: 'sherpa-asr',
          description: 'Whisper-Small: 244M params, multilingual fallback',
        },
      ]
    },
  },

  validationRequiredWhen: () => false,
  validators: {},
})
