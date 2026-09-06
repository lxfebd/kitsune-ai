/**
 * DuckDuckGo HTML 端点搜索（无 API key）。
 *
 * 抓取 `https://html.duckduckgo.com/html/?q=...` 的 HTML 结果页并解析
 * `result__a`（标题/链接）与 `result__snippet`（摘要）锚点。
 */

import { errorMessageFrom } from '@moeru/std'

import { decodeEntities, stripTags } from './html'

/** 搜索结果条目。 */
export interface SearchHit {
  title: string
  /** 已解包的真实 URL（DuckDuckGo 跳转链接会被还原为原始地址）。 */
  url: string
  snippet: string
}

export interface SearchDuckDuckGoOptions {
  /** 超时（秒）。 @default 20 */
  timeoutSec?: number
  /** 注入 fetch 实现（测试用）。 */
  fetchImpl?: typeof fetch
}

const DDG_HTML_ENDPOINT = 'https://html.duckduckgo.com/html/'

// NOTICE:
// html.duckduckgo.com 对无 UA / 默认 Node UA 的请求可能返回空结果页，
// 因此显式声明桌面浏览器 UA。
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/**
 * 通过 DuckDuckGo HTML 端点搜索。
 *
 * 调用方约定：query 非空、maxResults 已在 1–10 区间。
 */
export async function searchDuckDuckGo(query: string, maxResults: number, options: SearchDuckDuckGoOptions = {}): Promise<SearchHit[]> {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutSec = options.timeoutSec ?? 20
  const url = `${DDG_HTML_ENDPOINT}?q=${encodeURIComponent(query)}`

  let response: Response
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutSec * 1000),
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,*/*',
      },
    })
  }
  catch (error) {
    throw new Error(`DuckDuckGo 请求失败: ${errorMessageFrom(error) ?? 'unknown error'}`)
  }

  if (!response.ok)
    throw new Error(`DuckDuckGo 返回 HTTP ${response.status}`)

  const html = await response.text()
  return parseDuckDuckGoHtml(html).slice(0, maxResults)
}

interface AnchorRef {
  /** 锚点在原文中的起始下标（用于摘要配对定位）。 */
  index: number
  href: string
  text: string
}

function extractAnchors(html: string, className: string): AnchorRef[] {
  const out: AnchorRef[] = []
  const tagRe = /<a\b[^>]*>/gi
  let match: RegExpExecArray | null
  while ((match = tagRe.exec(html)) !== null) {
    const tag = match[0]

    const classMatch = /\bclass\s*=\s*("([^"]*)"|'([^']*)')/.exec(tag)
    const classes = (classMatch ? (classMatch[2] ?? classMatch[3] ?? '') : '').split(/\s+/)
    if (!classes.includes(className))
      continue

    const hrefMatch = /\bhref\s*=\s*("([^"]*)"|'([^']*)')/.exec(tag)
    const href = hrefMatch ? decodeEntities(hrefMatch[2] ?? hrefMatch[3] ?? '') : ''

    // 摘要锚点内可能包含 <b> 高亮等嵌套标签。
    const closeIndex = html.indexOf('</a>', match.index + tag.length)
    const inner = closeIndex >= 0 ? html.slice(match.index + tag.length, closeIndex) : ''

    out.push({
      index: match.index,
      href,
      text: stripTags(inner).replace(/\s+/g, ' ').trim(),
    })
  }
  return out
}

/**
 * 解析 DuckDuckGo HTML 结果页。
 *
 * 每个 `result__a` 标题配对其后方、下一个标题之前出现的第一个
 * `result__snippet`（按文档位置而非下标配对）；某条结果缺少摘要时返回
 * 空串，且不会使后续结果的摘要整体错位。
 */
export function parseDuckDuckGoHtml(html: string): SearchHit[] {
  const titles = extractAnchors(html, 'result__a')
  const snippets = extractAnchors(html, 'result__snippet')

  return titles.map((title, i) => {
    const nextStart = i + 1 < titles.length ? titles[i + 1]!.index : Number.MAX_SAFE_INTEGER
    const snippet = snippets.find(entry => entry.index > title.index && entry.index < nextStart)
    return {
      title: title.text,
      url: resolveResultUrl(title.href),
      snippet: snippet?.text ?? '',
    }
  })
}

/**
 * 还原 DuckDuckGo 结果链接。
 *
 * Before:
 * - "//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage&rut=abc"
 *
 * After:
 * - "https://example.com/page"
 *
 * 非跳转链接原样返回（协议相对链接补全为 https）。
 */
export function resolveResultUrl(href: string): string {
  const trimmed = href.trim()
  if (!trimmed)
    return ''

  try {
    const absolute = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed
    const parsed = new URL(absolute)
    if (parsed.hostname.endsWith('duckduckgo.com') && parsed.pathname.startsWith('/l/')) {
      const uddg = parsed.searchParams.get('uddg')
      if (uddg)
        return uddg
    }
    return absolute
  }
  catch {
    return trimmed
  }
}
