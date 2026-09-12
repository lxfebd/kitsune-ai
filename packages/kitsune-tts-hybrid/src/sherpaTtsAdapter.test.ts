import { describe, expect, it, vi, beforeEach } from 'vitest'

import { SherpaTtsAdapter } from './sherpaTtsAdapter.js'
import { TTSErrorCode } from './types.js'

// 用注入的 createTts 工厂替代真实 WASM（与包内 GPT-SoVITS sidecar 注入模式一致，
// 不走 vi.mock，避免 CJS require 拦截不可靠）。
const mockTts = {
  sampleRate: 24000,
  generate: vi.fn(() => ({
    samples: new Int16Array([100, -200, 300]),
    sampleRate: 24000,
  })),
}
const createTts = vi.fn(() => mockTts)

function makeAdapter() {
  return new SherpaTtsAdapter({
    model: { model: '/models/vits.onnx', tokens: '/models/tokens.txt' },
    createTts,
  })
}

describe('SherpaTtsAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('实现 TTSAdapter 契约：synthesize 返回 Float32 PCM ArrayBuffer', async () => {
    const adapter = makeAdapter()
    const buf = await adapter.synthesize('你好')
    expect(buf).toBeInstanceOf(ArrayBuffer)
    const f32 = new Float32Array(buf)
    expect(f32.length).toBeGreaterThan(0)
    // Int16 [100, -200, 300] → Float32 归一化（/32768）
    expect(f32[0]).toBeCloseTo(100 / 32768, 5)
    expect(f32[1]).toBeCloseTo(-200 / 32768, 5)
  })

  it('惰性加载：首次调用才触发 createTts', async () => {
    const adapter = makeAdapter()
    expect(createTts).not.toHaveBeenCalled()
    await adapter.health()
    expect(createTts).toHaveBeenCalledTimes(1)
  })

  it('stream 产出单块完整音频', async () => {
    const adapter = makeAdapter()
    const controller = adapter.stream('你好')
    const reader = controller.chunks.getReader()
    const { value, done } = await reader.read()
    expect(done).toBe(false)
    expect(value?.isLast).toBe(true)
    expect(value?.sampleRate).toBe(24000)
    expect(value?.data.length).toBeGreaterThan(0)
    const next = await reader.read()
    expect(next.done).toBe(true)
  })

  it('模型加载失败 → health unhealthy + synthesize 抛 MODEL_NOT_LOADED', async () => {
    createTts.mockImplementationOnce(() => {
      throw new Error('vits-model does not exist')
    })
    const adapter = makeAdapter()
    const health = await adapter.health()
    expect(health.status).toBe('unhealthy')
    expect(health.error).toContain('does not exist')

    await expect(adapter.synthesize('x')).rejects.toMatchObject({
      code: TTSErrorCode.MODEL_NOT_LOADED,
    })
  })

  it('getVoices 返回单一默认音色', async () => {
    const adapter = makeAdapter()
    const voices = await adapter.getVoices()
    expect(voices).toHaveLength(1)
    expect(voices[0].id).toBe('default')
  })

  it('适配器可作为注册表引擎（id/type 对齐 local-model）', async () => {
    const { hasEngine, getEngine, listEngines } = await import('./engine-registry.js')
    expect(hasEngine('sherpa-tts')).toBe(true)
    const def = getEngine('sherpa-tts')
    expect(def?.type).toBe('local-model')
    expect(def?.name).toContain('Sherpa')
    // 引擎列表包含 sherpa，可与 gpt-sovits/edge-tts/system 平级替换
    const ids = listEngines().map(e => e.id)
    expect(ids).toContain('sherpa-tts')
    expect(ids).toContain('gpt-sovits')
    expect(ids).toContain('edge-tts')
    expect(ids).toContain('system')
  })
})