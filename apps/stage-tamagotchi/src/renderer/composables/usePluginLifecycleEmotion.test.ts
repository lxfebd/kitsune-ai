import { describe, expect, it, vi } from 'vitest'
import type { PluginLifecycleEventPayload } from './usePluginLifecycleEmotion'
import { handlePluginLifecycle } from './usePluginLifecycleEmotion'
import { Emotion } from '@kitsune/stage-ui/constants/emotions'

// stage-ui character store 的值导入会经 analytics → use-build-info 拉到 ~build/time 虚拟模块，
// 该模块只在 stage-ui 自己的 vitest 配置里可解析，这里必须 mock（与 useSidecarEmotion 测试同款坑）。
vi.mock('@kitsune/stage-ui/stores/character', () => ({
  useCharacterStore: () => ({ emitTextOutput: vi.fn() }),
}))
vi.mock('@kitsune/electron-vueuse', () => ({
  getElectronEventaContext: vi.fn(() => ({ on: vi.fn(() => () => {}) })),
}))

function makeEvent(kind: PluginLifecycleEventPayload['kind'], extensionId = 'demo.ext'): PluginLifecycleEventPayload {
  return {
    kind,
    extensionId,
    reason: kind === 'load-failed' ? 'Cannot find module' : 'kit.gamelet.runtime',
    updatedAt: Date.now(),
  }
}

function makeDeps() {
  return {
    applyEvent: vi.fn(),
    enqueue: vi.fn(),
    speak: vi.fn(),
  }
}

describe('handlePluginLifecycle', () => {
  it('load-failed → Sad + 朗读「去设置页看看」', () => {
    const deps = makeDeps()
    handlePluginLifecycle(makeEvent('load-failed'), deps)
    expect(deps.applyEvent).toHaveBeenCalledWith(Emotion.Sad, 1)
    expect(deps.enqueue).toHaveBeenCalledWith({ name: Emotion.Sad, intensity: 1 })
    expect(deps.speak).toHaveBeenCalledWith('有个插件 demo.ext 没启动成功，去设置页看看原因吧。')
  })

  it('degraded → Awkward 轻强度，静默', () => {
    const deps = makeDeps()
    handlePluginLifecycle(makeEvent('degraded'), deps)
    expect(deps.applyEvent).toHaveBeenCalledWith(Emotion.Awkward, 0.6)
    expect(deps.enqueue).toHaveBeenCalledWith({ name: Emotion.Awkward, intensity: 0.6 })
    expect(deps.speak).not.toHaveBeenCalled()
  })

  it('unloaded → 无反应', () => {
    const deps = makeDeps()
    handlePluginLifecycle(makeEvent('unloaded'), deps)
    expect(deps.applyEvent).not.toHaveBeenCalled()
    expect(deps.enqueue).not.toHaveBeenCalled()
    expect(deps.speak).not.toHaveBeenCalled()
  })
})