import { Emotion } from '../../constants/emotions'
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

import { usePetEmotionStore } from './emotion-pet'

/**
 * 桌宠情绪状态机 — mood / energy / affection 的持久化状态与衰减。
 *
 * 此前的情绪系统是「事件瞬时触发的动画队列」：来了个 task_failed 就 Sad 一下，
 * 播完回 idle，桌宠不会累、不会无聊、不会掉好感 — 不像活的。
 * 这里补上三层「活」的状态：
 *
 *   mood      （心情，0-100）   事件的正负反馈驱动 + 向 50 均值回归
 *   energy    （精力，0-100）   随 tick 缓慢衰减；睡眠/休息后恢复（当前由 positive 事件小幅恢复）
 *   affection （好感，0-100）   正向互动累积，负向事件折损
 *
 * 数据流（单向，不与 Stage.vue 播放状态反向耦合）：
 *   状态机 tick / 事件输入 → petEmotionStore.enqueue() → Stage.vue watcher 消费
 *
 * 状态机本身不直接操作渲染，只负责「什么状态下该露出什么情绪」，由 consume/apply 输出。
 * localStorage 持久化，重启不丢。
 */

export interface PetStateSnapshot {
  mood: number
  energy: number
  affection: number
  lastTickAt: number
}

const STORAGE_KEY = 'kitsune/pet-state'
const TICK_MS = 5_000
const MEAN_MOOD = 50

/** 情绪对状态的影响权重（正向 +=，负向 -=） */
const EMOTION_STATE_DELTA: Record<Emotion, { mood: number, affection: number }> = {
  [Emotion.Happy]: { mood: 2, affection: 1 },
  [Emotion.Sad]: { mood: -2, affection: 0 },
  [Emotion.Angry]: { mood: -3, affection: -1 },
  [Emotion.Think]: { mood: 0, affection: 0 },
  [Emotion.Surprise]: { mood: 0, affection: 0 },
  [Emotion.Awkward]: { mood: -1, affection: 0 },
  [Emotion.Question]: { mood: 0, affection: 0 },
  [Emotion.Curious]: { mood: 1, affection: 0 },
  [Emotion.Neutral]: { mood: 0, affection: 0 },
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value * 10) / 10))
}

function loadInitial(): PetStateSnapshot {
  if (typeof window === 'undefined')
    return { mood: 50, energy: 80, affection: 0, lastTickAt: Date.now() }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw)
      return { mood: 50, energy: 80, affection: 0, lastTickAt: Date.now() }
    const parsed = JSON.parse(raw) as Partial<PetStateSnapshot>
    return {
      mood: clamp(parsed.mood ?? 50),
      energy: clamp(parsed.energy ?? 80),
      affection: clamp(parsed.affection ?? 0),
      lastTickAt: typeof parsed.lastTickAt === 'number' ? parsed.lastTickAt : Date.now(),
    }
  }
  catch {
    return { mood: 50, energy: 80, affection: 0, lastTickAt: Date.now() }
  }
}

export const usePetStateStore = defineStore('pet-state', () => {
  const initial = loadInitial()
  const mood = ref(initial.mood)
  const energy = ref(initial.energy)
  const affection = ref(initial.affection)
  const lastTickAt = ref(initial.lastTickAt)
  const running = ref(false)
  const petEmotionStore = usePetEmotionStore()

  let tickTimer: ReturnType<typeof setInterval> | undefined

  // 持久化：状态变化即落盘（localStorage，原子写入）
  watch([mood, energy, affection], () => {
    if (typeof window === 'undefined')
      return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        mood: mood.value,
        energy: energy.value,
        affection: affection.value,
        lastTickAt: lastTickAt.value,
      } satisfies PetStateSnapshot))
    }
    catch {
      // 存储不可用时静默降级（隐私模式等）
    }
  })

  /** 单一 tick：energy 衰减 + mood 向均值回归 + 按状态产出情绪 */
  function tick(): Emotion | null {
    const now = Date.now()
    lastTickAt.value = now

    // energy 缓慢衰减；低 energy 时心情也更容易低落
    energy.value = clamp(energy.value - (energy.value > 20 ? 1 : 0.5))
    if (energy.value < 25)
      mood.value = clamp(mood.value - 1) // 太累 → 心情持续低落
    else if (mood.value > MEAN_MOOD)
      mood.value = clamp(mood.value - 0.5) // 自然回落，避免永远亢奋
    else if (mood.value < MEAN_MOOD)
      mood.value = clamp(mood.value + 0.5) // 均值回归，避免永远低落

    // 状态驱动的自发情绪（低频，避免刷屏）
    if (Math.random() > 0.2)
      return null
    if (energy.value < 15 && mood.value < 35)
      return Emotion.Think // 太累又心情差 → 发呆
    if (mood.value < 30)
      return Emotion.Sad
    if (energy.value < 20)
      return Emotion.Think
    if (mood.value > 75)
      return Emotion.Happy
    return null
  }

  /** 外部情绪事件（经 enqueue 前的钩子注入）→ 更新状态，返回是否产生自发情绪 */
  function applyEvent(emotion: Emotion, intensity = 1): void {
    const delta = EMOTION_STATE_DELTA[emotion]
    if (!delta)
      return
    mood.value = clamp(mood.value + delta.mood * intensity)
    affection.value = clamp(affection.value + delta.affection * intensity)
    // 正向互动轻微回精力（睡觉/休息的近似）
    if (delta.mood > 0)
      energy.value = clamp(energy.value + 1)
  }

  function start() {
    if (running.value || typeof window === 'undefined')
      return
    running.value = true
    tickTimer = setInterval(() => {
      const spontaneous = tick()
      if (spontaneous)
        petEmotionStore.enqueue({ name: spontaneous, intensity: 1 })
    }, TICK_MS)
  }

  function stop() {
    if (!running.value)
      return
    running.value = false
    if (tickTimer) {
      clearInterval(tickTimer)
      tickTimer = undefined
    }
  }

  function reset() {
    mood.value = 50
    energy.value = 80
    affection.value = 0
  }

  return {
    mood,
    energy,
    affection,
    lastTickAt,
    running,
    tick,
    applyEvent,
    start,
    stop,
    reset,
  }
})
