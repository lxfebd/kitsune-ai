/**
 * Background removal inference adapter.
 *
 * Offloads Xenova/modnet inference to a Web Worker so the main
 * thread is not blocked during image processing.
 * Uses the unified inference protocol from protocol.ts.
 */
import type { ProgressPayload } from '../protocol';
export interface BackgroundRemovalAdapter {
    /**
     * Load the background removal model in the worker.
     * Must be called before `processImage()`.
     * Pass `options.signal` to cancel; rejects with `InferenceAbortError`.
     */
    load: (onProgress?: (p: ProgressPayload) => void, options?: {
        signal?: AbortSignal;
    }) => Promise<void>;
    /**
     * Remove the background from an image.
     * Returns a new ImageData with the background alpha set to 0.
     * Pass `options.signal` to cancel; rejects with `InferenceAbortError`.
     */
    processImage: (imageData: ImageData, options?: {
        signal?: AbortSignal;
    }) => Promise<ImageData>;
    /** Terminate the worker */
    terminate: () => void;
    /** Current state */
    readonly state: 'idle' | 'loading' | 'ready' | 'processing' | 'error' | 'terminated';
}
export declare function createBackgroundRemovalAdapter(): BackgroundRemovalAdapter;
