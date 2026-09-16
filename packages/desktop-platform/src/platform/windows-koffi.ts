/**
 * Windows 平台自动化实现（koffi FFI 版）。
 *
 * ── 修复笔记 ──
 * 原实现依赖 PowerShell（Add-Type System.Windows.Forms + WScript.Shell COM 对象），
 * 问题：PowerShell 可能被执行策略限制（Restricted/Signed）、.NET 可能未安装、
 * WScript.Shell 可能被企业安全策略禁用。三个依赖中任何一个不可用，所有桌面自动化操作都失败。
 *
 * 修复方案：用 koffi FFI 直接调用 user32.dll / kernel32.dll 的 Win32 API，
 * 完全不依赖 PowerShell、.NET 或 COM。所有操作都是纯 Win32 API 调用。
 *
 * 参考：window-enumerator.ts 同样的 koffi 模式。
 */

import { spawn } from 'node:child_process'

import { enumerateWindows } from './window-enumerator'
import type { PlatformAutomation, PlatformOptions, WindowInfo } from './index'

// ========== koffi 懒初始化 ==========

interface Win32Automation {
  // 鼠标
  GetCursorPos: (point: Buffer) => boolean
  SetCursorPos: (x: number, y: number) => boolean
  // 输出参数一律 Buffer（共享内存）：koffi 的 JS 数组参数不会被 API 写回
  GetWindowRect: (hWnd: number, rect: Buffer) => boolean
  GetWindowThreadProcessId: (hWnd: number, pid: Buffer) => number
  mouse_event: (flags: number, dx: number, dy: number, data: number, extra: number) => void
  // 键盘（SendInput unicode 路径，布局无关、支持 CJK）
  SendInput: (count: number, inputs: Uint8Array, size: number) => number
  // 窗口
  EnumWindows: (callback: any, lParam: number) => boolean
  IsWindowVisible: (hWnd: number) => boolean
  GetWindowTextLengthW: (hWnd: number) => number
  GetWindowTextW: (hWnd: number, buf: Buffer, maxCount: number) => number
  SetForegroundWindow: (hWnd: number) => boolean
  ShowWindow: (hWnd: number, cmdShow: number) => boolean
  SendMessageW: (hWnd: number, msg: number, wParam: number, lParam: number) => number
  GetSystemMetrics: (index: number) => number
  // 进程
  OpenProcess: (desiredAccess: number, inheritHandle: boolean, pid: number) => number
  CloseHandle: (handle: number) => boolean
  GetModuleBaseNameW: (hProcess: any, hModule: any, name: Buffer, size: number) => number
  // 回调
  registerCallback: (fn: any) => any
  unregisterCallback: (cb: any) => void
  // koffi 反射（构建 SendInput 输入结构）
  sizeof: (type: string) => number
}

let fns: Win32Automation | null = null
let initPromise: Promise<Win32Automation> | null = null

// Win32 常量
const MOUSEEVENTF_LEFTDOWN = 0x0002
const MOUSEEVENTF_LEFTUP = 0x0004
const MOUSEEVENTF_RIGHTDOWN = 0x0008
const MOUSEEVENTF_RIGHTUP = 0x0010
const MOUSEEVENTF_MIDDLEDOWN = 0x0020
const MOUSEEVENTF_MIDDLEUP = 0x0040
const MOUSEEVENTF_WHEEL = 0x0800
const MOUSEEVENTF_HWHEEL = 0x01000
const KEYEVENTF_KEYUP = 0x0002
const KEYEVENTF_UNICODE = 0x0004
const WM_CLOSE = 0x0010
const SW_MAXIMIZE = 3
const SW_MINIMIZE = 6
const SW_RESTORE = 9
const PROCESS_QUERY_INFORMATION = 0x0400
const PROCESS_VM_READ = 0x0010
const SM_CXSCREEN = 0
const SM_CYSCREEN = 1
const INPUT_KEYBOARD = 1
const WHEEL_DELTA = 120

/**
 * 懒加载并绑定 koffi DLL 函数（幂等，带并发去重）。
 * 用动态 import('koffi') 而非 require：vitest 的 vi.mock 拦截 import 而非 require，
 * 使平台实现可以在不触碰真实 DLL 的前提下被测试。
 */
async function ensureInit(): Promise<Win32Automation> {
  if (fns) return fns
  if (initPromise) return initPromise
  if (process.platform !== 'win32') {
    throw new Error('Windows automation is Windows only')
  }

  initPromise = (async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod: any = await import('koffi')
    // CJS 互操作：Node ESM 把 CJS 的 module.exports 包成 { default }，koffi 是 CJS
    const koffi = mod.default ?? mod

    const user32 = koffi.load('user32.dll')
    const kernel32 = koffi.load('kernel32.dll')

    // 鼠标
    const setCursorPos = user32.func('SetCursorPos', 'bool', ['int', 'int'])
    const getCursorPos = user32.func('GetCursorPos', 'bool', ['void*'])
    const mouseEvent = user32.func('mouse_event', 'void', ['uint', 'uint', 'uint', 'uint', 'int'])
    // 键盘 — SendInput：unicode 输入路径（KEYEVENTF_UNICODE）不依赖键盘布局，
    // 中文等任意字符都能输入；虚拟键路径只用于组合键与按键名。
    const sendInput = user32.func('SendInput', 'uint', ['uint', 'void*', 'uint'])
    // 窗口
    const enumWindows = user32.func('EnumWindows', 'bool', ['void*', 'int64'])
    const isWindowVisible = user32.func('IsWindowVisible', 'bool', ['int64'])
    const getWindowRect = user32.func('GetWindowRect', 'bool', ['int64', 'void*'])
    const getWindowTextLengthW = user32.func('GetWindowTextLengthW', 'int', ['int64'])
    const getWindowTextW = user32.func('GetWindowTextW', 'int', ['int64', 'uint16*', 'int'])
    const getWindowThreadProcessId = user32.func('GetWindowThreadProcessId', 'uint32', ['int64', 'void*'])
    const setForegroundWindow = user32.func('SetForegroundWindow', 'bool', ['int64'])
    const showWindow = user32.func('ShowWindow', 'bool', ['int64', 'int'])
    const sendMessageW = user32.func('SendMessageW', 'int64', ['int64', 'uint', 'int64', 'int64'])
    const getSystemMetrics = user32.func('GetSystemMetrics', 'int', ['int'])
    // 进程
    const openProcess = kernel32.func('OpenProcess', 'void*', ['uint', 'int', 'uint'])
    const closeHandle = kernel32.func('CloseHandle', 'bool', ['void*'])
    const psapi = koffi.load('psapi.dll')
    const getModuleBaseNameW = psapi.func('GetModuleBaseNameW', 'uint32', ['void*', 'void*', 'uint16*', 'uint'])
    // 回调
    koffi.proto('bool __stdcall _KoffiAutoEnumWinCb(void *hwnd, int64 lParam)')

    // SendInput 输入结构（koffi 定义，与 Win32 INPUT 内存布局一致）：
    //   INPUT { DWORD type; union { MOUSEINPUT; KEYBDINPUT; } }，对齐到 8 字节。
    // type 偏移 0（4 字节），后 4 字节填充，联合体从偏移 8 开始。
    // ⚠️ x64 下 MOUSEINPUT/KEYBDINPUT 的 dwExtraInfo 是 ULONG_PTR（8 字节），
    // 联合体实为 32 字节、INPUT 总 40 字节。SendInput 的 cbSize 必须传 sizeof 的真值，
    // 否则返回 ERROR_INVALID_PARAMETER (87) 拒绝整批输入（用 24/32 都被实测拒绝）。
    koffi.struct('_KoffiMouseInput', {
      dx: 'int32',
      dy: 'int32',
      mouseData: 'uint32',
      dwFlags: 'uint32',
      time: 'uint32',
      dwExtraInfo: 'int64', // ULONG_PTR：x86 为 4 字节，x64 为 8 字节
    })
    koffi.struct('_KoffiKeyboardInput', {
      wVk: 'uint16',
      wScan: 'uint16',
      dwFlags: 'uint32',
      time: 'uint32',
      dwExtraInfo: 'int64',
    })
    koffi.union('_KoffiInputUnion', {
      mi: '_KoffiMouseInput',
      ki: '_KoffiKeyboardInput',
    })
    koffi.struct('_KoffiInput', {
      type: 'uint32',
      _pad: 'uint32',
      u: '_KoffiInputUnion',
    })

    fns = {
      SetCursorPos: (x, y) => setCursorPos(x, y),
      GetCursorPos: pt => getCursorPos(pt),
      mouse_event: (flags, dx, dy, data, extra) => mouseEvent(flags, dx, dy, data, extra),
      SendInput: (count, inputs, size) => sendInput(count, inputs, size),
      EnumWindows: (callback, lParam) => enumWindows(callback, lParam),
      IsWindowVisible: hWnd => isWindowVisible(hWnd),
      GetWindowRect: (hWnd, rect) => getWindowRect(hWnd, rect),
      GetWindowTextLengthW: hWnd => getWindowTextLengthW(hWnd),
      GetWindowTextW: (hWnd, buf, maxCount) => getWindowTextW(hWnd, buf, maxCount),
      GetWindowThreadProcessId: (hWnd, pid) => getWindowThreadProcessId(hWnd, pid),
      SetForegroundWindow: hWnd => setForegroundWindow(hWnd),
      ShowWindow: (hWnd, cmdShow) => showWindow(hWnd, cmdShow),
      SendMessageW: (hWnd, msg, wParam, lParam) => sendMessageW(hWnd, msg, wParam, lParam),
      GetSystemMetrics: index => getSystemMetrics(index),
      OpenProcess: (desiredAccess, inheritHandle, pid) => openProcess(desiredAccess, inheritHandle ? 1 : 0, pid),
      CloseHandle: handle => closeHandle(handle),
      GetModuleBaseNameW: (hProcess, hModule, name, size) => getModuleBaseNameW(hProcess, hModule, name, size),
      registerCallback: fn => koffi.register(fn, '_KoffiAutoEnumWinCb *'),
      unregisterCallback: cb => koffi.unregister(cb),
      sizeof: type => koffi.sizeof(type),
    }
    return fns
  })()

  try {
    return await initPromise
  }
  catch (error) {
    initPromise = null
    throw error
  }
}

// ========== 虚拟键码映射 ==========

const VK_MAP: Record<string, number> = {
  ENTER: 0x0D, TAB: 0x09, ESC: 0x1B, ESCAPE: 0x1B,
  BACKSPACE: 0x08, BKSP: 0x08, BS: 0x08,
  DELETE: 0x2E, DEL: 0x2E, INSERT: 0x2D, INS: 0x2D,
  HOME: 0x24, END: 0x23, PGUP: 0x21, PGDN: 0x22,
  UP: 0x26, DOWN: 0x28, LEFT: 0x25, RIGHT: 0x27,
  F1: 0x70, F2: 0x71, F3: 0x72, F4: 0x73, F5: 0x74,
  F6: 0x75, F7: 0x76, F8: 0x77, F9: 0x78, F10: 0x79,
  F11: 0x7A, F12: 0x7B, F13: 0x7C, F14: 0x7D, F15: 0x7E,
  F16: 0x7F, F17: 0x80, F18: 0x81, F19: 0x82, F20: 0x83,
  F21: 0x84, F22: 0x85, F23: 0x86, F24: 0x87,
  ADD: 0x6B, SUBTRACT: 0x6D, MULTIPLY: 0x6A, DIVIDE: 0x6F,
  NUMPAD0: 0x60, NUMPAD1: 0x61, NUMPAD2: 0x62, NUMPAD3: 0x63,
  NUMPAD4: 0x64, NUMPAD5: 0x65, NUMPAD6: 0x66, NUMPAD7: 0x67,
  NUMPAD8: 0x68, NUMPAD9: 0x69,
  A: 0x41, B: 0x42, C: 0x43, D: 0x44, E: 0x45, F: 0x46,
  G: 0x47, H: 0x48, I: 0x49, J: 0x4A, K: 0x4B, L: 0x4C,
  M: 0x4D, N: 0x4E, O: 0x4F, P: 0x50, Q: 0x51, R: 0x52,
  S: 0x53, T: 0x54, U: 0x55, V: 0x56, W: 0x57, X: 0x58,
  Y: 0x59, Z: 0x5A,
  SPACE: 0x20,
  // 修饰键
  CONTROL: 0x11, CTRL: 0x11,
  SHIFT: 0x10,
  ALT: 0x12, MENU: 0x12,
  // Windows 键 — 用于打开开始菜单等系统操作
  WIN: 0x5B, LWIN: 0x5B, RWIN: 0x5C,
  // 跨平台键名对齐：macOS/Linux 的 Command 在 Windows 上是 Win 键
  COMMAND: 0x5B, CMD: 0x5B, SUPER: 0x5B,
}

/** 允许的键名（与旧实现一致，防止注入） */
const ALLOWED_KEYS = new Set(Object.keys(VK_MAP))

/**
 * 已初始化后的同步访问器（供 EnumWindows 回调等已确认初始化完成的场景使用）。
 */
function currentWin(): Win32Automation {
  if (!fns) {
    throw new Error('Windows automation not initialized (call ensureInit first)')
  }
  return fns
}

/**
 * 通过 SendInput 注入一个键盘事件（unicode 或虚拟键）。
 * 单条 KEYBDINPUT 结构：{ wVk, wScan, dwFlags, time, dwExtraInfo }，8 字节对齐。
 *
 * ── 修复笔记（2026-09-12，内置 AI desktop_type 触发主进程 V8 崩溃 exit 134）──
 * 旧实现用 koffi.alloc('_KoffiInput') + koffi.view(ref, size) 拿 ArrayBuffer 再包 DataView
 * 手写字节。实测 koffi 3.1.0 的 view() 在 Electron 主进程内会直接 V8 致命崩溃
 * （`view` at src-Ccc3zcz5.js:311，sendKeyboardInput → 栈溢出/段错误），
 * 普通 Node 下同一调用正常 —— Electron 专属的 koffi.view 缺陷。
 * 修复：完全绕开 koffi 内存分配，用 Node 原生 Buffer 构造 INPUT 的 40 字节布局，
 * 经 `void*` 参数直传 SendInput（koffi 的 void* 接受 Buffer/ArrayBuffer，已实测）。
 * Buffer 是平台原生的零拷贝内存，无 V8/koffi 边界包装，不再触发崩溃路径。
 */
function sendKeyboardInput(w: Win32Automation, flags: number, wVk: number = 0, wScan: number = 0): void {
  const inputSize = w.sizeof('_KoffiInput')
  const bytes = Buffer.alloc(inputSize)
  // type=INPUT_KEYBOARD（偏移 0，4 字节；后 4 字节对齐填充）
  bytes.writeUInt32LE(INPUT_KEYBOARD, 0)
  // 联合体从偏移 8 开始，写 KEYBDINPUT 字段（其余字节已由 Buffer.alloc 清零）
  const kiStart = 8
  bytes.writeUInt16LE(wVk, kiStart + 0)
  bytes.writeUInt16LE(wScan, kiStart + 2)
  bytes.writeUInt32LE(flags, kiStart + 4)
  w.SendInput(1, bytes, inputSize)
}

/** 输入一个字符（unicode 路径：KEYEVENTF_UNICODE，布局无关，支持中文等任意字符） */
function sendUnicodeChar(w: Win32Automation, ch: string): void {
  const code = ch.codePointAt(0) ?? 0
  if (code > 0xFFFF) {
    // 代理对（如 emoji）：按 UTF-16 高/低代理项分别发送
    const units = [Math.floor((code - 0x10000) / 0x400) + 0xD800, ((code - 0x10000) % 0x400) + 0xDC00]
    for (const unit of units) {
      sendKeyboardInput(w, KEYEVENTF_UNICODE, 0, unit)
      sendKeyboardInput(w, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, 0, unit)
    }
    return
  }
  sendKeyboardInput(w, KEYEVENTF_UNICODE, 0, code)
  sendKeyboardInput(w, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, 0, code)
}

/** 通过 SendInput 注入一个虚拟键（组合键用），不复原修饰键状态 */
function sendVk(w: Win32Automation, vk: number, up: boolean): void {
  sendKeyboardInput(w, up ? KEYEVENTF_KEYUP : 0, vk, 0)
}

function sendKey(w: Win32Automation, vk: number, shift: boolean): void {
  if (shift)
    sendVk(w, 0x10, false) // VK_SHIFT down
  sendVk(w, vk, false)
  sendVk(w, vk, true)
  if (shift)
    sendVk(w, 0x10, true) // VK_SHIFT up
}

// ========== 实现 ==========

export class WindowsKoffiAutomation implements PlatformAutomation {
  private ownPid: number

  constructor(_options: PlatformOptions = {}) {
    this.ownPid = process.pid
  }

  async moveTo(x: number, y: number): Promise<void> {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new TypeError(`Invalid cursor coordinates: ${x}, ${y}`)
    }
    const w = await ensureInit()
    w.SetCursorPos(Math.trunc(x), Math.trunc(y))
  }

  async click(button: 'left' | 'right' | 'middle' = 'left'): Promise<void> {
    const w = await ensureInit()
    const [down, up] = button === 'left'
      ? [MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP]
      : button === 'right'
        ? [MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP]
        : [MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP]
    w.mouse_event(down, 0, 0, 0, 0)
    w.mouse_event(up, 0, 0, 0, 0)
  }

  async drag(from: { x: number, y: number }, to: { x: number, y: number }): Promise<void> {
    const w = await ensureInit()
    // 真正的拖拽：按下左键 → 移动 → 松开左键。
    // 之前实现是「移动 + 点击 + 移动 + 点击」，等于在两个位置各单击一次，
    // 无法拖动文件/选中文本（拖动文件夹会变成打开它）。
    await this.moveTo(from.x, from.y)
    w.mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
    await this.moveTo(to.x, to.y)
    w.mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
  }

  async type(text: string): Promise<void> {
    const w = await ensureInit()
    // SendInput unicode 路径：逐个字符输入，任意语言（含中文/emoji）均可。
    // 旧实现用 VkKeyScanW 按当前键盘布局映射，中文返回 -1 被静默跳过。
    for (const ch of text) {
      sendUnicodeChar(w, ch)
    }
  }

  async pressKey(key: string): Promise<void> {
    // 先校验，再初始化（避免空键/非法键在出错前触发本机 DLL 加载）
    const parts = key.toUpperCase().split('+').filter(Boolean)
    if (parts.length === 0)
      throw new TypeError(`Empty key: ${key}`)
    for (const part of parts) {
      if (!ALLOWED_KEYS.has(part)) {
        throw new TypeError(`Unsupported key: ${part} (from ${key})`)
      }
    }
    const w = await ensureInit()
    // 支持 `+` 分隔的组合键，如 CTRL+SHIFT+I、Alt+F4。
    if (parts.length === 1) {
      const upper = parts[0]
      const vk = VK_MAP[upper]
      const shift = upper.length === 1 && upper >= 'A' && upper <= 'Z'
      sendKey(w, vk, shift)
      return
    }
    // 组合键：修饰键 + 尾键。常规组合（CTRL+C 等）不注入 SHIFT——
    // 组合键按虚拟键码发送，应用程序按修饰键+主键语义处理，不依赖大小写。
    const modifiers = parts.slice(0, -1)
    const main = parts[parts.length - 1]
    for (const part of modifiers)
      sendVk(w, VK_MAP[part], false)
    sendKey(w, VK_MAP[main], false)
    // 全部释放（反向）
    for (let i = modifiers.length - 1; i >= 0; i--)
      sendVk(w, VK_MAP[modifiers[i]], true)
  }

  async scroll(direction: 'up' | 'down' | 'left' | 'right', amount: number = 100, x?: number, y?: number): Promise<void> {
    const w = await ensureInit()
    if (x !== undefined && y !== undefined)
      await this.moveTo(x, y)
    // 滚轮刻度：每 120 为一步；amount 为像素参考量，换算成步数。
    const steps = Math.max(1, Math.round(Math.abs(amount) / WHEEL_DELTA))
    const delta = steps * WHEEL_DELTA
    // 垂直滚动用 WHEEL，水平滚动用 HWHEEL
    const flag = direction === 'left' || direction === 'right' ? MOUSEEVENTF_HWHEEL : MOUSEEVENTF_WHEEL
    const data = direction === 'down' || direction === 'right' ? -delta : delta
    // 在同一位置发送 N 次滚轮事件；位置固定后内容向指定方向滚动
    for (let i = 0; i < steps; i++)
      w.mouse_event(flag, 0, 0, data, 0)
  }

  async getCursorPosition(): Promise<{ x: number, y: number }> {
    const w = await ensureInit()
    // 输出参数用 Buffer（共享内存）：koffi 的 JS 数组参数不会被 API 写回，且触发 conversion failure
    const ptBuf = Buffer.alloc(8)
    if (!w.GetCursorPos(ptBuf)) {
      throw new Error('GetCursorPos failed')
    }
    return { x: ptBuf.readInt32LE(0), y: ptBuf.readInt32LE(4) }
  }

  async getScreenSize(): Promise<{ width: number, height: number }> {
    const w = await ensureInit()
    return {
      width: w.GetSystemMetrics(SM_CXSCREEN),
      height: w.GetSystemMetrics(SM_CYSCREEN),
    }
  }

  async listWindows(): Promise<WindowInfo[]> {
    const rawWindows = enumerateWindows(this.ownPid)
    const w = await ensureInit()

    return rawWindows.map(rw => {
      let processName = 'unknown'
      const hProcess = w.OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, rw.pid)
      if (hProcess && Number(hProcess) !== 0) {
        try {
          const nameBuf = Buffer.alloc(512)
          const len = w.GetModuleBaseNameW(hProcess, null, nameBuf, 256)
          if (len > 0) {
            processName = nameBuf.toString('utf16le', 0, len * 2).replace(/\0+$/, '')
          }
        } catch { /* 无法获取进程名 */ }
        w.CloseHandle(hProcess)
      }
      return {
        title: rw.title,
        processName,
        pid: rw.pid,
        x: rw.rect.x,
        y: rw.rect.y,
        width: rw.rect.width,
        height: rw.rect.height,
        isVisible: rw.isVisible,
        isMinimized: rw.isMinimized,
        isMaximized: false, // enumerateWindows 不提供此信息
      }
    })
  }

  private async findWindowAndAct(
    title: string | undefined,
    processName: string | undefined,
    action: (hWnd: number) => boolean,
  ): Promise<boolean> {
    const w = await ensureInit()
    let found = false

    const callback = w.registerCallback((hWnd: number) => {
      if (!w.IsWindowVisible(hWnd)) return true

      // 读取标题
      const titleLen = w.GetWindowTextLengthW(hWnd)
      if (titleLen <= 0) return true
      const titleBuf = Buffer.alloc((titleLen + 1) * 2)
      w.GetWindowTextW(hWnd, titleBuf, titleLen + 1)
      const winTitle = titleBuf.toString('utf16le').replace(/\0+$/, '')
      if (!winTitle) return true

      // 标题匹配
      if (title && !winTitle.toLowerCase().includes(title.toLowerCase())) {
        return true
      }

      // 进程名匹配
      if (processName && !title) {
        const pidBuf = Buffer.alloc(4)
        w.GetWindowThreadProcessId(hWnd, pidBuf)
        const hProcess = w.OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pidBuf.readUInt32LE(0))
        if (hProcess && Number(hProcess) !== 0) {
          try {
            const nameBuf = Buffer.alloc(512)
            const len = w.GetModuleBaseNameW(hProcess, null, nameBuf, 256)
            if (len > 0) {
              const name = nameBuf.toString('utf16le', 0, len * 2).replace(/\0+$/, '')
              if (!name.toLowerCase().includes(processName.toLowerCase())) {
                w.CloseHandle(hProcess)
                return true
              }
            }
          } catch { /* 跳过 */ }
          w.CloseHandle(hProcess)
        }
      }

      found = action(hWnd)
      return false // 找到后停止枚举
    })

    w.EnumWindows(callback, 0)
    w.unregisterCallback(callback)

    return found
  }

  async focusWindow(title?: string, processName?: string): Promise<boolean> {
    return this.findWindowAndAct(title, processName, (hWnd) => {
      // 如果窗口最小化，先恢复
      currentWin().ShowWindow(hWnd, SW_RESTORE)
      return currentWin().SetForegroundWindow(hWnd)
    })
  }

  async maximizeWindow(title?: string, processName?: string): Promise<boolean> {
    return this.findWindowAndAct(title, processName, (hWnd) => {
      return currentWin().ShowWindow(hWnd, SW_MAXIMIZE)
    })
  }

  async minimizeWindow(title?: string, processName?: string): Promise<boolean> {
    return this.findWindowAndAct(title, processName, (hWnd) => {
      return currentWin().ShowWindow(hWnd, SW_MINIMIZE)
    })
  }

  async restoreWindow(title?: string, processName?: string): Promise<boolean> {
    return this.findWindowAndAct(title, processName, (hWnd) => {
      return currentWin().ShowWindow(hWnd, SW_RESTORE)
    })
  }

  async closeWindow(title?: string, processName?: string): Promise<boolean> {
    return this.findWindowAndAct(title, processName, (hWnd) => {
      currentWin().SendMessageW(hWnd, WM_CLOSE, 0, 0)
      return true
    })
  }

  async launchApp(command: string, args: string[] = []): Promise<{ pid: number | null, error?: string }> {
    try {
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