/**
 * Sherpa TTS 适配器 — 本地 offline TTS（VITS 系模型,进程内 WASM,无 sidecar）。
 *
 * 与 ASR 侧 sherpa-onnx local-onnx 对称：引擎在主进程加载 WASM + 模型，
 * 不需要独立子进程。实现 TTSAdapter 契约（synthesize/stream/health/getVoices），
 * 使其可被 TTSManager 与现有 gpt-sovits / edge-tts 平级替换。
 *
 * 模型配置在构造时注入（模型目录由 app 侧按 sherpa-onnx 惯例解析，
 * 包不直接 import 应用模块，保持 DI 边界 —— 同 GPTSoVITSSidecarClient 思路）。
 *
 * 说明：sherpa-onnx Node 绑定在 1.x 里 createOfflineTts 的配置入口是
 * `offlineTtsModelConfig.offlineTtsVitsModelConfig`；generate(text, sid) 返回
 * `{ samples, sampleRate }`，samples 视绑定版本可能是 Float32Array 或 Int16Array，
 * 这里统一归一化为 Float32 PCM（与 TTSStreamController AudioChunk.data 类型一致）。
 */

import type {
  TTSAdapter,
  TTSDevice,
  TTSOptions,
  TTSStreamController,
  TTSHealthStatus,
  AudioChunk,
  Voice,
} from './types.js';
import { TTSError, TTSErrorCode } from './types.js';

/** Sherpa TTS 模型配置（与 sherpa-onnx OfflineTtsVitsModelConfig 对齐）。 */
export interface SherpaTtsModelConfig {
  /** VITS 模型文件路径（.onnx） */
  model: string;
  /** 词典文件路径（可为空） */
  lexicon?: string;
  /** tokens 文件路径 */
  tokens?: string;
  /** 数据目录（可选） */
  dataDir?: string;
  /** 推理线程数 */
  numThreads?: number;
}

/** Sherpa TTS 适配器配置 */
export interface SherpaTtsAdapterConfig {
  /** 适配器名称，默认 'sherpa-tts' */
  name?: string;
  model: SherpaTtsModelConfig;
  device?: TTSDevice;
  /**
   * 可选：注入 createOfflineTts 工厂（测试或自定义加载用）。
   * 不传时惰性 require('sherpa-onnx') —— 与 ASR 侧一致（WASM 包走 require）。
   */
  createTts?: (config: unknown) => OfflineTtsLike;
}

/** sherpa-onnx 惰性加载的 offline TTS 实例形状。 */
interface OfflineTtsLike {
  sampleRate: number;
  generate(text: string, sid?: number): { samples: Float32Array | Int16Array, sampleRate: number };
  dispose?(): void;
}

interface SherpaOnnxModule {
  createOfflineTts(config: unknown): OfflineTtsLike;
}

function toFloat32(samples: Float32Array | Int16Array): Float32Array {
  if (samples instanceof Float32Array)
    return samples;
  // Int16Array → Float32 (±1)
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++)
    out[i] = samples[i] / 32768;
  return out;
}

/** Sherpa TTS 适配器 */
export class SherpaTtsAdapter implements TTSAdapter {
  name: string;
  device: TTSDevice;
  private model: SherpaTtsModelConfig;
  private tts: OfflineTtsLike | null = null;
  private initError: string | null = null;
  private createTts: (config: unknown) => OfflineTtsLike;

  constructor(config: SherpaTtsAdapterConfig) {
    this.name = config.name ?? 'sherpa-tts';
    this.device = config.device ?? 'cpu';
    this.model = config.model;
    this.createTts = config.createTts ?? ((cfg) => {
      // sherpa-onnx 是 WASM 包，require 与 ASR 侧一致（不 import，避免 ESM 静态解析问题）
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const module = require('sherpa-onnx') as SherpaOnnxModule;
      return module.createOfflineTts(cfg);
    });
  }

  /** 惰性加载 sherpa-onnx 并创建 offline TTS。失败缓存错误信息，供 health() 透出。 */
  private ensureTts(): OfflineTtsLike {
    if (this.tts)
      return this.tts;
    if (this.initError)
      throw new TTSError(this.initError, this.device, TTSErrorCode.MODEL_NOT_LOADED);

    try {
      const config = {
        offlineTtsModelConfig: {
          offlineTtsVitsModelConfig: {
            model: this.model.model,
            lexicon: this.model.lexicon ?? '',
            tokens: this.model.tokens ?? '',
            dataDir: this.model.dataDir ?? '',
            numThreads: this.model.numThreads ?? 2,
          },
        },
      };
      this.tts = this.createTts(config);
      return this.tts;
    } catch (err) {
      this.initError = err instanceof Error ? err.message : String(err);
      throw new TTSError(this.initError, this.device, TTSErrorCode.MODEL_NOT_LOADED);
    }
  }

  /** 释放 WASM 实例（可选）。 */
  dispose(): void {
    try { this.tts?.dispose?.() } catch {}
    this.tts = null;
  }

  async synthesize(text: string, options?: TTSOptions): Promise<ArrayBuffer> {
    if (!text)
      throw new TTSError('text 为空', this.device, TTSErrorCode.INPUT_TOO_LONG);
    const tts = this.ensureTts();
    try {
      const result = tts.generate(text, options?.sampleRate);
      // sherpa-onnx 默认返回 Int16 PCM；接口契约要求 Float32，统一转浮点
      const float = toFloat32(result.samples);
      const buf = new ArrayBuffer(float.length * 4);
      new Float32Array(buf).set(float);
      return buf;
    } catch (err) {
      throw err instanceof TTSError
        ? err
        : new TTSError(
            err instanceof Error ? err.message : String(err),
            this.device,
            TTSErrorCode.SYNTHESIS_FAILED,
          );
    }
  }

  stream(text: string, _options?: TTSOptions): TTSStreamController {
    const controller = {
      completed: false,
      abort(): void {
        this.completed = true;
      },
      firstChunkLatency: Promise.resolve(0),
      totalLatency: Promise.resolve(0),
      chunks: null as unknown as ReadableStream<AudioChunk>,
    };

    const tts = this.ensureTts();
    const sampleRate = tts.sampleRate;
    const floatPromise = new Promise<Float32Array>((resolve, reject) => {
      try {
        resolve(toFloat32(tts.generate(text).samples));
      } catch (err) {
        reject(err);
      }
    });

    controller.chunks = new ReadableStream<AudioChunk>({
      async start(streamController) {
        try {
          const data = await floatPromise;
          if (controller.completed)
            return;
          streamController.enqueue({
            data,
            sampleRate,
            timestamp: Date.now(),
            isLast: true,
          });
          streamController.close();
        } catch (err) {
          streamController.error(err);
        }
      },
    });

    return controller;
  }

  async health(): Promise<TTSHealthStatus> {
    if (this.initError)
      return { device: this.device, status: 'unhealthy', error: this.initError };
    try {
      this.ensureTts();
      return { device: this.device, status: 'healthy' };
    } catch (err) {
      return {
        device: this.device,
        status: 'unhealthy',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async getVoices(): Promise<Voice[]> {
    // VITS 单模型 → 单一默认音色
    return [{ id: 'default', name: '默认音色' }];
  }
}