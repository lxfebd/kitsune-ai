/**
 * 跨平台自动化接口定义。
 *
 * 每个平台（Windows、macOS、Linux）需要实现此接口。
 */

// 从 shared/eventa 统一导入 WindowInfo 类型
export type { WindowInfo } from '../../../../shared/eventa'

import type { WindowInfo } from '../../../../shared/eventa'

export interface PlatformAutomation {
  // 鼠标操作
  moveTo(x: number, y: number): Promise<void>
  click(button: 'left' | 'right' | 'middle'): Promise<void>
  drag(from: { x: number, y: number }, to: { x: number, y: number }): Promise<void>

  // 键盘操作
  type(text: string): Promise<void>
  pressKey(key: string): Promise<void>

  // 屏幕信息
  getCursorPosition(): Promise<{ x: number, y: number }>
  getScreenSize(): Promise<{ width: number, height: number }>

  // 窗口管理
  listWindows(): Promise<WindowInfo[]>
  focusWindow(title?: string, processName?: string): Promise<boolean>
  maximizeWindow(title?: string, processName?: string): Promise<boolean>
  minimizeWindow(title?: string, processName?: string): Promise<boolean>
  restoreWindow(title?: string, processName?: string): Promise<boolean>
  closeWindow(title?: string, processName?: string): Promise<boolean>

  // 应用管理
  launchApp(command: string, args?: string[]): Promise<{ pid: number | null, error?: string }>
}

export interface PlatformOptions {
  timeout?: number
}
