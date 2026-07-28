/**
 * macOS 平台自动化实现。
 *
 * 使用 osascript (AppleScript) + cliclick 实现鼠标、键盘、窗口管理等功能。
 * 需要安装 cliclick 工具：brew install cliclick
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import type { PlatformAutomation, PlatformOptions, WindowInfo } from './index'

const execAsync = promisify(execFile)

export class MacAutomation implements PlatformAutomation {
  private timeout: number
  private hasCliclick: boolean | null = null

  constructor(options: PlatformOptions = {}) {
    this.timeout = options.timeout ?? 10_000
  }

  private async exec(command: string, args: string[]): Promise<string> {
    const { stdout } = await execAsync(command, args, { timeout: this.timeout })
    return stdout
  }

  private async execAppleScript(script: string): Promise<string> {
    return this.exec('osascript', ['-e', script])
  }

  private async checkCliclick(): Promise<boolean> {
    if (this.hasCliclick !== null) return this.hasCliclick
    try {
      await this.exec('which', ['cliclick'])
      this.hasCliclick = true
    }
    catch {
      this.hasCliclick = false
    }
    return this.hasCliclick
  }

  async moveTo(x: number, y: number): Promise<void> {
    if (await this.checkCliclick()) {
      await this.exec('cliclick', [`m:${x},${y}`])
    }
    else {
      // 使用 AppleScript 作为后备方案
      await this.execAppleScript(`
        tell application "System Events"
          set position of mouse to {${x}, ${y}}
        end tell
      `)
    }
  }

  async click(button: 'left' | 'right' | 'middle' = 'left'): Promise<void> {
    if (await this.checkCliclick()) {
      const clickType = button === 'right' ? 'rc' : 'c'
      await this.exec('cliclick', [clickType])
    }
    else {
      const buttonCode = button === 'right' ? 2 : button === 'middle' ? 3 : 1
      await this.execAppleScript(`
        tell application "System Events"
          click at {0, 0} button ${buttonCode}
        end tell
      `)
    }
  }

  async drag(from: { x: number, y: number }, to: { x: number, y: number }): Promise<void> {
    if (await this.checkCliclick()) {
      await this.exec('cliclick', [`dd:${from.x},${from.y}`, `du:${to.x},${to.y}`])
    }
    else {
      await this.execAppleScript(`
        tell application "System Events"
          set position of mouse to {${from.x}, ${from.y}}
          delay 0.1
          mouse down
          delay 0.1
          set position of mouse to {${to.x}, ${to.y}}
          delay 0.1
          mouse up
        end tell
      `)
    }
  }

  async type(text: string): Promise<void> {
    await this.execAppleScript(`
      tell application "System Events"
        keystroke "${text.replace(/"/g, '\\"')}"
      end tell
    `)
  }

  async pressKey(key: string): Promise<void> {
    // 映射常见按键到 AppleScript key code
    const keyMap: Record<string, string> = {
      'return': 'key code 36',
      'enter': 'key code 36',
      'tab': 'key code 48',
      'space': 'key code 49',
      'delete': 'key code 51',
      'escape': 'key code 53',
      'esc': 'key code 53',
      'left': 'key code 123',
      'right': 'key code 124',
      'down': 'key code 125',
      'up': 'key code 126',
      'f1': 'key code 122',
      'f2': 'key code 120',
      'f3': 'key code 99',
      'f4': 'key code 118',
      'f5': 'key code 96',
      'f6': 'key code 97',
      'f7': 'key code 98',
      'f8': 'key code 100',
      'f9': 'key code 101',
      'f10': 'key code 109',
      'f11': 'key code 103',
      'f12': 'key code 111',
    }

    // 处理修饰键组合 (如 Ctrl+C, Cmd+V)
    const parts = key.split('+')
    if (parts.length > 1) {
      const modifiers = parts.slice(0, -1)
      const mainKey = parts[parts.length - 1]
      const modifierStr = modifiers.map(m => {
        switch (m.toLowerCase()) {
          case 'ctrl': case 'control': return 'control down'
          case 'cmd': case 'command': return 'command down'
          case 'option': case 'alt': return 'option down'
          case 'shift': return 'shift down'
          default: return ''
        }
      }).filter(Boolean).join(' and ')

      const keyCode = keyMap[mainKey.toLowerCase()]
      if (keyCode) {
        await this.execAppleScript(`
          tell application "System Events"
            key code ${keyCode.split(' ').pop()} using {${modifierStr}}
          end tell
        `)
      }
      else {
        await this.execAppleScript(`
          tell application "System Events"
            keystroke "${mainKey}" using {${modifierStr}}
          end tell
        `)
      }
    }
    else {
      const keyCode = keyMap[key.toLowerCase()]
      if (keyCode) {
        await this.execAppleScript(`
          tell application "System Events"
            ${keyCode}
          end tell
        `)
      }
      else {
        await this.execAppleScript(`
          tell application "System Events"
            keystroke "${key}"
          end tell
        `)
      }
    }
  }

  async getCursorPosition(): Promise<{ x: number, y: number }> {
    const script = `
      tell application "System Events"
        set mousePos to position of mouse
        return (item 1 of mousePos as text) & "," & (item 2 of mousePos as text)
      end tell
    `
    const stdout = await this.execAppleScript(script)
    const parts = stdout.trim().split(',')
    return { x: parseInt(parts[0], 10), y: parseInt(parts[1], 10) }
  }

  async getScreenSize(): Promise<{ width: number, height: number }> {
    const script = `
      tell application "Finder"
        set screenBounds to bounds of window of desktop
        return (item 3 of screenBounds as text) & "," & (item 4 of screenBounds as text)
      end tell
    `
    const stdout = await this.execAppleScript(script)
    const parts = stdout.trim().split(',')
    return { width: parseInt(parts[0], 10), height: parseInt(parts[1], 10) }
  }

  async listWindows(): Promise<WindowInfo[]> {
    const script = `
      tell application "System Events"
        set windowList to {}
        set allProcesses to every process whose visible is true
        repeat with proc in allProcesses
          set procName to name of proc
          set procId to unix id of proc
          set procWindows to windows of proc
          repeat with win in procWindows
            set winTitle to name of win
            set winPos to position of win
            set winSize to size of win
            set winMin to miniaturized of win
            set winMax to zoomed of win
            set end of windowList to {procName, procId, winTitle, item 1 of winPos, item 2 of winPos, item 1 of winSize, item 2 of winSize, true, winMin, winMax}
          end repeat
        end repeat
      end tell
      return windowList
    `
    // 注意：AppleScript 返回复杂数据结构较困难，这里简化处理
    // 实际使用中可能需要使用 JavaScript for Automation (JXA)
    try {
      const jxaScript = `
        const app = Application.currentApplication();
        app.includeStandardAdditions = true;
        const se = Application('System Events');
        const processes = se.processes.whose({visible: true});
        const windows = [];
        for (const proc of processes) {
          const procName = proc.name();
          const procId = proc.unixId();
          for (const win of proc.windows()) {
            windows.push({
              title: win.name() || '',
              processName: procName,
              pid: procId,
              x: win.position()[0],
              y: win.position()[1],
              width: win.size()[0],
              height: win.size()[1],
              isVisible: true,
              isMinimized: win.miniaturized(),
              isMaximized: win.zoomed()
            });
          }
        }
        JSON.stringify(windows);
      `
      const stdout = await this.exec('osascript', ['-l', 'JavaScript', '-e', jxaScript])
      return JSON.parse(stdout.trim())
    }
    catch {
      return []
    }
  }

  private async windowAction(action: string, title?: string, processName?: string): Promise<boolean> {
    const jxaScript = `
      const app = Application.currentApplication();
      app.includeStandardAdditions = true;
      const se = Application('System Events');
      const processes = se.processes.whose({visible: true});

      for (const proc of processes) {
        const procName = proc.name();
        if (${processName ? `procName.toLowerCase().includes('${processName.toLowerCase()}')` : 'true'}) {
          for (const win of proc.windows()) {
            const winTitle = win.name() || '';
            if (${title ? `winTitle.toLowerCase().includes('${title.toLowerCase()}')` : 'true'}) {
              try {
                ${this.getWindowActionJXA(action)}
                true;
              } catch (e) {
                false;
              }
              break;
            }
          }
        }
      }
      false;
    `
    try {
      const stdout = await this.exec('osascript', ['-l', 'JavaScript', '-e', jxaScript])
      return stdout.trim() === 'true'
    }
    catch {
      return false
    }
  }

  private getWindowActionJXA(action: string): string {
    switch (action) {
      case 'focus':
        return `
          app.activate();
          proc.frontmost = true;
        `
      case 'maximize':
        return `
          win.zoomed = true;
        `
      case 'minimize':
        return `
          win.miniaturized = true;
        `
      case 'restore':
        return `
          win.miniaturized = false;
          win.zoomed = false;
        `
      case 'close':
        return `
          win.close();
        `
      default:
        return ''
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
      const child = spawn('open', ['-a', command, ...args], {
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
