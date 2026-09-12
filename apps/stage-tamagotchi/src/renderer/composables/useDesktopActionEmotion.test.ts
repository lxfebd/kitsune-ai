import { describe, expect, it, vi } from 'vitest'
import type { DesktopAutomationActionEventPayload } from './useDesktopActionEmotion'
import { handleDesktopAction } from './useDesktopActionEmotion'
import { Emotion } from '@kitsune/stage-ui/constants/emotions'

// stage-ui character store 的值导入会经 analytics → use-build-info 拉到 ~build/time 虚拟模块，
// 该模块只在 stage-ui 自己的 vitest 配置里可解析，这里必须 mock（与 useSidecarEmotion 测试同款坑）。
vi.mock('@kitsune/stage-ui/stores/character', () => ({
  useCharacterStore: () => ({ emitTextOutput: vi.fn() }),
}))
vi.mock('@kitsune/electron-vueuse', () => ({
  getElectronEventaContext: vi.fn(() => ({ on: vi.fn(() => () => {}) })),
}))

function makeEvent(phase: DesktopAutomationActionEventPayload['phase']): DesktopAutomationActionEventPayload {
  return {
    action: 'click',
    params: { x: 100, y: 200 },
    phase,
    ...(phase === 'error' ? { result: { ok: false, error: 'click failed' } } : {}),
  }
}

function makeDeps() {
  return {
    applyEvent: vi.fn(),
    enqueue: vi.fn(),
    speak: vi.fn(),
  }
}

describe('handleDesktopAction', () => {
  it('start → Think（"我在帮你点"）但不朗读', () => {
    const deps = makeDeps()
    handleDesktopAction(makeEvent('start'), deps)
    expect(deps.applyEvent).toHaveBeenCalledWith(Emotion.Think, 0.8)
    expect(deps.enqueue).toHaveBeenCalledWith({ name: Emotion.Think, intensity: 0.8 })
    expect(deps.speak).not.toHaveBeenCalled()
  })

  it('done → Happy 轻强度，静默', () => {
    const deps = makeDeps()
    handleDesktopAction(makeEvent('done'), deps)
    expect(deps.applyEvent).toHaveBeenCalledWith(Emotion.Happy, 0.4)
    expect(deps.enqueue).toHaveBeenCalledWith({ name: Emotion.Happy, intensity: 0.4 })
    expect(deps.speak).not.toHaveBeenCalled()
  })

  it('error → Awkward + 朗读一次', () => {
    const deps = makeDeps()
    handleDesktopAction(makeEvent('error'), deps)
    expect(deps.applyEvent).toHaveBeenCalledWith(Emotion.Awkward, 1)
    expect(deps.enqueue).toHaveBeenCalledWith({ name: Emotion.Awkward, intensity: 1 })
    expect(deps.speak).toHaveBeenCalledWith('这个操作没成功，我看看哪里不对。')
  })
})