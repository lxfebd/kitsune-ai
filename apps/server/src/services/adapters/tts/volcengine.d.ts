import type { TtsAdapter } from './types';
/**
 * Volcengine non-streaming REST adapter.
 *
 * Use when:
 * - Routing a hosted TTS request to Volcengine OpenSpeech.
 *
 * Expects:
 * - `ctx.baseURL` is the Volcengine TTS endpoint, e.g.
 *   `https://openspeech.bytedance.com/api/v1/tts`.
 * - `ctx.keyPlaintext` is the access token. The auth header uses Volcengine's
 *   non-standard `Bearer; <token>` format (semicolon after `Bearer`).
 * - `ctx.adapterParams.appid` is the Volcengine application id (required).
 * - `ctx.adapterParams.cluster` overrides the default cluster id when set.
 *
 * Returns:
 * - {@link TtsResult} with the audio bytes as an `ArrayBuffer`. Body is
 *   decoded from the upstream JSON `data` base64 field.
 */
export declare const volcengineAdapter: TtsAdapter;
