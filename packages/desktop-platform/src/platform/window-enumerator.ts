/**
 * Win32 原生窗口枚举器。
 *
 * 通过 koffi FFI 直接调用 user32.dll 的 EnumWindows，避免 PowerShell 开销。
 * 移植自 Mate-Engine 的 AvatarWindowHandler 窗口枚举逻辑。
 *
 * @see Mate-Engine/Assets/MATE ENGINE - Scripts/APIs/WinApi.cs
 */

import { createRequire } from 'node:module'

/** 屏幕矩形（本地类型，避免共享包依赖 Electron）。 */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 枚举到的原始窗口信息（屏幕坐标，含 DPI 缩放后的物理像素）。
 */
export interface EnumeratedWindow {
  hwnd: number
  title: string
  className: string
  rect: Rect
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
  GetWindowRect: (hWnd: number, rect: Buffer) => boolean
  GetWindowTextLengthW: (hWnd: number) => number
  GetWindowTextW: (hWnd: number, buf: Buffer, maxCount: number) => number
  GetClassNameW: (hWnd: number, buf: Buffer, maxCount: number) => number
  GetWindowThreadProcessId: (hWnd: number, pid: Buffer) => number
  GetAncestor: (hWnd: number, flags: number) => number
  IsIconic: (hWnd: number) => boolean
  GetWindowLongPtrW: (hWnd: number, index: number) => number
  DwmGetWindowAttribute: (hWnd: number, attr: number, value: Buffer, size: number) => number
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

  // ESM 环境（MCP/tsx）没有全局 require：用 createRequire 显式获得，
  // 兼容 Electron main（CJS）与纯 ESM 进程。
  const req = createRequire(import.meta.url)
  const koffi = req('koffi')


  const user32 = koffi.load('user32.dll')
  const dwmapi = koffi.load('dwmapi.dll')

  // 声明 EnumWindows 回调类型（唯一名称，__stdcall，只做一次）
  koffi.proto('bool __stdcall _Win32EnumWinCb(void *hwnd, int64 lParam)')

  const enumWindows = user32.func('EnumWindows', 'bool', ['void*', 'int64'])
  const isWindowVisible = user32.func('IsWindowVisible', 'bool', ['int64'])
  // NOTE: GetWindowRect 输出参数用 void* + Buffer 直传（共享内存），
  // 不能用 JS 数组——koffi 数组参数不回写，rect 恒为 0 导致所有窗口被当"过小"过滤。
  const getWindowRect = user32.func('GetWindowRect', 'bool', ['int64', 'void*'])
  const getWindowTextLengthW = user32.func('GetWindowTextLengthW', 'int', ['int64'])
  const getWindowTextW = user32.func('GetWindowTextW', 'int', ['int64', 'uint16*', 'int'])
  const getClassNameW = user32.func('GetClassNameW', 'int', ['int64', 'uint16*', 'int'])
  const getWindowThreadProcessId = user32.func('GetWindowThreadProcessId', 'uint32', ['int64', 'void*'])
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
  // 输出参数一律用 Buffer（共享内存）：koffi 的 JS 数组参数不会被 API 写回
  const rectBuf = Buffer.alloc(16)
  const cloakedBuf = Buffer.alloc(4)
  const pidBuf = Buffer.alloc(4)

  const callback = w.registerCallback((hWnd: number) => {
    // 跳过不可见窗口
    if (!w.IsWindowVisible(hWnd)) return true

    // 跳过被 Cloak 的窗口
    cloakedBuf.fill(0)
    const hr = w.DwmGetWindowAttribute(hWnd, DWMWA_CLOAKED, cloakedBuf, 4)
    if (hr === 0 && cloakedBuf.readInt32LE(0) !== 0) return true

    // 跳过子窗口
    // NOTE: koffi 回调的 hWnd 参数是 BigInt，GetAncestor 返回 number，直接 `!==` 恒不相等，
    // 会把所有顶层窗口误判为子窗口（desktop_list_windows 恒返回空）。统一转 number 再比。
    if (Number(w.GetAncestor(hWnd, GA_ROOT)) !== Number(hWnd)) return true

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
    pidBuf.fill(0)
    w.GetWindowThreadProcessId(hWnd, pidBuf)
    if (pidBuf.readUInt32LE(0) === ownPid) return true

    // 获取窗口矩形
    rectBuf.fill(0)
    w.GetWindowRect(hWnd, rectBuf)
    const left = rectBuf.readInt32LE(0)
    const top = rectBuf.readInt32LE(4)
    const right = rectBuf.readInt32LE(8)
    const bottom = rectBuf.readInt32LE(12)
    const width = right - left
    const height = bottom - top

    // 跳过过小的窗口
    if (width < MIN_WINDOW_WIDTH || height < MIN_WINDOW_HEIGHT) return true

    const isMinimized = w.IsIconic(hWnd)

    windows.push({
      hwnd: Number(hWnd),
      title,
      className,
      rect: { x: left, y: top, width, height },
      pid: pidBuf.readUInt32LE(0),
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
