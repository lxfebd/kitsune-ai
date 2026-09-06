/**
 * Reactive inference model status composable.
 *
 * Provides a centralised, reactive view of all inference models
 * (Kokoro TTS, Whisper ASR, background removal, etc.) so UI
 * components can display loading progress and state without
 * coupling to individual adapters.
 */

import type { ErrorPayload, ProgressPayload } from '../libs/inference/protocol'

import { computed, reactive } from 'vue'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InferenceModelState
  = | 'idle'
    | 'downloading'
    | 'loading'
    | 'compiling'
    | 'warming-up'
    | 'ready'
    | 'running'
    | 'error'

export interface InferenceModelStatus {
  modelId: string
  state: InferenceModelState
  progress?: ProgressPayload
  error?: ErrorPayload
  device: 'webgpu' | 'wasm' | 'cpu' | 'unknown'
}

// ---------------------------------------------------------------------------
// Shared state (module-scoped singleton)
// ---------------------------------------------------------------------------

const statusMap = reactive(new Map<string, InferenceModelStatus>())

// ---------------------------------------------------------------------------
// Mutation API (used by adapters)
// ---------------------------------------------------------------------------

/**
 * Update the status of an inference model.
 * Called by adapters to push state changes into the shared status map.
 * When a model reaches 'ready' state, it is auto-removed after a short delay
 * so the progress toast disappears automatically.
 */
export function updateInferenceStatus(
  modelId: string,
  update: Partial<Omit<InferenceModelStatus, 'modelId'>>,
): void {
  const existing = statusMap.get(modelId)
  if (existing) {
    Object.assign(existing, update)
  }
  else {
    statusMap.set(modelId, {
      modelId,
      state: 'idle',
      device: 'unknown',
      ...update,
    })
  }

  // Auto-remove 'ready' state after 5 seconds so the progress toast disappears.
  // The model is still loaded in the adapter; this only clears the UI notification.
  if (update.state === 'ready') {
    setTimeout(() => {
      const current = statusMap.get(modelId)
      if (current && current.state === 'ready') {
        statusMap.delete(modelId)
      }
    }, 5_000)
  }
}

/**
 * Remove a model from the status map (e.g. when unloaded).
 */
export function removeInferenceStatus(modelId: string): void {
  statusMap.delete(modelId)
}

// ---------------------------------------------------------------------------
// Composable (used by UI components)
// ---------------------------------------------------------------------------

export function useInferenceStatus() {
  const models = computed<InferenceModelStatus[]>(() =>
    Array.from(statusMap.values()),
  )

  const isAnyLoading = computed(() =>
    models.value.some(m =>
      m.state === 'downloading'
      || m.state === 'loading'
      || m.state === 'compiling'
      || m.state === 'warming-up',
    ),
  )

  const totalProgress = computed(() => {
    const loadingModels = models.value.filter(m =>
      m.state === 'downloading'
      || m.state === 'loading'
      || m.state === 'compiling'
      || m.state === 'warming-up',
    )
    if (loadingModels.length === 0)
      return 100

    const sum = loadingModels.reduce((acc, m) => {
      const p = m.progress?.percent ?? 0
      return acc + (p >= 0 ? p : 0)
    }, 0)

    return Math.round(sum / loadingModels.length)
  })

  return {
    models,
    isAnyLoading,
    totalProgress,
  }
}
