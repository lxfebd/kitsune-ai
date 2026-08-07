/**
 * Windows 平台自动化实现。
 *
 * 使用 PowerShell + Win32 API 实现鼠标、键盘、窗口管理等功能。
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import type { PlatformAutomation, PlatformOptions, WindowInfo } from './index'

const execAsync = promisify(execFile)

// ========== PowerShell 命令模板 ==========

/** 移动光标到指定坐标（强制整数并校验有限值，避免注入非法表达式） */
const MOUSE_MOVE_CMD = (x: number, y: number) => {
  if (!Number.isFinite(x) || !Number.isFinite(y))
    throw new TypeError(`Invalid cursor coordinates: ${x}, ${y}`)
  const px = Math.trunc(x)
  const py = Math.trunc(y)
  return `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${px},${py})`
}

/** 模拟鼠标点击（down/up 鼠标事件） */
const CLICK_CMD = (button: 'left' | 'right' | 'middle') => {
  const down = button === 'left' ? '0x02' : button === 'right' ? '0x08' : '0x20'
  const up = button === 'left' ? '0x04' : button === 'right' ? '0x10' : '0x40'
  return `Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class M{[DllImport("user32.dll")]public static extern void mouse_event(uint f,uint x,uint y,uint d,int e);}'; [M]::mouse_event(${down},0,0,0,0); [M]::mouse_event(${up},0,0,0,0)`
}

/** 键盘输入 */
const KEYBOARD_TYPE_CMD = (text: string) => {
  // NOTICE:
  // The result is wrapped in PowerShell single quotes, so a literal `'` would
  // terminate the string and allow command injection. PowerShell escapes a
  // single quote inside a single-quoted string by doubling it (`''`). `$()`,
  // backticks and `;` are inert inside single quotes.
  const escaped = text
    .replace(/'/g, "''")
    .replace(/\+/g, '{+}')
    .replace(/\^/g, '{^}')
    .replace(/%/g, '{%}')
    .replace(/~/g, '{~}')
    .replace(/\(/g, '{(}')
    .replace(/\)/g, '{)}')
    .replace(/\[/g, '{[}')
    .replace(/\]/g, '{]}')
    .replace(/\{/g, '{{}')
    .replace(/\}/g, '{}}')
  return `(New-Object -ComObject WScript.Shell).SendKeys('${escaped}')`
}

/** SendKeys 特殊键名白名单：仅允许固定键名，禁止任意字符串进入 PowerShell 单引号串 */
const SEND_KEYS_KEY_ALLOWLIST = [
  'ENTER', 'TAB', 'ESC', 'ESCAPE', 'BACKSPACE', 'BKSP', 'BS',
  'DELETE', 'DEL', 'INSERT', 'INS', 'HOME', 'END', 'PGUP', 'PGDN',
  'UP', 'DOWN', 'LEFT', 'RIGHT', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6',
  'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'F13', 'F14', 'F15', 'F16',
  'F17', 'F18', 'F19', 'F20', 'F21', 'F22', 'F23', 'F24',
  'ADD', 'SUBTRACT', 'MULTIPLY', 'DIVIDE', 'NUMPAD0', 'NUMPAD1', 'NUMPAD2',
  'NUMPAD3', 'NUMPAD4', 'NUMPAD5', 'NUMPAD6', 'NUMPAD7', 'NUMPAD8', 'NUMPAD9',
]

/** 获取鼠标位置 */
const GET_CURSOR_POSITION_CMD = `
Add-Type -AssemblyName System.Windows.Forms
$p = [System.Windows.Forms.Cursor]::Position
"X=$($p.X) Y=$($p.Y)"
`

/** 获取屏幕尺寸 */
const GET_SCREEN_SIZE_CMD = `
Add-Type -AssemblyName System.Windows.Forms
$screen = [System.Windows.Forms.Screen]::PrimaryScreen
"W=$($screen.Bounds.Width) H=$($screen.Bounds.Height)"
`

/** 获取所有窗口信息 */
const LIST_WINDOWS_CMD = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;
public class WinAPI {
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@

$windows = @()
$callback = [WinAPI+EnumWindowsProc]{
    param($hWnd, $lParam)
    $length = [WinAPI]::GetWindowTextLength($hWnd)
    if ($length -gt 0 -and [WinAPI]::IsWindowVisible($hWnd)) {
        $sb = New-Object System.Text.StringBuilder ($length + 1)
        [WinAPI]::GetWindowText($hWnd, $sb, $sb.Capacity) | Out-Null
        $title = $sb.ToString()
        if ($title -ne '') {
            $rect = New-Object WinAPI+RECT
            [WinAPI]::GetWindowRect($hWnd, [ref]$rect) | Out-Null
            $pid = 0
            [WinAPI]::GetWindowThreadProcessId($hWnd, [ref]$pid) | Out-Null
            $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
            $windows += @{
                title = $title
                processName = if ($proc) { $proc.ProcessName } else { 'unknown' }
                pid = $pid
                x = $rect.Left
                y = $rect.Top
                width = $rect.Right - $rect.Left
                height = $rect.Bottom - $rect.Top
                isVisible = [WinAPI]::IsWindowVisible($hWnd)
                isMinimized = [WinAPI]::IsIconic($hWnd)
                isMaximized = [WinAPI]::IsZoomed($hWnd)
            }
        }
    }
    return $true
}
[WinAPI]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null
$windows | ConvertTo-Json -Compress
`

// ========== Windows 平台实现 ==========

export class WindowsAutomation implements PlatformAutomation {
  private timeout: number

  constructor(options: PlatformOptions = {}) {
    this.timeout = options.timeout ?? 10_000
  }

  private async execPowerShell(cmd: string): Promise<string> {
    const { stdout } = await execAsync('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      cmd,
    ], { timeout: this.timeout })
    return stdout
  }

  async moveTo(x: number, y: number): Promise<void> {
    await this.execPowerShell(MOUSE_MOVE_CMD(x, y))
  }

  async click(button: 'left' | 'right' | 'middle' = 'left'): Promise<void> {
    await this.execPowerShell(CLICK_CMD(button))
  }

  async drag(from: { x: number, y: number }, to: { x: number, y: number }): Promise<void> {
    await this.moveTo(from.x, from.y)
    await this.click('left')
    await this.moveTo(to.x, to.y)
    await this.click('left')
  }

  async type(text: string): Promise<void> {
    await this.execPowerShell(KEYBOARD_TYPE_CMD(text))
  }

  async pressKey(key: string): Promise<void> {
    // NOTICE:
    // SendKeys special-key names are wrapped in braces and injected into a
    // single-quoted PowerShell string. Only a fixed allowlist of well-known
    // names is accepted; anything else is rejected rather than echoed, so an
    // untrusted key string cannot smuggle a closing quote or `{}` sequence.
    if (!SEND_KEYS_KEY_ALLOWLIST.includes(key)) {
      throw new TypeError(`Unsupported SendKeys key name: ${key}`)
    }
    await this.execPowerShell(KEYBOARD_TYPE_CMD(`{${key}}`))
  }

  async getCursorPosition(): Promise<{ x: number, y: number }> {
    const stdout = await this.execPowerShell(GET_CURSOR_POSITION_CMD)
    const match = stdout.match(/X=(\d+)\s+Y=(\d+)/)
    if (!match) {
      throw new Error(`无法解析鼠标位置: ${stdout}`)
    }
    return { x: parseInt(match[1], 10), y: parseInt(match[2], 10) }
  }

  async getScreenSize(): Promise<{ width: number, height: number }> {
    const stdout = await this.execPowerShell(GET_SCREEN_SIZE_CMD)
    const match = stdout.match(/W=(\d+)\s+H=(\d+)/)
    if (!match) {
      throw new Error(`无法解析屏幕尺寸: ${stdout}`)
    }
    return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) }
  }

  async listWindows(): Promise<WindowInfo[]> {
    const stdout = await this.execPowerShell(LIST_WINDOWS_CMD)
    try {
      const parsed = JSON.parse(stdout.trim())
      return Array.isArray(parsed) ? parsed : [parsed]
    }
    catch {
      return []
    }
  }

  private async windowAction(action: string, title?: string, processName?: string): Promise<boolean> {
    // NOTICE:
    // Title/processName are interpolated into PowerShell strings. Previously a
    // double-quoted string with backtick-escaping of `"` was used; that leaves
    // `$()` subexpressions injectable. Single-quoted strings make everything
    // inert except `'`, which we escape by doubling it (`''`).
    const matchCondition = title
      ? `$_.Title -like '*${title.replace(/'/g, "''")}*'`
      : processName
        ? `$_.ProcessName -eq '${processName.replace(/'/g, "''")}'`
        : '$false'

    let cmd: string

    switch (action) {
      case 'focus':
        cmd = `
$windows = @(Get-Process | Where-Object { ${matchCondition} -and $_.MainWindowHandle -ne [IntPtr]::Zero })
if ($windows.Count -gt 0) {
    $w = $windows[0]
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinFocus {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
    if ($w.WindowState -eq 'Minimized') { [WinFocus]::ShowWindow($w.MainWindowHandle, 9) }
    [WinFocus]::SetForegroundWindow($w.MainWindowHandle) | Out-Null
    "OK"
} else { "NOT_FOUND" }`
        break
      case 'maximize':
        cmd = `
$windows = @(Get-Process | Where-Object { ${matchCondition} -and $_.MainWindowHandle -ne [IntPtr]::Zero })
if ($windows.Count -gt 0) {
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinMax {
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
    [WinMax]::ShowWindow($windows[0].MainWindowHandle, 3) | Out-Null
    "OK"
} else { "NOT_FOUND" }`
        break
      case 'minimize':
        cmd = `
$windows = @(Get-Process | Where-Object { ${matchCondition} -and $_.MainWindowHandle -ne [IntPtr]::Zero })
if ($windows.Count -gt 0) {
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinMin {
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
    [WinMin]::ShowWindow($windows[0].MainWindowHandle, 6) | Out-Null
    "OK"
} else { "NOT_FOUND" }`
        break
      case 'restore':
        cmd = `
$windows = @(Get-Process | Where-Object { ${matchCondition} -and $_.MainWindowHandle -ne [IntPtr]::Zero })
if ($windows.Count -gt 0) {
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinRestore {
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
    [WinRestore]::ShowWindow($windows[0].MainWindowHandle, 9) | Out-Null
    "OK"
} else { "NOT_FOUND" }`
        break
      case 'close':
        cmd = `
$windows = @(Get-Process | Where-Object { ${matchCondition} -and $_.MainWindowHandle -ne [IntPtr]::Zero })
if ($windows.Count -gt 0) {
    $windows[0] | Stop-Process -Force
    "OK"
} else { "NOT_FOUND" }`
        break
      default:
        return false
    }

    const stdout = await this.execPowerShell(cmd)
    return stdout.trim() === 'OK'
  }

  async focusWindow(title?: string, processName?: string): Promise<boolean> {
    return this.windowAction('focus', title, processName)
  }

  async maximizeWindow(title?: string, processName?: string): Promise<boolean> {
    return this.windowAction('maximize', title, processName)
  }

  async minimizeWindow(title?: string, processName?: string): Promise<boolean> {
    return this.windowAction('minimize', title, processName)
  }

  async restoreWindow(title?: string, processName?: string): Promise<boolean> {
    return this.windowAction('restore', title, processName)
  }

  async closeWindow(title?: string, processName?: string): Promise<boolean> {
    return this.windowAction('close', title, processName)
  }

  async launchApp(command: string, args: string[] = []): Promise<{ pid: number | null, error?: string }> {
    try {
      const { spawn } = await import('node:child_process')
      const child = spawn(command, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      })
      child.unref()
      return { pid: child.pid ?? null }
    }
    catch (error) {
      return { pid: null, error: String(error) }
    }
  }
}
