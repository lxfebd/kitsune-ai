/**
 * One synthesized sentence emitted by the streaming pipeline. The pipeline
 * delivers these in arrival order; consumers schedule them into their
 * playback manager directly.
 */
export interface StreamingPipelineSentence {
    /** 0-based sentence index within the session. */
    index: number;
    /** Sentence text from the upstream `sentence.*` payload, when available. */
    text: string;
    /** Decoded audio. Same `AudioContext` is used for every sentence in the session. */
    audio: AudioBuffer;
}
export interface StreamingTtsPipelineEvents {
    /**
     * Fires once per synthesized sentence (TTS 1.0) or once per session
     * (TTS 2.0 / `bufferEntireSession: true`). Schedule the audio into your
     * playback manager from this callback.
     */
    onSentence?: (sentence: StreamingPipelineSentence) => void;
    /**
     * Surfaced for any post-upgrade failure (server `error` event, ws close
     * without `session.finished`, decode failure). Consumers should treat the
     * session as terminated after this fires.
     */
    onError?: (err: Error) => void;
    /**
     * Fires after the ws closes for any reason. Always paired with either
     * `onSentence` (success path) or `onError` (failure path) preceding it.
     */
    onDone?: () => void;
}
export interface StreamingTtsPipelineOptions extends StreamingTtsPipelineEvents {
    /** Server URL override. Defaults to {@link SERVER_URL}. */
    serverUrl?: string;
    /** Override the auth token (Bearer). Defaults to {@link getAuthToken}. */
    token?: string;
    /** unspeech-routed model id, e.g. `volcengine/seed-tts-2.0`. */
    model: string;
    /** Upstream voice / speaker id. */
    voice: string;
    /** OpenAI-style format. Default `mp3`. */
    responseFormat?: 'mp3' | 'opus' | 'aac' | 'flac' | 'pcm';
    /** Backend-specific knobs forwarded as the `extra_body` of the `start` frame. */
    extraBody?: Record<string, unknown>;
    /** Business trigger hint sent to server-side product analytics. */
    ttsTrigger?: 'auto' | 'manual';
    /** Low-cardinality source hint sent to server-side product analytics. */
    ttsSource?: 'chat_auto_tts' | 'manual_preview' | 'settings_test';
    /**
     * Decoder context. The pipeline calls `decodeAudioData` on it for each
     * sentence (or once at session end in buffered mode). Reusing the page's
     * AudioContext is required so playback nodes that connect to its
     * destination see compatible sample rates.
     */
    audioContext: BaseAudioContext;
    /**
     * When `true`, accumulate every binary chunk until `session.finished` and
     * emit ONE `onSentence`. Use for models where per-sentence audio boundaries
     * are not synchronously aligned with `sentence.end` events (Volcengine
     * Seed-TTS 2.0 ships subtitles asynchronously; chunking on `sentence.end`
     * would drop frames). Default `false` (chunk per sentence — correct for
     * Seed-TTS 1.0 / ICL 1.0 where `sentence.end` arrives in-band with audio).
     */
    bufferEntireSession?: boolean;
}
export interface StreamingTtsPipelineHandle {
    /**
     * Forward a chunk of LLM-generated text to the in-flight TTS session.
     * The text is sent verbatim — no client-side segmentation. The upstream
     * model decides where to split sentences and how to pace prosody.
     *
     * Safe to call before the ws is open; frames are queued and flushed
     * after the handshake completes.
     */
    appendText: (text: string) => void;
    /**
     * Signal end of the LLM text stream. The upstream emits any remaining
     * audio then `session.finished`; the pipeline closes the ws after.
     */
    finish: () => void;
    /**
     * Abort the in-flight session. Sends `cancel` upstream (best-effort, no
     * ack wait per protocol v1) and closes the ws.
     */
    cancel: () => void;
}
/**
 * Drives a single bidirectional streaming TTS session for one LLM intent.
 *
 * Use when:
 * - You have a streaming LLM output you want voiced without client-side
 *   sentence segmentation. The upstream model receives raw token chunks
 *   and decides where to split.
 *
 * Expects:
 * - Authenticated user (or `options.token`).
 * - `STREAMING_TTS_UPSTREAM` configKV configured server-side.
 *
 * Returns:
 * - A handle with `appendText` / `finish` / `cancel`. Side-effect: audio
 *   AudioBuffers are emitted via `options.onSentence` in arrival order.
 */
export declare function createStreamingTtsPipeline(options: StreamingTtsPipelineOptions): StreamingTtsPipelineHandle;
