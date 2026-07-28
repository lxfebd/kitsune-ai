import type { WSContext } from 'hono/ws';
import type { AudioSpeechWsHandlersOptions } from './types';
/**
 * Mutable state for one streaming speech websocket connection.
 */
export interface AudioSpeechSessionState {
    /** Stores the accepted client websocket. */
    attachClient: (ws: WSContext) => void;
    /** Reads config, checks balance, decrypts the upstream key, and dials upstream. */
    dialUpstream: () => Promise<void>;
    /** Forwards a client frame or queues it while the upstream connection opens. */
    handleClientMessage: (message: {
        data: unknown;
    }, ws: WSContext) => void;
    /** Cancels upstream and finalizes the span when the client disconnects. */
    handleClientClose: () => void;
}
export type StreamingTtsTrigger = 'auto' | 'manual';
export type StreamingTtsSource = 'audio.speech.ws' | 'chat_auto_tts' | 'manual_preview' | 'settings_test';
export interface AudioSpeechSessionAnalytics {
    trigger?: StreamingTtsTrigger;
    source?: StreamingTtsSource;
}
/**
 * Creates the per-connection streaming speech state machine.
 *
 * Use when:
 * - A Hono websocket connection has been accepted for a verified user.
 * - Client frames must be proxied to unSpeech while billing and request logs
 *   are handled at session end.
 *
 * Expects:
 * - `UNSPEECH_UPSTREAM.streaming` has a base URL and at least one encrypted key.
 *
 * Returns:
 * - A connection-scoped state object with no global peer registry.
 */
export declare function createSessionState(userId: string, opts: AudioSpeechWsHandlersOptions, analyticsInput?: AudioSpeechSessionAnalytics): AudioSpeechSessionState;
