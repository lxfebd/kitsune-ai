// Domain: desktop — eventa IPC 契约按域拆分
import { defineInvokeEventa, defineEventa } from '@moeru/eventa'

export interface ElectronDesktopAutomationInvokePayload {
  action: 'click' | 'moveTo' | 'drag' | 'type' | 'pressKey' | 'scroll' | 'screenshot' | 'getCursorPosition' | 'findElement' | 'setOverlayInteractive'
    | 'listWindows' | 'focusWindow' | 'maximizeWindow' | 'minimizeWindow' | 'restoreWindow' | 'closeWindow'
    | 'launchApp'
  params: {
    x?: number
    y?: number
    text?: string
    key?: string
    button?: 'left' | 'right' | 'middle'
    description?: string
    from?: { x: number, y: number }
    to?: { x: number, y: number }
    interactive?: boolean
    title?: string
    processName?: string
    command?: string
    args?: string[]
    direction?: 'up' | 'down' | 'left' | 'right'
    amount?: number
  }
}

export interface ElectronDesktopAutomationResult {
  ok: boolean
  error?: string
  result?: unknown
}

export const electronDesktopAutomationInvoke = defineInvokeEventa<ElectronDesktopAutomationResult, ElectronDesktopAutomationInvokePayload>(
  'eventa:invoke:electron:desktop-automation:invoke',
)

// ========== Desktop Automation 动作广播 ==========

/** 桌面自动化动作执行事件载荷 — 动作开始时广播 start，落定后广播 done/error。 */
export interface DesktopAutomationActionEventPayload {
  action: ElectronDesktopAutomationInvokePayload['action']
  params: ElectronDesktopAutomationInvokePayload['params']
  phase: 'start' | 'done' | 'error'
  result?: ElectronDesktopAutomationResult
}

/** 桌面自动化动作执行前后广播 — 桌宠感知"我在帮你点"、失败时表达懊恼。 */
export const electronDesktopAutomationAction = defineEventa<DesktopAutomationActionEventPayload>(
  'eventa:event:electron:desktop-automation:action',
)

// ========== Desktop Automation Find Element 视觉元素定位 ==========

/** 主进程 → 渲染进程：请求视觉定位 UI 元素 */
export interface FindElementRequestPayload {
  requestId: string
  imageDataUrl: string
  description: string
  /** 可选：限定搜索区域 */
  region?: { x: number, y: number, width: number, height: number }
}

/** 渲染进程 → 主进程：视觉定位结果 */
export interface FindElementResultPayload {
  requestId: string
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

export const electronFindElementRequest = defineEventa<FindElementRequestPayload>('eventa:event:electron:desktop-automation:find-element-request')
export const electronFindElementResult = defineInvokeEventa<FindElementResultPayload, FindElementResultPayload>('eventa:invoke:electron:desktop-automation:find-element-result')

// ========== Window Management 窗口管理 ==========

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

export interface WindowActionPayload {
  title?: string
  processName?: string
}

export interface LaunchAppPayload {
  command: string
  args?: string[]
}

// ========== Window Snap 窗口贴靠 ==========

/** 窗口贴靠状态。 */
export type WindowSnapState = 'idle' | 'snapped' | 'taskbar'

/** 贴靠目标窗口信息。 */
export interface WindowSnapTarget {
  hwnd: number
  title: string
  rect: { x: number, y: number, width: number, height: number }
  isTaskbar: boolean
}

/** 窗口贴靠状态快照。 */
export interface WindowSnapStatus {
  state: WindowSnapState
  target: WindowSnapTarget | null
  snapFraction: number
}

/** 贴靠状态变更事件。 */
export const windowSnapStatusChanged = defineEventa<WindowSnapStatus>('eventa:event:electron:window-snap:status-changed')

/** 获取当前贴靠状态。 */
export const windowSnapGetStatus = defineInvokeEventa<WindowSnapStatus>('eventa:invoke:electron:window-snap:get-status')

/** 尝试在指定屏幕坐标吸附。 */
export const windowSnapTrySnap = defineInvokeEventa<void, { screenX: number, screenY: number }>('eventa:invoke:electron:window-snap:try-snap')

/** 请求解吸。 */
export const windowSnapUnsnap = defineInvokeEventa<void>('eventa:invoke:electron:window-snap:unsnap')

/** 更新吸附比例（拖拽中水平位置）。 */
export const windowSnapSetFraction = defineInvokeEventa<void, { fraction: number }>('eventa:invoke:electron:window-snap:set-fraction')

// ========== Taskbar 任务栏感知 ==========

export type TaskbarPosition = 'bottom' | 'top' | 'left' | 'right'

export interface TaskbarInfoSnapshot {
  position: TaskbarPosition
  rect: { x: number, y: number, width: number, height: number }
  thickness: number
  /** 桌宠窗口是否与任务栏重叠。 */
  isOverlapping: boolean
}

/** 获取当前任务栏信息。 */
export const taskbarGetInfo = defineInvokeEventa<TaskbarInfoSnapshot | null>('eventa:invoke:electron:taskbar:get-info')

// ========== Web Tools 内置网页工具（browser.* / web_search 本地适配器） ==========

/** browser.navigate 入参：抓取 URL 并提取正文文本。 */
