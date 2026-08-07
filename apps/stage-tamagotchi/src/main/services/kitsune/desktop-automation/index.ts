/**
 * 桌面自动化服务。
 *
 * 提供跨平台的鼠标、键盘、窗口管理功能。
 * 通过视觉模型支持 UI 元素定位。
 */

import type { FindElementRequestPayload, FindElementResultPayload, WindowInfo } from '../../../../shared/eventa'
import type { PlatformAutomation } from './platform'

import { randomUUID } from 'node:crypto'
import { captureScreenshot } from '../overseer/capture'
import { createPlatformAutomation } from './platform/factory'
import { assertSafe } from './safety'

// IPC 事件定义（延迟导入避免循环依赖）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let electronFindElementRequest: any

async function loadIpcEvents() {
  if (!electronFindElementRequest) {
    const eventa = await import('../../../../shared/eventa')
    electronFindElementRequest = eventa.electronFindElementRequest
  }
}

// ========== 接口定义 ==========

export interface DesktopAutomationService {
  click(button?: 'left' | 'right' | 'middle'): Promise<void>
  moveTo(x: number, y: number): Promise<void>
  drag(from: { x: number, y: number }, to: { x: number, y: number }): Promise<void>
  type(text: string): Promise<void>
  pressKey(key: string): Promise<void>
  scroll(direction: 'up' | 'down' | 'left' | 'right', amount?: number, x?: number, y?: number): Promise<void>
  screenshot(): Promise<string>
  getCursorPosition(): Promise<{ x: number, y: number }>
  findElement(description: string, screenshot?: string): Promise<FindElementResult>
  setOverlayInteractive(interactive: boolean): Promise<void>
  /** 处理渲染进程返回的 findElement 视觉定位结果 */
  handleFindElementResult(result: FindElementResultPayload): void
  // 窗口管理
  listWindows(): Promise<WindowInfo[]>
  focusWindow(title?: string, processName?: string): Promise<boolean>
  maximizeWindow(title?: string, processName?: string): Promise<boolean>
  minimizeWindow(title?: string, processName?: string): Promise<boolean>
  restoreWindow(title?: string, processName?: string): Promise<boolean>
  closeWindow(title?: string, processName?: string): Promise<boolean>
  // 应用管理
  launchApp(command: string, args?: string[]): Promise<{ pid: number | null, error?: string }>
  stop(): void
}

export interface FindElementResult {
  found: boolean
  elements: Array<{
    label: string
    type: string
    x: number
    y: number
    width: number
    height: number
    confidence: number
  }>
  reason?: string
}

export interface DesktopAutomationOptions {
  maxActionsPerSecond?: number
  allowedActions?: string[]
  overlayWindow?: { setIgnoreMouseEvents: (ignore: boolean) => void }
  /** IPC context 用于视觉元素定位（渲染进程通信） */
  context?: {
    emit: (event: any, payload: any) => void
    on?: (event: any, handler: (event: any) => void) => () => void
  }
}

// ========== 服务实现 ==========

export async function createDesktopAutomationService(options: DesktopAutomationOptions = {}): Promise<DesktopAutomationService> {
  const { maxActionsPerSecond = 10, overlayWindow, context } = options
  let stopped = false
  const actionTimestamps: number[] = []

  // 创建平台自动化实例（异步）
  const platform: PlatformAutomation = await createPlatformAutomation()

  // 待处理的 findElement 请求队列
  const pendingFindElementRequests = new Map<string, {
    resolve: (result: FindElementResult) => void
    timer: NodeJS.Timeout
  }>()

  /**
   * 处理渲染进程返回的 findElement 结果。
   */
  function handleFindElementResult(result: FindElementResultPayload) {
    const pending = pendingFindElementRequests.get(result.requestId)
    if (!pending) return

    clearTimeout(pending.timer)
    pendingFindElementRequests.delete(result.requestId)
    pending.resolve({
      found: result.found,
      elements: result.elements,
      reason: result.reason,
    })
  }

  /** 操作频率限制 */
  function checkRateLimit(): boolean {
    const now = Date.now()
    while (actionTimestamps.length > 0 && actionTimestamps[0] < now - 1000)
      actionTimestamps.shift()
    if (actionTimestamps.length >= maxActionsPerSecond)
      return false
    actionTimestamps.push(now)
    return true
  }

  /** 检查服务状态 */
  function checkStopped() {
    if (stopped)
      throw new Error('DesktopAutomation 已停止')
    if (!checkRateLimit())
      throw new Error('操作频率超过限制（每秒最多 10 次）')
  }

  const service: DesktopAutomationService = {
    // ========== 鼠标操作 ==========

    async click(button = 'left') {
      checkStopped()
      assertSafe('click', button)
      await platform.click(button)
    },

    async moveTo(x: number, y: number) {
      checkStopped()
      assertSafe('moveTo', `${x},${y}`)
      const { width, height } = await platform.getScreenSize()
      if (x < 0 || y < 0 || x > width || y > height)
        throw new Error(`坐标超出屏幕范围: (${x}, ${y})，屏幕尺寸: ${width}x${height}`)
      await platform.moveTo(x, y)
    },

    async drag(from: { x: number, y: number }, to: { x: number, y: number }) {
      checkStopped()
      assertSafe('drag', `${from.x},${from.y} → ${to.x},${to.y}`)
      await platform.drag(from, to)
    },

    // ========== 键盘操作 ==========

    async type(text: string) {
      checkStopped()
      assertSafe('type', text)
      await platform.type(text)
    },

    async pressKey(key: string) {
      checkStopped()
      assertSafe('pressKey', key)
      await platform.pressKey(key)
    },

    async scroll(direction: 'up' | 'down' | 'left' | 'right', amount: number = 100, x?: number, y?: number) {
      checkStopped()
      assertSafe('scroll', `${direction}:${amount}`)
      // 获取滚动位置（默认屏幕中心）
      let scrollX = x
      let scrollY = y
      if (scrollX === undefined || scrollY === undefined) {
        const size = await platform.getScreenSize()
        scrollX = scrollX ?? Math.round(size.width / 2)
        scrollY = scrollY ?? Math.round(size.height / 2)
      }
      // 移动到滚动位置
      await platform.moveTo(scrollX, scrollY)
      // 使用平台原生滚动
      const { execFile } = await import('node:child_process')
      const { promisify } = await import('node:util')
      const execAsync = promisify(execFile)
      const scrollDelta = direction === 'up' || direction === 'left' ? 1 : -1
      const scrollAmount = Math.round(amount / 10) * scrollDelta
      // Windows: 使用 PowerShell mouse_event
      if (process.platform === 'win32') {
        const cmd = `Add-Type -AssemblyName System.Windows.Forms; $sig = '[DllImport("user32.dll")]public static extern void mouse_event(uint dwFlags,int dx,int dy,int dwData,int dwExtraInfo)'; Add-Type -MemberDefinition $sig -Name Wheel -Namespace Win32; [Win32.Wheel]::mouse_event(0x0800,0,0,${scrollAmount},0)`
        await execAsync('powershell', ['-NoProfile', '-NonInteractive', '-Command', cmd], { timeout: 5000 })
      }
      // macOS: 使用 cliclick 或 osascript
      else if (process.platform === 'darwin') {
        const delta = direction === 'up' || direction === 'down' ? `0,${scrollAmount}` : `${scrollAmount},0`
        try {
          await execAsync('cliclick', [`sc:${delta}`])
        }
        catch {
          // 后备方案：使用 osascript
          const directionCmd = direction === 'up' ? 'scroll row up' : direction === 'down' ? 'scroll row down' : 'scroll column right'
          await execAsync('osascript', ['-e', `tell application "System Events" to ${directionCmd}`])
        }
      }
      // Linux: 使用 xdotool
      else if (process.platform === 'linux') {
        const button = direction === 'up' ? '5' : direction === 'down' ? '4' : direction === 'right' ? '7' : '6'
        await execAsync('xdotool', ['click', '--window', '0', button])
      }
    },

    // ========== 屏幕信息 ==========

    async screenshot(): Promise<string> {
      return captureScreenshot()
    },

    async getCursorPosition(): Promise<{ x: number, y: number }> {
      return platform.getCursorPosition()
    },

    // ========== 视觉定位 ==========

    async findElement(description: string): Promise<FindElementResult> {
      checkStopped()
      assertSafe('findElement', description)

      // 加载 IPC 事件定义
      await loadIpcEvents()

      if (!context?.emit || !electronFindElementRequest) {
        return { found: false, elements: [], reason: 'IPC context or events not available' }
      }

      // 截取当前屏幕
      const imageDataUrl = await captureScreenshot()
      if (!imageDataUrl) {
        return { found: false, elements: [], reason: 'screenshot failed' }
      }

      // 通过 IPC 发送视觉定位请求到渲染进程
      const requestId = randomUUID()
      const payload: FindElementRequestPayload = { requestId, imageDataUrl, description }

      return new Promise<FindElementResult>((resolve) => {
        const TIMEOUT_MS = 30_000
        const timer = setTimeout(() => {
          pendingFindElementRequests.delete(requestId)
          resolve({ found: false, elements: [], reason: 'findElement timeout' })
        }, TIMEOUT_MS)

        pendingFindElementRequests.set(requestId, { resolve, timer })
        context.emit(electronFindElementRequest, payload)
      })
    },

    async setOverlayInteractive(interactive: boolean) {
      if (overlayWindow) {
        overlayWindow.setIgnoreMouseEvents(!interactive)
      }
    },

    // ========== 窗口管理 ==========

    async listWindows(): Promise<WindowInfo[]> {
      return platform.listWindows()
    },

    async focusWindow(title?: string, processName?: string): Promise<boolean> {
      checkStopped()
      assertSafe('focusWindow', title ?? processName ?? '*')
      return platform.focusWindow(title, processName)
    },

    async maximizeWindow(title?: string, processName?: string): Promise<boolean> {
      checkStopped()
      assertSafe('maximizeWindow', title ?? processName ?? '*')
      return platform.maximizeWindow(title, processName)
    },

    async minimizeWindow(title?: string, processName?: string): Promise<boolean> {
      checkStopped()
      assertSafe('minimizeWindow', title ?? processName ?? '*')
      return platform.minimizeWindow(title, processName)
    },

    async restoreWindow(title?: string, processName?: string): Promise<boolean> {
      checkStopped()
      assertSafe('restoreWindow', title ?? processName ?? '*')
      return platform.restoreWindow(title, processName)
    },

    async closeWindow(title?: string, processName?: string): Promise<boolean> {
      checkStopped()
      assertSafe('closeWindow', title ?? processName ?? '*')
      return platform.closeWindow(title, processName)
    },

    // ========== 应用管理 ==========

    async launchApp(command: string, args: string[] = []): Promise<{ pid: number | null, error?: string }> {
      checkStopped()
      assertSafe('launchApp', command)
      return platform.launchApp(command, args)
    },

    // ========== 生命周期 ==========

    stop() {
      stopped = true
    },

    handleFindElementResult(result: FindElementResultPayload) {
      handleFindElementResult(result)
    },
  }

  return service
}

// 导出平台相关类型
export type { WindowInfo } from '../../../../shared/eventa'
export { isPlatformSupported, getCurrentPlatform } from './platform/factory'
