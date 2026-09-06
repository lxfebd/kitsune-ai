import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { electronWebEvaluate, electronWebNavigate, electronWebSearch } from '../../../../shared/eventa'
import { createWebService } from './index'

// defineInvokeHandler 在运行时触碰 electron IPC，这里替换为记录型 stub；
// 其余 @moeru/eventa 导出保持真实（shared/eventa 的契约对象依赖它们）。
const defineInvokeHandlerMock = vi.hoisted(() => vi.fn())

vi.mock('@moeru/eventa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@moeru/eventa')>()
  return {
    ...actual,
    defineInvokeHandler: defineInvokeHandlerMock,
  }
})

// ---- fetch 夹具 ----

function stubFetchPage(html: string) {
  const mock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    url: 'https://example.com/page',
    text: () => Promise.resolve(html),
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

// 构造包含 count 条结果的 DuckDuckGo HTML 结果页。
function ddgPage(count: number): string {
  return Array.from({ length: count }, (_, i) =>
    `<div class="result"><a class="result__a" href="https://example.com/${i + 1}">Result ${i + 1}</a><a class="result__snippet" href="#">Snippet ${i + 1}.</a></div>`,
  ).join('')
}

function createService() {
  return createWebService({ context: {} as never })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createWebService', () => {
  it('registers all three invoke handlers on the given context', () => {
    createService()
    expect(defineInvokeHandlerMock).toHaveBeenCalledTimes(3)
    expect(defineInvokeHandlerMock).toHaveBeenCalledWith(expect.anything(), electronWebNavigate, expect.any(Function))
    expect(defineInvokeHandlerMock).toHaveBeenCalledWith(expect.anything(), electronWebEvaluate, expect.any(Function))
    expect(defineInvokeHandlerMock).toHaveBeenCalledWith(expect.anything(), electronWebSearch, expect.any(Function))
  })
})

describe('navigate', () => {
  it('rejects urls that are not http/https', async () => {
    const { navigate } = createService()
    await expect(
      navigate({ url: 'ftp://example.com/file', timeoutSec: 20, maxBodyChars: 100_000 }),
    ).rejects.toThrow('Only http/https URLs are supported')
  })

  it('rejects unparseable urls', async () => {
    const { navigate } = createService()
    await expect(
      navigate({ url: 'not a url', timeoutSec: 20, maxBodyChars: 100_000 }),
    ).rejects.toThrow('Invalid URL: not a url')
  })

  it('fetches the page and reports title, text, and truncation', async () => {
    const body = 'a'.repeat(1500)
    const html = `<html><head><title>Big Page</title></head><body><main>${body}</main></body></html>`
    stubFetchPage(html)
    const { navigate } = createService()

    const result = await navigate({ url: 'https://example.com/page', timeoutSec: 20, maxBodyChars: 1000 })

    expect(result.url).toBe('https://example.com/page')
    expect(result.status).toBe(200)
    expect(result.title).toBe('Big Page')
    expect(result.truncated).toBe(true)
    expect(result.text).toBe('a'.repeat(1000) + '\n…[truncated 500 chars]')

    const fetchMock = vi.mocked(globalThis.fetch)
    const [fetchUrl, init] = fetchMock.mock.calls[0]!
    expect(fetchUrl).toBe('https://example.com/page')
    const request = init as RequestInit
    expect(request.headers).toMatchObject({ 'user-agent': expect.stringContaining('Chrome') })
    expect(request.signal).toBeInstanceOf(AbortSignal)
  })

  it('reports a friendly timeout error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('The operation was aborted', 'TimeoutError')))
    const { navigate } = createService()
    await expect(
      navigate({ url: 'https://example.com/slow', timeoutSec: 5, maxBodyChars: 100_000 }),
    ).rejects.toThrow('Timed out after 5s fetching https://example.com/slow')
  })

  it('reports a friendly fetch error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    const { navigate } = createService()
    await expect(
      navigate({ url: 'https://example.com/down', timeoutSec: 5, maxBodyChars: 100_000 }),
    ).rejects.toThrow('Failed to fetch https://example.com/down: ECONNREFUSED')
  })
})

describe('evaluate', () => {
  it('extracts from provided html without fetching', async () => {
    const { evaluate } = createService()
    const result = await evaluate({
      html: '<div id="main">from html</div>',
      url: null,
      selector: '#main',
      timeoutSec: 20,
    })
    expect(result.source).toBe('provided')
    expect(result.url).toBeNull()
    expect(result.found).toBe(true)
    expect(result.text).toBe('from html')
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('fetches url when html is empty', async () => {
    stubFetchPage('<div id="main">fetched body</div>')
    const { evaluate } = createService()
    const result = await evaluate({
      html: '  ',
      url: 'https://example.com/page',
      selector: '#main',
      timeoutSec: 20,
    })
    expect(result.source).toBe('fetched')
    expect(result.url).toBe('https://example.com/page')
    expect(result.found).toBe(true)
    expect(result.text).toBe('fetched body')
  })

  it('throws when neither html nor url is provided', async () => {
    const { evaluate } = createService()
    await expect(
      evaluate({ html: null, url: null, selector: '#main', timeoutSec: 20 }),
    ).rejects.toThrow('Provide either html or url.')
  })

  it('reports found=false for a missing selector', async () => {
    const { evaluate } = createService()
    const result = await evaluate({
      html: '<div>nothing here</div>',
      url: null,
      selector: '#missing',
      timeoutSec: 20,
    })
    expect(result.found).toBe(false)
    expect(result.text).toBe('')
  })
})

describe('search', () => {
  it('rejects an empty query', async () => {
    const { search } = createService()
    await expect(
      search({ query: '   ', maxResults: 5 }),
    ).rejects.toThrow('query must not be empty')
  })

  it('clamps maxResults into the 1-10 range', async () => {
    stubFetchPage(ddgPage(12))
    const { search } = createService()

    const wide = await search({ query: 'kitsune', maxResults: 99 })
    expect(wide.results).toHaveLength(10)
    expect(wide.results[0]).toMatchObject({
      title: 'Result 1',
      url: 'https://example.com/1',
      snippet: 'Snippet 1.',
    })

    const narrow = await search({ query: 'kitsune', maxResults: 0 })
    expect(narrow.results).toHaveLength(1)

    const fetchMock = vi.mocked(globalThis.fetch)
    expect(fetchMock.mock.calls[0]![0]).toContain('https://html.duckduckgo.com/html/?q=kitsune')
  })
})
