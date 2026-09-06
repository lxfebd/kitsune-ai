/**
 * SenseVoice 情感检测 → 项目 Emotion enum 映射
 *
 * SenseVoice 输出 8 种情感：happy, sad, angry, neutral, surprised, fearful, disgusted, calm
 * 项目 Emotion enum 有 9 种：happy, sad, angry, think, surprised, awkward, question, curious, neutral
 *
 * 映射策略：
 * - 直接对应的情感直接映射
 * - 无直接对应的情感用最接近的近似
 * - 不在映射表中的情感（如 'unknown'）返回 null，不触发表情切换
 */

import { Emotion } from '../../constants/emotions'

/** SenseVoice emotion 字符串 → Emotion enum 映射表 */
const SENSEVOICE_EMOTION_MAP: Record<string, Emotion> = {
  'happy': Emotion.Happy,
  'sad': Emotion.Sad,
  'angry': Emotion.Angry,
  'surprised': Emotion.Surprise,
  'neutral': Emotion.Neutral,
  'fearful': Emotion.Awkward,
  'disgusted': Emotion.Sad,
  'calm': Emotion.Neutral,
}

/**
 * 将 SenseVoice 检测到的情感映射为项目 Emotion enum
 *
 * Before:
 * - 'happy'   → Emotion.Happy
 * - 'fearful' → Emotion.Awkward
 * - 'unknown' → null (不触发表情)
 *
 * After:
 * - 返回对应的 Emotion enum 值，或 null（不触发）
 */
export function mapSenseVoiceEmotion(senseVoiceEmotion: string | undefined): Emotion | null {
  if (!senseVoiceEmotion) return null
  const normalized = senseVoiceEmotion.toLowerCase().trim()
  return SENSEVOICE_EMOTION_MAP[normalized] ?? null
}
