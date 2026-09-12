import type { DirectorVerdictEventPayload } from '../../shared/eventa'
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

import { handleDirectorVerdict } from './useDirectorEmotion'

function createDeps() {
  return {
    applyEvent: vi.fn(),
    enqueue: vi.fn(),
    speak: vi.fn(),
  }
}

function makeVerdict(overrides: Partial<DirectorVerdictEventPayload> = {}): DirectorVerdictEventPayload {
  return {
    planId: 'plan_1',
    verdict: 'approved',
    reason: '计划清晰',
    reviewedAt: Date.now(),
    ...overrides,
  }
}

describe('handleDirectorVerdict', () => {
  it('approved → Happy + speak approval', () => {
    const deps = createDeps()
    handleDirectorVerdict(makeVerdict(), deps)

    expect(deps.applyEvent).toHaveBeenCalledWith(Emotion.Happy, 1)
    expect(deps.enqueue).toHaveBeenCalledWith({ name: Emotion.Happy, intensity: 1 })
    expect(deps.speak).toHaveBeenCalledWith('这份计划我批了，开工吧！')
  })

  it('rejected → Think + speak rejection', () => {
    const deps = createDeps()
    handleDirectorVerdict(makeVerdict({ verdict: 'rejected', reason: '任务拆分不清' }), deps)

    expect(deps.applyEvent).toHaveBeenCalledWith(Emotion.Think, 1)
    expect(deps.enqueue).toHaveBeenCalledWith({ name: Emotion.Think, intensity: 1 })
    expect(deps.speak).toHaveBeenCalledWith('这份计划还差点意思，我打回去了。')
  })
})