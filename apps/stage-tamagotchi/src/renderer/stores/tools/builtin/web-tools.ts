import type { Tool } from '@xsai/shared-chat'
import type { WindowInfo } from '../../../../shared/eventa'
import type { JsonSchema } from 'xsschema'

import { defineInvoke } from '@moeru/eventa'
import { getElectronEventaContext } from '@kitsune/electron-vueuse'
import { normalizeNullableAnyOf } from '@kitsune/stage-shared/json-schema'
import { rawTool } from '@xsai/tool'
import { toJsonSchema } from 'xsschema'
import { z } from 'zod'

import {
  electronDesktopAutomationInvoke,
  electronWebEvaluate,
  electronWebNavigate,
  electronWebSearch,
} from '../../../../shared/eventa'

// NOTICE: build the eventa context lazily instead of at module scope. Module-scope
// `getElectronEventaContext()` throws when imported without an Electron IPC bridge
// (unit tests, web runtime), which broke tool definition resolution. Production
// behavior is unchanged: the context is still created once, on first invocation.
let sharedContext: ReturnType<typeof getElectronEventaContext> | undefined

function getContext() {
  sharedContext ??= getElectronEventaContext()
  return sharedContext
}

function createInvokers() {
  const context = getContext()
  return {
    navigate: defineInvoke(context, electronWebNavigate),
    evaluate: defineInvoke(context, electronWebEvaluate),
    search: defineInvoke(context, electronWebSearch),
    listWindows: defineInvoke(context, electronDesktopAutomationInvoke),
  }
}

export type WebToolInvokers = ReturnType<typeof createInvokers>

let webToolInvokers: WebToolInvokers | undefined

function resolveInvokers(override?: WebToolInvokers): WebToolInvokers {
  if (override)
    return override
  webToolInvokers ??= createInvokers()
  return webToolInvokers
}

// NOTICE: OpenAI-compatible tool validators reject strict object schemas when
// some nested properties are omitted from `required`. Keep these fields
// required-but-nullable for the provider, then collapse `null` back to omitted
// runtime fields before dispatching.
const navigateParams = z.object({
  url: z.string().describe('Absolute http(s) URL to navigate to.'),
  timeoutSec: z.union([z.number().int().min(1).max(60), z.null()]).describe('Fetch timeout in seconds (1-60). Omit or null for the default of 20.'),
  maxBodyChars: z.union([z.number().int().min(1000).max(200000), z.null()]).describe('Max characters of extracted text to return (1000-200000). Omit or null for the default of 100000.'),
}).strict()

type NavigateToolInput = z.infer<typeof navigateParams>

const evaluateParams = z.object({
  html: z.string().nullable().describe('Raw HTML to evaluate. Provide this OR url (html wins when both are given).'),
  url: z.string().nullable().describe('http(s) URL to fetch, then evaluate. Provide this OR html.'),
  selector: z.string().describe('CSS selector to extract text for: #id, .class, or tagname (e.g. "article", "#main", ".content").'),
  timeoutSec: z.union([z.number().int().min(1).max(60), z.null()]).describe('Fetch timeout in seconds when url is used (1-60). Omit or null for the default of 20.'),
}).strict()

type EvaluateToolInput = z.infer<typeof evaluateParams>

const screenshotParams = z.object({
  windowTitle: z.string().nullable().describe('Substring of the browser window title to look for. Omit to list visible browser windows.'),
  title: z.string().nullable().describe('Alias of windowTitle (either may be used).'),
}).strict()

type ScreenshotToolInput = z.infer<typeof screenshotParams>

const searchParams = z.object({
  query: z.string().min(1).max(500).describe('Search query (1-500 chars).'),
  max_results: z.union([z.number().int().min(1).max(10), z.null()]).describe('Max results to return (1-10). Omit or null for the default of 5.'),
}).strict()

type SearchToolInput = z.infer<typeof searchParams>

// 常见浏览器进程名（含国内浏览器），用于在未指定标题时筛选候选窗口。
const BROWSER_PROCESS_RE = /chrome|chromium|msedge|firefox|brave|opera|vivaldi|maxthon|arc|360|qqbrowser/i

/**
 * browser.navigate — 抓取 URL 并返回提取后的正文文本。
 */
export async function navigateWebPage(input: NavigateToolInput, deps?: { invokers?: WebToolInvokers }) {
  const invokers = resolveInvokers(deps?.invokers)
  return invokers.navigate({
    url: input.url.trim(),
    timeoutSec: input.timeoutSec ?? 20,
    maxBodyChars: input.maxBodyChars ?? 100000,
  })
}

/**
 * browser.evaluate — 对 HTML（提供的或抓取的）按 CSS 选择器提取文本。
 */
export async function evaluateHtml(input: EvaluateToolInput, deps?: { invokers?: WebToolInvokers }) {
  const invokers = resolveInvokers(deps?.invokers)
  const result = await invokers.evaluate({
    html: input.html?.trim() ? input.html : null,
    url: input.url?.trim() ? input.url : null,
    selector: input.selector.trim(),
    timeoutSec: input.timeoutSec ?? 20,
  })

  if (!result.found)
    return { found: false, url: result.url, text: '', note: `No element matched selector "${input.selector}".` }

  return result
}

interface BrowserWindowCandidate {
  title: string
  processName: string
  pid: number
  x: number
  y: number
  width: number
  height: number
  isMaximized: boolean
}

/**
 * browser.screenshot — 给出浏览器窗口截图建议参数（实际截图走 desktop 工具）。
 */
export async function suggestBrowserCapture(input: ScreenshotToolInput, deps?: { invokers?: WebToolInvokers }) {
  const invokers = resolveInvokers(deps?.invokers)
  const response = await invokers.listWindows({ action: 'listWindows', params: {} })
  if (!response.ok || !response.result)
    throw new Error(response.error ?? 'desktop listWindows failed')

  const windows = response.result as WindowInfo[]
  const query = (input.windowTitle ?? input.title ?? '').trim().toLowerCase()
  const candidates: BrowserWindowCandidate[] = windows
    .filter(w => w.isVisible)
    .filter(w => (query ? w.title.toLowerCase().includes(query) : BROWSER_PROCESS_RE.test(w.processName)))
    .slice(0, 5)
    .map(w => ({
      title: w.title,
      processName: w.processName,
      pid: w.pid,
      x: w.x,
      y: w.y,
      width: w.width,
      height: w.height,
      isMaximized: w.isMaximized,
    }))

  const capture = candidates.length > 0
    ? `Found ${candidates.length} candidate window(s). No per-window capture tool is registered; use screen_screenshot and crop to the top candidate bounds (x=${candidates[0]!.x}, y=${candidates[0]!.y}, width=${candidates[0]!.width}, height=${candidates[0]!.height}).`
    : 'No matching visible browser window found. Use screen_screenshot for a full-screen capture, or desktop_list_windows to see all windows.'

  return { candidates, capture }
}

/**
 * web_search — DuckDuckGo 搜索（无 API key）。
 */
export async function searchWeb(input: SearchToolInput, deps?: { invokers?: WebToolInvokers }) {
  const invokers = resolveInvokers(deps?.invokers)
  return invokers.search({
    query: input.query.trim(),
    maxResults: input.max_results ?? 5,
  })
}

const tools: Promise<Tool>[] = [
  (async () => rawTool({
    name: 'browser_navigate',
    description: 'Navigate to a URL and fetch page content (HTML → extracted text). Follows redirects. Use this to read web pages in the main process (no browser window involved).',
    execute: params => navigateWebPage(params as NavigateToolInput),
    parameters: normalizeNullableAnyOf(await toJsonSchema(navigateParams) as JsonSchema),
  }))(),
  (async () => rawTool({
    name: 'browser_evaluate',
    description: 'Extract text content from HTML using CSS selectors (#id, .class, or tagname). Provide html directly, or url to fetch first.',
    execute: params => evaluateHtml(params as EvaluateToolInput),
    parameters: normalizeNullableAnyOf(await toJsonSchema(evaluateParams) as JsonSchema),
  }))(),
  (async () => rawTool({
    name: 'browser_screenshot',
    description: 'Get suggested capture params for a browser window screenshot. Returns candidate windows (title, process, bounds). Use screen_screenshot for the actual capture.',
    execute: params => suggestBrowserCapture(params as ScreenshotToolInput),
    parameters: normalizeNullableAnyOf(await toJsonSchema(screenshotParams) as JsonSchema),
  }))(),
  (async () => rawTool({
    name: 'web_search',
    description: 'Search the web via DuckDuckGo (no API key required). Returns titles, URLs, and snippets.',
    execute: params => searchWeb(params as SearchToolInput),
    parameters: normalizeNullableAnyOf(await toJsonSchema(searchParams) as JsonSchema),
  }))(),
]

export const webTools = async () => Promise.all(tools)
