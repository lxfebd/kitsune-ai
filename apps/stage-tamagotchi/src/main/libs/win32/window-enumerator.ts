/**
 * Win32 原生窗口枚举器。
 *
 * 通过 koffi FFI 直接调用 user32.dll 的 EnumWindows，避免 PowerShell 开销。
 * 移植自 Mate-Engine 的 AvatarWindowHandler 窗口枚举逻辑。
 *
 * @see Mate-Engine/Assets/MATE ENGINE - Scripts/APIs/WinApi.cs
 */

import type { Rectangle } from 'electron'

/**
 * 枚举到的原始窗口信息（屏幕坐标，含 DPI 缩放后的物理像素）。
 */
export interface EnumeratedWindow {
  hwnd: number
  title: string
  className: string
  rect: Rectangle
  pid: number
  isVisible: boolean
  isMinimized: boolean
  /** 窗口是否被 Cloak（UWP 隐藏窗口）。 */
  isCloaked: boolean
}

const GA_ROOT = 2
const DWMWA_CLOAKED = 14
const GWL_EXSTYLE = -20

/** 已知的桌面/系统窗口类名，枚举时跳过。 */
const SYSTEM_WINDOW_CLASSES = new Set([
  'Progman',
  'WorkerW',
  'DV2ControlHost',
  'Shell_TrayWnd',
  'Shell_SecondaryTrayWnd',
  'NotifyIconOverflowWindow',
  'MSCTFIME UI',
  'IME',
])

/** 最小窗口尺寸过滤（像素），低于此值的窗口不参与吸附。 */
const MIN_WINDOW_WIDTH = 200
const MIN_WINDOW_HEIGHT = 60

// ========== koffi 模块级懒初始化（只做一次） ==========

interface Win32Functions {
  EnumWindows: (callback: any, lParam: number) => boolean
  IsWindowVisible: (hWnd: number) => boolean
  GetWindowRect: (hWnd: number, rect: number[]) => boolean
  GetWindowTextLengthW: (hWnd: number) => number
  GetWindowTextW: (hWnd: number, buf: Buffer, maxCount: number) => number
  GetClassNameW: (hWnd: number, buf: Buffer, maxCount: number) => number
  GetWindowThreadProcessId: (hWnd: number, pid: number[]) => number
  GetAncestor: (hWnd: number, flags: number) => number
  IsIconic: (hWnd: number) => boolean
  GetWindowLongPtrW: (hWnd: number, index: number) => number
  DwmGetWindowAttribute: (hWnd: number, attr: number, value: number[], size: number) => number
  /** 注册回调。使用 koffi.register(fn, 'CallbackName *') 语法。 */
  registerCallback: (fn: any) => any
  unregisterCallback: (cb: any) => void
}

let fns: Win32Functions | null = null

/**
 * NOTICE: koffi 3.1.0 回调注册方式。
 *
 * koffi 3.1.0 的 register() 不接受字符串原型如 'bool (int64, int64)'，
 * 也不接受 koffi.pointer(proto) 作为第二个参数（会崩溃）。
 * 正确方式是：
 *   1. koffi.proto('bool __stdcall ProtoName(void *hwnd, int64 lParam)') 声明类型
 *   2. koffi.register(fn, 'ProtoName *') 用名称 + 星号注册
 *
 * proto 必须用 __stdcall 调用约定（Windows API 回调要求），
 * 且名称必须唯一（koffi 不允许重复类型名）。
 */
function ensureInit(): Win32Functions {
  if (fns) return fns
  if (process.platform !== 'win32') {
    throw new Error('window-enumerator is Windows only')
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const koffi = require('koffi')

  const user32 = koffi.load('user32.dll')
  const dwmapi = koffi.load('dwmapi.dll')

  // 声明 EnumWindows 回调类型（唯一名称，__stdcall，只做一次）
  koffi.proto('bool __stdcall _Win32EnumWinCb(void *hwnd, int64 lParam)')

  const enumWindows = user32.func('EnumWindows', 'bool', ['void*', 'int64'])
  const isWindowVisible = user32.func('IsWindowVisible', 'bool', ['int64'])
  const getWindowRect = user32.func('GetWindowRect', 'bool', ['int64', 'int64*'])
  const getWindowTextLengthW = user32.func('GetWindowTextLengthW', 'int', ['int64'])
  const getWindowTextW = user32.func('GetWindowTextW', 'int', ['int64', 'uint16*', 'int'])
  const getClassNameW = user32.func('GetClassNameW', 'int', ['int64', 'uint16*', 'int'])
  const getWindowThreadProcessId = user32.func('GetWindowThreadProcessId', 'uint32', ['int64', 'uint32*'])
  const getAncestor = user32.func('GetAncestor', 'int64', ['int64', 'uint'])
  const isIconic = user32.func('IsIconic', 'bool', ['int64'])
  const getWindowLongPtrW = user32.func('GetWindowLongPtrW', 'int64', ['int64', 'int'])
  const dwmGetWindowAttribute = dwmapi.func('DwmGetWindowAttribute', 'int', ['int64', 'int', 'int*', 'int'])

  fns = {
    EnumWindows: (callback, lParam) => enumWindows(callback, lParam),
    IsWindowVisible: hWnd => isWindowVisible(hWnd),
    GetWindowRect: (hWnd, rect) => getWindowRect(hWnd, rect),
    GetWindowTextLengthW: hWnd => getWindowTextLengthW(hWnd),
    GetWindowTextW: (hWnd, buf, maxCount) => getWindowTextW(hWnd, buf, maxCount),
    GetClassNameW: (hWnd, buf, maxCount) => getClassNameW(hWnd, buf, maxCount),
    GetWindowThreadProcessId: (hWnd, pid) => getWindowThreadProcessId(hWnd, pid),
    GetAncestor: (hWnd, flags) => getAncestor(hWnd, flags),
    IsIconic: hWnd => isIconic(hWnd),
    GetWindowLongPtrW: (hWnd, index) => getWindowLongPtrW(hWnd, index),
    DwmGetWindowAttribute: (hWnd, attr, value, size) => dwmGetWindowAttribute(hWnd, attr, value, size),
    // koffi 3.1.0: register(fn, 'ProtoName *') — 用字符串 '名称 *' 注册回调
    registerCallback: fn => koffi.register(fn, '_Win32EnumWinCb *'),
    unregisterCallback: cb => koffi.unregister(cb),
  }

  return fns
}

/**
 * 枚举所有顶层窗口并返回过滤后的列表。
 *
 * 过滤规则（移植自 Mate-Engine AvatarWindowHandler.UpdateCachedWindows）：
 * - 跳过不可见窗口
 * - 跳过被 Cloak 的窗口
 * - 跳过子窗口（GetAncestor != self）
 * - 跳过工具窗口（WS_EX_TOOLWINDOW 且无 WS_EX_APPWINDOW）
 * - 跳过系统桌面窗口（Progman, WorkerW 等）
 * - 跳过尺寸过小的窗口（< 200x60）
 * - 跳过 Electron 自身的窗口（通过 PID 匹配）
 *
 * @param ownPid 当前进程 PID，用于排除自身窗口
 * @returns 过滤后的窗口列表
 */
export function enumerateWindows(ownPid: number = process.pid): EnumeratedWindow[] {
  if (process.platform !== 'win32') return []

  const w = ensureInit()

  const windows: EnumeratedWindow[] = []
  const rectBuf = [0, 0, 0, 0]

  const callback = w.registerCallback((hWnd: number) => {
    // 跳过不可见窗口
    if (!w.IsWindowVisible(hWnd)) return true

    // 跳过被 Cloak 的窗口
    const cloakedBuf = [0]
    const hr = w.DwmGetWindowAttribute(hWnd, DWMWA_CLOAKED, cloakedBuf, 4)
    if (hr === 0 && cloakedBuf[0] !== 0) return true

    // 跳过子窗口
    if (w.GetAncestor(hWnd, GA_ROOT) !== hWnd) return true

    // 跳过工具窗口 (WS_EX_TOOLWINDOW=0x80, WS_EX_APPWINDOW=0x40000)
    const exStyle = Number(w.GetWindowLongPtrW(hWnd, GWL_EXSTYLE))
    if ((exStyle & 0x80) && !(exStyle & 0x40000)) return true

    // 读取类名
    const classBuf = Buffer.alloc(512)
    const classLen = w.GetClassNameW(hWnd, classBuf, 256)
    const className = classLen > 0 ? classBuf.toString('utf16le', 0, classLen * 2).replace(/\0+$/, '') : ''
    if (SYSTEM_WINDOW_CLASSES.has(className)) return true

    // 读取标题
    const titleLen = w.GetWindowTextLengthW(hWnd)
    if (titleLen <= 0) return true
    const titleBuf = Buffer.alloc((titleLen + 1) * 2)
    w.GetWindowTextW(hWnd, titleBuf, titleLen + 1)
    const title = titleBuf.toString('utf16le').replace(/\0+$/, '')
    if (!title) return true

    // 跳过自身进程窗口
    const pidBuf = [0]
    w.GetWindowThreadProcessId(hWnd, pidBuf)
    if (pidBuf[0] === ownPid) return true

    // 获取窗口矩形
    w.GetWindowRect(hWnd, rectBuf)
    const left = rectBuf[0]
    const top = rectBuf[1]
    const right = rectBuf[2]
    const bottom = rectBuf[3]
    const width = right - left
    const height = bottom - top

    // 跳过过小的窗口
    if (width < MIN_WINDOW_WIDTH || height < MIN_WINDOW_HEIGHT) return true

    const isMinimized = w.IsIconic(hWnd)

    windows.push({
      hwnd: hWnd,
      title,
      className,
      rect: { x: left, y: top, width, height },
      pid: pidBuf[0],
      isVisible: true,
      isMinimized,
      isCloaked: false,
    })

    return true
  })

  w.EnumWindows(callback, 0)
  w.unregisterCallback(callback)

  return windows
}
