/**
 * Global GPU resource coordinator singleton.
 *
 * Lazily initialized with detected VRAM from WebGPU capabilities.
 * All inference adapters should use this coordinator to track
 * their GPU memory allocations.
 */
import type { GPUResourceCoordinator } from './gpu-resource-coordinator';
import type { LoadQueue } from './load-queue';
/**
 * Get the global GPU resource coordinator.
 * Initializes lazily from cached WebGPU capabilities.
 */
export declare function getGPUCoordinator(): GPUResourceCoordinator;
/**
 * Get the global model load queue.
 * Ensures only one model loads at a time to prevent
 * bandwidth competition and GPU memory spikes.
 */
export declare function getLoadQueue(): LoadQueue;
export declare const MODEL_VRAM_ESTIMATES: Record<string, number>;
