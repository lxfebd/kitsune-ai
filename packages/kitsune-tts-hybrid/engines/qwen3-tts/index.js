/**
 * Qwen3-TTS 引擎插件入口
 *
 * 基于 llama.cpp 的纯 C++ 推理，零 Python 依赖
 * 支持声音克隆、流式合成、CUDA 加速
 */
const http = require('http');
const path = require('path');
const fs = require('fs');

const SIDECAR_HOST = '127.0.0.1';
const DEFAULT_PORT = 8006;

function create(manifest, ctx) {
  const { logger = console, sidecarPort, sidecarHost } = ctx || {};
  const port = sidecarPort || manifest.sidecar?.port || DEFAULT_PORT;
  const host = sidecarHost || SIDECAR_HOST;

  function request(method, reqPath, body) {
    return new Promise((resolve, reject) => {
      const opts = {
        hostname: host,
        port,
        path: reqPath,
        method,
        headers: { 'Content-Type': 'application/json' },
        timeout: 120_000, // TTS 可能需要较长时间
      };

      const req = http.request(opts, res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          if (res.headers['content-type']?.includes('audio')) {
            resolve({ audioBuffer: buf, mimeType: res.headers['content-type'] });
          } else {
            try {
              resolve(JSON.parse(buf.toString()));
            } catch {
              resolve({ raw: buf.toString() });
            }
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('timeout'));
      });

      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  return {
    /**
     * 非流式合成
     * @param {Object} opts
     * @param {string} opts.text - 要合成的文本
     * @param {string} [opts.voice] - 音色 ID 或 .wav/.json 文件路径
     * @param {number} [opts.temperature=0.8] - 温度
     * @param {number} [opts.seed=42] - 随机种子
     * @returns {Promise<{ audioUrl: string, mimeType: string }>}
     */
    async synthesizeNonStreaming(opts) {
      const res = await request('POST', '/tts', {
        text: opts.text,
        voice: opts.voice || 'default',
        temperature: opts.temperature || 0.8,
        seed: opts.seed || 42,
        streaming: false,
      });

      if (res.audioBuffer) {
        const tmpDir = path.join(require('os').tmpdir(), 'pet-agent-audio');
        fs.mkdirSync(tmpDir, { recursive: true });
        const tmpFile = path.join(
          tmpDir,
          `tts_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.wav`
        );
        fs.writeFileSync(tmpFile, res.audioBuffer);
        return {
          audioUrl: `local-audio://${tmpFile.replace(/\\/g, '/')}`,
          mimeType: res.mimeType || 'audio/wav',
        };
      }

      throw new Error(res.detail || res.error || 'Qwen3-TTS 合成失败');
    },

    /**
     * 流式合成
     * @param {Object} opts
     * @param {Function} onEvent - 事件回调
     */
    async streamSynthesis(opts, onEvent) {
      const res = await request('POST', '/tts', {
        text: opts.text,
        voice: opts.voice || 'default',
        temperature: opts.temperature || 0.8,
        seed: opts.seed || 42,
        streaming: true,
      });

      if (res.audioBuffer && onEvent) {
        onEvent({
          type: 'audio',
          audioBuffer: res.audioBuffer,
          mimeType: res.mimeType || 'audio/wav',
        });
        onEvent({ type: 'done' });
      }

      return res;
    },

    /**
     * 获取音频 buffer
     */
    async fetchAudioBuffer(opts) {
      const res = await request('POST', '/tts', {
        text: opts.text,
        voice: opts.voice || 'default',
        streaming: false,
      });
      return res.audioBuffer || null;
    },

    /**
     * 健康检查
     */
    async healthCheck() {
      try {
        const res = await request('GET', '/health');
        return res.status === 'ok' || res.model_loaded === true;
      } catch {
        return false;
      }
    },

    /**
     * 获取可用音色列表
     */
    async getVoices() {
      try {
        const res = await request('GET', '/voices');
        return res.voices || [];
      } catch {
        return [];
      }
    },

    /**
     * 声音克隆：使用参考音频克隆音色
     * @param {Object} opts
     * @param {string} opts.referenceAudioPath - 参考音频路径
     * @param {string} opts.referenceText - 参考音频对应的文本
     * @param {string} opts.text - 要合成的文本
     * @returns {Promise<{ audioUrl: string, mimeType: string }>}
     */
    async cloneVoice(opts) {
      const res = await request('POST', '/clone', {
        reference_audio: opts.referenceAudioPath,
        reference_text: opts.referenceText,
        text: opts.text,
        temperature: opts.temperature || 0.8,
        seed: opts.seed || 42,
      });

      if (res.audioBuffer) {
        const tmpDir = path.join(require('os').tmpdir(), 'pet-agent-audio');
        fs.mkdirSync(tmpDir, { recursive: true });
        const tmpFile = path.join(
          tmpDir,
          `tts_clone_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.wav`
        );
        fs.writeFileSync(tmpFile, res.audioBuffer);
        return {
          audioUrl: `local-audio://${tmpFile.replace(/\\/g, '/')}`,
          mimeType: res.mimeType || 'audio/wav',
        };
      }

      throw new Error(res.detail || '声音克隆失败');
    },

    // ── 生命周期 ──

    async start() {
      logger.info('[tts-plugin:qwen3-tts] 客户端就绪（sidecar 由 Supervisor 管理）');
    },

    async stop() {
      // 无持久连接需要清理
    },
  };
}

module.exports = { create };
