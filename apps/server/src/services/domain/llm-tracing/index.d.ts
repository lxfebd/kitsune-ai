/** Parameters identifying a request a Langfuse generation traces. */
interface GenerationInput {
    /** Provider-domain input payload, recorded verbatim as trace input. */
    input: unknown;
    /** Resolved upstream model id (after `auto` aliases are replaced). */
    model: string;
    /** Correlation id shared with billing / request-log rows. */
    requestId: string;
    /** Generation name shown in Langfuse. */
    name: string;
    /** Extra observation metadata. */
    metadata?: Record<string, unknown>;
    /** Billing/identity owner of the request. Lifted to trace-level `userId`. */
    userId: string;
    /** Client-supplied conversation id (`x-kitsune-session-id`). Absent → user-only attribution. */
    sessionId?: string;
}
/** Parameters identifying the chat request a generation traces. */
export interface ChatGenerationInput extends Omit<GenerationInput, 'name' | 'metadata'> {
    /** OpenAI chat `messages` array (the prompt), recorded verbatim as trace input. */
    input: unknown;
    /** Whether the response is streamed (affects how output is captured). */
    stream: boolean;
}
/** Parameters identifying the TTS request a generation traces. */
export interface TtsGenerationInput extends Omit<GenerationInput, 'name' | 'metadata'> {
    /** Adapter-neutral TTS request payload, recorded as trace input. */
    input: {
        text: string;
        voice?: string;
        speed?: number;
        responseFormat?: string;
    };
}
/** Terminal usage/cost figures recorded when a chat generation completes successfully. */
export interface ChatGenerationResult {
    /**
     * Explicit completion to record. Omit for streaming requests to use the
     * assistant text assembled from the streamed SSE deltas.
     */
    output?: unknown;
    promptTokens?: number;
    completionTokens?: number;
    /** Kitsune AI business cost (flux). Stored in generation metadata, not `costDetails`. */
    fluxConsumed?: number;
}
/** Terminal usage/cost figures recorded when a TTS generation completes successfully. */
export interface TtsGenerationResult {
    /** Output metadata only; binary audio is not buffered into Langfuse. */
    output?: unknown;
    /** Input character count charged by the TTS flux meter. */
    inputChars: number;
    /** Kitsune AI business cost (flux). Stored in generation metadata, not `costDetails`. */
    fluxConsumed?: number;
    /** Additional terminal metadata to merge with request metadata. */
    metadata?: Record<string, unknown>;
}
/**
 * Lifecycle handle for one chat completion's Langfuse generation.
 *
 * Hides whether Langfuse is enabled (no-op when off), the SDK call shape, the
 * trace field mapping, and the streamed-output assembly. The owning route only
 * drives the domain lifecycle: feed stream chunks, then end with success or
 * failure exactly once (subsequent calls are ignored, so every transport exit
 * branch can call defensively without double-ending).
 */
export interface ChatGenerationTrace {
    /**
     * Feed one decoded chunk of streamed SSE text. Accumulates the assistant
     * completion for the trace `output`, bounded by the char cap. No-op for
     * non-streaming requests (which pass `output` to {@link ChatGenerationTrace.succeed}).
     */
    appendStreamChunk: (decodedChunk: string) => void;
    /** Record a successful completion with usage/cost and end the generation. */
    succeed: (result: ChatGenerationResult) => void;
    /** Record a failure (`level: ERROR` + message) and end the generation. */
    fail: (statusMessage: string) => void;
}
/** Lifecycle handle for one TTS Langfuse generation. */
export interface TtsGenerationTrace {
    /** Record a successful speech generation with character usage/cost and end the generation. */
    succeed: (result: TtsGenerationResult) => void;
    /** Record a failure (`level: ERROR` + message) and end the generation. */
    fail: (statusMessage: string) => void;
}
/**
 * Starts a Langfuse generation for a chat completion, or a no-op handle when
 * Langfuse tracing is disabled.
 *
 * Use when:
 * - Entering a chat completion handler that should be traced for prompt/eval/cost.
 *
 * Expects:
 * - Called once per request. `instrumentation.ts` has already wired the isolated
 *   Langfuse TracerProvider when tracing is active.
 *
 * Returns:
 * - A {@link ChatGenerationTrace} whose `succeed`/`fail` are idempotent; the
 *   first call ends the generation and later calls are ignored.
 */
export declare function startChatGeneration(input: ChatGenerationInput): ChatGenerationTrace;
/**
 * Starts a Langfuse generation for a TTS request, or a no-op handle when
 * Langfuse tracing is disabled.
 *
 * Use when:
 * - Entering the OpenAI-compatible `/audio/speech` handler.
 *
 * Expects:
 * - Binary audio is not buffered into Langfuse; callers pass output metadata
 *   such as content type instead.
 *
 * Returns:
 * - A {@link TtsGenerationTrace} whose `succeed`/`fail` are idempotent.
 */
export declare function startTtsGeneration(input: TtsGenerationInput): TtsGenerationTrace;

