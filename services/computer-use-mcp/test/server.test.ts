import { describe, it, expect, beforeAll, afterAll } from 'vitest'

// Spawn the actual MCP server over stdio and talk to it via the MCP client,
// proving the tools register and respond — not just that the module loads.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = join(here, '..')

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
    const text = res.content?.[0]?.text ?? ''
    const parsed = JSON.parse(text)
    expect(parsed.executor).toBeTruthy()
    expect(typeof parsed.features.windows).toBe('boolean')
  })

  it('terminal_exec runs a real command and returns output', async () => {
    const res = await client.callTool({
      name: 'terminal_exec',
      arguments: { command: process.platform === 'win32' ? 'echo hello-kitsune' : "echo hello-kitsune && pwd" },
    })
    const text = res.content?.[0]?.text ?? ''
    const parsed = JSON.parse(text)
    expect(parsed.ok).toBe(true)
    expect(parsed.stdout).toContain('hello-kitsune')
  })
})