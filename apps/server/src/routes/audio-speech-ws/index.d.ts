import type { WSEvents } from 'hono/ws';
import type { AudioSpeechSessionAnalytics } from './session';
import type { AudioSpeechWsHandlersOptions } from './types';
export type { AudioSpeechWsHandlersOptions } from './types';
/**
 * Build the per-user setup function for the bidirectional streaming TTS proxy.
 *
 * Use when:
 * - Wiring `/api/v1/audio/speech/ws` in {@link app.ts}. The factory returns a
 *   curried `setupPeer(userId)` that produces hono `WSEvents`, mirroring the
 *   shape of {@link createChatWsHandlers} so app.ts wires both routes the
 *   same way.
 *
 * Expects:
 * - The route handler has already resolved auth via the `?token=` query
 *   (see app.ts wiring) and passes a verified `userId` in.
 * - `UNSPEECH_UPSTREAM.streaming` configKV subtree is populated with at least
 *   one key; absent config rejects the upgrade with policy-violation close.
 *
 * Returns:
 * - A function that takes `userId` and returns hono `WSEvents`. Each call
 *   produces a fresh closure scoped to one connection — there is no global
 *   peer registry because streaming TTS is single-session per connection.
 */
export declare function createAudioSpeechWsHandlers(opts: AudioSpeechWsHandlersOptions): (userId: string, analytics?: AudioSpeechSessionAnalytics) => WSEvents;
