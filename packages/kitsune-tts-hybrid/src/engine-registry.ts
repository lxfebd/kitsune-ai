/**
 * TTS 引擎注册表 — 配置驱动的引擎管理
 *
 * 设计目标：
 * 1. 集中管理所有 TTS 引擎定义，避免硬编码散落在各文件
 * 2. 换引擎只需注册新引擎 + 改默认配置，无需修改业务代码
 * 3. 运行时验证引擎 ID，保证类型安全
 *
 * 使用方式：
 * ```typescript
 * import { registerEngine, listEngines, getDefaultEngineId } from '@kitsune/tts-hybrid'
 *
 * // 注册新引擎
 * registerEngine({
 *   id: 'my-new-tts',
 *   name: 'My New TTS',
 *   type: 'local-sidecar',
 *   sidecarId: 'my-new-tts',
 * })
 *
 * // 获取引擎列表
 * const engines = listEngines()
 *
 * // 切换默认引擎
 * setDefaultEngineId('my-new-tts')
 * ```
 */

/** TTS 引擎类型 */
export type TtsEngineType = 'local-sidecar' | 'cloud-http' | 'system-builtin'

/** TTS 引擎定义 */
export interface TtsEngineDefinition {
  /** 引擎 ID，如 'gpt-sovits' */
  id: string
  /** 显示名称，如 'GPT-SoVITS（本地）' */
  name: string
  /** 引擎类型 */
  type: TtsEngineType
  /** Sidecar 进程 ID（仅 local-sidecar 类型） */
  sidecarId?: string
  /** 默认配置 */
  defaultConfig?: Record<string, unknown>
  /** 健康检查函数 */
  healthCheck?: () => Promise<boolean>
}

/** 引擎注册表 */
const engines = new Map<string, TtsEngineDefinition>()

/** 默认引擎 ID */
let defaultEngineId = 'gpt-sovits'

/**
 * 注册 TTS 引擎
 *
 * @param def - 引擎定义
 */
export function registerEngine(def: TtsEngineDefinition): void {
  engines.set(def.id, def)
}

/**
 * 获取引擎定义
 *
 * @param id - 引擎 ID
 * @returns 引擎定义，不存在则返回 undefined
 */
export function getEngine(id: string): TtsEngineDefinition | undefined {
  return engines.get(id)
}

/**
 * 获取所有已注册引擎
 *
 * @returns 引擎定义数组
 */
export function listEngines(): TtsEngineDefinition[] {
  return Array.from(engines.values())
}

/**
 * 检查引擎是否已注册
 *
 * @param id - 引擎 ID
 * @returns 是否已注册
 */
export function hasEngine(id: string): boolean {
  return engines.has(id)
}

/**
 * 获取默认引擎 ID
 *
 * @returns 默认引擎 ID
 */
export function getDefaultEngineId(): string {
  return defaultEngineId
}

/**
 * 设置默认引擎 ID
 *
 * @param id - 引擎 ID
 * @throws 如果引擎未注册
 */
export function setDefaultEngineId(id: string): void {
  if (!engines.has(id)) {
    throw new Error(`TTS engine "${id}" is not registered`)
  }
  defaultEngineId = id
}

/**
 * 获取引擎的 sidecar ID
 *
 * @param id - 引擎 ID
 * @returns sidecar ID，如果不是 local-sidecar 类型则返回 undefined
 */
export function getEngineSidecarId(id: string): string | undefined {
  return engines.get(id)?.sidecarId
}

/**
 * 验证引擎 ID 是否有效
 *
 * @param id - 引擎 ID
 * @returns 是否有效
 */
export function isValidEngineId(id: string | undefined | null): boolean {
  if (!id) return false
  return engines.has(id)
}

// ============================================================================
// 内置引擎注册
// ============================================================================

/** GPT-SoVITS 本地引擎 */
registerEngine({
  id: 'gpt-sovits',
  name: 'GPT-SoVITS（本地）',
  type: 'local-sidecar',
  sidecarId: 'gpt-sovits',
})

/** Edge TTS 在线引擎 */
registerEngine({
  id: 'edge-tts',
  name: 'Edge TTS（在线）',
  type: 'cloud-http',
})

/** 系统 TTS 引擎 */
registerEngine({
  id: 'system',
  name: '系统 TTS',
  type: 'system-builtin',
})
