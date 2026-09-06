import type { EmotionIntent, VADVector } from '@soullink-emotion/engine'

import { emotionVADPresets, getVADPreset } from '@soullink-emotion/engine'

import { Emotion } from '../../constants/emotions'

/**
 * Maps the existing `Emotion` enum to Soullink emotion identifiers and
 * optional variant names. The variant narrows the VAD preset resolution
 * when the same base emotion has multiple expression modes.
 */
export const EMOTION_TO_SOULLINK: Record<string, { emotion: string, variant?: string }> = {
  [Emotion.Happy]: { emotion: 'happy', variant: 'bright_smile' },
  [Emotion.Sad]: { emotion: 'sad', variant: 'downcast' },
  [Emotion.Angry]: { emotion: 'anger' },
  [Emotion.Think]: { emotion: 'curious' },
  [Emotion.Surprise]: { emotion: 'surprised' },
  [Emotion.Awkward]: { emotion: 'confused' },
  [Emotion.Question]: { emotion: 'confused' },
  [Emotion.Curious]: { emotion: 'curious' },
  [Emotion.Neutral]: { emotion: 'neutral' },
}

/**
 * Additional emotion mappings for Soullink's richer vocabulary
 * that don't have a direct Kitsune enum equivalent.
 * These can be used via `createEmotionIntent()` directly.
 */
export const SOULLINK_EXTENDED_EMOTIONS = {
  calm: { emotion: 'calm' },
  excited: { emotion: 'excited' },
  shy: { emotion: 'shy' },
  affectionate: { emotion: 'affectionate' },
  tired: { emotion: 'tired' },
  anxiety: { emotion: 'anxiety' },
  concerned: { emotion: 'concerned' },
} as const

/**
 * Creates an `EmotionIntent` from a Soullink emotion name.
 *
 * Looks up the VAD preset via `getVADPreset()` to populate the intent's
 * VAD-related fields so the Soullink runtime has a complete starting vector.
 */
export function createEmotionIntent(
  emotion: string,
  intensity = 0.7,
  contextTags: string[] = [],
  sourceMessage?: string,
): EmotionIntent {
  const mapping = EMOTION_TO_SOULLINK[emotion] ?? { emotion }
  const vad: VADVector = getVADPreset(mapping.emotion, mapping.variant)

  return {
    emotion: mapping.emotion,
    variant: mapping.variant,
    intensity,
    contextTags,
    naturalEmotion: mapping.emotion,
    naturalVariant: mapping.variant,
    naturalVAD: vad,
    sourceMessage,
  }
}

/**
 * Convenience wrapper that accepts a legacy `Emotion` enum value and
 * produces a fully resolved `EmotionIntent`.
 */
export function createEmotionIntentFromLegacy(
  legacyEmotion: Emotion,
  intensity = 0.7,
  sourceMessage?: string,
): EmotionIntent {
  return createEmotionIntent(legacyEmotion, intensity, [], sourceMessage)
}

/**
 * Creates an `EmotionIntent` from a Soullink extended emotion name
 * (calm, excited, shy, affectionate, tired, anxiety, concerned).
 */
export function createEmotionIntentFromExtended(
  emotion: keyof typeof SOULLINK_EXTENDED_EMOTIONS,
  intensity = 0.7,
  contextTags: string[] = [],
): EmotionIntent {
  const mapping = SOULLINK_EXTENDED_EMOTIONS[emotion]
  const vad: VADVector = getVADPreset(mapping.emotion)

  return {
    emotion: mapping.emotion,
    intensity,
    contextTags,
    naturalEmotion: mapping.emotion,
    naturalVAD: vad,
  }
}

/**
 * All available VAD presets for reference.
 * Each key maps to a { valence, arousal, dominance } vector.
 */
export const VAD_PRESETS = emotionVADPresets
