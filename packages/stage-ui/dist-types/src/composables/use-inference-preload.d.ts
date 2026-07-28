/**
 * Inference model preloading composable.
 *
 * Reads the user's provider configuration and preloads local inference
 * models (Kokoro TTS, Whisper ASR) in the background after a delay.
 * Only preloads models whose providers are configured and added by the user.
 *
 * Call `triggerPreload()` once during app initialization (e.g. in App.vue
 * onMounted, after stores are initialized).
 */
export interface UseInferencePreloadOptions {
    /** Delay in ms before starting preloads (default: 3000) */
    delayMs?: number;
}
export declare function useInferencePreload(options?: UseInferencePreloadOptions): {
    triggerPreload: () => Promise<void>;
    preloading: import("vue").Ref<boolean, boolean>;
    preloadedModels: import("vue").Ref<string[], string[]>;
    failedModels: import("vue").Ref<string[], string[]>;
    schedulePreload: (tasks: import("./use-model-preload").PreloadTask[]) => void;
    cancelPreload: () => void;
};
