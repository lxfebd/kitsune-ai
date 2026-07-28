/**
 * Unified inference worker message protocol.
 *
 * All inference workers (Kokoro, Whisper, background-removal, etc.)
 * communicate with the main thread through this typed protocol.
 * Each adapter maps its domain-specific messages to/from these types.
 *
 * ## Architecture Note: GPU Device Isolation
 *
 * Each Web Worker creates its own GPUDevice via `navigator.gpu.requestAdapter()`.
 * WebGPU does not support sharing a GPUDevice across workers — this is a platform
 * limitation, not a design choice. To mitigate the cost of multiple device contexts:
 *
 * - **LoadQueue** ensures only one model loads at a time (prevents bandwidth/VRAM spikes)
 * - **GPUResourceCoordinator** tracks estimated VRAM across all models and emits
 *   memory pressure events so the app can unload LRU models when nearing budget
 * - Workers auto-detect WebGPU availability and fall back to WASM when unavailable
 */
export type ProgressPhase = 'download' | 'compile' | 'warmup' | 'inference';
export interface ProgressPayload {
    phase: ProgressPhase;
    /**
     * Progress percentage, normalized to 0-100 range.
     * Use -1 when the progress is indeterminate.
     *
     * Adapters are responsible for normalizing worker-specific ranges:
     * - @huggingface/transformers progress_callback: already 0-100
     * - Whisper status 'progress': 0-1 → multiply by 100
     */
    percent: number;
    /** Optional human-readable status */
    message?: string;
    /** File being downloaded (for download phase) */
    file?: string;
    /** Bytes loaded / total (for download phase) */
    loaded?: number;
    total?: number;
}
export type InferenceErrorCode = 'OOM' | 'TIMEOUT' | 'DEVICE_LOST' | 'LOAD_FAILED' | 'INFERENCE_FAILED' | 'CANCELLED' | 'UNKNOWN';
export interface ErrorPayload {
    code: InferenceErrorCode;
    message: string;
    /** Whether the operation can be retried (e.g. with WASM fallback) */
    recoverable: boolean;
}
export interface LoadModelRequest {
    type: 'load-model';
    requestId: string;
    modelId: string;
    device: 'webgpu' | 'wasm' | 'cpu';
    dtype?: string;
    /** Adapter-specific options passed through opaquely */
    options?: Record<string, unknown>;
}
export interface RunInferenceRequest<TInput = unknown> {
    type: 'run-inference';
    requestId: string;
    input: TInput;
}
export interface UnloadModelRequest {
    type: 'unload-model';
    requestId: string;
}
/**
 * Cancel an in-flight or queued request. The worker should stop any
 * ongoing work tied to `targetRequestId` and must NOT send a normal
 * `model-ready` / `inference-result` response for that request; instead
 * it should send an `ErrorResponse` with code `'CANCELLED'` so the
 * adapter can reject the caller's promise deterministically.
 *
 * NOTE: Cancellation is best-effort. We cannot interrupt a synchronous
 * transformers.js / ONNX Runtime call that is already executing on the
 * worker thread. What the cancel signal does guarantee is that the
 * adapter stops waiting and the worker discards the result when it
 * eventually arrives.
 */
export interface CancelRequest {
    type: 'cancel';
    requestId: string;
    /** The requestId of the operation to cancel */
    targetRequestId: string;
}
export type WorkerInboundMessage<TInput = unknown> = LoadModelRequest | RunInferenceRequest<TInput> | UnloadModelRequest | CancelRequest;
export interface ModelReadyResponse {
    type: 'model-ready';
    requestId: string;
    modelId: string;
    device: 'webgpu' | 'wasm' | 'cpu';
    /** Domain-specific metadata (e.g. Kokoro voices) */
    metadata?: Record<string, unknown>;
}
export interface InferenceResultResponse<TOutput = unknown> {
    type: 'inference-result';
    requestId: string;
    output: TOutput;
    /** Worker-side timing in milliseconds */
    durationMs?: number;
}
export interface ProgressResponse {
    type: 'progress';
    requestId: string;
    payload: ProgressPayload;
}
export interface ErrorResponse {
    type: 'error';
    requestId: string;
    payload: ErrorPayload;
}
export interface ModelUnloadedResponse {
    type: 'model-unloaded';
    requestId: string;
}
export type WorkerOutboundMessage<TOutput = unknown> = ModelReadyResponse | InferenceResultResponse<TOutput> | ProgressResponse | ErrorResponse | ModelUnloadedResponse;
/** Generate a lightweight unique request ID */
export declare function createRequestId(): string;
/**
 * Classify an unknown error into an `InferenceErrorCode`.
 * Used by worker adapters to normalise caught exceptions.
 *
 * Specific error patterns (OOM, DEVICE_LOST, TIMEOUT) take priority
 * over the `phase` hint. When no specific pattern matches, `phase`
 * determines whether the code is `LOAD_FAILED` or `INFERENCE_FAILED`.
 */
export declare function classifyError(error: unknown, phase?: 'load' | 'inference'): InferenceErrorCode;
/** Reason classification for a device-loss event, following `GPUDeviceLostInfo.reason`. */
export type DeviceLossReason = 'destroyed' | 'unknown';
/**
 * Best-effort classification of a device-loss reason from an error message
 * or a `GPUDeviceLostInfo`-shaped object. 'destroyed' implies intentional
 * termination (no recovery); 'unknown' implies a transient event that may
 * be recoverable via adapter restart or WASM fallback.
 */
export declare function classifyDeviceLossReason(error: unknown): DeviceLossReason;
/**
 * Determine whether an error code represents a potentially recoverable
 * condition. TIMEOUT and DEVICE_LOST may succeed on retry (e.g. with
 * WASM fallback or after device re-acquisition).
 */
export declare function isRecoverable(code: InferenceErrorCode): boolean;
/**
 * Canonical error thrown by inference adapters when an operation is
 * cancelled via AbortSignal. Matches the DOM convention of `name === 'AbortError'`
 * so existing `if (err.name === 'AbortError')` checks work unchanged.
 */
export declare class InferenceAbortError extends Error {
    readonly name = "AbortError";
    readonly code: "CANCELLED";
    constructor(message?: string);
}
/** Throw `InferenceAbortError` if the signal is already aborted. */
export declare function throwIfAborted(signal: AbortSignal | undefined): void;
