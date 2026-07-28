import type { TtsAdapter } from './types';
/**
 * DashScope cosyvoice adapter.
 *
 * Use when:
 * - Routing a hosted TTS request to Alibaba DashScope's cosyvoice v2 / v3
 *   family of models (Chinese + English + selected multilingual voices).
 *
 * Expects:
 * - `ctx.baseURL` is the **full** non-streaming endpoint, e.g.
 *   `https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer`
 *   (or `dashscope-intl.aliyuncs.com` for the Singapore region). The adapter
 *   does not append a path — pointing at a bare `/api/v1` will 404.
 * - `ctx.keyPlaintext` is the DashScope API key (sent as `Bearer ...`).
 * - `ctx.adapterParams.model` (optional) names the cosyvoice variant; defaults
 *   to {@link DEFAULT_COSYVOICE_MODEL}.
 *
 * Returns:
 * - {@link TtsResult} with the audio bytes as an `ArrayBuffer`. The non-
 *   streaming endpoint returns a JSON envelope whose `output.audio.url` is
 *   a short-lived signed URL; this adapter performs the follow-up GET and
 *   surfaces the final bytes so router callers get the same single-shot
 *   contract as the Azure / Volcengine paths.
 */
export declare const dashscopeCosyvoiceAdapter: TtsAdapter;
