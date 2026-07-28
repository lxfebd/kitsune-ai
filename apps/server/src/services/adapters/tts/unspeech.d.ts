import type { Voice } from 'unspeech';
import type { TtsAdapterContext, TtsResult, TtsVoiceCatalogContext } from './types';
interface SendSpeechOptions {
    ctx: TtsAdapterContext;
    model: string;
    input: string;
    voice: string;
    speed?: number;
    responseFormat: string;
    extraBody?: Record<string, unknown>;
    fallbackContentType: string;
    providerLabel: string;
}
/**
 * Sends one OpenAI-shaped speech request through the unspeech SDK.
 *
 * Use when:
 * - A TTS adapter has resolved Kitsune AI's provider policy and needs to delegate the
 *   actual HTTP request to unspeech.
 *
 * Expects:
 * - `model`, `voice`, `responseFormat`, and `extraBody` already match the
 *   provider-specific unspeech contract.
 *
 * Returns:
 * - The binary audio payload plus a content type for the OpenAI route.
 */
export declare function sendSpeechViaUnSpeech(options: SendSpeechOptions): Promise<TtsResult>;
interface ListVoicesOptions {
    ctx: TtsVoiceCatalogContext;
    query: string;
    providerLabel: string;
}
/**
 * Lists unspeech voices and maps SDK failures into Kitsune AI gateway errors.
 *
 * Use when:
 * - A TTS adapter needs unspeech's normalized `Voice[]` catalog.
 *
 * Expects:
 * - `query` is an unspeech `/api/voices` query string such as
 *   `provider=microsoft&region=eastasia`.
 *
 * Returns:
 * - The parsed voice catalog.
 */
export declare function listVoicesViaUnSpeech(options: ListVoicesOptions): Promise<Voice[]>;

