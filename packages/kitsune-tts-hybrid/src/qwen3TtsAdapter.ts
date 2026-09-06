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

/** Qwen3-TTS 适配器配置 */
export interface Qwen3TTSAdapterConfig {
  /** 适配器名称，默认 'qwen3-tts'。 */
  name?: string;
  endpoint: string;
  device: TTSDevice;
  timeoutMs?: number;
}

/** Qwen3-TTS 适配器 */
export class Qwen3TTSAdapter implements TTSAdapter {
  name: string;
  device: TTSDevice;
  private endpoint: string;
  private timeoutMs: number;

  constructor(config: Qwen3TTSAdapterConfig) {
    this.name = config.name ?? 'qwen3-tts';
    this.endpoint = config.endpoint.replace(/\/+$/, '');
    this.device = config.device;
    this.timeoutMs = config.timeoutMs ?? 30000;
  }

  async synthesize(text: string, options?: TTSOptions): Promise<ArrayBuffer> {
    try {
      const response = await fetch(`${this.endpoint}/tts/api/tts/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice: options?.voice ?? 'default',
          speed: options?.speed ?? 1.0,
          pitch: options?.pitch ?? 1.0,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        throw new TTSError(
          `TTS synthesis failed: ${response.statusText}`,
          this.device,
          TTSErrorCode.SYNTHESIS_FAILED
        );
      }

      const buffer = await response.arrayBuffer();

      // 如果请求 WAV 格式，转换 PCM 为 WAV
      if (options?.format === 'wav') {
        const sampleRate = parseInt(response.headers.get('X-Sample-Rate') ?? '24000');
        return this.pcmToWav(buffer, sampleRate);
      }

      return buffer;
    } catch (error) {
      if (error instanceof TTSError) {
        throw error;
      }
      throw new TTSError(
        `TTS synthesis failed: ${error}`,
        this.device,
        TTSErrorCode.NETWORK_ERROR,
        error as Error
      );
    }
  }

  stream(text: string, options?: TTSOptions): TTSStreamController {
    const controller = new AbortController();
    const startTime = Date.now();
    let firstChunkLatencyResolve!: (value: number) => void;
    let totalLatencyResolve!: (value: number) => void;

    const firstChunkLatency = new Promise<number>((resolve) => {
      firstChunkLatencyResolve = resolve;
    });
    const totalLatency = new Promise<number>((resolve) => {
      totalLatencyResolve = resolve;
    });

    const chunks = new ReadableStream<AudioChunk>({
      start: async (streamController) => {
        try {
          const response = await fetch(`${this.endpoint}/tts/api/tts/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text,
              voice: options?.voice ?? 'default',
              speed: options?.speed ?? 1.0,
              pitch: options?.pitch ?? 1.0,
            }),
            signal: controller.signal,
          });

          if (!response.ok) {
            const err = new TTSError(
              `TTS stream failed: ${response.statusText}`,
              this.device,
              TTSErrorCode.SYNTHESIS_FAILED
            );
            streamController.error(err);
            return;
          }

          const reader = response.body!.getReader();
          let firstChunk = true;
          let sampleRate = parseInt(response.headers.get('X-Sample-Rate') ?? '24000');
          let buffer = new Uint8Array(0);

          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;

            // 累积数据到 buffer
            const newBuffer = new Uint8Array(buffer.length + value.length);
            newBuffer.set(buffer);
            newBuffer.set(value, buffer.length);
            buffer = newBuffer;

            // 循环提取所有完整帧：[4 bytes length][PCM data]
            while (buffer.length >= 4) {
              const headerView = new DataView(buffer.buffer, buffer.byteOffset, buffer.length);
              const frameLength = headerView.getInt32(0, true);

              // length === 0 表示结束标记
              if (frameLength === 0) {
                buffer = new Uint8Array(0);
                totalLatencyResolve(Date.now() - startTime);

                // 发送 isLast: true 的结束标记
                streamController.enqueue({
                  data: new Float32Array(0),
                  sampleRate,
                  timestamp: Date.now(),
                  isLast: true,
                });
                reader.cancel();
                return;
              }

              const totalFrameSize = 4 + frameLength;
              if (buffer.length < totalFrameSize) {
                // 不够一个完整帧，等待更多数据
                break;
              }

              // 提取 PCM 数据
              const pcmData = new Float32Array(
                buffer.buffer,
                buffer.byteOffset + 4,
                frameLength / 4
              );

              if (firstChunk) {
                firstChunkLatencyResolve(Date.now() - startTime);
                firstChunk = false;
              }

              streamController.enqueue({
                data: pcmData,
                sampleRate,
                timestamp: Date.now(),
                isLast: false,
              });

              // 消费已解析的帧，保留剩余数据
              buffer = buffer.slice(totalFrameSize);
            }
          }

          // 读取完毕（done=true），发送结束标记
          totalLatencyResolve(Date.now() - startTime);
          streamController.enqueue({
            data: new Float32Array(0),
            sampleRate,
            timestamp: Date.now(),
            isLast: true,
          });
          streamController.close();
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            // 正常取消，关闭流
            streamController.close();
            return;
          }
          const err =
            error instanceof TTSError
              ? error
              : new TTSError(
                  `TTS stream failed: ${error}`,
                  this.device,
                  TTSErrorCode.NETWORK_ERROR,
                  error as Error
                );
          streamController.error(err);
        }
      },
    });

    return {
      chunks,
      abort: () => controller.abort(),
      firstChunkLatency,
      totalLatency,
    };
  }

  async health(): Promise<TTSHealthStatus> {
    try {
      const response = await fetch(`${this.endpoint}/tts/health`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return {
          device: this.device,
          status: 'unhealthy',
          error: `HTTP ${response.status}`,
        };
      }

      const data = (await response.json()) as { model_loaded?: boolean };
      return {
        device: this.device,
        status: data.model_loaded ? 'healthy' : 'degraded',
      };
    } catch (error) {
      return {
        device: this.device,
        status: 'unhealthy',
        error: String(error),
      };
    }
  }

  async getVoices(): Promise<Voice[]> {
    try {
      const response = await fetch(`${this.endpoint}/tts/voices`, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        throw new TTSError(
          `Failed to fetch voices: ${response.statusText}`,
          this.device,
          TTSErrorCode.NETWORK_ERROR
        );
      }

      const data = (await response.json()) as { voices?: Array<{ id?: string; name?: string; voice_id?: string; voice_name?: string }> };
      return (data.voices ?? []).map((v) => ({
        id: v.id ?? v.voice_id ?? 'default',
        name: v.name ?? v.voice_name ?? 'Unknown',
      }));
    } catch (error) {
      if (error instanceof TTSError) {
        throw error;
      }
      throw new TTSError(
        `Failed to fetch voices: ${error}`,
        this.device,
        TTSErrorCode.NETWORK_ERROR,
        error as Error
      );
    }
  }

  /** PCM 转 WAV */
  private pcmToWav(pcm: ArrayBuffer, sampleRate: number): ArrayBuffer {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcm.byteLength;
    const headerSize = 44;
    const buffer = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(buffer);

    // RIFF header
    view.setUint8(0, 0x52); // R
    view.setUint8(1, 0x49); // I
    view.setUint8(2, 0x46); // F
    view.setUint8(3, 0x46); // F
    view.setUint32(4, 36 + dataSize, true);
    view.setUint8(8, 0x57); // W
    view.setUint8(9, 0x41); // A
    view.setUint8(10, 0x56); // V
    view.setUint8(11, 0x45); // E

    // fmt sub-chunk
    view.setUint8(12, 0x66); // f
    view.setUint8(13, 0x6d); // m
    view.setUint8(14, 0x74); // t
    view.setUint8(15, 0x20); // (space)
    view.setUint32(16, 16, true); // sub-chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data sub-chunk
    view.setUint8(36, 0x64); // d
    view.setUint8(37, 0x61); // a
    view.setUint8(38, 0x74); // t
    view.setUint8(39, 0x61); // a
    view.setUint32(40, dataSize, true);

    // PCM data (需要转换 Float32 为 Int16)
    const pcmFloat = new Float32Array(pcm);
    const pcmInt16 = new Int16Array(pcmFloat.length);
    for (let i = 0; i < pcmFloat.length; i++) {
      const s = Math.max(-1, Math.min(1, pcmFloat[i]));
      pcmInt16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    new Int16Array(buffer, headerSize).set(pcmInt16);

    return buffer;
  }
}
