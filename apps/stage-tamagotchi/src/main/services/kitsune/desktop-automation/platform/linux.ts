/**
 * Linux 平台自动化实现。
 *
 * 使用 xdotool + wmctrl 实现鼠标、键盘、窗口管理等功能。
 * 需要安装：sudo apt install xdotool wmctrl
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import type { PlatformAutomation, PlatformOptions, WindowInfo } from './index'

const execAsync = promisify(execFile)

export class LinuxAutomation implements PlatformAutomation {
  private timeout: number
  private hasXdotool: boolean | null = null
  private hasWmctrl: boolean | null = null

  constructor(options: PlatformOptions = {}) {
    this.timeout = options.timeout ?? 10_000
  }

  private async exec(command: string, args: string[]): Promise<string> {
    const { stdout } = await execAsync(command, args, { timeout: this.timeout })
    return stdout
  }

  private async checkTool(tool: string): Promise<boolean> {
    try {
      await this.exec('which', [tool])
      return true
    }
    catch {
      return false
    }
  }

  private async ensureXdotool(): Promise<void> {
    if (this.hasXdotool === null) {
      this.hasXdotool = await this.checkTool('xdotool')
    }
    if (!this.hasXdotool) {
      throw new Error('xdotool 未安装，请运行: sudo apt install xdotool')
    }
  }

  private async ensureWmctrl(): Promise<void> {
    if (this.hasWmctrl === null) {
      this.hasWmctrl = await this.checkTool('wmctrl')
    }
    if (!this.hasWmctrl) {
      throw new Error('wmctrl 未安装，请运行: sudo apt install wmctrl')
    }
  }

  async moveTo(x: number, y: number): Promise<void> {
    await this.ensureXdotool()
    await this.exec('xdotool', ['mousemove', String(x), String(y)])
  }

  async click(button: 'left' | 'right' | 'middle' = 'left'): Promise<void> {
    await this.ensureXdotool()
    const buttonMap = { left: '1', right: '3', middle: '2' }
    await this.exec('xdotool', ['click', buttonMap[button]])
  }

  async drag(from: { x: number, y: number }, to: { x: number, y: number }): Promise<void> {
    await this.ensureXdotool()
    await this.exec('xdotool', ['mousemove', String(from.x), String(from.y)])
    await this.exec('xdotool', ['mousedown', '1'])
    await this.exec('xdotool', ['mousemove', String(to.x), String(to.y)])
    await this.exec('xdotool', ['mouseup', '1'])
  }

  async type(text: string): Promise<void> {
    await this.ensureXdotool()
    await this.exec('xdotool', ['type', '--clearmodifiers', text])
  }

  async pressKey(key: string): Promise<void> {
    await this.ensureXdotool()
    // 映射常见按键到 xdotool key name
    const keyMap: Record<string, string> = {
      'return': 'Return',
      'enter': 'Return',
      'tab': 'Tab',
      'space': 'space',
      'delete': 'Delete',
      'backspace': 'BackSpace',
      'escape': 'Escape',
      'esc': 'Escape',
      'left': 'Left',
      'right': 'Right',
      'down': 'Down',
      'up': 'Up',
      'home': 'Home',
      'end': 'End',
      'pageup': 'Page_Up',
      'pagedown': 'Page_Down',
      'f1': 'F1',
      'f2': 'F2',
      'f3': 'F3',
      'f4': 'F4',
      'f5': 'F5',
      'f6': 'F6',
      'f7': 'F7',
      'f8': 'F8',
      'f9': 'F9',
      'f10': 'F10',
      'f11': 'F11',
      'f12': 'F12',
    }

    // 处理修饰键组合
    const parts = key.split('+')
    if (parts.length > 1) {
      const modifiers = parts.slice(0, -1).map(m => {
        switch (m.toLowerCase()) {
          case 'ctrl': case 'control': return 'ctrl'
          case 'alt': case 'option': return 'alt'
          case 'shift': return 'shift'
          case 'super': case 'cmd': case 'command': return 'super'
          default: return ''
        }
      }).filter(Boolean)

      const mainKey = parts[parts.length - 1]
      const xdotoolKey = keyMap[mainKey.toLowerCase()] || mainKey
      const fullKey = [...modifiers, xdotoolKey].join('+')
      await this.exec('xdotool', ['key', '--clearmodifiers', fullKey])
    }
    else {
      const xdotoolKey = keyMap[key.toLowerCase()] || key
      await this.exec('xdotool', ['key', '--clearmodifiers', xdotoolKey])
    }
  }

  async getCursorPosition(): Promise<{ x: number, y: number }> {
    await this.ensureXdotool()
    const stdout = await this.exec('xdotool', ['getmouselocation'])
    const match = stdout.match(/x:(\d+)\s+y:(\d+)/)
    if (!match) {
      throw new Error(`无法解析鼠标位置: ${stdout}`)
    }
    return { x: parseInt(match[1], 10), y: parseInt(match[2], 10) }
  }

  async getScreenSize(): Promise<{ width: number, height: number }> {
    await this.ensureXdotool()
    const stdout = await this.exec('xdotool', ['getdisplaygeometry'])
    const parts = stdout.trim().split(/\s+/)
    return { width: parseInt(parts[0], 10), height: parseInt(parts[1], 10) }
  }

  async listWindows(): Promise<WindowInfo[]> {
    await this.ensureWmctrl()
    const stdout = await this.exec('wmctrl', ['-l', '-p', '-G'])
    const windows: WindowInfo[] = []

    for (const line of stdout.split('\n').filter(Boolean)) {
      const parts = line.split(/\s+/)
      if (parts.length >= 7) {
        windows.push({
          title: parts.slice(6).join(' '),
          processName: '', // wmctrl 不直接提供进程名
          pid: parseInt(parts[2], 10),
          x: parseInt(parts[1], 10),
          y: parseInt(parts[2], 10),
          width: parseInt(parts[3], 10),
          height: parseInt(parts[4], 10),
          isVisible: true,
          isMinimized: false,
          isMaximized: false,
        })
      }
    }

    return windows
  }

  private async windowAction(action: string, title?: string, processName?: string): Promise<boolean> {
    await this.ensureWmctrl()

    // 使用 xdotool 搜索窗口
    const searchArgs = ['search', '--name']
    if (title) {
      searchArgs.push(title)
    }
    else if (processName) {
      // xdotool 可以通过 --pid 搜索进程的窗口
      const pidOutput = await this.exec('pgrep', ['-f', processName]).catch(() => '')
      const pid = pidOutput.trim().split('\n')[0]
      if (!pid) return false
      searchArgs.splice(1, 0, '--pid', pid)
    }
    else {
      return false
    }

    try {
      const stdout = await this.exec('xdotool', searchArgs)
      const windowId = stdout.trim().split('\n')[0]
      if (!windowId) return false

      switch (action) {
        case 'focus':
          await this.exec('xdotool', ['windowactivate', '--sync', windowId])
          break
        case 'maximize':
          await this.exec('wmctrl', ['-i', '-r', windowId, '-b', 'add,maximized_vert,maximized_horz'])
          break
        case 'minimize':
          await this.exec('xdotool', ['windowminimize', '--sync', windowId])
          break
        case 'restore':
          await this.exec('wmctrl', ['-i', '-r', windowId, '-b', 'remove,maximized_vert,maximized_horz'])
          break
        case 'close':
          await this.exec('xdotool', ['windowclose', windowId])
          break
      }

      return true
    }
    catch {
      return false
    }
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
      })
      child.unref()
      return { pid: child.pid ?? null }
    }
    catch (error) {
      return { pid: null, error: String(error) }
    }
  }
}
