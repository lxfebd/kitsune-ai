// src/ai-core/tts/types.ts

/** TTS 设备类型 */
export type TTSDevice = 'gpu' | 'cpu';

/** TTS 选项 */
export interface TTSOptions {
  voice?: string;
  speed?: number;
  pitch?: number;
  /** format 仅在 synthesize() 生效，stream() 忽略此选项，始终返回 PCM */
  format?: 'pcm' | 'wav' | 'mp3';
  sampleRate?: number;
}

/** 音频块（流式输出） */
export interface AudioChunk {
  /** PCM Float32 数据 */
  data: Float32Array;
  /** 采样率（LipSync 需要） */
  sampleRate: number;
  /** 时间戳 */
  timestamp: number;
  /** 是否是最后一块 */
  isLast: boolean;
}

/** TTS 健康状态 */
export interface TTSHealthStatus {
  device: TTSDevice;
  status: 'healthy' | 'degraded' | 'unhealthy';
  firstChunkLatency?: number;
  totalLatency?: number;
  error?: string;
}

/** TTS 音色 */
export interface Voice {
  id: string;
  name: string;
  language?: string;
}

/** TTS 流控制器 */
export interface TTSStreamController {
  /** 音频数据流（始终 PCM） */
  readonly chunks: ReadableStream<AudioChunk>;
  /** 取消合成 */
  abort(): void;
  /** 首包延迟 */
  readonly firstChunkLatency: Promise<number>;
  /** 完整延迟 */
  readonly totalLatency: Promise<number>;
}

/** TTS 适配器接口 */
export interface TTSAdapter {
  name: string;
  device: TTSDevice;
  synthesize(text: string, options?: TTSOptions): Promise<ArrayBuffer>;
  stream(text: string, options?: TTSOptions): TTSStreamController;
  health(): Promise<TTSHealthStatus>;
  getVoices(): Promise<Voice[]>;
}

/** TTS 服务接口 */
export interface TTSService {
  /** 同步合成（format 选项在此生效） */
  synthesize(text: string, options?: TTSOptions): Promise<ArrayBuffer>;
  /** 流式合成（始终返回 PCM，忽略 format 选项） */
  stream(text: string, options?: TTSOptions): TTSStreamController;
  /** 带降级的合成 */
  synthesizeWithFallback(text: string, options?: TTSOptions): Promise<ArrayBuffer>;
  /** 健康检查 */
  health(): Promise<TTSHealthStatus>;
  /** 获取音色列表 */
  getVoices(): Promise<Voice[]>;
  /** 获取当前设备 */
  getCurrentDevice(): TTSDevice;
  /** 获取可用设备列表 */
  getAvailableDevices(): TTSDevice[];
}

/** TTS 错误码 */
export enum TTSErrorCode {
  DEVICE_NOT_AVAILABLE = 'DEVICE_NOT_AVAILABLE',
  SYNTHESIS_FAILED = 'SYNTHESIS_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  MODEL_NOT_LOADED = 'MODEL_NOT_LOADED',
  GPU_ERROR = 'GPU_ERROR',
  INPUT_TOO_LONG = 'INPUT_TOO_LONG',
  TIMEOUT = 'TIMEOUT',
}

/** TTS 错误 */
export class TTSError extends Error {
  constructor(
    message: string,
    public device: TTSDevice,
    public code: TTSErrorCode,
    public cause?: Error
  ) {
    super(message);
    this.name = 'TTSError';
  }
}
