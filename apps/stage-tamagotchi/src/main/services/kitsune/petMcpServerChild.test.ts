import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// petMcpServerChild.ts 是自执行入口（import 即连 stdio）：
// mock 掉 MCP SDK，让顶层 main() 空跑，只测我们关心的 forwardToBridge。
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: class {
    setRequestHandler = vi.fn()
    connect = vi.fn().mockResolvedValue(undefined)
  },
}))

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(),
}))

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  CallToolRequestSchema: 'CallToolRequestSchema',
  ListToolsRequestSchema: 'ListToolsRequestSchema',
}))

const { forwardToBridge } = await import('./petMcpServerChild')

/** 响应 abort 信号的挂起 fetch：只有 abort 时 reject（模拟主进程桥卡死） */
function stubHangingFetch() {
  vi.stubGlobal('fetch', vi.fn((_url: string, opts?: { signal?: AbortSignal }) =>
    new Promise((_resolve, reject) => {
      opts?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }),
  ))
}

describe('petMcpServerChild — forwardToBridge 超时', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('桥 10s 无响应 → fetch 收到 abort 并 reject（不再无限挂起）', async () => {
    stubHangingFetch()
    const promise = forwardToBridge({ type: 'milestone', message: 'hi' }, 'http://127.0.0.1:6122/pet-reaction', 10_000)

    let settled = false
    promise.catch(() => { settled = true })

    await vi.advanceTimersByTimeAsync(9_500)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1_000) // 越过 10s
    await expect(promise).rejects.toThrow()
    expect(settled).toBe(true)
  })

  it('桥正常响应 → 解析结果 JSON 并返回 content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      statusText: 'OK',
      json: async () => ({ status: 'queued', reason: undefined }),
    }))
    const result = await forwardToBridge({ type: 'milestone', message: 'hi' }, 'http://127.0.0.1:6122/pet-reaction')
    expect(result.content).toHaveLength(1)
    expect(JSON.parse(result.content[0].text)).toMatchObject({ status: 'queued' })
  })

  it('fetch 收到 signal（超时可终止的关键断言）', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      statusText: 'OK',
      json: async () => ({ status: 'queued', reason: undefined }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await forwardToBridge({ type: 'milestone', message: 'hi' }, 'http://127.0.0.1:6122/pet-reaction', 10_000)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:6122/pet-reaction',
      expect.objectContaining({ signal: expect.anything() }),
    )
  })
})