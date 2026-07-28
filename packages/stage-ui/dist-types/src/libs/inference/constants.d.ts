/**
 * Centralized constants for the inference pipeline.
 *
 * Model IDs, timeout values, and retry parameters shared across
 * all adapters and workers.
 */
/** HuggingFace model repository identifiers */
export declare const MODEL_IDS: {
    readonly KOKORO: "onnx-community/Kokoro-82M-v1.0-ONNX";
    readonly WHISPER: "onnx-community/whisper-large-v3-turbo";
    readonly BG_REMOVAL: "Xenova/modnet";
};
/** Short model identifiers used in adapter state tracking and logging */
export declare const MODEL_NAMES: {
    readonly KOKORO: "kokoro-82m";
    readonly WHISPER: "whisper-large-v3-turbo";
    readonly BG_REMOVAL: "modnet";
};
export declare const TIMEOUTS: {
    /** Kokoro model load timeout */
    readonly KOKORO_LOAD: 120000;
    /** Kokoro audio generation timeout */
    readonly KOKORO_GENERATE: 120000;
    /** Whisper model load timeout (larger model, allow more time) */
    readonly WHISPER_LOAD: 180000;
    /** Whisper transcription timeout */
    readonly WHISPER_TRANSCRIBE: 120000;
    /** Background removal model load timeout */
    readonly BG_REMOVAL_LOAD: 120000;
    /** Background removal per-image processing timeout */
    readonly BG_REMOVAL_PROCESS: 60000;
};
/** Maximum number of automatic worker restarts before giving up */
export declare const MAX_RESTARTS = 3;
/** Base delay in ms between restart attempts (multiplied by attempt number) */
export declare const RESTART_DELAY_MS = 1000;
/**
 * Number of WebGPU device-loss events an adapter tolerates before proactively
 * promoting subsequent loads to WASM. A single device loss may be transient
 * (driver reset, GPU process crash), but repeated losses indicate the WebGPU
 * path is unreliable on this device and WASM is safer.
 */
export declare const DEVICE_LOSS_WASM_THRESHOLD = 2;
