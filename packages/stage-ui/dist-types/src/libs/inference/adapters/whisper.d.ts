/**
 * Whisper ASR inference adapter.
 *
 * Uses the unified inference protocol from protocol.ts.
 * Preserves the onMessage API for streaming UI updates by forwarding
 * unified protocol messages to subscribers.
 */
import type { ProgressPayload } from '../protocol';
export type WhisperState = 'idle' | 'loading' | 'ready' | 'transcribing' | 'error' | 'terminated';
export interface WhisperTranscribeInput {
    audio?: string;
    audioFloat32?: Float32Array;
    language: string;
}
/**
 * Unified message events for Whisper, based on protocol.ts types.
 * These replace the old status-based MessageEvents.
 */
export type WhisperEvent = {
    type: 'progress';
    payload: ProgressPayload & Record<string, unknown>;
} | {
    type: 'model-ready';
} | {
    type: 'inference-result';
    output: {
        text: string[];
    };
} | {
    type: 'error';
    payload: {
        code: string;
        message: string;
    };
};
export interface WhisperAdapter {
    /**
     * Load the Whisper model.
     * Pass `options.signal` to cancel the load; rejects with `InferenceAbortError`.
     */
    load: (onProgress?: (p: ProgressPayload) => void, options?: {
        signal?: AbortSignal;
    }) => Promise<void>;
    /**
     * Transcribe audio, returning the text result.
     * Pass `options.signal` to cancel; rejects with `InferenceAbortError`.
     */
    transcribe: (input: WhisperTranscribeInput, options?: {
        signal?: AbortSignal;
    }) => Promise<string>;
    /** Terminate the worker */
    terminate: () => void;
    /** Current state */
    readonly state: WhisperState;
    /**
     * Subscribe to unified protocol events for streaming UI updates.
     * Returns an unsubscribe function.
     */
    onMessage: (handler: (event: WhisperEvent) => void) => () => void;
    /**
     * Snapshot of the last successful load, or null if never loaded.
     * `device` reflects what the worker actually used (post-fallback).
     */
    readonly manifest: {
        device: string;
    } | null;
    /** Number of WebGPU device-loss events observed by this adapter */
    readonly deviceLossCount: number;
}
export declare function createWhisperAdapter(workerUrl: string | URL): WhisperAdapter;
