import type { WindowInfo } from '../../../../shared/eventa'

import { describe, expect, it, vi } from 'vitest'

import type { WebToolInvokers } from './web-tools'

import { installStrictToolSchemaMatchers } from '../testing/strict-tool-schema'
import {
  evaluateHtml,
  navigateWebPage,
  searchWeb,
  suggestBrowserCapture,
  webTools,
} from './web-tools'

installStrictToolSchemaMatchers()

function createMockInvokers(): WebToolInvokers {
  return {
    navigate: vi.fn(),
    evaluate: vi.fn(),
    search: vi.fn(),
    listWindows: vi.fn(),
  }
}

function createWindowInfo(overrides: Partial<WindowInfo> = {}): WindowInfo {
  return {
    title: '',
    processName: '',
    pid: 0,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    isVisible: true,
    isMinimized: false,
    isMaximized: false,
    ...overrides,
  }
}

describe('webTools factory', () => {
  it('exposes the four built-in web tools with provider-safe names', async () => {
    const tools = await webTools()
    expect(tools.map(tool => tool.function.name)).toEqual([
      'browser_navigate',
      'browser_evaluate',
      'browser_screenshot',
      'web_search',
    ])
  })

  it('keeps every tool schema provider-strict (required keys + additionalProperties:false)', async () => {
    const tools = await webTools()
    expect(tools).toSatisfyStrictToolSchemas()
  })
})

describe('navigateWebPage (browser_navigate)', () => {
  it('fills provider defaults for omitted optional fields', async () => {
    const invokers = createMockInvokers()
    vi.mocked(invokers.navigate).mockResolvedValue({ url: 'https://example.com', status: 200, title: 't', text: 'body', truncated: false })

    const result = await navigateWebPage({ url: '  https://example.com  ', timeoutSec: null, maxBodyChars: null }, { invokers })

    expect(invokers.navigate).toHaveBeenCalledWith({ url: 'https://example.com', timeoutSec: 20, maxBodyChars: 100000 })
    expect(result).toMatchObject({ url: 'https://example.com', truncated: false })
  })
})

describe('evaluateHtml (browser_evaluate)', () => {
  it('sends provided html and nulls out the url', async () => {
    const invokers = createMockInvokers()
    vi.mocked(invokers.evaluate).mockResolvedValue({ source: 'provided', url: null, found: true, text: 'extracted' })

    await evaluateHtml({ html: '<div id="x">extracted</div>', url: null, selector: ' #x ', timeoutSec: null }, { invokers })

    expect(invokers.evaluate).toHaveBeenCalledWith({ html: '<div id="x">extracted</div>', url: null, selector: '#x', timeoutSec: 20 })
  })

  it('forwards url-only input for fetching', async () => {
    const invokers = createMockInvokers()
    vi.mocked(invokers.evaluate).mockResolvedValue({ source: 'fetched', url: 'https://a.b/', found: true, text: 'x' })

    await evaluateHtml({ html: '', url: 'https://a.b/', selector: 'article', timeoutSec: 30 }, { invokers })

    expect(invokers.evaluate).toHaveBeenCalledWith({ html: null, url: 'https://a.b/', selector: 'article', timeoutSec: 30 })
  })

  it('surfaces a note when the selector matched nothing', async () => {
    const invokers = createMockInvokers()
    vi.mocked(invokers.evaluate).mockResolvedValue({ source: 'provided', url: null, found: false, text: '' })

    const result = await evaluateHtml({ html: '<div></div>', url: null, selector: '#missing', timeoutSec: null }, { invokers })

    expect(result).toMatchObject({ found: false, text: '' })
    expect((result as { note: string }).note).toContain('#missing')
  })
})

describe('suggestBrowserCapture (browser_screenshot)', () => {
  const windows = [
    createWindowInfo({ title: 'Kitsune - Google Chrome', processName: 'chrome.exe', pid: 11, x: 0, y: 0, width: 1920, height: 1080, isMaximized: true }),
    createWindowInfo({ title: 'Editor - Notepad', processName: 'notepad.exe', pid: 12, x: 10, y: 10, width: 800, height: 600 }),
    createWindowInfo({ title: 'Mozilla Firefox', processName: 'firefox.exe', pid: 13, x: 20, y: 20, width: 1200, height: 900 }),
    createWindowInfo({ title: 'Hidden Chrome', processName: 'chrome.exe', pid: 14, isVisible: false }),
  ]

  it('lists visible browser windows when no title is given', async () => {
    const invokers = createMockInvokers()
    vi.mocked(invokers.listWindows).mockResolvedValue({ ok: true, result: windows })

    const result = await suggestBrowserCapture({ windowTitle: null, title: null }, { invokers })

    expect(invokers.listWindows).toHaveBeenCalledWith({ action: 'listWindows', params: {} })
    expect(result.candidates.map(candidate => candidate.processName)).toEqual(['chrome.exe', 'firefox.exe'])
    expect(result.capture).toContain('screen_screenshot')
  })

  it('filters by title substring when provided', async () => {
    const invokers = createMockInvokers()
    vi.mocked(invokers.listWindows).mockResolvedValue({ ok: true, result: windows })

    const result = await suggestBrowserCapture({ windowTitle: 'notepad', title: null }, { invokers })

    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]!.title).toBe('Editor - Notepad')
  })

  it('reports when no window matches and suggests the full-screen fallback', async () => {
    const invokers = createMockInvokers()
    vi.mocked(invokers.listWindows).mockResolvedValue({ ok: true, result: windows })

    const result = await suggestBrowserCapture({ windowTitle: 'safari', title: null }, { invokers })

    expect(result.candidates).toEqual([])
    expect(result.capture).toContain('No matching visible browser window')
  })

  it('throws when the desktop automation call fails', async () => {
    const invokers = createMockInvokers()
    vi.mocked(invokers.listWindows).mockResolvedValue({ ok: false, result: undefined, error: 'koffi init failed' })

    await expect(suggestBrowserCapture({ windowTitle: null, title: null }, { invokers })).rejects.toThrow('koffi init failed')
  })
})

describe('searchWeb (web_search)', () => {
  it('applies the default result count and trims the query', async () => {
    const invokers = createMockInvokers()
    vi.mocked(invokers.search).mockResolvedValue({ query: 'kitsune', results: [] })

    await searchWeb({ query: '  kitsune  ', max_results: null }, { invokers })

    expect(invokers.search).toHaveBeenCalledWith({ query: 'kitsune', maxResults: 5 })
  })
})
