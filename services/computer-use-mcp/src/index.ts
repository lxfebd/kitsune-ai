/**
 * Kitsune Computer Use MCP Service
 *
 * 桌面编排 MCP 服务，通过 @modelcontextprotocol/sdk 暴露桌面自动化工具。
 *
 * 桌面操作统一走 @kitsune/desktop-platform 共享实现（win32=koffi FFI /
 * darwin=osascript+cliclick / linux=xdotool），与桌宠主进程同一套代码，
 * 不再各自维护 PowerShell/AppleScript 双实现。
 *
 * 保留本地能力（共享平台层不覆盖）：
 * - desktop_screenshot：node 进程无 Electron desktopCapturer，保留平台命令截屏
 * - terminal_exec / clipboard_read_text / clipboard_write_text
 */

import { env, exit } from 'node:process'

import {
  createPlatformAutomation,
  type PlatformAutomation,
} from '@kitsune/desktop-platform'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const EXECUTOR = env.COMPUTER_USE_EXECUTOR ?? 'dry-run'
const APPROVAL_MODE = env.COMPUTER_USE_APPROVAL_MODE ?? 'actions'
const SESSION_ROOT = env.COMPUTER_USE_SESSION_ROOT ?? '/tmp/kitsune-computer-use'
const TIMEOUT_MS = Number(env.COMPUTER_USE_TIMEOUT_MS) || 30_000

const server = new McpServer({
  name: 'kitsune-computer-use',
  version: '0.1.0',
})

// ========== 共享平台层实例 ==========

let platform: PlatformAutomation | null = null

/**
 * 懒加载平台自动化实例（win32/darwin/linux 均支持；factory 内部按平台分发）。
 * 首次真实桌面操作前初始化；dry-run 模式不初始化，避免加载原生绑定。
 */
async function getPlatform(): Promise<PlatformAutomation> {
  if (!platform) {
    platform = await createPlatformAutomation()
  }
  return platform
}

/**
 * MCP 键格式 → 共享平台层键格式。
 *
 * MCP 侧用 macOS 风格键名（Command/Ctrl 大小写混合），共享层 pressKey 用
 * 大写 `+` 拆分（CTRL+SHIFT+I）。跨平台修饰键语义翻译：
 * - Command/Cmd：darwin → CMD（⌘）；win32 → CTRL（DevTools 等跨平台快捷键惯例）；
 *   linux → SUPER（xdotool 的 super 键）
 * - Option/Alt：darwin → OPTION；win32/linux → ALT
 */
function mapKeysToPlatform(keys: string): string {
  const parts = keys.split('+').filter(Boolean)
  if (parts.length <= 1) {
    return keys.toUpperCase()
  }
  return parts.map((p) => {
    const lower = p.toLowerCase()
    if (lower === 'command' || lower === 'cmd') {
      if (process.platform === 'darwin') return 'CMD'
      if (process.platform === 'win32') return 'CTRL'
      return 'SUPER'
    }
    if (lower === 'option') {
      return process.platform === 'darwin' ? 'OPTION' : 'ALT'
    }
    return p.toUpperCase()
  }).join('+')
}

export { mapKeysToPlatform }

// ========== 桌面观察与控制 ==========

server.tool(
  'desktop_get_capabilities',
  '返回当前执行器的能力清单',
  {},
  async () => {
    return {
      content: [{ type: 'text', text: JSON.stringify({
        executor: EXECUTOR,
        approvalMode: APPROVAL_MODE,
        features: {
          windows: true,
          screenshots: EXECUTOR !== 'dry-run',
          mouse: EXECUTOR !== 'dry-run',
          keyboard: EXECUTOR !== 'dry-run',
          appOpen: EXECUTOR !== 'dry-run',
          terminal: true,
          clipboard: true,
        },
      }) }],
    }
  },
)

server.tool(
  'desktop_observe_windows',
  '枚举当前桌面的可见窗口',
  {},
  async () => {
    const windows = await enumerateWindows()
    return {
      content: [{ type: 'text', text: JSON.stringify(windows) }],
    }
  },
)

server.tool(
  'desktop_screenshot',
  '截取当前屏幕',
  { path: z.string().optional().describe('保存路径，可选') },
  async ({ path }) => {
    const result = await takeScreenshot(path)
    return {
      content: [{ type: 'text', text: result }],
    }
  },
)

server.tool(
  'desktop_click',
  '模拟鼠标点击',
  {
    x: z.number().describe('x 坐标'),
    y: z.number().describe('y 坐标'),
    button: z.enum(['left', 'right', 'middle']).default('left').describe('鼠标按钮'),
  },
  async ({ x, y, button }) => {
    if (EXECUTOR === 'dry-run') {
      return { content: [{ type: 'text', text: `[dry-run] click ${button} at (${x}, ${y})` }] }
    }
    const p = await getPlatform()
    await p.moveTo(x, y)
    await p.click(button)
    return { content: [{ type: 'text', text: `clicked ${button} at (${x}, ${y})` }] }
  },
)

server.tool(
  'desktop_type_text',
  '输入文本',
  { text: z.string().describe('要输入的文本') },
  async ({ text }) => {
    if (EXECUTOR === 'dry-run') {
      return { content: [{ type: 'text', text: `[dry-run] type: ${text.slice(0, 50)}...` }] }
    }
    const p = await getPlatform()
    await p.type(text)
    return { content: [{ type: 'text', text: `typed ${text.length} characters` }] }
  },
)

server.tool(
  'desktop_press_keys',
  '模拟按键',
  { keys: z.string().describe('键名，如 Enter / Ctrl+C / Command+Shift+I') },
  async ({ keys }) => {
    if (EXECUTOR === 'dry-run') {
      return { content: [{ type: 'text', text: `[dry-run] press keys: ${keys}` }] }
    }
    const p = await getPlatform()
    await p.pressKey(mapKeysToPlatform(keys))
    return { content: [{ type: 'text', text: `pressed: ${keys}` }] }
  },
)

server.tool(
  'desktop_scroll',
  '滚动',
  {
    direction: z.enum(['up', 'down', 'left', 'right']).describe('滚动方向'),
    amount: z.number().default(3).describe('滚动量（单位：行/格）'),
  },
  async ({ direction, amount }) => {
    if (EXECUTOR === 'dry-run') {
      return { content: [{ type: 'text', text: `[dry-run] scroll ${direction} ${amount}` }] }
    }
    const p = await getPlatform()
    // 共享层 amount 是像素参考量；MCP 侧以行/格为单位 → 换算成像素（每行约 120px）
    await p.scroll(direction, amount * 120)
    return { content: [{ type: 'text', text: `scrolled ${direction} ${amount}` }] }
  },
)

server.tool(
  'desktop_open_app',
  '打开应用',
  { name: z.string().describe('应用的 bundle identifier 或名称') },
  async ({ name }) => {
    if (EXECUTOR === 'dry-run') {
      return { content: [{ type: 'text', text: `[dry-run] open app: ${name}` }] }
    }
    const p = await getPlatform()
    await p.launchApp(name)
    return { content: [{ type: 'text', text: `opened: ${name}` }] }
  },
)

server.tool(
  'desktop_focus_app',
  '聚焦应用窗口',
  { name: z.string().describe('应用名称或进程名') },
  async ({ name }) => {
    if (EXECUTOR === 'dry-run') {
      return { content: [{ type: 'text', text: `[dry-run] focus app: ${name}` }] }
    }
    const p = await getPlatform()
    await p.focusWindow(undefined, name)
    return { content: [{ type: 'text', text: `focused: ${name}` }] }
  },
)

// ========== 终端编排 ==========

server.tool(
  'terminal_exec',
  '在后台终端执行命令',
  {
    command: z.string().describe('要执行的命令'),
    cwd: z.string().optional().describe('工作目录'),
    timeoutMs: z.number().default(TIMEOUT_MS).describe('超时毫秒'),
  },
  async ({ command, cwd, timeoutMs }) => {
    const result = await execCommand(command, cwd, timeoutMs)
    return { content: [{ type: 'text', text: JSON.stringify(result) }] }
  },
)

// ========== 剪贴板 ==========

server.tool(
  'clipboard_read_text',
  '读取剪贴板文本',
  {},
  async () => {
    const text = await readClipboard()
    return { content: [{ type: 'text', text }] }
  },
)

server.tool(
  'clipboard_write_text',
  '写入剪贴板文本',
  { text: z.string().describe('要写入的文本') },
  async ({ text }) => {
    await writeClipboard(text)
    return { content: [{ type: 'text', text: `written ${text.length} chars to clipboard` }] }
  },
)

// ========== 保留本地实现（共享平台层不覆盖） ==========

/** 窗口枚举：优先共享平台层（覆盖三种平台），失败时回退旧 Get-Process 逻辑。 */
async function enumerateWindows(): Promise<any[]> {
  try {
    const p = await getPlatform()
    const windows = await p.listWindows()
    return windows.map(w => ({
      name: w.processName,
      title: w.title,
      pid: w.pid,
      bounds: { x: w.x, y: w.y, width: w.width, height: w.height },
      isVisible: w.isVisible,
      isMinimized: w.isMinimized,
    }))
  }
  catch {
    // 平台层初始化失败（如非受支持平台）时回退系统命令。
    // PowerShell 在中文 Windows 输出 GBK，需按 GBK 解码，否则标题乱码。
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execAsync = promisify(execFile)
    try {
      const { stdout } = await execAsync('powershell', [
        '-NoProfile', '-NonInteractive', '-Command',
        '$OutputEncoding = [System.Text.Encoding]::UTF8; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object Name, MainWindowTitle | ConvertTo-Json -Compress',
      ], { timeout: 10000, encoding: 'utf8' })
      return JSON.parse(stdout || '[]')
    }
    catch { return [] }
  }
}

async function takeScreenshot(path?: string): Promise<string> {
  if (process.platform === 'darwin') {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execAsync = promisify(execFile)
    const outputPath = path ?? `${SESSION_ROOT}/screenshot-${Date.now()}.png`
    await execAsync('screencapture', ['-x', '-T', '0', outputPath], { timeout: 15000 })
    return `screenshot saved to ${outputPath}`
  }
  if (process.platform === 'win32') {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execAsync = promisify(execFile)
    const outputPath = path ?? `${SESSION_ROOT}/screenshot-${Date.now()}.png`
    // Windows 使用 PowerShell 截屏（node 进程无 Electron desktopCapturer，保留本地命令）
    await execAsync('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::PrimaryScreen.Bounds | ForEach-Object { $b = $_; $bitmap = New-Object System.Drawing.Bitmap $b.Width, $b.Height; $graphics = [System.Drawing.Graphics]::FromImage($bitmap); $graphics.CopyFromScreen($b.Left, $b.Top, 0, 0, $b.Size); $bitmap.Save('${outputPath}', [System.Drawing.Imaging.ImageFormat]::Png); $graphics.Dispose(); $bitmap.Dispose() }`,
    ], { timeout: 15000 })
    return `screenshot saved to ${outputPath}`
  }
  return 'screenshot not supported on this platform'
}

async function execCommand(command: string, cwd?: string, timeoutMs: number = TIMEOUT_MS): Promise<{ ok: boolean, stdout: string, stderr: string, exitCode: number | null }> {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const execAsync = promisify(execFile)
  try {
    const { stdout, stderr } = await execAsync(command, [], { cwd, timeout: timeoutMs, shell: true })
    return { ok: true, stdout: stdout.slice(0, 10000), stderr: stderr.slice(0, 2000), exitCode: 0 }
  }
  catch (err: any) {
    return { ok: false, stdout: err.stdout?.slice(0, 10000) ?? '', stderr: err.stderr?.slice(0, 2000) ?? '', exitCode: err.code ?? -1 }
  }
}

async function readClipboard(): Promise<string> {
  if (process.platform === 'darwin') {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execAsync = promisify(execFile)
    const { stdout } = await execAsync('pbpaste', [], { timeout: 5000 })
    return stdout
  }
  if (process.platform === 'win32') {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execAsync = promisify(execFile)
    const { stdout } = await execAsync('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::GetText()',
    ], { timeout: 5000 })
    return stdout.trim()
  }
  return ''
}

async function writeClipboard(text: string): Promise<void> {
  if (process.platform === 'darwin') {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execAsync = promisify(execFile)
    const proc = execAsync('pbcopy', [], { timeout: 5000 })
    proc.child.stdin?.write(text)
    proc.child.stdin?.end()
    await proc
  }
  else if (process.platform === 'win32') {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execAsync = promisify(execFile)
    const escaped = text.replace(/'/g, "''")
    await execAsync('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetText('${escaped}')`,
    ], { timeout: 5000 })
  }
}

// ========== 启动 ==========

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

// 仅作为入口直接执行时启动（tsx src/index.ts）；被 import（如测试导入
// mapKeysToPlatform）时不自动拉起 stdio server，避免副作用。
const entryFile = process.argv[1]?.replace(/\\/g, '/').split('/').pop()
const isEntry = entryFile === 'index.ts' || entryFile === 'index.js'
if (isEntry) {
  main().catch((err) => {
    console.error('Fatal error:', err)
    exit(1)
  })
}