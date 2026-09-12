import { describe, expect, it, vi } from 'vitest'
import type { ConnectorInfo } from './useConnectorEmotion'
import { handleConnectorChange } from './useConnectorEmotion'
import { Emotion } from '@kitsune/stage-ui/constants/emotions'

// stage-ui character store 的值导入会经 analytics → use-build-info 拉到 ~build/time 虚拟模块，
// 该模块只在 stage-ui 自己的 vitest 配置里可解析，这里必须 mock（与 useSidecarEmotion 测试同款坑）。
vi.mock('@kitsune/stage-ui/stores/character', () => ({
  useCharacterStore: () => ({ emitTextOutput: vi.fn() }),
}))
vi.mock('@kitsune/electron-vueuse', () => ({
  getElectronEventaContext: vi.fn(() => ({ on: vi.fn(() => () => {}) })),
}))

function makeConnector(id: string, name: string): ConnectorInfo {
  return {
    id,
    type: 'vscode',
    name,
    peerId: `peer-${id}`,
    connectedAt: Date.now(),
    lastContext: null,
    lastContextAt: null,
  }
}

function makeDeps() {
  return {
    applyEvent: vi.fn(),
    enqueue: vi.fn(),
    speak: vi.fn(),
  }
}

describe('handleConnectorChange', () => {
  it('首次连上 IDE → Curious + 朗读「连上了」', () => {
    const deps = makeDeps()
    handleConnectorChange([makeConnector('zcode', 'ZCode')], 0, deps)
    expect(deps.applyEvent).toHaveBeenCalledWith(Emotion.Curious, 1)
    expect(deps.enqueue).toHaveBeenCalledWith({ name: Emotion.Curious, intensity: 1 })
    expect(deps.speak).toHaveBeenCalledWith('ZCode 连上了！')
  })

  it('数量增加（第二个 IDE 连上）→ 同样提示，但不清零不报断开', () => {
    const deps = makeDeps()
    handleConnectorChange(
      [makeConnector('zcode', 'ZCode'), makeConnector('trae', 'TRAE')],
      1,
      deps,
    )
    expect(deps.applyEvent).toHaveBeenCalledWith(Emotion.Curious, 1)
    expect(deps.speak).toHaveBeenCalled()
  })

  it('数量未变（context 更新，不 emit）→ 无反应', () => {
    const deps = makeDeps()
    handleConnectorChange([makeConnector('zcode', 'ZCode')], 1, deps)
    expect(deps.applyEvent).not.toHaveBeenCalled()
    expect(deps.speak).not.toHaveBeenCalled()
  })

  it('全部断开 → Sad + 朗读「断开了」', () => {
    const deps = makeDeps()
    handleConnectorChange([], 2, deps)
    expect(deps.applyEvent).toHaveBeenCalledWith(Emotion.Sad, 1)
    expect(deps.enqueue).toHaveBeenCalledWith({ name: Emotion.Sad, intensity: 1 })
    expect(deps.speak).toHaveBeenCalledWith('IDE 断开了，有需要随时叫我。')
  })

  it('部分断开但仍有连接 → 不打扰', () => {
    const deps = makeDeps()
    handleConnectorChange([makeConnector('zcode', 'ZCode')], 2, deps)
    expect(deps.applyEvent).not.toHaveBeenCalled()
    expect(deps.speak).not.toHaveBeenCalled()
  })
})
