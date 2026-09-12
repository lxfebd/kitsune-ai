import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Emotion } from '../../constants/emotions'
import { usePetStateStore } from './pet-state'

describe('store pet-state (情绪状态机)', () => {
  beforeEach(() => {
    const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: false })
    setActivePinia(pinia)
    vi.stubGlobal('window', { localStorage: { getItem: () => null, setItem: vi.fn() } })
  })

  it('初始值：mood=50 energy=80 affection=0', () => {
    const store = usePetStateStore()
    expect(store.mood).toBe(50)
    expect(store.energy).toBe(80)
    expect(store.affection).toBe(0)
  })

  it('applyEvent：正向情绪提升 mood/affection，负向情绪降低 mood', () => {
    const store = usePetStateStore()
    store.applyEvent(Emotion.Happy, 2)
    expect(store.mood).toBe(54)
    expect(store.affection).toBe(2)
    expect(store.energy).toBe(81) // 正向互动轻微回精力

    store.applyEvent(Emotion.Angry, 3)
    expect(store.mood).toBe(54 - 9)
    expect(store.affection).toBe(0) // 2 - 3 被 clamp 到 0
  })

  it('applyEvent：负面情绪不折损 affection（Sad）', () => {
    const store = usePetStateStore()
    store.applyEvent(Emotion.Sad, 1)
    expect(store.mood).toBe(48)
    expect(store.affection).toBe(0)
  })

  it('applyEvent：clamp 到 0-100，不越界', () => {
    const store = usePetStateStore()
    for (let i = 0; i < 30; i++)
      store.applyEvent(Emotion.Angry, 3)
    expect(store.mood).toBe(0)
    expect(store.affection).toBe(0)

    for (let i = 0; i < 50; i++)
      store.applyEvent(Emotion.Happy, 2)
    expect(store.mood).toBe(100)
    expect(store.affection).toBe(100)
  })

  it('tick：energy 衰减、mood 向 50 均值回归', () => {
    const store = usePetStateStore()
    store.mood = 80 // 偏高 → 回落
    store.energy = 100
    store.tick()
    expect(store.energy).toBeLessThan(100)
    expect(store.mood).toBeLessThan(80)
    expect(store.mood).toBeGreaterThanOrEqual(50 - 1)
  })

  it('低 energy 时 mood 加速衰减', () => {
    const store = usePetStateStore()
    store.mood = 60
    store.energy = 10
    store.tick()
    expect(store.energy).toBeLessThan(11)
    expect(store.mood).toBeLessThan(60)
  })

  it('reset：回到初始值', () => {
    const store = usePetStateStore()
    store.applyEvent(Emotion.Angry, 3)
    store.reset()
    expect(store.mood).toBe(50)
    expect(store.energy).toBe(80)
    expect(store.affection).toBe(0)
  })
})
