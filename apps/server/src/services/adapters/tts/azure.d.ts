import type { TtsAdapter } from './types';
/**
 * Azure Cognitive Services REST adapter.
 *
 * Use when:
 * - The router routes a hosted TTS request to an Azure upstream (e.g.
 *   `https://eastasia.tts.speech.microsoft.com/cognitiveservices/v1`).
 *
 * Expects:
 * - `ctx.baseURL` is the full Azure REST endpoint (region-prefixed).
 * - `ctx.keyPlaintext` is the subscription key string the gateway will send as
 *   `Ocp-Apim-Subscription-Key`.
 *
 * Returns:
 * - {@link TtsResult} with the audio bytes as an `ArrayBuffer`. The
 *   `contentType` is taken from the upstream `content-type` header when
 *   present, otherwise inferred from the requested format.
 */
export declare const azureAdapter: TtsAdapter;
