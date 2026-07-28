/**
 * Whisper ASR inference adapter.
 *
 * Uses the unified inference protocol from protocol.ts.
 * Preserves the onMessage API for streaming UI updates by forwarding
 * unified protocol messages to subscribers.
 */

import type { AllocationToken } from '../gpu-resource-coordinator'
import type { ProgressPayload } from '../protocol'

import { getCachedWebGPUCapabilities } from '@kitsune/stage-shared/webgpu'
import { defaultPerfTracer } from '@kitsune/stage-shared'
import { Mutex } from 'async-mutex'

import { removeInferenceStatus, updateInferenceStatus } from '../../../composables/use-inference-status'
import { DEVICE_LOSS_WASM_THRESHOLD, IDLE_UNLOAD_TIMEOUT, MAX_RESTARTS, MODEL_IDS, MODEL_NAMES, RESTART_DELAY_MS, TIMEOUTS } from '../constants'
import { getGPUCoordinator, getLoadQueue, MODEL_VRAM_ESTIMATES } from '../coordinator'
import { LOAD_PRIORITY } from '../load-queue'
import { classifyDeviceLossReason, classifyError, createRequestId, InferenceAbortError, throwIfAborted } from '../protocol'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WhisperState
  = | 'idle'
    | 'loading'
    | 'ready'
    | 'transcribing'
    | 'error'
    | 'terminated'

export interface WhisperTranscribeInput {
  audio?: string
  audioFloat32?: Float32Array
  language: string
}

/**
 * Unified message events for Whisper, based on protocol.ts types.
 * These replace the old status-based MessageEvents.
 */
export type WhisperEvent
  = | { type: 'progress', payload: ProgressPayload & Record<string, unknown> }
    | { type: 'model-ready' }
    | { type: 'inference-result', output: { text: string[] } }
    | { type: 'error', payload: { code: string, message: string } }

export interface WhisperAdapter {
  /**
   * Load the Whisper model.
   * Pass `options.signal` to cancel the load; rejects with `InferenceAbortError`.
   */
  load: (
    onProgress?: (p: ProgressPayload) => void,
    options?: { signal?: AbortSignal, modelId?: string },
  ) => Promise<void>

  /**
   * Transcribe audio, returning the text result.
   * Pass `options.signal` to cancel; rejects with `InferenceAbortError`.
   */
  transcribe: (
    input: WhisperTranscribeInput,
    options?: { signal?: AbortSignal },
  ) => Promise<string>

  /** Terminate the worker */
  terminate: () => void

  /** Current state */
  readonly state: WhisperState

  /**
   * Subscribe to unified protocol events for streaming UI updates.
   * Returns an unsubscribe function.
   */
  onMessage: (handler: (event: WhisperEvent) => void) => () => void

  /**
   * Snapshot of the last successful load, or null if never loaded.
   * `device` reflects what the worker actually used (post-fallback).
   */
  readonly manifest: { device: string } | null

  /** Number of WebGPU device-loss events observed by this adapter */
  readonly deviceLossCount: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOAD_TIMEOUT = TIMEOUTS.WHISPER_LOAD
const TRANSCRIBE_TIMEOUT = TIMEOUTS.WHISPER_TRANSCRIBE

/**
 * VRAM gate for opting into WebGPU per model. This is a *desktop-pet* product,
 * so we keep the GPU footprint deliberately small rather than chasing peak
 * accuracy: every model runs INT8 (q8) on WebGPU, which slashes the
 * intermediate-activation buffers that previously blew whisper-small up to
 * 7+ GB on an 8 GB laptop dGPU (when it used fp16). The gate only uses WebGPU
 * when the safety-factored coordinator budget can still fit the estimated
 * footprint after currently-allocated models (e.g. Kokoro TTS) are accounted
 * for; otherwise it stays on WASM/CPU (q8) — slower but stable on low-end
 * machines and free of GPU memory pressure / OOM.
 *
 * The footprint scales with model size, so the gate is per-model:
 * - whisper-tiny (~39M): negligible VRAM, fits any discrete GPU.
 * - whisper-base (~74M): light, fits virtually any GPU.
 * - whisper-small (244M): kept at a conservative bar so it still leaves room
 *   for Kokoro TTS on 8 GB cards instead of OOM-ing.
 * Previously a single 7 GB threshold was applied to every model, which forced
 * even tiny onto CPU on mid-range GPUs — wasting WebGPU and making ASR slow.
 */
const WHISPER_WEBGPU_VRAM_BYTES: Record<string, number> = {
  [MODEL_IDS.WHISPER_TINY]: Math.round(0.8 * 1024 * 1024 * 1024),
  [MODEL_IDS.WHISPER_BASE]: Math.round(1.2 * 1024 * 1024 * 1024),
  [MODEL_IDS.WHISPER]: Math.round(2.5 * 1024 * 1024 * 1024),
}
const DEFAULT_WHISPER_WEBGPU_VRAM_BYTES = Math.round(2.5 * 1024 * 1024 * 1024)

function decideWhisperDevice(modelId: string = MODEL_IDS.WHISPER_BASE): 'webgpu' | 'wasm' {
  const required = WHISPER_WEBGPU_VRAM_BYTES[modelId] ?? DEFAULT_WHISPER_WEBGPU_VRAM_BYTES

  const capabilities = getCachedWebGPUCapabilities()
  if (!capabilities?.supported)
    return 'wasm'

  const usage = getGPUCoordinator().getUsage()
  const free = usage.budget > 0 ? usage.budget - usage.allocated : Number.POSITIVE_INFINITY
  if (free >= required)
    return 'webgpu'

  return 'wasm'
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createWhisperAdapter(workerUrl: string | URL): WhisperAdapter {
  let worker: Worker | null = null
  let state: WhisperState = 'idle'
  let allocationToken: AllocationToken | null = null
  let loadedModelId: string | null = null
  let restartAttempts = 0
  let messageListener: ((event: MessageEvent) => void) | null = null
  let errorListener: ((event: ErrorEvent) => void) | null = null
  const messageHandlers = new Set<(event: WhisperEvent) => void>()

  // NOTICE: Device-loss resilience state. See kokoro.ts for rationale.
  let lastManifest: { device: string } | null = null
  let deviceLossCount = 0

  // NOTICE: Idle timeout for auto-unloading models. Reduces GPU memory usage
  // on low-end machines when the model is not actively used.
  let idleUnloadTimer: ReturnType<typeof setTimeout> | null = null

  const operationMutex = new Mutex()

  function resetIdleTimer(): void {
    if (idleUnloadTimer) {
      clearTimeout(idleUnloadTimer)
      idleUnloadTimer = null
    }
    if (IDLE_UNLOAD_TIMEOUT > 0) {
      idleUnloadTimer = setTimeout(() => {
        if (state === 'ready') {
          console.log(`[WhisperAdapter] Idle timeout (${IDLE_UNLOAD_TIMEOUT / 1000}s), unloading model`)
          unloadModel()
        }
      }, IDLE_UNLOAD_TIMEOUT)
    }
  }

  function unloadModel(): void {
    if (worker) {
      worker.postMessage({ type: 'unload-model', requestId: createRequestId() })
      state = 'idle'
      updateInferenceStatus(MODEL_NAMES.WHISPER, { state: 'idle' })
    }
  }

  function handleWorkerError(event: ErrorEvent | Error): void {
    state = 'error'
    operationMutex.cancel()

    const code = classifyError(event instanceof Error ? event : (event as ErrorEvent).error ?? event)
    if (code === 'DEVICE_LOST') {
      deviceLossCount++
      getGPUCoordinator().recordDeviceLoss({
        modelId: MODEL_NAMES.WHISPER,
        reason: classifyDeviceLossReason(event instanceof Error ? event : (event as ErrorEvent).error ?? event),
        occurredAt: Date.now(),
      })
    }

    destroyWorker()
    scheduleRestart()
  }

  function destroyWorker(): void {
    if (worker) {
      if (messageListener)
        worker.removeEventListener('message', messageListener)
      if (errorListener)
        worker.removeEventListener('error', errorListener)
      messageListener = null
      errorListener = null
      worker.terminate()
      worker = null
    }
  }

  function scheduleRestart(): void {
    if (restartAttempts >= MAX_RESTARTS) {
      console.error(`[WhisperAdapter] Max restart attempts (${MAX_RESTARTS}) reached.`)
      // NOTICE: Transition to 'terminated' so callers can detect the dead adapter
      // instead of being stuck in 'error' state indefinitely.
      state = 'terminated'
      return
    }

    restartAttempts++
    const delay = RESTART_DELAY_MS * restartAttempts
    console.warn(`[WhisperAdapter] Restarting in ${delay}ms (attempt ${restartAttempts}/${MAX_RESTARTS})`)

    setTimeout(() => {
      ensureWorker()
    }, delay)
  }

  function onSuccess(): void {
    restartAttempts = 0
  }

  function ensureWorker(): Worker {
    if (!worker) {
      worker = new Worker(workerUrl, { type: 'module' })
      messageListener = (event: MessageEvent) => {
        const data = event.data
        // Forward unified protocol messages to subscribers
        if (data.type === 'progress') {
          const evt: WhisperEvent = { type: 'progress', payload: data.payload }
          for (const handler of messageHandlers) handler(evt)
        }
        else if (data.type === 'model-ready') {
          const evt: WhisperEvent = { type: 'model-ready' }
          for (const handler of messageHandlers) handler(evt)
        }
        else if (data.type === 'inference-result') {
          const evt: WhisperEvent = { type: 'inference-result', output: data.output }
          for (const handler of messageHandlers) handler(evt)
        }
        else if (data.type === 'error') {
          const evt: WhisperEvent = { type: 'error', payload: data.payload }
          for (const handler of messageHandlers) handler(evt)
        }
      }
      errorListener = (event: ErrorEvent) => {
        handleWorkerError(event)
      }
      worker.addEventListener('message', messageListener)
      worker.addEventListener('error', errorListener)
    }
    return worker
  }

  /**
   * Wait for a specific unified protocol message type, filtered by requestId.
   * If `signal` is provided and aborts, sends a `cancel` message to the
   * worker and rejects with `InferenceAbortError`.
   */
  function waitForMessage<T = any>(
    w: Worker,
    requestId: string,
    targetType: string,
    timeout: number,
    onOther?: (data: any) => void,
    signal?: AbortSignal,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined
      let abortListener: (() => void) | null = null

      function cleanup(): void {
        if (timeoutId !== undefined)
          clearTimeout(timeoutId)
        w.removeEventListener('message', handler)
        if (abortListener && signal)
          signal.removeEventListener('abort', abortListener)
      }

      function handler(event: MessageEvent): void {
        if (event.data.requestId !== requestId)
          return

        if (event.data.type === targetType) {
          cleanup()
          resolve(event.data as T)
        }
        else if (event.data.type === 'error') {
          cleanup()
          const code = event.data.payload?.code
          if (code === 'CANCELLED')
            reject(new InferenceAbortError(event.data.payload?.message))
          else
            reject(new Error(event.data.payload?.message ?? 'Worker error'))
        }
        else {
          onOther?.(event.data)
        }
      }

      w.addEventListener('message', handler)

      timeoutId = setTimeout(() => {
        cleanup()
        reject(new Error(`Whisper: timeout after ${timeout}ms waiting for '${targetType}'`))
      }, timeout)

      if (signal) {
        if (signal.aborted) {
          cleanup()
          w.postMessage({ type: 'cancel', requestId: createRequestId(), targetRequestId: requestId })
          reject(new InferenceAbortError(typeof signal.reason === 'string' ? signal.reason : undefined))
          return
        }
        abortListener = () => {
          cleanup()
          w.postMessage({ type: 'cancel', requestId: createRequestId(), targetRequestId: requestId })
          const reason = signal.reason
          reject(reason instanceof Error ? reason : new InferenceAbortError(typeof reason === 'string' ? reason : undefined))
        }
        signal.addEventListener('abort', abortListener)
      }
    })
  }

  async function load(
    onProgress?: (p: ProgressPayload) => void,
    options?: { signal?: AbortSignal, modelId?: string },
  ): Promise<void> {
    const requestedModelId = options?.modelId ?? MODEL_IDS.WHISPER

    // NOTICE: Short-circuit if the same model is already loaded (or currently
    // transcribing). Prevents re-downloading and re-warming when `load()` is
    // called redundantly (e.g., by the provider's `fetch` wrapper). Without
    // this guard, every transcription attempt would show "downloading" and
    // restart the warmup.
    if ((state === 'ready' || state === 'transcribing') && loadedModelId === requestedModelId) {
      updateInferenceStatus(MODEL_NAMES.WHISPER, { state: 'ready' })
      return
    }

    // If a different model is currently loaded, unload it first so the new
    // model loads cleanly into the worker.
    if (state === 'ready' && loadedModelId !== requestedModelId && worker) {
      worker.postMessage({ type: 'unload-model', requestId: createRequestId() })
      state = 'idle'
    }

    // Whisper on WebGPU allocates far more VRAM than its file size (observed
    // 7+ GB for whisper-small on an RTX 4060 Laptop 8 GB), which crowds out
    // Kokoro TTS and other GPU models. Only opt into WebGPU when the
    // safety-factored coordinator budget can still fit that footprint after
    // currently-allocated models are accounted for; otherwise stay on
    // WASM/CPU — slower but stable on low/mid-range GPUs.
    const requestedDevice = decideWhisperDevice(requestedModelId)
    if (requestedDevice === 'wasm') {
      console.warn(
        `[WhisperAdapter] ${deviceLossCount} device-loss events recorded, `
        + `or insufficient VRAM budget — loading on wasm.`,
      )
    }
    throwIfAborted(options?.signal)
    loadedModelId = requestedModelId
    return operationMutex.runExclusive(async () => {
      throwIfAborted(options?.signal)
      state = 'loading'
      updateInferenceStatus(MODEL_NAMES.WHISPER, { state: 'downloading', device: requestedDevice as any })

      return getLoadQueue().enqueue(MODEL_NAMES.WHISPER, LOAD_PRIORITY.ASR, async () => {
        throwIfAborted(options?.signal)
        const w = ensureWorker()
        const requestId = createRequestId()

        const readyPromise = waitForMessage(w, requestId, 'model-ready', LOAD_TIMEOUT, (data) => {
          if (data.type === 'progress') {
            const payload = data.payload
            const progress: ProgressPayload = {
              phase: payload.phase ?? 'download',
              percent: payload.percent ?? -1,
              message: payload.message,
              file: payload.file,
              loaded: payload.loaded,
              total: payload.total,
            }
            // Push progress to the reactive statusMap so the UI toaster can display it.
            updateInferenceStatus(MODEL_NAMES.WHISPER, { progress })
            onProgress?.(progress)
          }
        }, options?.signal)

        w.postMessage({ type: 'load-model', requestId, modelId: requestedModelId, device: requestedDevice })

        let readyResponse: any
        try {
          readyResponse = await readyPromise
        }
        catch (error) {
          state = 'error'
          updateInferenceStatus(MODEL_NAMES.WHISPER, { state: 'error' })
          throw error
        }

        // Capture actual device reported by the worker (may fall back to WASM)
        const actualDevice = readyResponse?.device ?? requestedDevice

        // Track GPU memory allocation. WASM runs on CPU and consumes no VRAM,
        // so only record an estimate when actually on WebGPU.
        const coordinator = getGPUCoordinator()
        if (allocationToken)
          coordinator.release(allocationToken)
        const estimate = actualDevice === 'webgpu'
          ? (WHISPER_WEBGPU_VRAM_BYTES[requestedModelId] ?? DEFAULT_WHISPER_WEBGPU_VRAM_BYTES)
          : 0
        allocationToken = coordinator.requestAllocation(MODEL_NAMES.WHISPER, estimate)

        lastManifest = { device: actualDevice }
        state = 'ready'
        updateInferenceStatus(MODEL_NAMES.WHISPER, { state: 'ready', device: actualDevice })
        onSuccess()
        // Start idle timer after successful load
        resetIdleTimer()
      }, { signal: options?.signal })
    })
  }

  async function transcribe(
    input: WhisperTranscribeInput,
    options?: { signal?: AbortSignal },
  ): Promise<string> {
    throwIfAborted(options?.signal)
    return defaultPerfTracer.withMeasure('inference', 'whisper-transcribe', () => operationMutex.runExclusive(async () => {
      throwIfAborted(options?.signal)
      if (!worker || state !== 'ready')
        throw new Error('Model not loaded. Call load() first.')

      state = 'transcribing'
      const requestId = createRequestId()

      const resultPromise = waitForMessage<any>(
        worker,
        requestId,
        'inference-result',
        TRANSCRIBE_TIMEOUT,
        undefined,
        options?.signal,
      )

      worker.postMessage({
        type: 'run-inference',
        requestId,
        input: {
          audio: input.audio,
          audioFloat32: input.audioFloat32,
          language: input.language,
        },
      })

      try {
        const result = await resultPromise
        state = 'ready'
        onSuccess()
        // Reset idle timer after successful inference
        resetIdleTimer()
        return result.output?.text?.[0] ?? ''
      }
      catch (error) {
        // NOTICE: Recover to 'ready' instead of 'error' so the adapter is not
        // destroyed by getWhisperAdapter() on the next call. Setting 'error'
        // would cause the singleton to be recreated, losing the loaded model
        // in memory and forcing a full re-download from the local server.
        // The error is still thrown to the caller for proper error handling.
        state = 'ready'
        // Reset idle timer even on error to keep model available for retry
        resetIdleTimer()
        throw error
      }
    }), { language: input.language })
  }

  function terminateAdapter(): void {
    // Clear idle timer
    if (idleUnloadTimer) {
      clearTimeout(idleUnloadTimer)
      idleUnloadTimer = null
    }
    operationMutex.cancel()
    destroyWorker()
    if (allocationToken) {
      removeInferenceStatus(MODEL_NAMES.WHISPER)
      getGPUCoordinator().release(allocationToken)
      allocationToken = null
    }
    messageHandlers.clear()
    state = 'terminated'
  }

  function onMessage(handler: (event: WhisperEvent) => void): () => void {
    messageHandlers.add(handler)
    return () => messageHandlers.delete(handler)
  }

  return {
    load,
    transcribe,
    terminate: terminateAdapter,
    onMessage,
    get state() { return state },
    get manifest() { return lastManifest },
    get deviceLossCount() { return deviceLossCount },
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let globalAdapter: WhisperAdapter | null = null
const singletonMutex = new Mutex()

/**
 * Get the global Whisper adapter instance.
 * Creates and starts the worker on first call.
 * Automatically re-creates the adapter if it has entered a terminal state
 * ('terminated' or 'error' after max restarts exhausted).
 */
export async function getWhisperAdapter(): Promise<WhisperAdapter> {
  return singletonMutex.runExclusive(async () => {
    // NOTICE: Only recreate the adapter if it doesn't exist or has been fully
    // terminated. The 'error' state no longer triggers recreation (see transcribe()
    // which recovers to 'ready'). This prevents losing the loaded model in memory
    // and forcing a re-download from the local server.
    if (
      !globalAdapter
      || globalAdapter.state === 'terminated'
    ) {
      globalAdapter = createWhisperAdapter(new URL('../../../libs/workers/worker.ts', import.meta.url))
    }
    return globalAdapter
  })
}
