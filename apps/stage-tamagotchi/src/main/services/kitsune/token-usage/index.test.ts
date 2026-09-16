import { beforeEach, describe, expect, it, vi } from 'vitest'

// 在 import 服务前 mock electron 相关依赖
vi.mock('electron', () => ({ ipcMain: { on: vi.fn(), handle: vi.fn() } }))
vi.mock('@moeru/eventa', () => ({
  defineInvokeHandler: vi.fn(),
}))
vi.mock('../../../../shared/eventa', () => ({
  electronUsageSnapshot: { invokeEvent: { id: 'eventa:invoke:electron:usage:snapshot' } },
  electronUsageChanged: { event: { id: 'eventa:event:electron:usage:changed' } },
}))

const mockEmit = vi.fn()

// getElectronMainDirname mock — 指到临时目录
vi.mock('../../../libs/electron/location', () => ({
  getElectronMainDirname: () => '/tmp/kitsune-test/out/main',
}))

import { createTokenUsageService } from './index'

describe('createTokenUsageService', () => {
  beforeEach(() => {
    mockEmit.mockReset()
  })

  it('accumulates today usage and exposes snapshot', () => {
    const service = createTokenUsageService({ context: { emit: mockEmit } } as any)

    service.record({ promptTokens: 100, completionTokens: 50, timestamp: Date.now() })
    service.record({ promptTokens: 30, completionTokens: 20, timestamp: Date.now() })

    const snap = service.snapshot()
    expect(snap.today.requests).toBe(2)
    expect(snap.today.promptTokens).toBe(130)
    expect(snap.today.completionTokens).toBe(70)
    expect(snap.today.totalTokens).toBe(200)
    expect(snap.total.totalTokens).toBe(200)
    expect(mockEmit).toHaveBeenCalledTimes(2)

    service.dispose()
  })

  it('tracks last model name', () => {
    const service = createTokenUsageService({ context: { emit: mockEmit } } as any)

    service.record({ model: 'deepseekv4-flash', promptTokens: 10, completionTokens: 5, timestamp: Date.now() })
    expect(service.snapshot().lastModel).toBe('deepseekv4-flash')

    service.dispose()
  })

  it('clamps negative token values to zero', () => {
    const service = createTokenUsageService({ context: { emit: mockEmit } } as any)

    service.record({ promptTokens: -5, completionTokens: 10, timestamp: Date.now() })
    expect(service.snapshot().today.promptTokens).toBe(0)
    expect(service.snapshot().today.completionTokens).toBe(10)

    service.dispose()
  })
})
