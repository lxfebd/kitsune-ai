import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type {
  ElectronMcpCallToolPayload,
  ElectronMcpCallToolResult,
  ElectronMcpStdioApplyResult,
  ElectronMcpStdioConfigFile,
  ElectronMcpStdioConfigText,
  ElectronMcpStdioRuntimeStatus,
  ElectronMcpStdioServerConfig,
  ElectronMcpStdioServerRuntimeStatus,
  ElectronMcpStdioTestPayload,
  ElectronMcpStdioTestResult,
  ElectronMcpToolDescriptor,
} from '../../../../shared/eventa'

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { useLogg } from '@guiiai/logg'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { app, shell } from 'electron'

import {
  electronMcpApplyAndRestart,
  electronMcpCallTool,
  electronMcpGetRuntimeStatus,
  electronMcpListTools,
  electronMcpOpenConfigFile,
  electronMcpReadConfigText,
  electronMcpTestServer,
  electronMcpWriteConfigText,
} from '../../../../shared/eventa'
import { parseElectronMcpConfigText } from '../../../../shared/mcp-config'
import { onAppBeforeQuit } from '../../../libs/bootkit/lifecycle'

interface McpServerSession {
  client: Client
  transport: StdioClientTransport
  config: ElectronMcpStdioServerConfig
}

export interface McpStdioManager {
  ensureConfigFile: () => Promise<{ path: string }>
  openConfigFile: () => Promise<{ path: string }>
  applyAndRestart: () => Promise<ElectronMcpStdioApplyResult>
  listTools: () => Promise<ElectronMcpToolDescriptor[]>
  callTool: (payload: ElectronMcpCallToolPayload) => Promise<ElectronMcpCallToolResult>
  stopAll: () => Promise<void>
  getRuntimeStatus: () => ElectronMcpStdioRuntimeStatus
  readConfigText: () => Promise<ElectronMcpStdioConfigText>
  writeConfigText: (text: string) => Promise<ElectronMcpStdioConfigText>
  testServer: (payload: ElectronMcpStdioTestPayload) => Promise<ElectronMcpStdioTestResult>
}

const defaultMcpConfig: ElectronMcpStdioConfigFile = {
  mcpServers: {},
}
const toolNameSeparator = '::'
const mcpRequestTimeoutMsec = 10_000
const mcpRequestMaxTotalTimeoutMsec = 15_000
const mcpTestStderrMaxChars = 16_000

function getConfigPath() {
  return join(app.getPath('userData'), 'mcp.json')
}

function parseQualifiedToolName(name: string) {
  const separatorIndex = name.indexOf(toolNameSeparator)
  if (separatorIndex <= 0 || separatorIndex === name.length - toolNameSeparator.length) {
    throw new Error(`invalid qualified tool name: ${name}`)
  }

  return {
    serverName: name.slice(0, separatorIndex),
    toolName: name.slice(separatorIndex + toolNameSeparator.length),
  }
}

function resolveFallbackToolName(toolName: string): string | undefined {
  const normalizedTransportPrefix = toolName
    .replace(/^\.(?:stdio|stdo)::/, '')
    .replace(/^(?:stdio|stdo)::/, '')
  if (normalizedTransportPrefix !== toolName) {
    return normalizedTransportPrefix
  }

  const lastSeparatorIndex = toolName.lastIndexOf(toolNameSeparator)
  if (lastSeparatorIndex <= 0 || lastSeparatorIndex === toolName.length - toolNameSeparator.length) {
    return undefined
  }

  return toolName.slice(lastSeparatorIndex + toolNameSeparator.length)
}

async function closeSession(session: McpServerSession) {
  try {
    await session.client.close()
  }
  catch {
    await session.transport.close()
  }
}

export function createMcpStdioManager(): McpStdioManager {
  const log = useLogg('main/mcp-stdio').useGlobalConfig()
  const sessions = new Map<string, McpServerSession>()
  const runtimeStatuses = new Map<string, ElectronMcpStdioServerRuntimeStatus>()
  // 已加载的已启用 MCP 配置，lazy spawn 时按 name 查找
  const serverConfigs = new Map<string, ElectronMcpStdioServerConfig>()
  // 每个 MCP 正在 spawn 的 Promise，防止并发调用重复 spawn 同一进程
  const pendingTransports = new Map<string, Promise<StdioClientTransport>>()
  let updatedAt = Date.now()

  const setRuntimeStatus = (status: ElectronMcpStdioServerRuntimeStatus) => {
    runtimeStatuses.set(status.name, status)
    updatedAt = Date.now()
  }

  const ensureConfigFile = async () => {
    const path = getConfigPath()
    await mkdir(app.getPath('userData'), { recursive: true })

    try {
      await readFile(path, 'utf-8')
    }
    catch {
      await writeFile(path, `${JSON.stringify(defaultMcpConfig, null, 2)}\n`)
    }

    return { path }
  }

  const openConfigFile = async () => {
    const { path } = await ensureConfigFile()
    shell.showItemInFolder(path)
    return { path }
  }

  const readConfigFile = async (path: string): Promise<ElectronMcpStdioConfigFile> => {
    const raw = await readFile(path, 'utf-8')
    return parseElectronMcpConfigText(raw)
  }

  const stopAll = async () => {
    // 清理 lazy spawn 相关状态：丢弃待 spawn 的 promise 和已加载配置，
    // 避免 stopAll 后仍有残留配置触发新的 lazy spawn
    pendingTransports.clear()
    serverConfigs.clear()
    const entries = [...sessions.entries()]
    for (const [name, session] of entries) {
      await closeSession(session)
      setRuntimeStatus({
        name,
        state: 'stopped',
        command: session.config.command,
        args: session.config.args ?? [],
        pid: null,
      })
      sessions.delete(name)
    }
  }

  // 实际 spawn 子进程并建立 client 连接，成功后写入 sessions 并更新状态
  const spawnSession = async (name: string, config: ElectronMcpStdioServerConfig): Promise<McpServerSession> => {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      env: config.env,
      cwd: config.cwd,
      stderr: 'pipe',
    })
    const client = new Client({
      name: `proj-kitsune:stage-tamagotchi:mcp:${name}`,
      version: app.getVersion(),
    })

    try {
      await client.connect(transport)
      transport.stderr?.on('data', (data) => {
        const text = data.toString('utf-8').trim()
        if (text) {
          log.withFields({ serverName: name }).warn(text)
        }
      })
      const session: McpServerSession = { client, transport, config }
      sessions.set(name, session)
      setRuntimeStatus({
        name,
        state: 'running',
        command: config.command,
        args: config.args ?? [],
        pid: transport.pid,
      })
      return session
    }
    catch (error) {
      await transport.close().catch(() => {})
      throw error
    }
  }

  /**
   * Lazy spawn：按需启动单个 MCP 子进程并返回其 transport。
   *
   * - 已有活跃 session：直接返回其 transport
   * - 正在 spawn 中：返回同一个 pending promise，避免并发重复 spawn
   * - 首次调用：spawn 子进程，成功后写入 sessions，失败则清除 pending 允许重试
   *
   * Call stack:
   *
   * callTool / 外部按需调用
   *   -> getOrSpawn
   *     -> spawnSession（首次）
   *       -> new StdioClientTransport -> client.connect
   */
  const getOrSpawn = (name: string): Promise<StdioClientTransport> => {
    // 已有活跃 session，直接返回 transport
    const existing = sessions.get(name)
    if (existing) {
      return Promise.resolve(existing.transport)
    }

    // 已有 pending spawn，复用同一个 promise 防止并发重复 spawn
    const pending = pendingTransports.get(name)
    if (pending) {
      return pending
    }

    const config = serverConfigs.get(name)
    if (!config) {
      return Promise.reject(new Error(`no config for mcp server: ${name}`))
    }

    // 发起 spawn，成功/失败都需要清除 pendingTransports 中的条目
    const spawnPromise = spawnSession(name, config)
      .then(session => session.transport)
      .catch((error: unknown) => {
        const message = errorMessageFrom(error) ?? "Unknown error"
        setRuntimeStatus({
          name,
          state: 'error',
          command: config.command,
          args: config.args ?? [],
          pid: null,
          lastError: message,
        })
        throw error
      })
      .finally(() => {
        pendingTransports.delete(name)
      })

    pendingTransports.set(name, spawnPromise)
    return spawnPromise
  }

  const applyAndRestart = async (): Promise<ElectronMcpStdioApplyResult> => {
    const { path } = await ensureConfigFile()
    const config = await readConfigFile(path)

    await stopAll()
    runtimeStatuses.clear()

    const result: ElectronMcpStdioApplyResult = {
      path,
      started: [],
      failed: [],
      skipped: [],
    }

    // 启用/禁用过滤逻辑保持不变
    const enabledServers = Object.entries(config.mcpServers).filter(([, server]) => server.enabled !== false)
    const disabledServers = Object.entries(config.mcpServers).filter(([, server]) => server.enabled === false)

    // 标记被禁用的服务器
    for (const [name, server] of disabledServers) {
      result.skipped.push({ name, reason: 'disabled' })
      setRuntimeStatus({
        name,
        state: 'stopped',
        command: server.command,
        args: server.args ?? [],
        pid: null,
      })
    }

    // Lazy spawn：仅记录已启用服务器的配置并标记为 stopped，
    // 实际子进程在 getOrSpawn 首次调用时才启动，避免冷启动并行 spawn 阻塞
    for (const [name, server] of enabledServers) {
      serverConfigs.set(name, server)
      setRuntimeStatus({
        name,
        state: 'stopped',
        command: server.command,
        args: server.args ?? [],
        pid: null,
      })
    }

    updatedAt = Date.now()

    return result
  }

  const listTools = async (): Promise<ElectronMcpToolDescriptor[]> => {
    const entries = [...sessions.entries()].sort(([left], [right]) => left.localeCompare(right))
    const listResult = await Promise.all(entries.map(async ([serverName, session]) => {
      try {
        const response = await session.client.listTools(undefined, {
          timeout: mcpRequestTimeoutMsec,
          maxTotalTimeout: mcpRequestMaxTotalTimeoutMsec,
        })
        return response.tools.map<ElectronMcpToolDescriptor>(item => ({
          serverName,
          name: `${serverName}${toolNameSeparator}${item.name}`,
          toolName: item.name,
          description: item.description,
          inputSchema: item.inputSchema,
        }))
      }
      catch (error) {
        log.withFields({ serverName }).withError(error).warn('failed to list tools from mcp server')
        return []
      }
    }))

    return listResult.flat()
  }

  const callTool = async (payload: ElectronMcpCallToolPayload): Promise<ElectronMcpCallToolResult> => {
    const { serverName, toolName } = parseQualifiedToolName(payload.name)
    // Lazy spawn：首次调用该 server 的工具时按需启动子进程
    let session = sessions.get(serverName)
    if (!session) {
      await getOrSpawn(serverName)
      session = sessions.get(serverName)
    }
    if (!session) {
      throw new Error(`mcp server is not running: ${serverName}`)
    }

    let result
    try {
      result = await session.client.callTool({
        name: toolName,
        arguments: payload.arguments ?? {},
      }, undefined, {
        timeout: mcpRequestTimeoutMsec,
        maxTotalTimeout: mcpRequestMaxTotalTimeoutMsec,
      })
    }
    catch (error) {
      const fallbackToolName = resolveFallbackToolName(toolName)
      if (!fallbackToolName || fallbackToolName === toolName) {
        throw error
      }

      log.withFields({
        serverName,
        requestedToolName: toolName,
        fallbackToolName,
      }).warn('retrying mcp tool call with normalized tool name')

      result = await session.client.callTool({
        name: fallbackToolName,
        arguments: payload.arguments ?? {},
      }, undefined, {
        timeout: mcpRequestTimeoutMsec,
        maxTotalTimeout: mcpRequestMaxTotalTimeoutMsec,
      })
    }

    const normalized: ElectronMcpCallToolResult = {}
    if ('content' in result && Array.isArray(result.content)) {
      normalized.content = result.content as Array<Record<string, unknown>>
    }
    if ('structuredContent' in result && result.structuredContent && typeof result.structuredContent === 'object' && !Array.isArray(result.structuredContent)) {
      normalized.structuredContent = result.structuredContent as Record<string, unknown>
    }
    if ('isError' in result && typeof result.isError === 'boolean') {
      normalized.isError = result.isError
    }
    if ('toolResult' in result) {
      normalized.toolResult = result.toolResult
    }

    return normalized
  }

  const getRuntimeStatus = (): ElectronMcpStdioRuntimeStatus => {
    return {
      path: getConfigPath(),
      servers: [...runtimeStatuses.values()].sort((left, right) => left.name.localeCompare(right.name)),
      updatedAt,
    }
  }

  const readConfigText = async (): Promise<ElectronMcpStdioConfigText> => {
    const { path } = await ensureConfigFile()
    const text = await readFile(path, 'utf-8')
    return { path, text }
  }

  const writeConfigText = async (text: string): Promise<ElectronMcpStdioConfigText> => {
    const { path } = await ensureConfigFile()
    const validated = parseElectronMcpConfigText(text)
    const normalized = `${JSON.stringify(validated, null, 2)}\n`
    await writeFile(path, normalized)
    return { path, text: normalized }
  }

  const testServer = async (payload: ElectronMcpStdioTestPayload): Promise<ElectronMcpStdioTestResult> => {
    const startedAt = Date.now()
    let transport: StdioClientTransport | null = null
    let client: Client | null = null
    const stderrChunks: string[] = []

    const withDeadline = <V>(promise: Promise<V>, ms: number, label: string): Promise<V> => {
      let timer: NodeJS.Timeout | undefined
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
      })
      return Promise.race([promise, timeout]).finally(() => {
        if (timer)
          clearTimeout(timer)
      })
    }

    try {
      transport = new StdioClientTransport({
        command: payload.config.command,
        args: payload.config.args ?? [],
        env: payload.config.env,
        cwd: payload.config.cwd,
        stderr: 'pipe',
      })
      client = new Client({
        name: `proj-kitsune:stage-tamagotchi:mcp:test:${payload.name}`,
        version: app.getVersion(),
      })

      transport.stderr?.on('data', (data) => {
        const text = data.toString('utf-8')
        if (text)
          stderrChunks.push(text)
      })

      await withDeadline(client.connect(transport), mcpRequestMaxTotalTimeoutMsec, 'connect')

      const response = await client.listTools(undefined, {
        timeout: mcpRequestTimeoutMsec,
        maxTotalTimeout: mcpRequestMaxTotalTimeoutMsec,
      })

      if (stderrChunks.length > 0) {
        log.withFields({ serverName: payload.name }).debug(stderrChunks.join('').trim())
      }

      return {
        ok: true,
        tools: response.tools.map(tool => tool.name),
        durationMs: Date.now() - startedAt,
      }
    }
    catch (error) {
      const message = errorMessageFrom(error) ?? "Unknown error"
      // Keep only the tail so a noisy failed server cannot flood the settings UI.
      const stderr = stderrChunks.join('').trim().slice(-mcpTestStderrMaxChars)
      return {
        ok: false,
        error: stderr ? `${message}\n\n${stderr}` : message,
        durationMs: Date.now() - startedAt,
      }
    }
    finally {
      if (client) {
        await client.close().catch(() => {})
      }
      if (transport) {
        await transport.close().catch(() => {})
      }
    }
  }

  return {
    ensureConfigFile,
    openConfigFile,
    applyAndRestart,
    listTools,
    callTool,
    stopAll,
    getRuntimeStatus,
    readConfigText,
    writeConfigText,
    testServer,
  }
}

export async function setupMcpStdioManager() {
  const log = useLogg('main/mcp-stdio').useGlobalConfig()
  const manager = createMcpStdioManager()

  onAppBeforeQuit(async () => {
    await manager.stopAll()
  })

  await manager.ensureConfigFile()

  try {
    await manager.applyAndRestart()
  }
  catch (error) {
    log.withError(error).warn('failed to apply mcp stdio config during startup')
  }

  return manager
}

export function createMcpServersService(params: { context: ReturnType<typeof createContext>['context'], manager: McpStdioManager }) {
  defineInvokeHandler(params.context, electronMcpOpenConfigFile, async () => {
    return params.manager.openConfigFile()
  })

  defineInvokeHandler(params.context, electronMcpApplyAndRestart, async () => {
    return params.manager.applyAndRestart()
  })

  defineInvokeHandler(params.context, electronMcpGetRuntimeStatus, async () => {
    return params.manager.getRuntimeStatus()
  })

  defineInvokeHandler(params.context, electronMcpListTools, async () => {
    return params.manager.listTools()
  })

  defineInvokeHandler(params.context, electronMcpCallTool, async (payload) => {
    return params.manager.callTool(payload)
  })

  defineInvokeHandler(params.context, electronMcpReadConfigText, async () => {
    return params.manager.readConfigText()
  })

  defineInvokeHandler(params.context, electronMcpWriteConfigText, async (payload) => {
    return params.manager.writeConfigText(payload.text)
  })

  defineInvokeHandler(params.context, electronMcpTestServer, async (payload) => {
    return params.manager.testServer(payload)
  })
}
