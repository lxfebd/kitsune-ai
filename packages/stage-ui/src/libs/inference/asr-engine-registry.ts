/**
 * ASR 引擎注册表 — 配置驱动的引擎管理
 *
 * 设计目标（与 TTS engine-registry 完全一致的模式）：
 * 1. 集中管理所有 ASR 引擎定义，避免硬编码散落在各文件
 * 2. 换引擎只需注册新引擎 + 改默认配置，无需修改业务代码
 * 3. 运行时验证引擎 ID，保证类型安全
 *
 * 使用方式：
 * ```typescript
 * import { registerAsrEngine, listAsrEngines, setDefaultAsrEngineId } from '@kitsune/stage-ui/inference'
 *
 * // 注册新引擎
 * registerAsrEngine({
 *   id: 'my-new-asr',
 *   name: 'My New ASR',
 *   type: 'local-onnx',
 *   modelPath: '/path/to/model.onnx',
 *   tokensPath: '/path/to/tokens.txt',
 * })
 *
 * // 切换默认引擎
 * setDefaultAsrEngineId('my-new-asr')
 * ```
 */

import type { OfflineRecognizerConfig } from 'sherpa-onnx'

/** ASR 引擎类型 */
export type AsrEngineType = 'local-onnx' | 'cloud-http' | 'browser-builtin'

/** ASR 引擎定义 */
export interface AsrEngineDefinition {
  /** 引擎 ID，如 'sensevoice' */
  id: string
  /** 显示名称，如 'SenseVoice（本地）' */
  name: string
  /** 引擎类型 */
  type: AsrEngineType
  /** sherpa-onnx 离线识别器配置 */
  recognizerConfig: OfflineRecognizerConfig
  /** 默认语言（SenseVoice 支持 'auto'，Whisper 需要显式语言） */
  defaultLanguage?: string
  /** 是否支持情感检测（SenseVoice 特有） */
  supportsEmotion?: boolean
  /** 是否支持事件检测（SenseVoice 特有：Music/Applause 等） */
  supportsEventDetection?: boolean
  /** 健康检查函数 */
  healthCheck?: () => Promise<boolean>
}

/** 引擎注册表 */
const engines = new Map<string, AsrEngineDefinition>()

/** 默认引擎 ID */
let defaultEngineId = 'sensevoice'

/**
 * 注册 ASR 引擎
 *
 * @param def - 引擎定义
 */
export function registerAsrEngine(def: AsrEngineDefinition): void {
  engines.set(def.id, def)
}

/**
 * 获取引擎定义
 *
 * @param id - 引擎 ID
 * @returns 引擎定义，不存在则返回 undefined
 */
export function getAsrEngine(id: string): AsrEngineDefinition | undefined {
  return engines.get(id)
}

/**
 * 获取所有已注册引擎
 *
 * @returns 引擎定义数组
 */
export function listAsrEngines(): AsrEngineDefinition[] {
  return Array.from(engines.values())
}

/**
 * 检查引擎是否已注册
 *
 * @param id - 引擎 ID
 * @returns 是否已注册
 */
export function hasAsrEngine(id: string): boolean {
  return engines.has(id)
}

/**
 * 获取默认引擎 ID
 *
 * @returns 默认引擎 ID
 */
export function getDefaultAsrEngineId(): string {
  return defaultEngineId
}

/**
 * 设置默认引擎 ID
 *
 * @param id - 引擎 ID
 * @throws 如果引擎未注册
 */
export function setDefaultAsrEngineId(id: string): void {
  if (!engines.has(id)) {
    throw new Error(`ASR engine "${id}" is not registered`)
  }
  defaultEngineId = id
}

/**
 * 验证引擎 ID 是否有效
 *
 * @param id - 引擎 ID
 * @returns 是否有效
 */
export function isValidAsrEngineId(id: string | undefined | null): boolean {
  if (!id) return false
  return engines.has(id)
}
