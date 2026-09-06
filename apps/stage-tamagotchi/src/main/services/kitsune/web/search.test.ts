import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseDuckDuckGoHtml, resolveResultUrl, searchDuckDuckGo } from './search'

const DDG_FIXTURE = `
<html><body>
  <div class="result results_links results_links_deep web-result">
    <div class="links_main links_deep result__body">
      <h2 class="result__title">
        <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs&amp;foo=bar&rut=abc123">Example Docs</a>
      </h2>
      <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs">This is the <b>snippet</b> with bold and &amp; entities.</a>
    </div>
  </div>
  <div class="result results_links results_links_deep web-result">
    <div class="links_main links_deep result__body">
      <h2 class="result__title">
        <a class="result__a" href="https://plain.org/page">Plain Result</a>
      </h2>
    </div>
  </div>
  <div class="result results_links results_links_deep web-result">
    <div class="links_main links_deep result__body">
      <h2 class="result__title">
        <a class="result__a" href="https://third.example/">Third</a>
      </h2>
      <a class="result__snippet" href="#">Third snippet.</a>
    </div>
  </div>
  <a class="result__a" href="https://stray.example/">Stray link outside results</a>
</body></html>
`

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseDuckDuckGoHtml', () => {
  it('pairs titles with snippets and unwraps uddg redirects', () => {
    const hits = parseDuckDuckGoHtml(DDG_FIXTURE)
    expect(hits).toHaveLength(4)

    expect(hits[0]!.title).toBe('Example Docs')
    // uddg is one query parameter: the real url ends at the next '&'.
    expect(hits[0]!.url).toBe('https://example.com/docs')
    expect(hits[0]!.snippet).toBe('This is the snippet with bold and & entities.')

    expect(hits[1]!.title).toBe('Plain Result')
    expect(hits[1]!.url).toBe('https://plain.org/page')
    expect(hits[1]!.snippet).toBe('')
  })

  it('returns an empty list for pages without results', () => {
    expect(parseDuckDuckGoHtml('<html><body><p>no results</p></body></html>')).toEqual([])
  })
})

describe('resolveResultUrl', () => {
  it('unwraps duckduckgo redirect links', () => {
    expect(resolveResultUrl('//duckduckgo.com/l/?uddg=https%3A%2F%2Fa.com%2Fb&rut=x')).toBe('https://a.com/b')
  })

  it('keeps direct urls and fixes protocol-relative links', () => {
    expect(resolveResultUrl('https://a.com/b')).toBe('https://a.com/b')
    expect(resolveResultUrl('//a.com/b')).toBe('https://a.com/b')
  })

  it('returns the raw input when it is not a parseable URL', () => {
    expect(resolveResultUrl('not a url')).toBe('not a url')
    expect(resolveResultUrl('   ')).toBe('')
  })
})

describe('searchDuckDuckGo', () => {
  it('requests the html endpoint with the encoded query and respects maxResults', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => DDG_FIXTURE,
    })
    vi.stubGlobal('fetch', fetchSpy)

    const hits = await searchDuckDuckGo('kitsune ai search', 2)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(url).toContain('https://html.duckduckgo.com/html/?q=kitsune%20ai%20search')
    expect((init as RequestInit).method).toBe('GET')
    expect(hits).toHaveLength(2)
    expect(hits[0]!.title).toBe('Example Docs')
  })

  it('throws a friendly error when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')))
    await expect(searchDuckDuckGo('q', 5)).rejects.toThrow('DuckDuckGo 请求失败')
  })

  it('throws when the endpoint responds non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => '' }))
    await expect(searchDuckDuckGo('q', 5)).rejects.toThrow('HTTP 403')
  })
})
