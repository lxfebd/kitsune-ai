/**
 * Background removal Web Worker.
 *
 * Runs the Xenova/modnet model inference off the main thread.
 * Uses the unified inference protocol from protocol.ts.
 */
export interface BackgroundRemovalInput {
    imageData: Uint8ClampedArray;
    width: number;
    height: number;
}
export interface BackgroundRemovalOutput {
    maskData: Uint8Array;
    width: number;
    height: number;
}
