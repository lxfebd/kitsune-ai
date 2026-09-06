// src/ai-core/tts/ttsManager.ts

import type {
  TTSAdapter,
  TTSDevice,
  TTSOptions,
  TTSHealthStatus,
  TTSService,
  TTSStreamController,
  Voice,
} from './types.js';
import { TTSError, TTSErrorCode } from './types.js';
import { TTSRequestQueue } from './ttsRequestQueue.js';
import { TTSFallbackChain } from './ttsFallbackChain.js';

/** TTSManager 配置 */
export interface TTSManagerConfig {
  /** 适配器列表，按优先级排序 */
  adapters: TTSAdapter[];
  /** 请求队列最大长度 */
  maxQueueSize?: number;
  /** 请求等待最大时间（ms） */
  maxWaitTimeMs?: number;
}

/** TTS 管理器，组合请求队列和降级链，实现 TTSService 接口 */
export class TTSManager implements TTSService {
  private adapters: TTSAdapter[];
  private queue: TTSRequestQueue;
  private fallbackChain: TTSFallbackChain;

  constructor(config: TTSManagerConfig) {
    if (!config.adapters || config.adapters.length === 0) {
      throw new TTSError(
        'At least one adapter is required',
        'cpu',
        TTSErrorCode.DEVICE_NOT_AVAILABLE
      );
    }

    this.adapters = config.adapters;

    this.fallbackChain = new TTSFallbackChain({
      adapters: this.adapters,
      onDeviceRecovered: () => {
        this.notifySidecarReady();
      },
    });

    this.queue = new TTSRequestQueue({
      maxQueueSize: config.maxQueueSize,
      maxWaitTimeMs: config.maxWaitTimeMs,
    });
  }

  /** 同步合成（通过请求队列） */
  async synthesize(text: string, options?: TTSOptions): Promise<ArrayBuffer> {
    return this.queue.enqueue(text, options);
  }

  /** 流式合成（找到第一个可用适配器） */
  stream(text: string, options?: TTSOptions): TTSStreamController {
    const availableAdapter = this.findAvailableAdapter();
    if (!availableAdapter) {
      throw new TTSError(
        'No available TTS adapter',
        'cpu',
        TTSErrorCode.DEVICE_NOT_AVAILABLE
      );
    }
    return availableAdapter.stream(text, options);
  }

  /** 带降级的合成 */
  async synthesizeWithFallback(text: string, options?: TTSOptions): Promise<ArrayBuffer> {
    return this.fallbackChain.synthesizeWithFallback(text, options);
  }

  /** 健康检查：检查当前适配器的健康状态 */
  async health(): Promise<TTSHealthStatus> {
    const adapter = this.findAvailableAdapter();
    if (!adapter) {
      return {
        device: this.getCurrentDevice(),
        status: 'unhealthy',
        error: 'No available adapter',
      };
    }
    return adapter.health();
  }

  /** 获取当前适配音色列表 */
  async getVoices(): Promise<Voice[]> {
    const adapter = this.findAvailableAdapter();
    if (!adapter) {
      return [];
    }
    return adapter.getVoices();
  }

  /** 获取当前设备（第一个适配器的设备） */
  getCurrentDevice(): TTSDevice {
    return this.adapters[0].device;
  }

  /** 获取可用设备列表 */
  getAvailableDevices(): TTSDevice[] {
    return this.fallbackChain.getAvailableDevices();
  }

  /**
   * 手动 flush 队列，使用自定义 synthesizer。
   * 大多数场景应使用 {@link notifySidecarReady}，它会自动使用 fallback chain。
   */
  async flushQueue(
    synthesizer: (text: string, options?: TTSOptions) => Promise<ArrayBuffer>
  ): Promise<void> {
    return this.queue.onSidecarReady(synthesizer);
  }

  /**
   * 通知 sidecar 已就绪，自动 flush 等待队列。
   *
   * 当 sidecar 重新可用（例如健康检查通过、进程重启完成）时调用此方法。
   * 内部使用 {@link synthesizeWithFallback} 作为合成函数，会按适配器优先级
   * 依次尝试合成排队中的请求。
   *
   * 如果队列为空，则为 no-op。
   */
  async notifySidecarReady(): Promise<void> {
    if (this.queueLength === 0)
      return;

    await this.flushQueue((text, options) =>
      this.synthesizeWithFallback(text, options)
    );
  }

  /** 清空请求队列 */
  clearQueue(): void {
    this.queue.clear();
  }

  /** 获取队列长度 */
  get queueLength(): number {
    return this.queue.length;
  }

  /** 查找第一个可用适配器（按优先级排序） */
  private findAvailableAdapter(): TTSAdapter | undefined {
    const availableDevices = this.fallbackChain.getAvailableDevices();
    return this.adapters.find((adapter) => availableDevices.includes(adapter.device));
  }
}
