/**
 * Whisper ASR Web Worker.
 *
 * Uses the unified inference protocol from protocol.ts.
 * Streaming token updates are sent as progress messages with phase 'inference'.
 */
import type { ModelOutput, Tensor } from '@huggingface/transformers';
export interface WhisperInput {
    /** @deprecated Use audioFloat32 instead */
    audio?: string;
    audioFloat32?: Float32Array;
    language: string;
}
export interface WhisperOutput {
    text: string[];
}
/** Streaming update sent during transcription as a progress message */
export interface WhisperStreamUpdate {
    output: ModelOutput | Tensor;
    tps?: number;
    numTokens: number;
}
