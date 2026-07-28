/**
 * GPU resource coordinator.
 *
 * Bookkeeping layer that tracks estimated GPU memory allocation
 * across inference models. Advisory — does not own the actual
 * GPUDevice (workers manage their own via transformers.js).
 *
 * Emits memory pressure events when allocation nears the budget
 * so consumers can decide to unload LRU models or fall back to WASM.
 *
 * Also records device-loss telemetry so adapters can coordinate
 * cross-model WASM fallback decisions.
 */
import type { DeviceLossReason } from './protocol';
export type MemoryPressureLevel = 'warning' | 'critical';
export interface AllocationToken {
    modelId: string;
    bytes: number;
    allocatedAt: number;
    lastUsedAt: number;
}
export interface GPUResourceUsage {
    /** Total bytes currently allocated (sum of all tokens) */
    allocated: number;
    /** Estimated budget in bytes */
    budget: number;
    /** Currently loaded model IDs */
    models: string[];
}
export interface DeviceLossEvent {
    modelId: string;
    reason: DeviceLossReason;
    occurredAt: number;
}
export interface DeviceLossMetrics {
    /** Total device-loss events recorded across all models */
    totalCount: number;
    /** Per-model device-loss counts */
    byModel: Record<string, number>;
    /** Most recent event, or null if none recorded */
    lastEvent: DeviceLossEvent | null;
}
export interface GPUResourceCoordinator {
    /**
     * Request an allocation for a model.
     * Returns the token. May trigger memory pressure events if over budget.
     */
    requestAllocation: (modelId: string, estimatedBytes: number) => AllocationToken;
    /** Release a previously allocated token */
    release: (token: AllocationToken) => void;
    /** Mark a model as recently used (updates LRU ordering) */
    touch: (modelId: string) => void;
    /** Get current resource usage */
    getUsage: () => GPUResourceUsage;
    /**
     * Get the least-recently-used model ID, or null if none loaded.
     * Useful for deciding which model to unload under pressure.
     */
    getLRUModel: () => string | null;
    /**
     * Subscribe to memory pressure events.
     * Returns an unsubscribe function.
     */
    onMemoryPressure: (handler: (level: MemoryPressureLevel) => void) => () => void;
    /**
     * Record a WebGPU device-loss event. Adapters call this from their error
     * handlers when they detect a DEVICE_LOST error so the coordinator can
     * maintain cross-model telemetry.
     */
    recordDeviceLoss: (event: DeviceLossEvent) => void;
    /** Get current device-loss telemetry across all models */
    getDeviceLossMetrics: () => DeviceLossMetrics;
    /**
     * Subscribe to device-loss events. Fired after `recordDeviceLoss()`.
     * Returns an unsubscribe function.
     */
    onDeviceLoss: (handler: (event: DeviceLossEvent) => void) => () => void;
}
export declare function createGPUResourceCoordinator(estimatedVRAM: number): GPUResourceCoordinator;
