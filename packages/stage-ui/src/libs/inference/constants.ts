/**
 * Centralized constants for the inference pipeline.
 *
 * Model IDs, timeout values, and retry parameters shared across
 * all adapters and workers.
 */

// ---------------------------------------------------------------------------
// Model IDs
// ---------------------------------------------------------------------------

/** HuggingFace model repository identifiers */
export const MODEL_IDS = {
  KOKORO: 'onnx-community/Kokoro-82M-v1.0-ONNX',
  // NOTICE: This is a desktop-pet product, so local ASR must stay light on
  // GPU/CPU. whisper-tiny (39M params) is the DEFAULT — tiny VRAM footprint and
  // fast on both WebGPU (q8) and CPU/WASM (q8). whisper-base (74M) is the
  // middle ground (more accurate than tiny, lighter than small). whisper-small
  // (244M) is offered for users who explicitly want higher accuracy and have
  // spare VRAM, but it is NOT the default because its WebGPU footprint is far
  // larger — exactly the "7 GB+" blow-up we want to avoid for a pet.
  WHISPER_TINY: 'onnx-community/whisper-tiny',
  WHISPER_BASE: 'onnx-community/whisper-base',
  WHISPER: 'onnx-community/whisper-small',
  BG_REMOVAL: 'Xenova/modnet',
} as const

/** Short model identifiers used in adapter state tracking and logging */
export const MODEL_NAMES = {
  KOKORO: 'kokoro-82m',
  WHISPER_TINY: 'whisper-tiny',
  WHISPER_BASE: 'whisper-base',
  WHISPER: 'whisper-small',
  BG_REMOVAL: 'modnet',
} as const

// ---------------------------------------------------------------------------
// Timeouts (ms)
// ---------------------------------------------------------------------------

export const TIMEOUTS = {
  /** Kokoro model load timeout */
  KOKORO_LOAD: 120_000,
  /** Kokoro audio generation timeout */
  KOKORO_GENERATE: 120_000,

  /** Whisper model load timeout (larger model, allow more time) */
  WHISPER_LOAD: 180_000,
  /** Whisper transcription timeout */
  WHISPER_TRANSCRIBE: 120_000,

  /** Background removal model load timeout */
  BG_REMOVAL_LOAD: 120_000,
  /** Background removal per-image processing timeout */
  BG_REMOVAL_PROCESS: 60_000,
} as const

// ---------------------------------------------------------------------------
// Restart / Retry
// ---------------------------------------------------------------------------

/** Maximum number of automatic worker restarts before giving up */
export const MAX_RESTARTS = 3

/** Base delay in ms between restart attempts (multiplied by attempt number) */
export const RESTART_DELAY_MS = 1_000

// ---------------------------------------------------------------------------
// Device loss resilience
// ---------------------------------------------------------------------------

/**
 * Number of WebGPU device-loss events an adapter tolerates before proactively
 * promoting subsequent loads to WASM. A single device loss may be transient
 * (driver reset, GPU process crash), but repeated losses indicate the WebGPU
 * path is unreliable on this device and WASM is safer.
 */
export const DEVICE_LOSS_WASM_THRESHOLD = 2

// ---------------------------------------------------------------------------
// Idle timeout (ms)
// ---------------------------------------------------------------------------

/**
 * Idle timeout for auto-unloading models after no inference requests.
 * This helps reduce GPU memory usage on low-end machines.
 * Set to 0 to disable auto-unload.
 */
// NOTICE: Idle unload disabled — whisper-small runs on WASM (CPU) and does not
// consume GPU memory. Keeping the model loaded avoids re-downloading/re-warming
// on every transcription request. Set to a positive value (e.g., 5 * 60 * 1000)
// to auto-unload after inactivity if running on WebGPU.
export const IDLE_UNLOAD_TIMEOUT = 0
