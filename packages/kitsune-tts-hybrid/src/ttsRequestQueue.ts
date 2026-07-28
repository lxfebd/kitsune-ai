// src/ai-core/tts/ttsRequestQueue.ts

import type { TTSOptions } from './types.js';
import { TTSError, TTSErrorCode } from './types.js';

/** 队列请求 */
interface QueueRequest {
  text: string;
  options?: TTSOptions;
  resolve: (value: ArrayBuffer) => void;
  reject: (reason: Error) => void;
  timestamp: number;
}

/** 请求队列配置 */
export interface RequestQueueConfig {
  maxQueueSize?: number;
  maxWaitTimeMs?: number;
  onTimeout?: (request: QueueRequest) => Promise<ArrayBuffer>;
}

/** 请求队列管理器 */
export class TTSRequestQueue {
  private queue: QueueRequest[] = [];
  private maxQueueSize: number;
  private maxWaitTimeMs: number;
  private onTimeout?: (request: QueueRequest) => Promise<ArrayBuffer>;

  constructor(config: RequestQueueConfig) {
    this.maxQueueSize = config.maxQueueSize ?? 20;
    this.maxWaitTimeMs = config.maxWaitTimeMs ?? 10000;
    this.onTimeout = config.onTimeout;
  }

  /** 入队请求 */
  async enqueue(
    text: string,
    options?: TTSOptions
  ): Promise<ArrayBuffer> {
    // 检查队列是否已满
    if (this.queue.length >= this.maxQueueSize) {
      throw new TTSError(
        'Request queue is full',
        'cpu',
        TTSErrorCode.DEVICE_NOT_AVAILABLE
      );
    }

    return new Promise((resolve, reject) => {
      const request: QueueRequest = {
        text,
        options,
        resolve,
        reject,
        timestamp: Date.now(),
      };

      this.queue.push(request);

      // 设置超时
      setTimeout(() => {
        const index = this.queue.indexOf(request);
        if (index !== -1) {
          this.queue.splice(index, 1);

          if (this.onTimeout) {
            this.onTimeout(request)
              .then(resolve)
              .catch(reject);
          } else {
            reject(new TTSError(
              'Request timeout',
              'cpu',
              TTSErrorCode.TIMEOUT
            ));
          }
        }
      }, this.maxWaitTimeMs);
    });
  }

  /** Sidecar 恢复后 flush 队列 */
  async onSidecarReady(
    synthesizer: (text: string, options?: TTSOptions) => Promise<ArrayBuffer>
  ): Promise<void> {
    const pending = [...this.queue];
    this.queue = [];

    for (const request of pending) {
      try {
        const audio = await synthesizer(request.text, request.options);
        request.resolve(audio);
      } catch (error) {
        request.reject(error as Error);
      }
    }
  }

  /** 获取队列长度 */
  get length(): number {
    return this.queue.length;
  }

  /** 清空队列 */
  clear(): void {
    for (const request of this.queue) {
      request.reject(new TTSError(
        'Queue cleared',
        'cpu',
        TTSErrorCode.DEVICE_NOT_AVAILABLE
      ));
    }
    this.queue = [];
  }
}
