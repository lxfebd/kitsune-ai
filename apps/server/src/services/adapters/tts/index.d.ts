import type { TtsAdapter } from './types';
/**
 * Resolves a TTS adapter by its stable id.
 *
 * Use when:
 * - The router has loaded a TTS model config slice and needs to dispatch the
 *   request to the matching provider adapter.
 *
 * Expects:
 * - `id` is one of the {@link TtsAdapterId} union members. Anything else means
 *   the configKV entry is desynced from the code (admin added a provider id we
 *   don't ship yet) — surface as a 400 with the offending id so ops can
 *   diagnose without digging through logs.
 *
 * Returns:
 * - The adapter implementation. Throws `BAD_REQUEST` on unknown id.
 */
export declare function getAdapter(id: string): TtsAdapter;
export type { TtsAdapter, TtsAdapterContext, TtsAdapterId, TtsInput, TtsResult } from './types';
