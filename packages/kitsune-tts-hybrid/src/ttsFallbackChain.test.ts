import { describe, expect, it, vi } from 'vitest'

import { TTSFallbackChain } from './ttsFallbackChain.js'

import type { TTSAdapter } from './types.js'

function createMockAdapter(overrides: Partial<TTSAdapter> = {}): TTSAdapter {
  return {
    name: overrides.name ?? 'mock',
    device: overrides.device ?? 'cpu',
    synthesize: overrides.synthesize ?? vi.fn().mockResolvedValue(new ArrayBuffer(100)),
    stream: overrides.stream ?? vi.fn(),
    health: overrides.health ?? vi.fn().mockResolvedValue({ status: 'healthy', device: 'cpu' }),
    getVoices: overrides.getVoices ?? vi.fn().mockResolvedValue([]),
  }
}

describe('TTSFallbackChain', () => {
  it('synthesizes with the first available adapter', async () => {
    const adapter = createMockAdapter()
    const chain = new TTSFallbackChain({ adapters: [adapter] })

    const result = await chain.synthesizeWithFallback('hello')
    expect(result).toBeInstanceOf(ArrayBuffer)
    expect(adapter.synthesize).toHaveBeenCalledWith('hello', undefined)
  })

  it('falls back to second adapter when first is unhealthy', async () => {
    const unhealthy = createMockAdapter({
      name: 'unhealthy',
      device: 'gpu',
      health: vi.fn().mockResolvedValue({ status: 'unhealthy', device: 'gpu' }),
    })
    const healthy = createMockAdapter({
      name: 'healthy',
      device: 'cpu',
    })
    const chain = new TTSFallbackChain({ adapters: [unhealthy, healthy] })

    const result = await chain.synthesizeWithFallback('hello')
    expect(result).toBeInstanceOf(ArrayBuffer)
    expect(unhealthy.synthesize).not.toHaveBeenCalled()
    expect(healthy.synthesize).toHaveBeenCalled()
  })

  it('retries on failure within maxRetries', async () => {
    let callCount = 0
    const adapter = createMockAdapter({
      synthesize: vi.fn().mockImplementation(async () => {
        callCount++
        if (callCount < 2) throw new Error('transient error')
        return new ArrayBuffer(50)
      }),
    })
    const chain = new TTSFallbackChain({ adapters: [adapter], maxRetries: 3 })

    const result = await chain.synthesizeWithFallback('hello')
    expect(result).toBeInstanceOf(ArrayBuffer)
    expect(adapter.synthesize).toHaveBeenCalledTimes(2)
  })

  it('throws TTSError when all adapters fail', async () => {
    const adapter = createMockAdapter({
      synthesize: vi.fn().mockRejectedValue(new Error('always fails')),
    })
    const chain = new TTSFallbackChain({ adapters: [adapter], maxRetries: 0 })

    await expect(chain.synthesizeWithFallback('hello')).rejects.toThrow('All TTS devices unavailable')
  })

  it('chunks long text (>500 chars)', async () => {
    const adapter = createMockAdapter()
    const chain = new TTSFallbackChain({ adapters: [adapter] })

    const longText = 'a'.repeat(1200)
    await chain.synthesizeWithFallback(longText)

    // 1200 chars = 3 chunks (500 + 500 + 200)
    expect(adapter.synthesize).toHaveBeenCalledTimes(3)
  })

  it('reports available devices', () => {
    const gpu = createMockAdapter({ name: 'gpu', device: 'gpu' })
    const cpu = createMockAdapter({ name: 'cpu', device: 'cpu' })
    const chain = new TTSFallbackChain({ adapters: [gpu, cpu] })

    expect(chain.getAvailableDevices()).toEqual(['gpu', 'cpu'])
  })

  it('marks device unavailable and resets', () => {
    const adapter = createMockAdapter({ device: 'gpu' })
    const chain = new TTSFallbackChain({ adapters: [adapter] })

    chain.markDeviceUnavailable('gpu', new Error('test'))
    expect(chain.getAvailableDevices()).toEqual([])

    chain.resetDeviceStatus('gpu')
    expect(chain.getAvailableDevices()).toEqual(['gpu'])
  })
})
