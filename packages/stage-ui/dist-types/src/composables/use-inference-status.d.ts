/**
 * Reactive inference model status composable.
 *
 * Provides a centralised, reactive view of all inference models
 * (Kokoro TTS, Whisper ASR, background removal, etc.) so UI
 * components can display loading progress and state without
 * coupling to individual adapters.
 */
import type { ErrorPayload, ProgressPayload } from '../libs/inference/protocol';
export type InferenceModelState = 'idle' | 'downloading' | 'compiling' | 'warming-up' | 'ready' | 'running' | 'error';
export interface InferenceModelStatus {
    modelId: string;
    state: InferenceModelState;
    progress?: ProgressPayload;
    error?: ErrorPayload;
    device: 'webgpu' | 'wasm' | 'cpu' | 'unknown';
}
/**
 * Update the status of an inference model.
 * Called by adapters to push state changes into the shared status map.
 */
export declare function updateInferenceStatus(modelId: string, update: Partial<Omit<InferenceModelStatus, 'modelId'>>): void;
/**
 * Remove a model from the status map (e.g. when unloaded).
 */
export declare function removeInferenceStatus(modelId: string): void;
export declare function useInferenceStatus(): {
    models: import("vue").ComputedRef<InferenceModelStatus[]>;
    isAnyLoading: import("vue").ComputedRef<boolean>;
    totalProgress: import("vue").ComputedRef<number>;
};
