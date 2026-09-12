import type { SidecarStatus } from '../../shared/eventa'
import { Emotion } from '@kitsune/stage-ui/constants/emotions'
import { describe, expect, it, vi } from 'vitest'

// 顶层 import 会拉进 useCharacterStore 值导入 → analytics → ~build/time
// （unplugin-info 虚拟模块，仅 stage-ui 自己的 vitest 配置解析）。mock 掉避免加载失败。
vi.mock('@kitsune/stage-ui/stores/character', () => ({
  useCharacterStore: () => ({ emitTextOutput: vi.fn() }),
}))

// getElectronEventaContext 在模块顶层调用会抛错（无 IPC bridge），mock 掉
vi.mock('@kitsune/electron-vueuse', () => ({
  getElectronEventaContext: vi.fn(() => ({
    on: vi.fn(() => () => {}),
  })),
}))

import { handleSidecarStatus } from './useSidecarEmotion'

function createDeps() {
  return {
    applyEvent: vi.fn(),
    enqueue: vi.fn(),
    speak: vi.fn(),
  }
}

function makeStatus(overrides: Partial<SidecarStatus>): SidecarStatus {
  return {
    id: 'gpt-sovits',
    state: 'running',
    pid: 123,
    restartCount: 0,
    updatedAt: Date.now(),
    ...overrides,
  }
}

describe('handleSidecarStatus', () => {
  it('degraded → Sad + speak fallback message', () => {
    const deps = createDeps()
    handleSidecarStatus(makeStatus({ state: 'degraded', pid: null }), deps)

    expect(deps.applyEvent).toHaveBeenCalledWith(Emotion.Sad, 2)
    expect(deps.enqueue).toHaveBeenCalledWith({ name: Emotion.Sad, intensity: 2 })
    expect(deps.speak).toHaveBeenCalledWith('gpt-sovits 启动失败太多次，我已切换到备用方案。')
  })

  it('error → Awkward + speak error message', () => {
    const deps = createDeps()
    handleSidecarStatus(makeStatus({ state: 'error', pid: null }), deps)

    expect(deps.applyEvent).toHaveBeenCalledWith(Emotion.Awkward, 2)
    expect(deps.enqueue).toHaveBeenCalledWith({ name: Emotion.Awkward, intensity: 2 })
    expect(deps.speak).toHaveBeenCalledWith('gpt-sovits 出错了，可能是没找到引擎。')
  })

  it('running → Happy (recovered)', () => {
    const deps = createDeps()
    handleSidecarStatus(makeStatus({ state: 'running' }), deps)

    expect(deps.applyEvent).toHaveBeenCalledWith(Emotion.Happy, 1)
    expect(deps.enqueue).toHaveBeenCalledWith({ name: Emotion.Happy, intensity: 1 })
    expect(deps.speak).not.toHaveBeenCalled()
  })

  it('stopped / starting / stopping → no reaction', () => {
    for (const state of ['stopped', 'starting', 'stopping'] as const) {
      const deps = createDeps()
      handleSidecarStatus(makeStatus({ state, pid: null }), deps)
      expect(deps.applyEvent).not.toHaveBeenCalled()
      expect(deps.speak).not.toHaveBeenCalled()
    }
  })
})