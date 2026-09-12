import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'

// Spawn the actual MCP server over stdio and talk to it via the MCP client,
// proving the tools register and respond — not just that the module loads.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = join(here, '..')

// SDK 1.29 的 CallToolResult 带 [x: string]: unknown 索引签名，content 属性在
// 本包 tsconfig 下被解析为 unknown；服务端工具固定返回 [{ type: 'text', text }]，
// 这里显式窄化到我们期望的形状。
function firstText(res: unknown): string {
  const items = (res as { content?: unknown }).content
  if (!Array.isArray(items)) return ''
  const first = items[0] as { text?: unknown } | undefined
  return typeof first?.text === 'string' ? first.text : ''
}

describe('computer-use-mcp server', () => {
  let client: Client
  let transport: StdioClientTransport

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', join(pkgRoot, 'src', 'index.ts')],
      cwd: pkgRoot,
    })
    client = new Client({ name: 'test', version: '0.0.0' })
    await client.connect(transport)
  })

  afterAll(async () => {
    await client.close()
    transport?.close?.()
  })

  it('registers the desktop tools', async () => {
    const { tools } = await client.listTools()
    const names = tools.map((t) => t.name)
    for (const expected of [
      'desktop_get_capabilities',
      'desktop_observe_windows',
      'desktop_screenshot',
      'desktop_click',
      'desktop_type_text',
      'desktop_press_keys',
      'desktop_scroll',
      'desktop_open_app',
      'desktop_focus_app',
      'terminal_exec',
      'clipboard_read_text',
      'clipboard_write_text',
    ]) {
      expect(names, `missing tool ${expected}`).toContain(expected)
    }
    expect(names.length).toBeGreaterThanOrEqual(12)
  })

  it('responds with executor capabilities (dry-run by default in tests)', async () => {
    const res = await client.callTool({
      name: 'desktop_get_capabilities',
      arguments: {},
    })
    const text = firstText(res)
    const parsed = JSON.parse(text)
    expect(parsed.executor).toBeTruthy()
    expect(typeof parsed.features.windows).toBe('boolean')
  })

  it('terminal_exec runs a real command and returns output', async () => {
    const res = await client.callTool({
      name: 'terminal_exec',
      arguments: { command: process.platform === 'win32' ? 'echo hello-kitsune' : "echo hello-kitsune && pwd" },
    })
    const text = firstText(res)
    const parsed = JSON.parse(text)
    expect(parsed.ok).toBe(true)
    expect(parsed.stdout).toContain('hello-kitsune')
  })
})

describe('mapKeysToPlatform（跨平台键名翻译）', () => {
  const realPlatform = process.platform
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: realPlatform })
  })
  const setPlatform = (p: NodeJS.Platform) => {
    Object.defineProperty(process, 'platform', { value: p })
  }

  it('单键统一转大写', async () => {
    const { mapKeysToPlatform } = await import('../src/index.js')
    expect(mapKeysToPlatform('Enter')).toBe('ENTER')
    expect(mapKeysToPlatform('f4')).toBe('F4')
  })

  it('darwin: Command → CMD，Option → OPTION', async () => {
    setPlatform('darwin')
    const { mapKeysToPlatform } = await import('../src/index.js')
    expect(mapKeysToPlatform('Command+Shift+I')).toBe('CMD+SHIFT+I')
    expect(mapKeysToPlatform('Option+Click')).toBe('OPTION+CLICK')
  })

  it('win32: Command → CTRL（DevTools 等跨平台快捷键惯例）', async () => {
    setPlatform('win32')
    const { mapKeysToPlatform } = await import('../src/index.js')
    expect(mapKeysToPlatform('Command+Shift+I')).toBe('CTRL+SHIFT+I')
    expect(mapKeysToPlatform('Ctrl+C')).toBe('CTRL+C')
  })

  it('linux: Command → SUPER', async () => {
    setPlatform('linux')
    const { mapKeysToPlatform } = await import('../src/index.js')
    expect(mapKeysToPlatform('Command+Shift+I')).toBe('SUPER+SHIFT+I')
  })
})