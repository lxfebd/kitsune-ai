import { Emotion } from '@kitsune/stage-ui/constants/emotions'
import { describe, expect, it, vi } from 'vitest'

// 顶层 import 会拉进 useCharacterStore 值导入 → analytics → use-build-info
// → ~build/time（unplugin-info 虚拟模块，仅 stage-ui 自己的 vitest 配置解析）。
// 测试只关心纯逻辑，mock 掉 character store 避免加载失败。
vi.mock('@kitsune/stage-ui/stores/character', () => ({
  useCharacterStore: () => ({ emitTextOutput: vi.fn() }),
}))

// getElectronEventaContext 在模块顶层调用会抛错（无 IPC bridge），mock 掉
vi.mock('@kitsune/electron-vueuse', () => ({
  getElectronEventaContext: vi.fn(() => ({
    on: vi.fn(() => () => {}),
  })),
}))

import { handleMemoryEntryAdded } from './useMemoryEmotion'

function createDeps() {
  return {
    applyEvent: vi.fn(),
    enqueue: vi.fn(),
    speak: vi.fn(),
  }
}

describe('handleMemoryEntryAdded', () => {
  it('enqueues Curious then Happy with intensity 0.6', () => {
    const deps = createDeps()
    handleMemoryEntryAdded({ id: 'mem_1', content: '用户喜欢简洁', type: 'preference' }, deps)

    expect(deps.applyEvent).toHaveBeenNthCalledWith(1, Emotion.Curious, 0.6)
    expect(deps.enqueue).toHaveBeenNthCalledWith(1, { name: Emotion.Curious, intensity: 0.6 })
    expect(deps.applyEvent).toHaveBeenNthCalledWith(2, Emotion.Happy, 0.6)
    expect(deps.enqueue).toHaveBeenNthCalledWith(2, { name: Emotion.Happy, intensity: 0.6 })
  })

  it('speaks 记住了！ for user-written memory (source !== chat)', () => {
    const deps = createDeps()
    handleMemoryEntryAdded({ id: 'mem_2', content: '记住：明天开会', type: 'fact', source: 'llm' }, deps)
    expect(deps.speak).toHaveBeenCalledWith('记住了！')
  })

  it('stays quiet for chat auto-extracted memory (source === chat)', () => {
    const deps = createDeps()
    handleMemoryEntryAdded({ id: 'mem_3', content: '用户喜欢猫', type: 'preference', source: 'chat' }, deps)
    expect(deps.speak).not.toHaveBeenCalled()
  })

  it('stays quiet when source is missing', () => {
    const deps = createDeps()
    handleMemoryEntryAdded({ id: 'mem_4', content: '无来源', type: 'fact' }, deps)
    expect(deps.speak).not.toHaveBeenCalled()
  })
})