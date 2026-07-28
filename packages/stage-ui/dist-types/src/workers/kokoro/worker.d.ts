/**
 * Kokoro TTS Web Worker Entry Point
 *
 * Uses the unified inference protocol from protocol.ts.
 * Domain-specific messages (getVoices) are handled via RunInferenceRequest.
 */
import type { VoiceKey, Voices } from './types';
export interface KokoroGenerateInput {
    action: 'generate';
    text: string;
    voice: VoiceKey;
}
export interface KokoroGetVoicesInput {
    action: 'getVoices';
}
export type KokoroInferenceInput = KokoroGenerateInput | KokoroGetVoicesInput;
export interface KokoroGenerateOutput {
    action: 'generate';
    samples: Float32Array;
    samplingRate: number;
}
export interface KokoroVoicesOutput {
    action: 'getVoices';
    voices: Voices;
}
export type KokoroInferenceOutput = KokoroGenerateOutput | KokoroVoicesOutput;
