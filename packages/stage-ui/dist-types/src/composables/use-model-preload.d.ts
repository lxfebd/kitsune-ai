/**
 * Model preloading composable.
 *
 * Allows the app to preload inference models during idle time,
 * so they're ready before the user first needs them.
 * Uses `setTimeout` to defer loading and avoid blocking the main
 * thread during app startup.
 *
 * Cancellation uses an AbortController so the signal can be forwarded
 * to adapter methods that accept `options.signal` — a cancelled preload
 * aborts any in-flight model load instead of just ignoring the result.
 */
export interface PreloadTask {
    /** Human-readable model name for logging */
    modelId: string;
    /**
     * The async function that loads the model. Receives an `AbortSignal`
     * that will fire if the preload is cancelled; loaders should forward
     * it to adapter methods (e.g. `adapter.loadModel(q, d, { signal })`).
     */
    loader: (signal: AbortSignal) => Promise<void>;
}
export interface UseModelPreloadOptions {
    /** Delay in ms before starting preloads (default: 2000) */
    delayMs?: number;
}
export declare function useModelPreload(options?: UseModelPreloadOptions): {
    /** Whether a preload is currently in progress */
    preloading: import("vue").Ref<boolean, boolean>;
    /** Model IDs that have been successfully preloaded */
    preloadedModels: import("vue").Ref<string[], string[]>;
    /** Model IDs that failed to preload (non-fatal) */
    failedModels: import("vue").Ref<string[], string[]>;
    /** Schedule models for idle-time preloading */
    schedulePreload: (tasks: PreloadTask[]) => void;
    /** Cancel any pending or in-progress preloads */
    cancelPreload: () => void;
};
