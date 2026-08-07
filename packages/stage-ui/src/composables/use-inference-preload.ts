/**
 * Inference model preloading composable.
 *
 * Reads the user's provider configuration and preloads local inference
 * models (Whisper ASR) in the background after a delay.
 * Only preloads models whose providers are configured and added by the user.
 *
 * Call `triggerPreload()` once during app initialization (e.g. in App.vue
 * onMounted, after stores are initialized).
 */

import { detectWebGPU } from '@kitsune/stage-shared/webgpu'

import { useModelPreload } from './use-model-preload'

export interface UseInferencePreloadOptions {
  /** Delay in ms before starting preloads (default: 3000) */
  delayMs?: number
}

export function useInferencePreload(options: UseInferencePreloadOptions = {}) {
  const { delayMs = 3000 } = options

  const preload = useModelPreload({ delayMs })

  /**
   * Check provider configuration and schedule preloads for any
   * configured local inference providers.
   *
   * Should be called once after app stores are initialized.
   */
  async function triggerPreload(): Promise<void> {
    // Ensure WebGPU capabilities are cached for downstream use
    await detectWebGPU()

    const tasks: { modelId: string, loader: (signal: AbortSignal) => Promise<void> }[] = []

    // NOTICE: Whisper preloading is intentionally omitted here.
    // Whisper's model (~800 MB) is too large to preload eagerly —
    // it should only be loaded when the user explicitly enables ASR.
    // If this changes in the future, add a similar block checking
    // for a configured 'whisper-local' provider.

    if (tasks.length > 0) {
      preload.schedulePreload(tasks)
    }
  }

  return {
    ...preload,
    triggerPreload,
  }
}
