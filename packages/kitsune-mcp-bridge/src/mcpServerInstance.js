import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { execSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/**
 * 从 PATH 环境变量中查找可执行文件的绝对路径
 * Windows 上使用 where 命令，Unix 上使用 which 命令
 */
function findInPath(cmd) {
  try {
    const isWin = process.platform === 'win32'
    const findCmd = isWin ? `where ${cmd}` : `which ${cmd}`
    const result = execSync(findCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
    // where/which 可能返回多行，取第一行
    const lines = result.trim().split('\n')
    return lines[0]?.trim() || null
  }
  catch {
    return null
  }
}

/**
 * 解析命令为绝对路径（解决 Windows 上 npx/npm 不在 PATH 中的问题）
 * 优先从 PATH 查找，然后从常见安装路径搜索
 */
async function resolveCommand(cmd) {
  if (!cmd) {
    throw new Error('command is required and cannot be empty')
  }
  // 已经是绝对路径或包含分隔符（如 ./npx、..\bin\npx）
  if (path.isAbsolute(cmd) || /[\\/]/.test(cmd)) return cmd

  const isWin = process.platform === 'win32'

  // 常见命令 → 对应可执行文件名映射
  const binMap = {
    'npx': isWin ? 'npx.cmd' : 'npx',
    'npm': isWin ? 'npm.cmd' : 'npm',
    'node': process.execPath,
    'yarn': isWin ? 'yarn.cmd' : 'yarn',
    'pnpm': isWin ? 'pnpm.cmd' : 'pnpm',
    'bun': isWin ? 'bun.exe' : 'bun',
    'python': isWin ? 'python.exe' : 'python3',
    'pip': isWin ? 'pip.exe' : 'pip3',
    'java': isWin ? 'java.exe' : 'java',
  }

  const targetName = binMap[cmd] || cmd

  // 1. 优先从 PATH 环境变量中查找（最可靠的方式）
  const pathResult = findInPath(targetName)
  if (pathResult) {
    console.log(`[MCP] resolveCommand: found "${targetName}" in PATH: ${pathResult}`)
    return pathResult
  }

  // 2. 尝试用原始命令名查找（cross-spawn 可能通过 shell 解析）
  const rawResult = findInPath(cmd)
  if (rawResult) {
    console.log(`[MCP] resolveCommand: found "${cmd}" in PATH: ${rawResult}`)
    return rawResult
  }

  // 3. 候选目录：从常见安装路径搜索
  const searchDirs = []

  // Windows 常见 Node.js 安装路径
  if (isWin) {
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files'
    searchDirs.push(
      path.join(programFiles, 'nodejs'),
      path.join(process.env.APPDATA || '', 'npm'),
      path.join(process.env.LOCALAPPDATA || '', 'fnm_multishells'),
    )
  }
  else {
    searchDirs.push('/usr/local/bin', '/usr/bin', path.join(os.homedir(), '.npm-global', 'bin'))
  }

  for (const dir of searchDirs) {
    const candidate = path.join(dir, targetName)
    try {
      await fs.access(candidate, fs.constants.X_OK)
      console.log(`[MCP] resolveCommand: found "${targetName}" in ${dir}`)
      return candidate
    }
    catch { /* continue */ }
  }

  // 4. 最后回退：在 Windows 上确保使用 .cmd 后缀
  if (isWin && !targetName.endsWith('.cmd') && !targetName.endsWith('.exe')) {
    const cmdWithExt = `${targetName}.cmd`
    const cmdResult = findInPath(cmdWithExt)
    if (cmdResult) {
      console.log(`[MCP] resolveCommand: found "${cmdWithExt}" in PATH: ${cmdResult}`)
      return cmdResult
    }
  }

  // 找不到则回退原始命令名（让 cross-spawn 通过 PATH 查找）
  console.log(`[MCP] resolveCommand: using fallback command "${cmd}"`)
  return cmd
}

// 单个MCP Server连接实例
export class McpServerInstance {
  constructor(serverConfig) {
    this.config = serverConfig
    this.client = null
    this.tools = []           // 已发现的工具列表
    this.status = 'disconnected' // disconnected | connecting | connected | error
    this.error = null
    this.connectedAt = null
    this._transport = null
  }

  get name() { return this.config.name }
  get isConnected() { return this.status === 'connected' }

  /**
   * 连接到MCP Server（stdio模式：启动子进程）
   */
  async connect(timeoutMs = 15000) {
    if (this.isConnected) return true

    this.status = 'connecting'
    this.error = null

    try {
      const transport = await this._createTransport()
      if (!transport) {
        throw new Error(`unsupported transport type: ${this.config.transport}`)
      }

      // 保存 transport 引用，供 disconnect 使用
      this._transport = transport

      this.client = new Client(
        { name: 'pet-agent', version: '1.0.0' },
        { capabilities: { tools: {} } },
      )

      // client.connect() 内部会调用 transport.start()，由 SDK 自行 spawn 子进程
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), timeoutMs)

      try {
        await this.client.connect(transport)
      }
      finally {
        clearTimeout(timer)
      }

      // stdio 模式下，start 后 transport.stderr 可用，设置 stderr 监控
      if (this.config.transport !== 'sse' && transport.stderr) {
        transport.stderr.on('data', (data) => {
          const text = data.toString().trim()
          if (text) console.log(`[MCP:${this.name}:stderr] ${text}`)
        })
      }

      // 监听 transport 关闭事件，自动检测子进程退出
      transport.onclose = () => {
        if (this.status === 'connected') {
          console.warn(`[MCP:${this.name}] transport closed unexpectedly (process exited?)`)
          this.status = 'error'
          this.error = 'transport closed'
          this.tools = []
        }
      }

      // 发现工具
      const { tools } = await this.client.listTools({})
      this.tools = (tools || []).map(t => ({
        name: t.name,
        description: t.description || '',
        inputSchema: t.inputSchema || {},
      }))

      this.status = 'connected'
      this.connectedAt = new Date().toISOString()
      console.log(`[MCP] ${this.name} connected with ${this.tools.length} tools`)
      return true
    }
    catch (err) {
      this.status = 'error'
      this.error = err.message || String(err)
      console.error(`[MCP] ${this.name} connect failed:`, this.error)
      this._cleanup()
      return false
    }
  }

  async _createTransport() {
    const transportType = (this.config.transport || 'stdio').toLowerCase()

    if (transportType === 'stdio') {
      if (!this.config.command) {
        throw new Error('stdio transport requires "command" field')
      }

      const args = (Array.isArray(this.config.args) ? this.config.args : [])
        .filter(a => typeof a === 'string' && a.trim().length > 0) // 过滤空参数
      const env = { ...this.config.env }

      // 解析命令路径（如 npx → npx.cmd）
      const resolvedCmd = await resolveCommand(this.config.command)

      // 确定安全的 cwd：Electron 打包后 process.cwd() 可能在 .asar 内，spawn 无法访问
      let safeCwd = process.cwd()
      try {
        await fs.access(safeCwd)
      }
      catch {
        safeCwd = os.homedir()
      }
      // 若 cwd 仍在 asar 内，回退到用户主目录
      if (safeCwd.includes('.asar')) {
        safeCwd = os.homedir()
      }

      console.log(`[MCP:${this.name}] spawn: cmd=${resolvedCmd}, args=[${args.join(', ')}], cwd=${safeCwd}`)

      // SDK v1.29+ StdioClientTransport 期望配置对象，由 SDK 内部调用 cross-spawn 启动进程
      // 传入 stderr: 'pipe' 以便在 connect 后通过 transport.stderr 获取 stderr 流
      // Windows 上需要 shell: true 来正确执行 .cmd 文件
      return new StdioClientTransport({
        command: resolvedCmd,
        args,
        env,
        stderr: 'pipe',
        cwd: safeCwd,
        shell: process.platform === 'win32', // Windows 上启用 shell 模式
      })
    }

    if (transportType === 'sse') {
      if (!this.config.url) {
        throw new Error('sse transport requires "url" field')
      }
      // NOTICE:
      // Dynamic import to avoid hard dependency on SSE support.
      // Removal condition: when SSE transport is always available in the SDK.
      const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js')
      return new SSEClientTransport(new URL(this.config.url), {
        requestInit: { headers: this.config.headers || {} },
      })
    }

    return null
  }

  /**
   * 调用工具（带自动重连）
   */
  async callTool(toolName, args = {}, timeoutMs = 30000) {
    // 如果未连接，尝试自动重连一次
    if (!this.isConnected || !this.client) {
      console.log(`[MCP:${this.name}] not connected, attempting auto-reconnect...`)
      try {
        await this.connect(15000)
      }
      catch (_) {
        // connect 内部会设置 status = 'error'
      }
      // 重连后仍未连接，抛出错误
      if (!this.isConnected || !this.client) {
        throw new Error(`MCP server "${this.name}" is not connected (auto-reconnect failed)`)
      }
    }

    try {
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), timeoutMs)

      try {
        return await this.client.callTool({ name: toolName, arguments: args })
      }
      finally {
        clearTimeout(timer)
      }
    }
    catch (err) {
      // 工具调用失败，检查是否连接断开
      if (this._isConnectionError(err)) {
        console.warn(`[MCP:${this.name}] connection lost during tool call, marking as disconnected`)
        this._cleanup()
      }
      throw err
    }
  }

  /**
   * 判断是否为连接级别的错误（进程崩溃、管道断开等）
   */
  _isConnectionError(err) {
    const msg = (err.message || '').toLowerCase()
    return (
      msg.includes('pipe')
      || msg.includes('broken')
      || msg.includes('closed')
      || msg.includes('econnreset')
      || msg.includes('econnrefused')
      || msg.includes('epipe')
      || msg.includes('transport closed')
      || msg.includes('server closed')
      || msg.includes('process exited')
    )
  }

  /**
   * 断开连接
   */
  async disconnect() {
    try {
      if (this.client) {
        await this.client.close()
      }
    }
    catch (_) {}
    this._cleanup()
  }

  _cleanup() {
    // Remove stderr listener if transport exists
    if (this._transport?.stderr) {
      this._transport.stderr.removeAllListeners('data')
    }
    this.tools = []
    this.client = null
    this._transport = null
    this.status = 'disconnected'
    // 进程由 SDK StdioClientTransport 内部管理，client.close() 会触发 transport.close() 终止进程
    // 无需手动 kill
  }

  /**
   * 获取状态摘要
   */
  getStatus() {
    return {
      name: this.name,
      status: this.status,
      toolCount: this.tools.length,
      tools: this.tools.map(t => ({ name: t.name, description: t.description })),
      error: this.error,
      connectedAt: this.connectedAt,
      transport: this.config.transport,
      ...(this.config.command ? { command: this.config.command } : {}),
      ...(this.config.url ? { url: this.config.url } : {}),
    }
  }
}
