/**
 * Minimum chunk size for processing audio
 */
declare const MIN_CHUNK_SIZE = 512;
/**
 * Global state for audio buffer accumulation
 */
declare let globalPointer: number;
declare const globalBuffer: Float32Array<ArrayBuffer>;
/**
 * VAD AudioWorklet Processor - processes audio chunks and sends them to the main thread
 */
declare class VADProcessor extends AudioWorkletProcessor {
    process(inputs: Float32Array[][], _outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean;
}
