/**
 * ASR 服务 — 基于 sherpa-onnx 的本地语音识别
 *
 * 在 Electron 主进程中运行 sherpa-onnx WASM，提供内存管线转录：
 * renderer 发送 Float32Array → main 进程识别 → 返回文本 + 情感
 *
 * 引擎由 asr-engine-registry 配置驱动，支持热切换：
 * SenseVoice（默认，中文最优） ↔ Paraformer（最快） ↔ Whisper（降级）
 */

import type { AsrEngineDefinition } from '@kitsune/stage-ui/inference/asr-engine-registry'
import type { OfflineRecognizer, OfflineRecognizerResult } from 'sherpa-onnx'

import { app } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { useLogg } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'
import {
  getAsrEngine,
  getDefaultAsrEngineId,
  hasAsrEngine,
} from '@kitsune/stage-ui/inference/asr-engine-registry'

const log = useLogg('asr-service').useGlobalConfig()

// sherpa-onnx 是 WASM 包，直接 require
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sherpa_onnx = require('sherpa-onnx') as typeof import('sherpa-onnx')

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ---------------------------------------------------------------------------
// 模型路径解析
// ---------------------------------------------------------------------------

/**
 * 解析 ASR 模型文件目录
 *
 * 路径探测策略（复用 model-file-server.ts 的 getModelsDir 模式）：
 * 1. 开发模式：monorepo 根目录 resources/models/sherpa-onnx/
 * 2. 生产模式：app.getAppPath()/models/sherpa-onnx/
 * 3. 生产回退：app.getAppPath()/extraResources/models/sherpa-onnx/
 */
function getAsrModelsDir(): string {
  const isDev = !app.isPackaged

  if (isDev) {
    // 开发模式：从 apps/stage-tamagotchi 向上找到 monorepo 根
    const devPaths = [
      join(__dirname, '..', '..', '..', '..', '..', '..', 'resources', 'models', 'sherpa-onnx'),
      join(process.cwd(), '..', '..', 'resources', 'models', 'sherpa-onnx'),
    ]
    for (const p of devPaths) {
      if (existsSync(p)) return p
    }
  }

  // 生产模式
  const prodPaths = [
    join(app.getAppPath(), 'models', 'sherpa-onnx'),
    join(app.getPath('exe'), '..', 'resources', 'models', 'sherpa-onnx'),
  ]
  for (const p of prodPaths) {
    if (existsSync(p)) return p
  }

  // 最终回退：开发模式相对路径
  return join(__dirname, '..', '..', '..', '..', '..', '..', 'resources', 'models', 'sherpa-onnx')
}

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------

let recognizer: OfflineRecognizer | null = null
let currentEngineId: string | null = null
let asrModelsDir: string | null = null

// NOTICE:
// sherpa-onnx WASM 的 OfflineRecognizer 非线程安全：并发 `decode(stream)` 访问
// 同一实例会破坏 WASM 内存（结果损坏甚至崩溃）。renderer 可能并行发起多次
// transcribe，因此用一个 promise 链把对共享 recognizer 的访问串行化。
let transcribeQueue: Promise<unknown> = Promise.resolve()

function runSerialized<T>(task: () => Promise<T>): Promise<T> {
  const run = transcribeQueue.then(task)
  // 无论成功失败都续上队列，避免一次异常卡死后续任务
  transcribeQueue = run.then(() => undefined, () => undefined)
  return run
}

/**
 * 串行化共享 ASR recognizer 访问的互斥原语。
 *
 * sherpa-onnx WASM 的 OfflineRecognizer 非线程安全，`transcribe` 用它保证
 * 并发调用不会同时 `decode` 同一实例。任务按调用顺序依次执行；单个任务失败
 * 不会阻塞队列中的后续任务。
 *
 * @param task 需串行执行的异步任务
 * @returns task 的结果；若 task 抛错则返回被拒绝的 Promise
 */
export function enqueueRecognizerTask<T>(task: () => Promise<T>): Promise<T> {
  return runSerialized(task)
}

// ---------------------------------------------------------------------------
// 引擎管理
// ---------------------------------------------------------------------------

function resolveRecognizerConfig(engine: AsrEngineDefinition): ReturnType<typeof sherpa_onnx.createOfflineRecognizer> {
  // sherpa-onnx WASM 版的 config 格式
  const config: Record<string, unknown> = {
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      ...engine.recognizerConfig.modelConfig,
      // 将相对路径转为绝对路径
      tokens: resolveModelPath(engine.recognizerConfig.modelConfig.tokens as string),
    },
    decodingMethod: engine.recognizerConfig.decodingMethod ?? 'greedy_search',
  }

  // 解析模型文件路径
  const modelConfig = config.modelConfig as Record<string, unknown>
  if (modelConfig.senseVoice) {
    const sv = modelConfig.senseVoice as Record<string, unknown>
    sv.model = resolveModelPath(sv.model as string)
  }
  if (modelConfig.paraformer) {
    const pf = modelConfig.paraformer as Record<string, unknown>
    pf.model = resolveModelPath(pf.model as string)
  }
  if (modelConfig.whisper) {
    const w = modelConfig.whisper as Record<string, unknown>
    w.encoder = resolveModelPath(w.encoder as string)
    w.decoder = resolveModelPath(w.decoder as string)
  }

  return sherpa_onnx.createOfflineRecognizer(config as unknown as Parameters<typeof sherpa_onnx.createOfflineRecognizer>[0])
}

function resolveModelPath(relativePath: string): string {
  if (!asrModelsDir) {
    asrModelsDir = getAsrModelsDir()
    log.log(`ASR models directory: ${asrModelsDir}`)
  }
  return join(asrModelsDir, relativePath)
}

// ---------------------------------------------------------------------------
// 公共 API
// ---------------------------------------------------------------------------

/**
 * 初始化 ASR 引擎（加载模型）
 *
 * @param engineId - 引擎 ID，默认使用注册表中的默认引擎
 */
export async function initEngine(engineId?: string): Promise<void> {
  const id = engineId ?? getDefaultAsrEngineId()
  const engine = getAsrEngine(id)
  if (!engine) {
    throw new Error(`ASR engine "${id}" is not registered. Available: ${Array.from(['sensevoice', 'paraformer', 'whisper']).join(', ')}`)
  }

  // 如果同一引擎已加载，跳过
  if (currentEngineId === id && recognizer) {
    log.log(`ASR engine "${id}" already loaded`)
    return
  }

  // 释放旧引擎
  if (recognizer) {
    recognizer.free()
    recognizer = null
    currentEngineId = null
  }

  log.log(`Loading ASR engine: ${engine.name} (${engine.id})`)

  try {
    recognizer = resolveRecognizerConfig(engine)
    currentEngineId = id
    log.log(`ASR engine "${id}" loaded successfully`)
  }
  catch (error) {
    recognizer = null
    currentEngineId = null
    log.error(`Failed to load ASR engine "${id}": ${errorMessageFrom(error)}`)
    throw error
  }
}

/**
 * 内存管线转录：直接接收 Float32Array，返回文本 + 情感
 *
 * @param samples - Float32Array 音频样本（16kHz, [-1, 1]）
 * @param sampleRate - 采样率，默认 16000
 * @returns 转录结果（文本 + 语言 + 情感 + 事件）
 */
export async function transcribe(
  samples: Float32Array,
  sampleRate: number = 16000,
): Promise<TranscribeResult> {
  // 串行化对共享 recognizer 的访问（详见 transcribeQueue 处 NOTICE）
  return enqueueRecognizerTask(async () => {
    if (!recognizer || !currentEngineId) {
      // 自动初始化默认引擎
      await initEngine()
      if (!recognizer) {
        throw new Error('ASR engine failed to initialize')
      }
    }

    // `currentEngineId` is a module-level `let`, so TS drops the narrowing from
    // the guard above across the `await`. Re-read it into a local instead.
    const engineId = currentEngineId
    const engine = engineId ? getAsrEngine(engineId) : undefined
    const supportsEmotion = engine?.supportsEmotion ?? false

    const stream = recognizer.createStream()
    try {
      stream.acceptWaveform(sampleRate, samples)
      recognizer.decode(stream)
      const rawResult = recognizer.getResult(stream) as OfflineRecognizerResult & {
        lang?: string
        emotion?: string
        event?: string
      }

      const result: TranscribeResult = {
        text: rawResult.text ?? '',
      }

      // SenseVoice 特有字段
      if (supportsEmotion) {
        result.lang = rawResult.lang
        result.emotion = rawResult.emotion
        result.event = rawResult.event
      }

      return result
    }
    finally {
      stream.free()
    }
  })
}

/**
 * 切换 ASR 引擎（热切换）
 *
 * @param engineId - 目标引擎 ID
 */
export async function switchEngine(engineId: string): Promise<void> {
  if (!hasAsrEngine(engineId)) {
    throw new Error(`Unknown ASR engine: "${engineId}"`)
  }
  await initEngine(engineId)
}

/**
 * 获取当前 ASR 状态
 */
export function getStatus(): AsrStatus {
  return {
    engineId: currentEngineId,
    ready: recognizer !== null,
    modelsDir: asrModelsDir ?? getAsrModelsDir(),
  }
}

/**
 * 释放 ASR 引擎资源
 */
export function dispose(): void {
  if (recognizer) {
    recognizer.free()
    recognizer = null
    currentEngineId = null
    log.log('ASR engine disposed')
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TranscribeResult {
  text: string
  /** SenseVoice: 检测到的语言 */
  lang?: string
  /** SenseVoice: 情感（happy/sad/angry/neutral/surprised/fearful/disgusted/calm） */
  emotion?: string
  /** SenseVoice: 音频事件（Speech/Music/Applause/Laughter/BGM/Others） */
  event?: string
}

export interface AsrStatus {
  engineId: string | null
  ready: boolean
  modelsDir: string
}
