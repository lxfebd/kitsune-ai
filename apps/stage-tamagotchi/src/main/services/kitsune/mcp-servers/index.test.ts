import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const appMock = vi.hoisted(() => ({
  getPath: vi.fn(),
  getVersion: vi.fn(),
}))

const shellMock = vi.hoisted(() => ({
  showItemInFolder: vi.fn(),
}))

const clientMocks = vi.hoisted(() => ({
  close: vi.fn(),
  connect: vi.fn(),
  listTools: vi.fn(),
  callTool: vi.fn(),
}))

vi.mock('electron', () => ({
  app: appMock,
  shell: shellMock,
}))

vi.mock('@guiiai/logg', () => ({
  useLogg: vi.fn(() => ({
    useGlobalConfig: () => ({
      debug: vi.fn(),
      warn: vi.fn(),
      withError: vi.fn(() => ({ warn: vi.fn() })),
      withFields: vi.fn(() => ({ debug: vi.fn(), warn: vi.fn() })),
    }),
  })),
}))

vi.mock('../../../libs/bootkit/lifecycle', () => ({
  onAppBeforeQuit: vi.fn(),
}))

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class {
    close = clientMocks.close
    connect = clientMocks.connect
    listTools = clientMocks.listTools
    callTool = clientMocks.callTool
  },
}))

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', async () => {
  const { PassThrough } = await import('node:stream')

  return {
    StdioClientTransport: class {
      stderr = new PassThrough()
      pid = 4242

      constructor(readonly server: unknown) {}

      close = vi.fn(async () => undefined)
    },
  }
})

describe('createMcpStdioManager', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    appMock.getPath.mockReturnValue('/tmp/airi-user-data')
    appMock.getVersion.mockReturnValue('0.10.0')
    clientMocks.close.mockResolvedValue(undefined)
    clientMocks.listTools.mockResolvedValue({ tools: [] })
    clientMocks.callTool.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] })
  })

  it('includes stderr captured during connect failures in MCP server test results', async () => {
    const { createMcpStdioManager } = await import('./index')
    const manager = createMcpStdioManager()

    clientMocks.connect.mockImplementationOnce(async (transport: { stderr: NodeJS.WritableStream }) => {
      transport.stderr.write('Missing required environment variable: API_KEY\n')
      throw new Error('connect failed')
    })

    const result = await manager.testServer({
      name: 'broken-server',
      config: {
        command: 'broken-mcp-server',
      },
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('connect failed')
    expect(result.error).toContain('Missing required environment variable: API_KEY')
  })
})

describe('lazy spawn connect deadline (D3)', () => {
  let userDataDir: string

  beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), 'mcp-deadline-'))
    appMock.getPath.mockReturnValue(userDataDir)
    clientMocks.connect.mockReset()
    clientMocks.callTool.mockReset()
    clientMocks.callTool.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] })
    writeFileSync(join(userDataDir, 'mcp.json'), JSON.stringify({
      mcpServers: {
        hang: { command: 'node', args: ['hang.js'] },
      },
    }), 'utf-8')
  })

  afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true })
  })

  it('子进程 connect 永不返回 → 15s deadline 后失败（不再无限挂起）', async () => {
    const { createMcpStdioManager } = await import('./index')
    const manager = createMcpStdioManager()
    // connect 挂起 — 模拟 MCP 子进程启动了但 initialize 握手永不完成
    clientMocks.connect.mockReturnValue(new Promise(() => {}))
    await manager.applyAndRestart()

    const startedAt = Date.now()
    await expect(manager.callTool({ name: 'hang::tool' })).rejects.toThrow(/timed out after \d+ms/)
    const elapsed = Date.now() - startedAt
    // deadline 15s 后失败（允许 ±2s 抖动）
    expect(elapsed).toBeGreaterThanOrEqual(14_000)
    expect(elapsed).toBeLessThan(20_000)
  }, 25_000)
})

describe('qualified tool name 解析', () => {
  let userDataDir: string

  beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), 'mcp-calltest-'))
    appMock.getPath.mockReturnValue(userDataDir)
    // clientMocks 是 vi.hoisted 顶层单例，跨用例累计调用数。
    // 这里 reset 并重建默认，避免前一用例的调用数/Once 队列污染本用例。
    clientMocks.callTool.mockReset()
    clientMocks.connect.mockReset()
    clientMocks.connect.mockResolvedValue(undefined)
    clientMocks.callTool.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] })
    // 预置合法配置：callTool 走 lazy spawn 前需要 serverConfigs 中有该 server
    writeFileSync(join(userDataDir, 'mcp.json'), JSON.stringify({
      mcpServers: {
        fs: { command: 'node', args: ['fs.js'] },
        server: { command: 'node', args: ['server.js'] },
      },
    }), 'utf-8')
  })

  afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true })
  })

  it('parseQualifiedToolName 拆分 serverName/toolName', async () => {
    const { createMcpStdioManager } = await import('./index')
    const manager = createMcpStdioManager()
    clientMocks.connect.mockResolvedValue(undefined)
    await manager.applyAndRestart()

    await manager.callTool({ name: 'fs::read' })

    expect(clientMocks.callTool).toHaveBeenCalledWith(
      { name: 'read', arguments: {} },
      undefined,
      expect.any(Object),
    )
  })

  it('callTool 携带 arguments', async () => {
    const { createMcpStdioManager } = await import('./index')
    const manager = createMcpStdioManager()
    clientMocks.connect.mockResolvedValue(undefined)
    await manager.applyAndRestart()

    await manager.callTool({ name: 'server::tool', arguments: { a: 1 } })

    expect(clientMocks.callTool).toHaveBeenCalledWith(
      { name: 'tool', arguments: { a: 1 } },
      undefined,
      expect.any(Object),
    )
  })

  it('首次遇到崩溃 → 去掉工具名内的命名空间后重试', async () => {
    const { createMcpStdioManager } = await import('./index')
    const manager = createMcpStdioManager()
    clientMocks.connect.mockResolvedValue(undefined)
    clientMocks.callTool
      .mockRejectedValueOnce(new Error('unknown tool'))
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'ok' }] })
    await manager.applyAndRestart()

    // qualified name 'server::fs::read' → serverName='server', toolName='fs::read'
    // 首次调用抛错后，resolveFallbackToolName('fs::read') → 'read' 重试
    const result = await manager.callTool({ name: 'server::fs::read' })

    expect(clientMocks.callTool).toHaveBeenCalledTimes(2)
    expect(clientMocks.callTool.mock.calls[0][0]).toMatchObject({ name: 'fs::read' })
    expect(clientMocks.callTool).toHaveBeenLastCalledWith(
      { name: 'read', arguments: {} },
      undefined,
      expect.any(Object),
    )
    expect('content' in result).toBe(true)
  })
})

describe('applyAndRestart 启用/禁用过滤', () => {
  let userDataDir: string

  beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), 'mcp-stdio-test-'))
    appMock.getPath.mockReturnValue(userDataDir)
  })

  afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true })
  })

  it('禁用 server 标记 skipped，启用 server lazy 记录配置', async () => {
    writeFileSync(join(userDataDir, 'mcp.json'), JSON.stringify({
      mcpServers: {
        fs: { command: 'node', args: ['fs.js'] },
        ops: { command: 'node', args: ['ops.js'], enabled: false },
      },
    }), 'utf-8')

    const { createMcpStdioManager } = await import('./index')
    const manager = createMcpStdioManager()

    const result = await manager.applyAndRestart()
    const status = manager.getRuntimeStatus()

    expect(result.skipped).toHaveLength(1)
    expect(result.started).toEqual([])
    // fs 被记录配置（lazy），ops 被禁用标记 stopped
    const fsStatus = status.servers.find(s => s.name === 'fs')
    const opsStatus = status.servers.find(s => s.name === 'ops')
    expect(fsStatus?.state).toBe('stopped')
    expect(opsStatus?.state).toBe('stopped')
    expect(result.skipped[0].name).toBe('ops')
  })

  it('writeConfigText 校验非法配置并抛错，未写入非法内容', async () => {
    const { createMcpStdioManager } = await import('./index')
    const manager = createMcpStdioManager()

    // mcpServers 是数组而非 record → zod .strict() 拒绝
    await expect(manager.writeConfigText('{"mcpServers":[1,2]}')).rejects.toThrow()

    // ensureConfigFile 会先创建默认 mcp.json，因此文件必然存在；
    // 关键是非法输入不会覆盖默认配置
    const configPath = join(userDataDir, 'mcp.json')
    expect(existsSync(configPath)).toBe(true)
    expect(readFileSync(configPath, 'utf-8')).toContain('mcpServers')
    expect(readFileSync(configPath, 'utf-8')).not.toContain('1,2')
  })

  it('writeConfigText 写入规范化的合法配置', async () => {
    const { createMcpStdioManager } = await import('./index')
    const manager = createMcpStdioManager()

    const res = await manager.writeConfigText('{"mcpServers":{"fs":{"command":"node","args":["fs.js"]}}}')

    expect(res.text).toContain('"fs"')
    expect(existsSync(join(userDataDir, 'mcp.json'))).toBe(true)
    const parsed = JSON.parse(readFileSync(join(userDataDir, 'mcp.json'), 'utf-8'))
    expect(parsed.mcpServers.fs.command).toBe('node')
  })
})
