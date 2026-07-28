/**
 * Model loading queue.
 *
 * Ensures only one model loads at a time to prevent bandwidth
 * competition and GPU memory spikes. Higher priority loads
 * are dequeued first.
 *
 * Default priorities: TTS = 10, ASR = 5, BackgroundRemoval = 1.
 *
 * Cancellation: pass an `AbortSignal` in `enqueueOptions` to `enqueue()`.
 * When aborted, the entry is removed from the pending queue (if not yet
 * active) and its promise is rejected with `InferenceAbortError`. If the
 * entry is already running, the loader itself is responsible for honoring
 * the same signal and rejecting accordingly — the queue cannot interrupt
 * an in-flight async loader.
 */
export interface EnqueueOptions {
    /** Abort the enqueued load. Rejects the returned promise with `InferenceAbortError`. */
    signal?: AbortSignal;
}
export interface LoadQueue {
    /**
     * Enqueue a model load. Returns a promise that resolves when
     * the loader completes. If another load is in progress, this
     * one waits in a priority queue.
     */
    enqueue: <T>(modelId: string, priority: number, loader: () => Promise<T>, options?: EnqueueOptions) => Promise<T>;
    /** Model IDs waiting in the queue */
    readonly pending: string[];
    /** Model ID currently loading, or null */
    readonly active: string | null;
}
export declare function createLoadQueue(): LoadQueue;
export declare const LOAD_PRIORITY: {
    readonly TTS: 10;
    readonly ASR: 5;
    readonly BACKGROUND_REMOVAL: 1;
};
