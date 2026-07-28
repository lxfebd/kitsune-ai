/**
 * One control event over the bidirectional streaming TTS protocol
 * (unspeech v1, see `unspeech/docs/wire-protocols/audio-speech-stream-v1.md`).
 *
 * Audio frames travel as raw WebSocket binary frames and never use this
 * envelope.
 */
export interface StreamingTtsServerEvent {
    event: 'session.started' | 'sentence.start' | 'sentence.end' | 'subtitle' | 'session.finished' | 'error';
    text?: string;
    code?: string;
    message?: string;
    payload?: Record<string, unknown>;
}
/**
 * Inbound bookkeeping captured during a session. Returned alongside the
 * audio buffer so UI consumers can drive captions / mouth shape from
 * sentence boundaries when the upstream model emits them.
 */
export interface StreamingTtsSessionResult {
    audio: ArrayBuffer;
    /** Sentence-level events received from the gateway, in arrival order. */
    sentences: Array<{
        kind: 'start' | 'end' | 'subtitle';
        payload?: Record<string, unknown>;
    }>;
    /** Total bytes accumulated across all binary audio frames. */
    byteLength: number;
}
export interface StreamingTtsSessionOptions {
    /** Server URL override. Defaults to {@link SERVER_URL}. */
    serverUrl?: string;
    /** Override the auth token (Bearer). Defaults to {@link getAuthToken}. */
    token?: string;
    /** unspeech-routed model id, e.g. `volcengine/seed-tts-2.0`. */
    model: string;
    /** Upstream voice / speaker id. */
    voice: string;
    /** The text to synthesize. */
    input: string;
    /** OpenAI-style format. `mp3` default; streaming upstream rejects `wav`. */
    responseFormat?: 'mp3' | 'opus' | 'aac' | 'flac' | 'pcm';
    /**
     * Backend-specific knobs forwarded verbatim into the `extra_body` of the
     * `start` frame. For Volcengine: `api_resource_id`, `audio.*`, `additions`,
     * `section_id`, `context_texts`, etc.
     */
    extraBody?: Record<string, unknown>;
    /** Business trigger hint sent to server-side product analytics. */
    ttsTrigger?: 'auto' | 'manual';
    /** Low-cardinality source hint sent to server-side product analytics. */
    ttsSource?: 'chat_auto_tts' | 'manual_preview' | 'settings_test';
    /** Caller-side abort signal. Closes the ws and rejects with `AbortError`. */
    signal?: AbortSignal;
}
/**
 * Runs one bidirectional streaming TTS session against the airi server
 * (`/api/v1/audio/speech/ws`) and returns the concatenated audio when the
 * upstream emits `session.finished`.
 *
 * Use when:
 * - The stage speech pipeline's per-segment `tts()` callback wants to use
 *   the streaming gateway instead of HTTP `/audio/speech`.
 *
 * Expects:
 * - The user is authenticated; `getAuthToken()` returns a JWT or one is
 *   passed in `options.token`.
 * - The server has `STREAMING_TTS_UPSTREAM` configured.
 *
 * Returns:
 * - `{ audio, sentences, byteLength }` once `session.finished` arrives.
 * - Rejects with the upstream `error.message` on a server error event.
 * - Rejects with the abort reason on signal abort.
 */
export declare function streamingSynthesize(options: StreamingTtsSessionOptions): Promise<StreamingTtsSessionResult>;
