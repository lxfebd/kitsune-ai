/**
 * 跨平台桌面自动化接口定义。
 *
 * 每个平台（Windows、macOS、Linux）需要实现此接口。
 * 本包为纯 Node 实现，不依赖 Electron——桌宠主进程与 computer-use-mcp 共享。
 */

/** 窗口信息（与 shared/eventa domains/desktop.ts 的 WindowInfo 结构对齐）。 */
export interface WindowInfo {
  title: string
  processName: string
  pid: number
  x: number
  y: number
  width: number
  height: number
  isVisible: boolean
  isMinimized: boolean
  isMaximized: boolean
}

export interface PlatformAutomation {
  // 鼠标操作
  moveTo(x: number, y: number): Promise<void>
  click(button: 'left' | 'right' | 'middle'): Promise<void>
  drag(from: { x: number, y: number }, to: { x: number, y: number }): Promise<void>
  /**
   * 在指定位置滚动（不传 x/y 时默认屏幕中心）。
   * direction: up=向上滚（内容上移）down=向下滚 left=向左滚 right=向右滚。
   * amount: 滚动量参考值，平台实现自行换算成滚轮刻度。
   */
  scroll(direction: 'up' | 'down' | 'left' | 'right', amount?: number, x?: number, y?: number): Promise<void>

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
