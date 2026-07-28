import type { AnimationState, Skeleton, TrackEntry } from '@esotericsoftware/spine-webgl'

import { EMOTION_SpineAnimationName_value, SPINE_EMOTION_TRACK } from '../../constants/emotions'
import type { Emotion } from '../../constants/emotions'

export interface SpineExpressionController {
  /** 播放情感表情（自动映射到 Spine 动画名） */
  playEmotion: (emotion: Emotion, options?: { duration?: number, loop?: boolean }) => TrackEntry | null
  /** 清除当前表情，回到 idle */
  clearExpression: (mixDuration?: number) => void
  /** 设置自定义情感→动画映射 */
  setMapping: (emotion: Emotion, animationName: string) => void
  /** 获取当前映射 */
  getMapping: () => Record<Emotion, string>
  /** 列出可用的动画名 */
  listAnimations: () => string[]
}

/**
 * Spine 表情控制器
 *
 * 将 AIRI 情感类型映射到 Spine 动画，提供与 Live2D ExpressionController
 * 对等的功能。支持自定义映射和自动回退。
 *
 * Use when: 需要根据 AI 情感状态驱动 Spine 模型表情。
 * Expects: 已初始化的 AnimationState 和 Skeleton。
 * Returns: SpineExpressionController 实例。
 */
export function useSpineExpressionController(
  animationState: AnimationState,
  skeleton: Skeleton,
  options?: {
    defaultMixDuration?: number
    customMapping?: Partial<Record<Emotion, string>>
  },
): SpineExpressionController {
  const defaultMixDuration = options?.defaultMixDuration ?? 0.2
  const mapping: Record<Emotion, string> = {
    ...EMOTION_SpineAnimationName_value,
    ...options?.customMapping,
  }

  function listAnimations(): string[] {
    return skeleton.data.animations.map(a => a.name)
  }

  function resolveAnimationName(preferred: string): string | undefined {
    const animations = listAnimations()
    if (animations.length === 0) return undefined

    // exact match
    const exact = animations.find(n => n === preferred)
    if (exact) return exact

    // case-insensitive
    const ci = animations.find(n => n.toLowerCase() === preferred.toLowerCase())
    if (ci) return ci

    // substring
    const contains = animations.find(n => n.toLowerCase().includes(preferred.toLowerCase()))
    if (contains) return contains

    return undefined
  }

  function playEmotion(emotion: Emotion, opts?: { duration?: number, loop?: boolean }): TrackEntry | null {
    const targetName = mapping[emotion]
    if (!targetName) return null

    const resolved = resolveAnimationName(targetName)
    if (!resolved) return null

    const entry = animationState.setAnimation(SPINE_EMOTION_TRACK, resolved, opts?.loop ?? false)
    entry.mixDuration = opts?.duration ?? defaultMixDuration

    // 非循环动画完成后自动清除
    if (!entry.loop) {
      const listener = {
        complete: (completed: TrackEntry) => {
          if (completed === entry) {
            try {
              animationState.setEmptyAnimation(SPINE_EMOTION_TRACK, defaultMixDuration)
            }
            finally {
              animationState.removeListener(listener)
            }
          }
        },
      }
      animationState.addListener(listener)
    }

    return entry
  }

  function clearExpression(mixDuration?: number): void {
    animationState.setEmptyAnimation(SPINE_EMOTION_TRACK, mixDuration ?? defaultMixDuration)
  }

  function setMapping(emotion: Emotion, animationName: string): void {
    mapping[emotion] = animationName
  }

  function getMapping(): Record<Emotion, string> {
    return { ...mapping }
  }

  return {
    playEmotion,
    clearExpression,
    setMapping,
    getMapping,
    listAnimations,
  }
}
