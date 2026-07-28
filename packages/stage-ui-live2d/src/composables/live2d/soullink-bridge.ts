import type { AudioLevelAnalyzer, EmotionIntent, ModelProfile, MotionStyleOptions, PartialFACSLikeState, RuntimeSnapshot, VADVector } from '@soullink-emotion/engine'

import { motionStylePresets, SoullinkRuntime } from '@soullink-emotion/engine'

import type { MotionManagerPlugin } from './motion-manager'

/**
 * Composable that bridges the Soullink Emotion Engine into the Live2D
 * motion-manager plugin pipeline.
 *
 * The bridge exposes the full {@link SoullinkRuntime} API including:
 * - VAD-based continuous emotion with decay, ambient drift, and hold
 * - Idle engine (blink, gaze, breathing, body sway, micro-motion)
 * - Gesture controller (emotion-triggered head/body gestures)
 * - Private parameter overlay (auto-drive blush, tear, sweat, etc.)
 * - Lip sync with measured audio input
 * - Voice waiting motion during TTS loading
 * - Proactive idle events
 * - Reflection pulse animations
 * - Reaction/action plan sequencing
 *
 * Call stack (per frame):
 *
 * motion-manager hookUpdate
 *   -> final plugins
 *     -> {@link createBridgePlugin}
 *       -> {@link SoullinkRuntime}.update
 *       -> write live2dParams to Cubism model
 */
export function useSoullinkBridge(options: {
  profile: ModelProfile
  motionStyle?: MotionStyleOptions
  audioLevelAnalyzer?: AudioLevelAnalyzer | null
}) {
  const {
    profile,
    motionStyle = motionStylePresets.natural,
    audioLevelAnalyzer = null,
  } = options

  const runtime = new SoullinkRuntime({ profile, motionStyle, audioLevelAnalyzer })
  const startedAt = performance.now() / 1000
  let latestSnapshot: RuntimeSnapshot | null = null

  function now(): number {
    return performance.now() / 1000 - startedAt
  }

  // ------------------------------------------------------------------
  // Per-frame plugin
  // ------------------------------------------------------------------

  /**
   * Creates a MotionManagerPlugin for the `final` stage.
   *
   * Each frame it advances the Soullink runtime and writes the computed
   * `live2dParams` onto the Cubism model, skipping any parameter IDs that
   * are currently occupied by a native animation directive.
   */
  function createBridgePlugin(): MotionManagerPlugin {
    return (ctx) => {
      try {
        const timeSeconds = now()
        const deltaSeconds = ctx.timeDelta

        const snapshot = runtime.update(timeSeconds, deltaSeconds)
        latestSnapshot = snapshot

        // Collect param IDs that native animation owns this frame.
        const suppressedIds = new Set(snapshot.nativeAnimation?.suppressParamIds ?? [])

        if (snapshot.nativeAnimation) {
          const { expression, motion } = snapshot.nativeAnimation
          if (expression || motion) {
            console.debug('[soullink] native animation directive:', { expression, motion })
          }
        }

        // Write computed parameters onto the Live2D model.
        for (const [paramId, value] of Object.entries(snapshot.live2dParams)) {
          if (suppressedIds.has(paramId))
            continue
          ctx.model.setParameterValueById(paramId, value)
        }
      }
      catch {
        // Silently ignore per-frame errors to prevent cascading ticker stop.
      }
    }
  }

  // ------------------------------------------------------------------
  // Emotion triggering
  // ------------------------------------------------------------------

  /** Trigger an emotion intent (VAD target + expression + gesture). */
  function triggerIntent(intent: EmotionIntent, timeSeconds?: number) {
    runtime.triggerIntent(intent, timeSeconds ?? now())
  }

  /** Classify a user message and auto-trigger the matched emotion. */
  function sendMessage(message: string, timeSeconds?: number): EmotionIntent {
    return runtime.sendMessage(message, timeSeconds ?? now())
  }

  /** Directly blend the VAD state toward a target vector. */
  function applyVADTarget(target: Partial<VADVector>, amount = 0.65) {
    runtime.applyVADTarget(target, amount)
  }

  /** Nudge the VAD state by a delta vector. */
  function applyVADDelta(delta: Partial<VADVector>, amount = 1) {
    runtime.applyVADDelta(delta, amount)
  }

  // ------------------------------------------------------------------
  // Lip sync & voice
  // ------------------------------------------------------------------

  /** Enable/disable lip sync (mouth movement during speech). */
  function setLipSyncEnabled(enabled: boolean) {
    runtime.setLipSyncEnabled(enabled)
  }

  /** Notify runtime that voice playback started/stopped (enables lip sync). */
  function setVoicePlaybackActive(active: boolean) {
    runtime.setVoicePlaybackActive(active)
  }

  /** Replace the audio level analyzer (e.g. when switching audio sources). */
  function setAudioLevelAnalyzer(analyzer: AudioLevelAnalyzer | null) {
    runtime.setAudioLevelAnalyzer(analyzer)
  }

  /** Start voice waiting motion (shown while TTS is loading). */
  function startVoiceWaitingMotion(timeSeconds?: number) {
    return runtime.startVoiceWaitingMotion(timeSeconds ?? now())
  }

  /** Stop voice waiting motion. */
  function clearVoiceWaitingMotion() {
    runtime.clearVoiceWaitingMotion()
  }

  // ------------------------------------------------------------------
  // Idle & motion
  // ------------------------------------------------------------------

  /** Enable/disable the idle engine (blink, gaze, breathing, body sway). */
  function setIdleEnabled(enabled: boolean) {
    runtime.setIdleEnabled(enabled)
  }

  /** Update the motion style preset at runtime. */
  function setMotionStyle(style: MotionStyleOptions) {
    runtime.setMotionStyle(style)
  }

  /** Adjust parameter gain (amplifies facial expression intensity). */
  function setParameterGain(gain: number) {
    runtime.setParameterGain(gain)
  }

  /** Adjust body motion gain (amplifies head/body sway). */
  function setBodyMotionGain(gain: number) {
    runtime.setBodyMotionGain(gain)
  }

  // ------------------------------------------------------------------
  // Manual overrides
  // ------------------------------------------------------------------

  /** Set manual FACS values (override specific facial parameters). */
  function setManualFACS(facs: PartialFACSLikeState) {
    runtime.setManualFACS(facs)
  }

  /** Clear all manual FACS and action unit overrides. */
  function clearManualFACS() {
    runtime.clearManualFACS()
  }

  // ------------------------------------------------------------------
  // Private parameters (blush, tear, sweat, etc.)
  // ------------------------------------------------------------------

  /** Configure private VAD parameters for model-specific effects. */
  function setPrivateVADParameters(parameters: Record<string, any>) {
    return runtime.setPrivateVADParameters(parameters)
  }

  // ------------------------------------------------------------------
  // Proactive & reflection
  // ------------------------------------------------------------------

  /** Enable/disable proactive idle repeat events. */
  function setProactiveRepeatEnabled(enabled: boolean) {
    runtime.setProactiveRepeatEnabled(enabled)
  }

  /** Consume a proactive event (acknowledge it happened). */
  function consumeProactive() {
    runtime.consumeProactive()
  }

  // ------------------------------------------------------------------
  // Snapshot & cleanup
  // ------------------------------------------------------------------

  function getSnapshot(): RuntimeSnapshot | null {
    return latestSnapshot
  }

  function destroy() {
    runtime.reset(now())
    latestSnapshot = null
  }

  return {
    // Core
    runtime,
    createBridgePlugin,

    // Emotion
    triggerIntent,
    sendMessage,
    applyVADTarget,
    applyVADDelta,

    // Voice
    setLipSyncEnabled,
    setVoicePlaybackActive,
    setAudioLevelAnalyzer,
    startVoiceWaitingMotion,
    clearVoiceWaitingMotion,

    // Idle & motion
    setIdleEnabled,
    setMotionStyle,
    setParameterGain,
    setBodyMotionGain,

    // Manual
    setManualFACS,
    clearManualFACS,

    // Private params
    setPrivateVADParameters,

    // Proactive
    setProactiveRepeatEnabled,
    consumeProactive,

    // State
    getSnapshot,
    destroy,
  }
}

export type SoullinkBridge = ReturnType<typeof useSoullinkBridge>
