/**
 * Generic inference worker manager.
 *
 * Provides lifecycle management (start / restart / terminate), request
 * serialisation via async-mutex, timeout handling, and a unified
 * message protocol for any inference worker.
 *
 * NOTICE: Currently not consumed by any adapter. Adapters implement their
 * own lifecycle management directly. This module is retained as a reusable
 * building block for future adapters that need generic worker management.
 */
import type { ErrorPayload, LoadModelRequest, ModelReadyResponse, ProgressPayload } from './protocol';
export type WorkerManagerState = 'idle' | 'loading' | 'ready' | 'running' | 'error' | 'terminated';
export interface WorkerManagerOptions {
    /** Factory that creates a fresh Worker instance */
    createWorker: () => Worker;
    /** Timeout for model loading in ms (default 120 000) */
    loadTimeout?: number;
    /** Timeout for a single inference call in ms (default 120 000) */
    inferenceTimeout?: number;
    /** Maximum automatic restart attempts after worker errors (default 3) */
    maxRestarts?: number;
    /** Base delay between restarts in ms; multiplied by attempt number (default 1 000) */
    restartDelayMs?: number;
}
export interface InferenceWorkerManager {
    /**
     * Load a model in the worker.
     * Returns domain-specific metadata (e.g. Kokoro voices list).
     */
    loadModel: (request: Omit<LoadModelRequest, 'type' | 'requestId'>, onProgress?: (p: ProgressPayload) => void) => Promise<ModelReadyResponse>;
    /**
     * Run inference with the currently loaded model.
     * `TInput` / `TOutput` are opaque to the manager — the adapter defines them.
     */
    run: <TInput, TOutput>(input: TInput, onProgress?: (p: ProgressPayload) => void) => Promise<TOutput>;
    /** Unload the current model but keep the worker alive */
    unload: () => Promise<void>;
    /** Terminate the worker entirely */
    terminate: () => void;
    /** Current state */
    readonly state: WorkerManagerState;
    /** Last error, if any */
    readonly lastError: ErrorPayload | null;
}
export declare function createInferenceWorkerManager(options: WorkerManagerOptions): InferenceWorkerManager;
