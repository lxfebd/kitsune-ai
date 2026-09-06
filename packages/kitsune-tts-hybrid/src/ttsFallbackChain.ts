import type { TTSAdapter, TTSDevice, TTSOptions } from './types.js';
import { TTSError, TTSErrorCode } from './types.js';

/** 降级链配置 */
export interface FallbackChainConfig {
  adapters: TTSAdapter[];
  maxRetries?: number;
  /**
   * 设备自动恢复时的回调。
   * 当某个设备从不可用状态恢复为可用时触发，可用于 flush 等待队列。
   */
  onDeviceRecovered?: (device: TTSDevice) => void;
}

const RECOVERY_DELAY_MS = 30_000

/** 降级链管理器 */
export class TTSFallbackChain {
  private adapters: TTSAdapter[];
  private unavailableDevices: Set<TTSDevice> = new Set();
  private recoveryTimers: Map<TTSDevice, ReturnType<typeof setTimeout>> = new Map();
  private maxRetries: number;
  private onDeviceRecovered?: (device: TTSDevice) => void;

  constructor(config: FallbackChainConfig) {
    this.adapters = config.adapters;
    this.maxRetries = config.maxRetries ?? 2;
    this.onDeviceRecovered = config.onDeviceRecovered;
  }

  /** 带降级的合成 */
  async synthesizeWithFallback(
    text: string,
    options?: TTSOptions
  ): Promise<ArrayBuffer> {
    // 检查输入长度
    if (text.length > 500) {
      return await this.synthesizeInChunks(text, options);
    }

    for (const adapter of this.adapters) {
      if (this.unavailableDevices.has(adapter.device)) {
        continue;
      }

      try {
        const health = await adapter.health();
        if (health.status === 'unhealthy') {
          this.markDeviceUnavailable(adapter.device, new Error('Device unhealthy'));
          continue;
        }

        // 对单个 adapter 进行重试
        let lastError: Error | undefined;
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
          try {
            return await adapter.synthesize(text, options);
          } catch (retryError) {
            lastError = retryError as Error;
            console.warn(
              `TTS device ${adapter.device} attempt ${attempt + 1}/${this.maxRetries + 1} failed:`,
              retryError
            );
          }
        }

        // 所有重试都失败，标记设备不可用
        this.markDeviceUnavailable(adapter.device, lastError!);
      } catch (error) {
        console.warn(`TTS device ${adapter.device} failed:`, error);
        this.markDeviceUnavailable(adapter.device, error as Error);
      }
    }

    throw new TTSError(
      'All TTS devices unavailable',
      'cpu',
      TTSErrorCode.DEVICE_NOT_AVAILABLE
    );
  }

  /** 分段合成长文本 */
  private async synthesizeInChunks(
    text: string,
    options?: TTSOptions
  ): Promise<ArrayBuffer> {
    const chunkSize = 500;
    const chunks: ArrayBuffer[] = [];

    for (let i = 0; i < text.length; i += chunkSize) {
      const chunk = text.slice(i, i + chunkSize);
      const audio = await this.synthesizeWithFallback(chunk, options);
      chunks.push(audio);
    }

    // 合并音频（简单拼接，实际可能需要 crossfade）
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
      result.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }

    return result.buffer;
  }

  /** 标记设备不可用，自动安排恢复 */
  markDeviceUnavailable(device: TTSDevice, error: Error): void {
    this.unavailableDevices.add(device);
    console.warn(`TTS device ${device} marked as unavailable:`, error.message);

    // 清除已有恢复定时器
    const existing = this.recoveryTimers.get(device);
    if (existing) clearTimeout(existing);

    // 安排自动恢复
    const timer = setTimeout(() => {
      this.recoveryTimers.delete(device);
      this.unavailableDevices.delete(device);
      console.info(`TTS device ${device} auto-recovered after ${RECOVERY_DELAY_MS}ms`);
      this.onDeviceRecovered?.(device);
    }, RECOVERY_DELAY_MS);
    // 允许 Node.js 在定时器存在时不阻止进程退出
    if (typeof timer === 'object' && 'unref' in timer) timer.unref();
    this.recoveryTimers.set(device, timer);
  }

  /** 获取当前可用设备 */
  getAvailableDevices(): TTSDevice[] {
    return this.adapters
      .filter(adapter => !this.unavailableDevices.has(adapter.device))
      .map(adapter => adapter.device);
  }

  /** 重置设备状态 */
  resetDeviceStatus(device: TTSDevice): void {
    this.unavailableDevices.delete(device);
    const timer = this.recoveryTimers.get(device);
    if (timer) {
      clearTimeout(timer);
      this.recoveryTimers.delete(device);
    }
  }

  /** 清理所有恢复定时器 */
  dispose(): void {
    for (const timer of this.recoveryTimers.values()) {
      clearTimeout(timer);
    }
    this.recoveryTimers.clear();
  }
}
