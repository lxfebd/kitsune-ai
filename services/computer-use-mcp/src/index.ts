/**
 * Kitsune Computer Use MCP Service
 *
 * macOS 桌面编排 MCP 服务，通过 @modelcontextprotocol/sdk 暴露桌面自动化工具。
 *
 * 复用：
 * - @modelcontextprotocol/sdk（MCP 协议）
 * - 与 apps/stage-tamagotchi 的 desktop-automation/ 共享设计模式
 *
 * 工具清单见 README.md
 */

import { env, exit } from 'node:process'

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
    await clickAt(x, y, button)
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
    await typeText(text)
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
    await pressKeys(keys)
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
    await scroll(direction, amount)
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
    await openApp(name)
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
    await focusApp(name)
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

// ========== 平台实现 ==========

async function enumerateWindows(): Promise<any[]> {
  if (process.platform === 'darwin') {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execAsync = promisify(execFile)
    try {
      const { stdout } = await execAsync('osascript', ['-e', `
        tell application "System Events"
          set winList to {}
          repeat with proc in every process whose visible is true
            set procName to name of proc
            try
              repeat with win in every window of proc
                set winTitle to title of win
                if winTitle is not "" then
                  set end of winList to {name:procName, title:winTitle}
                end if
              end repeat
            end try
          end repeat
          return winList
        end tell
      `], { timeout: 10000 })
      return JSON.parse(stdout || '[]')
    }
    catch { return [] }
  }
  if (process.platform === 'win32') {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execAsync = promisify(execFile)
    try {
      const { stdout } = await execAsync('powershell', [
        '-NoProfile', '-NonInteractive', '-Command',
        'Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object Name, MainWindowTitle | ConvertTo-Json -Compress',
      ], { timeout: 10000 })
      return JSON.parse(stdout || '[]')
    }
    catch { return [] }
  }
  return []
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
    // Windows 使用 PowerShell 截屏
    await execAsync('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::PrimaryScreen.Bounds | ForEach-Object { $b = $_; $bitmap = New-Object System.Drawing.Bitmap $b.Width, $b.Height; $graphics = [System.Drawing.Graphics]::FromImage($bitmap); $graphics.CopyFromScreen($b.Left, $b.Top, 0, 0, $b.Size); $bitmap.Save('${outputPath}', [System.Drawing.Imaging.ImageFormat]::Png); $graphics.Dispose(); $bitmap.Dispose() }`,
    ], { timeout: 15000 })
    return `screenshot saved to ${outputPath}`
  }
  return 'screenshot not supported on this platform'
}

async function clickAt(x: number, y: number, button: string): Promise<void> {
  if (process.platform === 'darwin') {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execAsync = promisify(execFile)
    await execAsync('cliclick', [`c:${x},${y}`], { timeout: 5000 })
  }
  else if (process.platform === 'win32') {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execAsync = promisify(execFile)
    const btn = button === 'right' ? 'R' : button === 'middle' ? 'M' : 'L'
    await execAsync('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${Math.trunc(x)},${Math.trunc(y)}); [System.Windows.Forms.SendKeys]::SendWait('{${btn}CLICK}')`,
    ], { timeout: 5000 })
  }
}

async function typeText(text: string): Promise<void> {
  if (process.platform === 'darwin') {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execAsync = promisify(execFile)
    await execAsync('cliclick', [`t:${text.replace(/"/g, '\\"')}`], { timeout: 10000 })
  }
  else if (process.platform === 'win32') {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execAsync = promisify(execFile)
    const escaped = text.replace(/'/g, "''")
    await execAsync('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      `(New-Object -ComObject WScript.Shell).SendKeys('${escaped}')`,
    ], { timeout: 10000 })
  }
}

async function pressKeys(keys: string): Promise<void> {
  if (process.platform === 'darwin') {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execAsync = promisify(execFile)
    await execAsync('cliclick', [`kp:${keys}`], { timeout: 5000 })
  }
  else if (process.platform === 'win32') {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execAsync = promisify(execFile)
    await execAsync('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      `(New-Object -ComObject WScript.Shell).SendKeys('{${keys}}')`,
    ], { timeout: 5000 })
  }
}

async function scroll(direction: string, amount: number): Promise<void> {
  if (process.platform === 'darwin') {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execAsync = promisify(execFile)
    const delta = direction === 'up' || direction === 'left' ? -amount : amount
    const axis = direction === 'up' || direction === 'down' ? 'y' : 'x'
    await execAsync('cliclick', [`sc:${axis}:${delta}`], { timeout: 5000 })
  }
  else if (process.platform === 'win32') {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execAsync = promisify(execFile)
    const btn = direction === 'up' ? '5' : direction === 'down' ? '4' : direction === 'left' ? '7' : '6'
    for (let i = 0; i < Math.abs(amount); i++) {
      await execAsync('powershell', [
        '-NoProfile', '-NonInteractive', '-Command',
        `Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class SW{[DllImport("user32.dll")]public static extern void mouse_event(uint f,uint x,uint y,uint d,int e);}'; [SW]::mouse_event(0x0800,0,0,0,${btn === '4' ? 120 : btn === '5' ? -120 : 0},0)`,
      ], { timeout: 1000 })
    }
  }
}

async function openApp(name: string): Promise<void> {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const execAsync = promisify(execFile)
  if (process.platform === 'darwin') {
    await execAsync('open', ['-a', name], { timeout: 10000 })
  }
  else if (process.platform === 'win32') {
    await execAsync('start', ['""', name], { timeout: 10000, shell: true })
  }
}

async function focusApp(name: string): Promise<void> {
  if (process.platform === 'darwin') {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execAsync = promisify(execFile)
    await execAsync('osascript', ['-e', `tell application "${name}" to activate`], { timeout: 10000 })
  }
  else if (process.platform === 'win32') {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execAsync = promisify(execFile)
    await execAsync('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      `(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.ProcessName -like '*${name}*' } | Select-Object -First 1).MainWindowHandle | ForEach-Object { Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class F{[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr hWnd);}'; [F]::SetForegroundWindow($_) }`,
    ], { timeout: 10000 })
  }
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

main().catch((err) => {
  console.error('Fatal error:', err)
  exit(1)
})