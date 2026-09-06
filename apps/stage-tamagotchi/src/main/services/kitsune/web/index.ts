/**
 * 内置网页服务（browser.navigate / browser.evaluate / web_search 的本地适配器）。
 *
 * 在主进程内执行网络抓取与 HTML 解析，避开渲染进程 fetch 的 CORS 限制，
 * 也不依赖任何外部 MCP 服务。
 *
 * Call stack:
 *
 * 渲染进程工具 (renderer/stores/tools/builtin/web-tools.ts)
 *   -> {@link electronWebNavigate} / {@link electronWebEvaluate} / {@link electronWebSearch}
 *     -> {@link createWebService} 注册的 invoke 处理器
 *       -> fetchHtml / {@link searchDuckDuckGo} / {@link extractBySelector}
 */

import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { WebEvaluateResult, WebNavigateResult, WebSearchResult } from '../../../../shared/eventa'

import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'

import { electronWebEvaluate, electronWebNavigate, electronWebSearch } from '../../../../shared/eventa'
import { extractBySelector, extractTitle, htmlToText } from './html'
import { searchDuckDuckGo } from './search'

export interface WebService {
  navigate: WebNavigateHandler
  evaluate: WebEvaluateHandler
  search: WebSearchHandler
}

export type WebNavigateHandler = (payload: { url: string, timeoutSec: number, maxBodyChars: number }) => Promise<WebNavigateResult>
export type WebEvaluateHandler = (payload: { html: string | null, url: string | null, selector: string, timeoutSec: number }) => Promise<WebEvaluateResult>
export type WebSearchHandler = (payload: { query: string, maxResults: number }) => Promise<WebSearchResult>

const DEFAULT_TIMEOUT_SEC = 20
const DEFAULT_MAX_BODY_CHARS = 100_000

// NOTICE: 与 search.ts 保持一致的桌面浏览器 UA；html.duckduckgo.com 对默认 Node UA
// 可能返回空结果页。两处各自声明是为了让两个模块可独立测试。
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value))
    return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

function assertHttpUrl(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  }
  catch {
    throw new Error(`Invalid URL: ${url}`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    throw new Error(`Only http/https URLs are supported, got "${parsed.protocol}"`)
}

async function fetchHtml(url: string, timeoutSec: number): Promise<{ html: string, status: number, finalUrl: string }> {
  let response: Response
  try {
    response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutSec * 1000),
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,*/*',
      },
    })
  }
  catch (error) {
    const message = errorMessageFrom(error) ?? ''
    const aborted = (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) || /abort|timeout/i.test(message)
    if (aborted)
      throw new Error(`Timed out after ${timeoutSec}s fetching ${url}`)
    throw new Error(`Failed to fetch ${url}: ${message || 'unknown error'}`)
  }

  const html = await response.text()
  return { html, status: response.status, finalUrl: response.url || url }
}

function createNavigateHandler(): WebNavigateHandler {
  return async payload => {
    assertHttpUrl(payload.url)
    const timeoutSec = clamp(payload.timeoutSec, 1, 60, DEFAULT_TIMEOUT_SEC)
    const maxBodyChars = clamp(payload.maxBodyChars, 1000, 200_000, DEFAULT_MAX_BODY_CHARS)

    const { html, status, finalUrl } = await fetchHtml(payload.url, timeoutSec)
    const fullText = htmlToText(html)
    const truncated = fullText.length > maxBodyChars

    return {
      url: finalUrl,
      status,
      title: extractTitle(html),
      text: truncated
        ? `${fullText.slice(0, maxBodyChars)}\n…[truncated ${fullText.length - maxBodyChars} chars]`
        : fullText,
      truncated,
    }
  }
}

function createEvaluateHandler(): WebEvaluateHandler {
  return async payload => {
    let html: string
    let source: 'provided' | 'fetched' = 'provided'
    let finalUrl: string | null = null

    if (payload.html && payload.html.trim()) {
      html = payload.html
    }
    else {
      if (!payload.url)
        throw new Error('Provide either html or url.')
      assertHttpUrl(payload.url)
      const timeoutSec = clamp(payload.timeoutSec, 1, 60, DEFAULT_TIMEOUT_SEC)
      const fetched = await fetchHtml(payload.url, timeoutSec)
      html = fetched.html
      finalUrl = fetched.finalUrl
      source = 'fetched'
    }

    const text = extractBySelector(html, payload.selector)
    return {
      source,
      url: finalUrl,
      found: text.length > 0,
      text,
    }
  }
}

function createSearchHandler(): WebSearchHandler {
  return async payload => {
    const query = payload.query.trim()
    if (!query)
      throw new Error('query must not be empty')
    const maxResults = clamp(payload.maxResults, 1, 10, 5)
    const results = await searchDuckDuckGo(query, maxResults, { timeoutSec: DEFAULT_TIMEOUT_SEC })
    return { query, results }
  }
}

/**
 * 创建网页服务并注册全部 invoke 处理器。
 *
 * @param params.context 主进程 eventa context（注册目标）。
 */
export function createWebService(params: { context: ReturnType<typeof createContext>['context'] }): WebService {
  const navigate = createNavigateHandler()
  const evaluate = createEvaluateHandler()
  const search = createSearchHandler()

  defineInvokeHandler(params.context, electronWebNavigate, navigate)
  defineInvokeHandler(params.context, electronWebEvaluate, evaluate)
  defineInvokeHandler(params.context, electronWebSearch, search)

  return { navigate, evaluate, search }
}
