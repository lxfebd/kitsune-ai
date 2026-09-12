import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// generateHeadless 依赖 injeca 解析 config；logg / eventa 仅模块级副作用，mock 掉隔离
vi.mock('injeca', () => ({
  injeca: { resolve: vi.fn() },
}))

vi.mock('@guiiai/logg', () => ({
  useLogg: () => ({
    useGlobalConfig: () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
  }),
}))

vi.mock('@moeru/eventa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@moeru/eventa')>()
  return { ...actual, defineInvokeHandler: vi.fn() }
})

import { injeca } from 'injeca'
import type { ArtistryProvider, ArtistryJobStatus } from './providers/base'

const { generateHeadless, downloadImageAsBase64, artistryProviders } = await import('./artistry-bridge')

/** 可手动触发回调的假 provider（模拟 ComfyUI 的 setJobCallback 行为，generate 同步返回 job） */
function makeCallbackProvider() {
  let cb: ((s: ArtistryJobStatus) => void) | undefined
  const provider: ArtistryProvider = {
    id: 'fake',
    name: 'Fake',
    initialize: vi.fn(),
    generate: vi.fn().mockResolvedValue({ jobId: 'j1', providerJobId: 'pj1' }),
    getStatus: vi.fn(),
    setJobCallback(_jobId: string, callback: (s: ArtistryJobStatus) => void) {
      cb = callback
    },
  }
  const fire = (status: ArtistryJobStatus) => cb?.(status)
  return { provider, fire }
}

/** 响应 abort 信号的挂起 fetch：只有 signal.abort 时 reject（模拟网络卡死） */
function stubHangingFetch() {
  vi.stubGlobal('fetch', vi.fn((_url: string, opts?: { signal?: AbortSignal }) =>
    new Promise((_resolve, reject) => {
      opts?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }),
  ))
}

describe('artistry-bridge D1 — 图片下载超时与迟到回调短路', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(injeca.resolve).mockResolvedValue({
      config: { get: () => ({ artistryProvider: 'fake', artistryGlobals: {} }) },
    })
  })

  afterEach(() => {
    artistryProviders.delete('fake')
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('downloadImageAsBase64: 30s 未响应 → fetch 收到 abort 信号并 reject（不再无限挂起）', async () => {
    stubHangingFetch()

    const promise = downloadImageAsBase64('http://127.0.0.1:9999/hang.png')
    let settled: 'pending' | 'rejected' = 'pending'
    promise.catch(() => { settled = 'rejected' })

    await vi.advanceTimersByTimeAsync(29_000)
    expect(settled).toBe('pending')
    await vi.advanceTimersByTimeAsync(2_000) // 越过 30s → abort 触发
    await expect(promise).rejects.toThrow()
    expect(settled).toBe('rejected')
  })

  it('downloadImageAsBase64: 正常下载返回 data URL，且带 signal 传给 fetch', async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      statusText: 'OK',
      arrayBuffer: async () => pngBytes.buffer,
    }))

    const dataUrl = await downloadImageAsBase64('http://127.0.0.1:9999/img.png')
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true)
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:9999/img.png', expect.objectContaining({ signal: expect.anything() }))
  })

  it('generateHeadless 回调超时 → 返回 {error}（外层已收敛），迟到成功回调被忽略（不再触发下载）', async () => {
    const { provider, fire } = makeCallbackProvider()
    artistryProviders.set('fake', provider)
    stubHangingFetch()

    const promise = generateHeadless({ prompt: 'cat', provider: 'fake' })
    // 等 generateHeadless 走到 setJobCallback（微任务冲刷）
    await vi.advanceTimersByTimeAsync(0)

    // 5 分钟超时 → generateHeadless 把内部 reject 收敛成 { error }
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1)
    await expect(promise).resolves.toMatchObject({ error: 'Image generation timed out after 5 minutes.' })

    // 超时后才到达的迟到成功回调 → 短路：不再发起下载
    const fetchMock = vi.mocked(fetch)
    fire({ status: 'succeeded', imageUrl: 'http://127.0.0.1:9999/late.png' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('generateHeadless 回调正常成功 → 走下载并返回 base64（正常路径不受影响）', async () => {
    const { provider, fire } = makeCallbackProvider()
    artistryProviders.set('fake', provider)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      statusText: 'OK',
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }))

    const promise = generateHeadless({ prompt: 'cat', provider: 'fake' })
    await vi.advanceTimersByTimeAsync(0) // 等 setJobCallback 完成注册
    fire({ status: 'succeeded', imageUrl: 'http://127.0.0.1:9999/ok.png' })

    // 回调下载在异步回调里完成，先推到微任务
    await vi.advanceTimersByTimeAsync(0)
    const result = await promise
    expect(result.base64).toBe('data:image/png;base64,AQID')
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:9999/ok.png', expect.objectContaining({ signal: expect.anything() }))
  })
})

describe('artistry-bridge — 导出回归锁定', () => {
  it('downloadImageAsBase64 / generateHeadless 均导出（测试可直测）', () => {
    expect(typeof downloadImageAsBase64).toBe('function')
    expect(typeof generateHeadless).toBe('function')
  })
})