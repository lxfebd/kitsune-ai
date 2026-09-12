// Domain: web-tools — eventa IPC 契约按域拆分
import { defineInvokeEventa } from '@moeru/eventa'

export interface WebNavigatePayload {
  url: string
  /** 抓取超时（秒），1–60。 */
  timeoutSec: number
  /** 返回文本上限（字符），1000–200000。 */
  maxBodyChars: number
}

/** browser.navigate 结果：重定向后的最终 URL、状态码、标题与截断后的正文文本。 */
export interface WebNavigateResult {
  url: string
  status: number
  title: string
  text: string
  truncated: boolean
}

/** browser.evaluate 入参：对提供的 HTML（或抓取 URL 得到的 HTML）按 CSS 选择器提取文本。 */
export interface WebEvaluatePayload {
  /** 直接提供的 HTML；与 url 二选一（同时提供时优先 html）。 */
  html: string | null
  /** 待抓取的 http(s) URL；与 html 二选一。 */
  url: string | null
  /** 支持的 CSS 选择器：#id、.class 或 tagname。 */
  selector: string
  /** url 抓取超时（秒），1–60。 */
  timeoutSec: number
}

/** browser.evaluate 结果。 */
export interface WebEvaluateResult {
  source: 'provided' | 'fetched'
  url: string | null
  found: boolean
  text: string
}

/** web_search 入参。 */
export interface WebSearchPayload {
  /** 搜索词，1–500 字符。 */
  query: string
  /** 返回结果数上限，1–10。 */
  maxResults: number
}

/** web_search 单条结果。 */
export interface WebSearchHit {
  title: string
  url: string
  snippet: string
}

/** web_search 结果。 */
export interface WebSearchResult {
  query: string
  results: WebSearchHit[]
}

export const electronWebNavigate = defineInvokeEventa<WebNavigateResult, WebNavigatePayload>('eventa:invoke:electron:web:navigate')
export const electronWebEvaluate = defineInvokeEventa<WebEvaluateResult, WebEvaluatePayload>('eventa:invoke:electron:web:evaluate')
export const electronWebSearch = defineInvokeEventa<WebSearchResult, WebSearchPayload>('eventa:invoke:electron:web:search')
