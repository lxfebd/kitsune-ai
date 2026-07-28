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

/** JSON-RPC 2.0 消息形状（与 sidecar 协议 JsonMessage 结构兼容）。 */
interface JsonMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/** 二进制音频帧（与 sidecar 协议 BinaryFrame 结构兼容）。 */
interface BinaryFrame {
  data: Uint8Array;
  endOfStream: boolean;
}

/**
 * Sidecar 客户端最小接口 — adapter 通过此接口与 Python sidecar 通信。
 *
 * apps/stage-tamagotchi 的 SidecarService 结构化满足此接口，构造时注入。
 * 包不能直接 import app 模块，故在此声明消费端接口（DI 边界）。
 */
export interface GPTSoVITSSidecarClient {
  start(
    config: {
      id: string;
      command: string;
      args?: string[];
      cwd?: string;
      env?: Record<string, string>;
      onDegraded?: (id: string, reason: string) => void;
    },
    handlers: {
      onNotification?: (method: string, params: unknown) => void;
      onBinary?: (frame: BinaryFrame) => void;
    },
  ): Promise<unknown>;
  sendRequest(id: string, method: string, params?: unknown): Promise<JsonMessage>;
  sendNotification(id: string, method: string, params?: unknown): Promise<void>;
  acquireLock(id: string): Promise<() => void>;
  healthCheck(id: string): Promise<{ healthy: boolean; reason?: string }>;
  getStatus(id: string): { state: string } | null;
}

/** GPT-SoVITS 默认 TTS 参数。 */
export interface GPTSoVITSDefaults {
  refAudioPath?: string;
  promptText?: string;
  promptLang?: string;
  textLang?: string;
  textSplitMethod?: string;
  speedFactor?: number;
  streamingMode?: number;
}

/** GPT-SoVITS 适配器配置。 */
export interface GPTSoVITSAdapterConfig {
  /** 适配器名称，默认 'gpt-sovits'。 */
  name?: string;
  sidecarId: string;
  sidecar: GPTSoVITSSidecarClient;
  device: TTSDevice;
  /** Python 解释器命令（如 'python'、'python3' 或完整路径）。 */
  command: string;
  /** sidecar 脚本参数（脚本路径 + sidecar 参数，如 ['-u', 'gptsovits_stdio.py', '-c', configPath]）。 */
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  /** sidecar 重启预算耗尽时回调，adapter 应降级到云端 TTS。 */
  onDegraded?: (id: string, reason: string) => void;
  /** 默认 TTS 参数（参考音频、语言等）。 */
  defaults?: GPTSoVITSDefaults;
  /** 单次 TTS 流式合成超时（ms），默认 60s。 */
  streamTimeoutMs?: number;
}

/**
 * GPT-SoVITS 适配器 — 通过 stdin/stdout 管道与 Python sidecar 通信。
 *
 * 不使用 HTTP fetch，不占用 TCP 端口。进程生命周期由注入的 SidecarService 管理，
 * 音频数据通过 Task 6 的 magic byte 二进制帧协议流式接收。
 */
export class GPTSoVITSAdapter implements TTSAdapter {
  name: string;
  device: TTSDevice;

  private readonly sidecar: GPTSoVITSSidecarClient;
  private readonly sidecarId: string;
  private readonly command: string;
  private readonly args: string[];
  private readonly cwd?: string;
  private readonly env?: Record<string, string>;
  private readonly onDegraded?: (id: string, reason: string) => void;
  private readonly defaults: GPTSoVITSDefaults;
  private readonly streamTimeoutMs: number;

  private started = false;
  /** 当前活跃的音频帧处理器，由 synthesize/stream 设置，endOfStream 后清除。 */
  private currentFrameHandler: ((frame: BinaryFrame) => void) | null = null;
  /** 当前活跃的错误通知处理器，用于 sidecar 发送 tts/error notification 时拒绝请求。 */
  private currentErrorHandler: ((message: string) => void) | null = null;

  constructor(config: GPTSoVITSAdapterConfig) {
    this.name = config.name ?? 'gpt-sovits';
    this.sidecar = config.sidecar;
    this.sidecarId = config.sidecarId;
    this.device = config.device;
    this.command = config.command;
    this.args = config.args;
    this.cwd = config.cwd;
    this.env = config.env;
    this.onDegraded = config.onDegraded;
    this.defaults = config.defaults ?? {};
    this.streamTimeoutMs = config.streamTimeoutMs ?? 60_000;
  }

  async synthesize(text: string, options?: TTSOptions): Promise<ArrayBuffer> {
    const release = await this.sidecar.acquireLock(this.sidecarId);
    try {
      await this.ensureStarted();

      const chunks: Uint8Array[] = [];
      let sampleRate = options?.sampleRate ?? 32000;

      await this.runTtsStream(text, options, {
        onSampleRate: (rate) => { sampleRate = rate; },
        onFrame: (frame) => chunks.push(frame.data),
      });

      const pcm = concatUint8(chunks);
      if (options?.format === 'wav')
        return pcmToWav(pcm, sampleRate);
      // NOTICE: TTSAdapter.synthesize 契约要求 ArrayBuffer，而 concatUint8 返回 Uint8Array。
      // Uint8Array<ArrayBufferLike> 不能直接赋给 ArrayBuffer（SharedArrayBuffer 缺少 detached 等属性），
      // 这里拷贝到独立的 ArrayBuffer 以满足契约。
      const ab = new ArrayBuffer(pcm.byteLength);
      new Uint8Array(ab).set(pcm);
      return ab;
    } finally {
      release();
    }
  }

  stream(text: string, options?: TTSOptions): TTSStreamController {
    const startTime = Date.now();
    let firstChunkResolve!: (ms: number) => void;
    let totalResolve!: (ms: number) => void;
    let aborted = false;

    const firstChunkLatency = new Promise<number>(r => { firstChunkResolve = r; });
    const totalLatency = new Promise<number>(r => { totalResolve = r; });

    const chunks = new ReadableStream<AudioChunk>({
      start: async (controller) => {
        const release = await this.sidecar.acquireLock(this.sidecarId);
        try {
          await this.ensureStarted();
          let sampleRate = options?.sampleRate ?? 32000;
          let firstChunk = true;

          try {
            await this.runTtsStream(text, options, {
              onSampleRate: (rate) => { sampleRate = rate; },
              onFrame: (frame) => {
                if (aborted) return;
                if (firstChunk) {
                  firstChunkResolve(Date.now() - startTime);
                  firstChunk = false;
                }
                controller.enqueue({
                  data: bytesToFloat32(frame.data),
                  sampleRate,
                  timestamp: Date.now(),
                  isLast: false,
                });
              },
            });

            totalResolve(Date.now() - startTime);
            if (!aborted) {
              controller.enqueue({
                data: new Float32Array(0),
                sampleRate,
                timestamp: Date.now(),
                isLast: true,
              });
            }
            controller.close();
          } catch (error) {
            if (firstChunk) firstChunkResolve(Date.now() - startTime);
            totalResolve(Date.now() - startTime);
            if (aborted)
              controller.close();
            else
              controller.error(error);
          }
        } finally {
          release();
        }
      },
    });

    return {
      chunks,
      abort: () => { aborted = true; },
      firstChunkLatency,
      totalLatency,
    };
  }

  async health(): Promise<TTSHealthStatus> {
    const status = this.sidecar.getStatus(this.sidecarId);
    if (!status || status.state !== 'running') {
      return {
        device: this.device,
        status: 'unhealthy',
        error: `sidecar not running (state=${status?.state ?? 'null'})`,
      };
    }

    const check = await this.sidecar.healthCheck(this.sidecarId);
    if (!check.healthy) {
      return {
        device: this.device,
        status: 'unhealthy',
        error: check.reason,
      };
    }

    const resp = await this.sidecar.sendRequest(this.sidecarId, 'health');
    if (resp.error) {
      return { device: this.device, status: 'unhealthy', error: resp.error.message };
    }
    const result = resp.result as { model_loaded?: boolean; load_error?: string } | undefined;
    if (!result?.model_loaded) {
      return {
        device: this.device,
        status: 'degraded',
        error: result?.load_error ?? 'model not loaded',
      };
    }
    return { device: this.device, status: 'healthy' };
  }

  async getVoices(): Promise<Voice[]> {
    // GPT-SoVITS 使用参考音频而非预设音色，返回固定列表
    return [{ id: 'default', name: 'GPT-SoVITS', language: 'zh' }];
  }

  // --- 内部 ---

  private async ensureStarted(): Promise<void> {
    if (this.started) return;
    await this.sidecar.start(
      {
        id: this.sidecarId,
        command: this.command,
        args: this.args,
        cwd: this.cwd,
        env: {
          PYTHONUNBUFFERED: '1',
          PYTHONIOENCODING: 'utf-8',
          ...this.env,
        },
        onDegraded: this.onDegraded,
      },
      {
        onBinary: (frame) => this.currentFrameHandler?.(frame),
        onNotification: (method, params) => this.handleNotification(method, params),
      },
    );
    this.started = true;
  }

  private handleNotification(method: string, params: unknown): void {
    if (method === 'tts/error') {
      const message = (params as { message?: string })?.message ?? 'unknown sidecar error';
      this.currentErrorHandler?.(message);
    }
  }

  /**
   * 发送 tts 请求并等待所有音频帧 + endOfStream。
   * 调用前必须持有 sidecar 串行锁（acquireLock），避免多个 TTS 请求的音频帧交错。
   *
   * 流程：
   * 1. 设置 currentFrameHandler — 在 sendRequest resolve 之前就绑定，
   *    防止 "started" 响应后、handler 设置前到达的音频帧丢失。
   * 2. sendRequest 发送 tts 方法 → sidecar 回 "started" 响应（含 sampleRate）。
   * 3. sidecar 流式写入二进制音频帧 → currentFrameHandler 逐帧回调。
   * 4. sidecar 写 end-of-stream 帧 → currentFrameHandler 调用 streamResolve。
   * 5. 若 sidecar 发 tts/error notification → currentErrorHandler 调用 streamReject。
   */
  private async runTtsStream(
    text: string,
    options: TTSOptions | undefined,
    callbacks: {
      onSampleRate: (rate: number) => void;
      onFrame: (frame: BinaryFrame) => void;
    },
  ): Promise<void> {
    const params = this.buildTtsParams(text, options);

    let streamResolve!: () => void;
    let streamReject!: (error: unknown) => void;
    const streamDone = new Promise<void>((resolve, reject) => {
      streamResolve = resolve;
      streamReject = reject;
    });

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new TTSError(
          'TTS stream timeout',
          this.device,
          TTSErrorCode.TIMEOUT,
        )),
        this.streamTimeoutMs,
      );
    });

    this.currentFrameHandler = (frame) => {
      if (!frame.endOfStream)
        callbacks.onFrame(frame);
      else
        streamResolve();
    };
    this.currentErrorHandler = (message) => {
      streamReject(new TTSError(
        `TTS error: ${message}`,
        this.device,
        TTSErrorCode.SYNTHESIS_FAILED,
      ));
    };

    try {
      const resp = await this.sidecar.sendRequest(this.sidecarId, 'tts', params);
      if (resp.error) {
        throw new TTSError(
          `TTS request failed: ${resp.error.message}`,
          this.device,
          TTSErrorCode.SYNTHESIS_FAILED,
        );
      }
      const result = resp.result as { sampleRate?: number } | undefined;
      if (result?.sampleRate)
        callbacks.onSampleRate(result.sampleRate);

      await Promise.race([streamDone, timeout]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      this.currentFrameHandler = null;
      this.currentErrorHandler = null;
    }
  }

  private buildTtsParams(text: string, options: TTSOptions | undefined): Record<string, unknown> {
    const d = this.defaults;
    return {
      text,
      text_lang: d.textLang ?? 'zh',
      ref_audio_path: d.refAudioPath ?? '',
      prompt_text: d.promptText ?? '',
      prompt_lang: d.promptLang ?? 'zh',
      text_split_method: d.textSplitMethod ?? 'cut5',
      streaming_mode: d.streamingMode ?? 2,
      speed_factor: options?.speed ?? d.speedFactor ?? 1.0,
    };
  }
}

// --- 工具函数 ---

function concatUint8(chunks: Uint8Array[]): Uint8Array {
  if (chunks.length === 0) return new Uint8Array(0);
  const total = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.byteLength;
  }
  return result;
}

/** 将 float32 LE 字节解为 Float32Array。 */
function bytesToFloat32(data: Uint8Array): Float32Array {
  const len = Math.floor(data.byteLength / 4);
  const result = new Float32Array(len);
  new Uint8Array(result.buffer).set(data.subarray(0, len * 4));
  return result;
}

/** 将 float32 PCM 包装为 WAV ArrayBuffer（int16 PCM 编码）。 */
function pcmToWav(pcm: Uint8Array, sampleRate: number): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcm.byteLength / 4 * 2; // float32 → int16
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  view.setUint8(0, 0x52); view.setUint8(1, 0x49); view.setUint8(2, 0x46); view.setUint8(3, 0x46);
  view.setUint32(4, 36 + dataSize, true);
  view.setUint8(8, 0x57); view.setUint8(9, 0x41); view.setUint8(10, 0x56); view.setUint8(11, 0x45);
  // fmt sub-chunk
  view.setUint8(12, 0x66); view.setUint8(13, 0x6d); view.setUint8(14, 0x74); view.setUint8(15, 0x20);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  // data sub-chunk
  view.setUint8(36, 0x64); view.setUint8(37, 0x61); view.setUint8(38, 0x74); view.setUint8(39, 0x61);
  view.setUint32(40, dataSize, true);

  // float32 → int16
  const pcmFloat = new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 4));
  const pcmInt16 = new Int16Array(pcmFloat.length);
  for (let i = 0; i < pcmFloat.length; i++) {
    const s = Math.max(-1, Math.min(1, pcmFloat[i]));
    pcmInt16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  new Int16Array(buffer, headerSize).set(pcmInt16);
  return buffer;
}
