/**
 * TTS 模块统一导出
 *
 * 提供 TTS (Text-to-Speech) 功能的全部类型、类和配置接口。
 */

// 基础类型与接口
export type {
  TTSDevice,
  TTSOptions,
  AudioChunk,
  TTSHealthStatus,
  Voice,
  TTSStreamController,
  TTSAdapter,
  TTSService,
} from './types.js';

// 错误类型（枚举和类）
export { TTSError, TTSErrorCode } from './types.js';

// 引擎注册表（配置驱动的引擎管理）
export type {
  TtsEngineType,
  TtsEngineDefinition,
} from './engine-registry.js';
export {
  registerEngine,
  getEngine,
  listEngines,
  hasEngine,
  getDefaultEngineId,
  setDefaultEngineId,
  getEngineSidecarId,
  isValidEngineId,
} from './engine-registry.js';

// Qwen3-TTS 适配器及其配置
export type { Qwen3TTSAdapterConfig } from './qwen3TtsAdapter.js';
export { Qwen3TTSAdapter } from './qwen3TtsAdapter.js';

// GPT-SoVITS 适配器及其配置（stdin/stdout 管道通信）
export type {
  GPTSoVITSAdapterConfig,
  GPTSoVITSSidecarClient,
  GPTSoVITSDefaults,
} from './gptsovitsAdapter.js';
export { GPTSoVITSAdapter } from './gptsovitsAdapter.js';

// TTS 降级链及其配置
export type { FallbackChainConfig } from './ttsFallbackChain.js';
export { TTSFallbackChain } from './ttsFallbackChain.js';

// TTS 请求队列及其配置
export type { RequestQueueConfig } from './ttsRequestQueue.js';
export { TTSRequestQueue } from './ttsRequestQueue.js';

// TTS 管理器及其配置
export type { TTSManagerConfig } from './ttsManager.js';
export { TTSManager } from './ttsManager.js';
