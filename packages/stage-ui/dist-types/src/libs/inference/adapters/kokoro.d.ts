/**
 * Kokoro TTS inference adapter.
 *
 * Uses the unified inference protocol from protocol.ts.
 * The worker now speaks the same protocol — no translation layer needed.
 */
import type { VoiceKey, Voices } from '../../../workers/kokoro/types';
import type { ProgressPayload } from '../protocol';
export interface KokoroAdapter {
    /**
     * Load a TTS model with the given quantization and device.
     * Pass `options.signal` to cancel the load; the returned promise will
     * reject with `InferenceAbortError` (name: `'AbortError'`).
     */
    loadModel: (quantization: string, device: string, options?: {
        onProgress?: (p: ProgressPayload) => void;
        signal?: AbortSignal;
    }) => Promise<Voices>;
    /**
     * Generate speech audio from text.
     * Pass `options.signal` to cancel; rejects with `InferenceAbortError`.
     */
    generate: (text: string, voice: VoiceKey, options?: {
        signal?: AbortSignal;
    }) => Promise<ArrayBuffer>;
    /** Get the voices from the last loaded model */
    getVoices: () => Voices;
    /** Terminate the worker */
    terminate: () => void;
    /** Current state */
    readonly state: 'idle' | 'loading' | 'ready' | 'running' | 'error' | 'terminated';
    /**
     * Snapshot of the last successful load config, or null if never loaded.
     * `device` reflects the device actually used (post WASM promotion / worker
     * fallback), which may differ from the device requested by the caller.
     */
    readonly manifest: {
        quantization: string;
        device: string;
    } | null;
    /** Number of WebGPU device-loss events observed by this adapter */
    readonly deviceLossCount: number;
}
export declare function createKokoroAdapter(): KokoroAdapter;
/**
 * Get the global Kokoro adapter instance.
 * Creates and starts the worker on first call.
 * Automatically re-creates the adapter if it has entered a terminal state
 * ('terminated' or 'error' after max restarts exhausted).
 */
export declare function getKokoroAdapter(): Promise<KokoroAdapter>;
