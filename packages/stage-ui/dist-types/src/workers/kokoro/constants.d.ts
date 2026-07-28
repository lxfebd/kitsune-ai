/**
 * Kokoro TTS Constants
 * Centralized constants for Kokoro TTS to avoid duplication
 */
/**
 * Platform types for Kokoro models
 */
export type KokoroPlatform = 'webgpu' | 'wasm';
/**
 * Kokoro model definition
 */
export interface KokoroModel {
    /** Model identifier/quantization string */
    id: string;
    /** Human-readable name */
    name: string;
    /** Platform required to run this model */
    platform: KokoroPlatform;
    /** Quantization value to pass to loadModel */
    quantization: string;
    /** i18n key for model description */
    descriptionKey: string;
}
/**
 * Available Kokoro models with their platform requirements
 */
export declare const KOKORO_MODELS: readonly [{
    readonly id: "fp16-webgpu";
    readonly name: "FP16 (WebGPU)";
    readonly platform: "webgpu";
    readonly quantization: "fp16";
    readonly descriptionKey: "settings.pages.providers.provider.kokoro-local.models.fp16-webgpu.description";
}, {
    readonly id: "fp32-webgpu";
    readonly name: "FP32 (WebGPU)";
    readonly platform: "webgpu";
    readonly quantization: "fp32";
    readonly descriptionKey: "settings.pages.providers.provider.kokoro-local.models.fp32-webgpu.description";
}, {
    readonly id: "fp32";
    readonly name: "FP32 (WASM)";
    readonly platform: "wasm";
    readonly quantization: "fp32";
    readonly descriptionKey: "settings.pages.providers.provider.kokoro-local.models.fp32.description";
}, {
    readonly id: "fp16";
    readonly name: "FP16 (WASM)";
    readonly platform: "wasm";
    readonly quantization: "fp16";
    readonly descriptionKey: "settings.pages.providers.provider.kokoro-local.models.fp16.description";
}, {
    readonly id: "q8";
    readonly name: "Q8 (WASM)";
    readonly platform: "wasm";
    readonly quantization: "q8";
    readonly descriptionKey: "settings.pages.providers.provider.kokoro-local.models.q8.description";
}, {
    readonly id: "q4";
    readonly name: "Q4 (WASM)";
    readonly platform: "wasm";
    readonly quantization: "q4";
    readonly descriptionKey: "settings.pages.providers.provider.kokoro-local.models.q4.description";
}, {
    readonly id: "q4f16";
    readonly name: "Q4F16 (WASM)";
    readonly platform: "wasm";
    readonly quantization: "q4f16";
    readonly descriptionKey: "settings.pages.providers.provider.kokoro-local.models.q4f16.description";
}];
/**
 * Type for Kokoro quantization options
 */
export type KokoroQuantization = typeof KOKORO_MODELS[number]['id'];
/**
 * Convert Kokoro models to ModelInfo array
 * @param hasWebGPU - Whether WebGPU is available (filters out WebGPU models if false)
 * @param t - Optional translation function for i18n support
 * @param fp16Supported - Whether fp16 shader operations are supported (filters out fp16-webgpu if false)
 * @returns Array of ModelInfo objects
 */
export declare function kokoroModelsToModelInfo(hasWebGPU: boolean, t?: (key: string) => string, fp16Supported?: boolean): {
    id: "fp16-webgpu" | "fp16" | "fp32-webgpu" | "fp32" | "q8" | "q4" | "q4f16";
    name: "FP16 (WebGPU)" | "FP32 (WebGPU)" | "FP32 (WASM)" | "FP16 (WASM)" | "Q8 (WASM)" | "Q4 (WASM)" | "Q4F16 (WASM)";
    provider: string;
    description: string;
}[];
/**
 * Get the default model based on WebGPU availability
 * @param hasWebGPU - Whether WebGPU is available
 * @returns The default model to use
 */
export declare function getDefaultKokoroModel(hasWebGPU: boolean, fp16Supported?: boolean): KokoroQuantization;
