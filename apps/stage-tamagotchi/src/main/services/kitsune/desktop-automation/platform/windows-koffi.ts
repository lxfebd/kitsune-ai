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

import { enumerateWindows } from '../../../../libs/win32/window-enumerator'
import type { PlatformAutomation, PlatformOptions, WindowInfo } from './index'

// ========== koffi 懒初始化 ==========

interface Win32Automation {
  // 鼠标
  SetCursorPos: (x: number, y: number) => boolean
  GetCursorPos: (point: number[]) => boolean
  mouse_event: (flags: number, dx: number, dy: number, data: number, extra: number) => void
  // 键盘
  keybd_event: (vk: number, scan: number, flags: number, extra: number) => void
  VkKeyScanW: (ch: number) => number
  // 窗口
  EnumWindows: (callback: any, lParam: number) => boolean
  IsWindowVisible: (hWnd: number) => boolean
  GetWindowRect: (hWnd: number, rect: number[]) => boolean
  GetWindowTextLengthW: (hWnd: number) => number
  GetWindowTextW: (hWnd: number, buf: Buffer, maxCount: number) => number
  GetWindowThreadProcessId: (hWnd: number, pid: number[]) => number
  SetForegroundWindow: (hWnd: number) => boolean
  ShowWindow: (hWnd: number, cmdShow: number) => boolean
  SendMessageW: (hWnd: number, msg: number, wParam: number, lParam: number) => number
  GetSystemMetrics: (index: number) => number
  // 进程
  OpenProcess: (desiredAccess: number, inheritHandle: boolean, pid: number) => number
  CloseHandle: (handle: number) => boolean
  // 回调
  registerCallback: (fn: any) => any
  unregisterCallback: (cb: any) => void
}

let fns: Win32Automation | null = null

// Win32 常量
const MOUSEEVENTF_LEFTDOWN = 0x0002
const MOUSEEVENTF_LEFTUP = 0x0004
const MOUSEEVENTF_RIGHTDOWN = 0x0008
const MOUSEEVENTF_RIGHTUP = 0x0010
const MOUSEEVENTF_MIDDLEDOWN = 0x0020
const MOUSEEVENTF_MIDDLEUP = 0x0040
const KEYEVENTF_KEYUP = 0x0002
const WM_CLOSE = 0x0010
const SW_MAXIMIZE = 3
const SW_MINIMIZE = 6
const SW_RESTORE = 9
const PROCESS_QUERY_INFORMATION = 0x0400
const PROCESS_VM_READ = 0x0010
const SM_CXSCREEN = 0
const SM_CYSCREEN = 1

function ensureInit(): Win32Automation {
  if (fns) return fns
  if (process.platform !== 'win32') {
    throw new Error('Windows automation is Windows only')
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const koffi = require('koffi')

  const user32 = koffi.load('user32.dll')
  const kernel32 = koffi.load('kernel32.dll')

  // 鼠标
  const setCursorPos = user32.func('SetCursorPos', 'bool', ['int', 'int'])
  const getCursorPos = user32.func('GetCursorPos', 'bool', ['int*'])
  const mouseEvent = user32.func('mouse_event', 'void', ['uint', 'uint', 'uint', 'uint', 'int'])
  // 键盘
  const keybdEvent = user32.func('keybd_event', 'void', ['byte', 'byte', 'uint', 'uint'])
  const vkKeyScanW = user32.func('VkKeyScanW', 'int16', ['uint16'])
  // 窗口
  const enumWindows = user32.func('EnumWindows', 'bool', ['void*', 'int64'])
  const isWindowVisible = user32.func('IsWindowVisible', 'bool', ['int64'])
  const getWindowRect = user32.func('GetWindowRect', 'bool', ['int64', 'int64*'])
  const getWindowTextLengthW = user32.func('GetWindowTextLengthW', 'int', ['int64'])
  const getWindowTextW = user32.func('GetWindowTextW', 'int', ['int64', 'uint16*', 'int'])
  const getWindowThreadProcessId = user32.func('GetWindowThreadProcessId', 'uint32', ['int64', 'uint32*'])
  const setForegroundWindow = user32.func('SetForegroundWindow', 'bool', ['int64'])
  const showWindow = user32.func('ShowWindow', 'bool', ['int64', 'int'])
  const sendMessageW = user32.func('SendMessageW', 'int64', ['int64', 'uint', 'int64', 'int64'])
  const getSystemMetrics = user32.func('GetSystemMetrics', 'int', ['int'])
  // 进程
  const openProcess = kernel32.func('OpenProcess', 'void*', ['uint', 'int', 'uint'])
  const closeHandle = kernel32.func('CloseHandle', 'bool', ['void*'])
  // 回调
  koffi.proto('bool __stdcall _KoffiAutoEnumWinCb(void *hwnd, int64 lParam)')

  fns = {
    SetCursorPos: (x, y) => setCursorPos(x, y),
    GetCursorPos: pt => getCursorPos(pt),
    mouse_event: (flags, dx, dy, data, extra) => mouseEvent(flags, dx, dy, data, extra),
    keybd_event: (vk, scan, flags, extra) => keybdEvent(vk, scan, flags, extra),
    VkKeyScanW: ch => vkKeyScanW(ch),
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
        registerCallback: fn => koffi.register(fn, '_KoffiAutoEnumWinCb *'),
    unregisterCallback: cb => koffi.unregister(cb),
  }

  return fns
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
}

/** 允许的键名（与旧实现一致，防止注入） */
const ALLOWED_KEYS = new Set(Object.keys(VK_MAP))

function sendKey(vk: number, shift: boolean): void {
  const w = ensureInit()
  if (shift) {
    w.keybd_event(0x10, 0, 0, 0) // VK_SHIFT down
  }
  w.keybd_event(vk, 0, 0, 0) // key down
  w.keybd_event(vk, 0, KEYEVENTF_KEYUP, 0) // key up
  if (shift) {
    w.keybd_event(0x10, 0, KEYEVENTF_KEYUP, 0) // VK_SHIFT up
  }
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
    ensureInit().SetCursorPos(Math.trunc(x), Math.trunc(y))
  }

  async click(button: 'left' | 'right' | 'middle' = 'left'): Promise<void> {
    const w = ensureInit()
    const [down, up] = button === 'left'
      ? [MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP]
      : button === 'right'
        ? [MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP]
        : [MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP]
    w.mouse_event(down, 0, 0, 0, 0)
    w.mouse_event(up, 0, 0, 0, 0)
  }

  async drag(from: { x: number, y: number }, to: { x: number, y: number }): Promise<void> {
    await this.moveTo(from.x, from.y)
    await this.click('left')
    await this.moveTo(to.x, to.y)
    await this.click('left')
  }

  async type(text: string): Promise<void> {
    const w = ensureInit()
    for (const ch of text) {
      // 对于 ASCII 可打印字符，用 VkKeyScanW 获取虚拟键码
      const code = ch.charCodeAt(0)
      const scan = w.VkKeyScanW(code)
      if (scan === -1) {
        // 无法映射的字符（如 CJK），跳过
        continue
      }
      const vk = scan & 0xFF
      const shift = (scan & 0x100) !== 0
      sendKey(vk, shift)
    }
  }

  async pressKey(key: string): Promise<void> {
    const w = ensureInit()
    // 支持 `+` 分隔的组合键，如 CONTROL+SHIFT+I
    const parts = key.toUpperCase().split('+').filter(Boolean)
    if (parts.length === 0)
      throw new TypeError(`Empty key: ${key}`)
    // 单键：直接发送
    if (parts.length === 1) {
      const upper = parts[0]
      if (!ALLOWED_KEYS.has(upper)) {
        throw new TypeError(`Unsupported key: ${key}`)
      }
      const vk = VK_MAP[upper]
      const shift = upper.length === 1 && upper >= 'A' && upper <= 'Z'
      sendKey(vk, shift)
      return
    }
    // 组合键：按顺序按下所有键，再反向释放
    const vks: number[] = []
    for (const part of parts) {
      if (!ALLOWED_KEYS.has(part)) {
        throw new TypeError(`Unsupported key in combo: ${part} (from ${key})`)
      }
      vks.push(VK_MAP[part])
    }
    // 全部按下
    for (const vk of vks)
      w.keybd_event(vk, 0, 0, 0)
    // 全部释放（反向）
    for (let i = vks.length - 1; i >= 0; i--)
      w.keybd_event(vks[i], 0, KEYEVENTF_KEYUP, 0)
  }

  async getCursorPosition(): Promise<{ x: number, y: number }> {
    const w = ensureInit()
    const pt = [0, 0]
    if (!w.GetCursorPos(pt)) {
      throw new Error('GetCursorPos failed')
    }
    return { x: pt[0], y: pt[1] }
  }

  async getScreenSize(): Promise<{ width: number, height: number }> {
    const w = ensureInit()
    return {
      width: w.GetSystemMetrics(SM_CXSCREEN),
      height: w.GetSystemMetrics(SM_CYSCREEN),
    }
  }

  async listWindows(): Promise<WindowInfo[]> {
    const rawWindows = enumerateWindows(this.ownPid)
    // ensureInit() 会懒加载并缓存 koffi DLL 绑定，需保持调用（副作用：初始化 FFI 环境）
    ensureInit()
    const kernel32 = (() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const koffi = require('koffi')
      return koffi.load('kernel32.dll')
    })()

    // 预加载 GetModuleBaseNameW 和 OpenProcess 用于获取进程名
    const openProcess = kernel32.func('OpenProcess', 'void*', ['uint', 'int', 'uint'])
    const closeHandle = kernel32.func('CloseHandle', 'bool', ['void*'])

    return rawWindows.map(rw => {
      let processName = 'unknown'
      const hProcess = openProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, 0, rw.pid)
      if (hProcess && Number(hProcess) !== 0) {
        try {
          // 通过 psapi.GetModuleBaseNameW 获取进程名
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const koffi2 = require('koffi')
          const psapi = koffi2.load('psapi.dll')
          const getModuleBaseNameW = psapi.func('GetModuleBaseNameW', 'uint32', ['void*', 'void*', 'uint16*', 'uint'])
          const nameBuf = Buffer.alloc(512)
          const len = getModuleBaseNameW(hProcess, null, nameBuf, 256)
          if (len > 0) {
            processName = nameBuf.toString('utf16le', 0, len * 2).replace(/\0+$/, '')
          }
        } catch { /* 无法获取进程名 */ }
        closeHandle(hProcess)
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
    const w = ensureInit()
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
        const pidBuf = [0]
        w.GetWindowThreadProcessId(hWnd, pidBuf)
        // 获取进程名
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const koffi = require('koffi')
        const kernel32 = koffi.load('kernel32.dll')
        const openProcess = kernel32.func('OpenProcess', 'void*', ['uint', 'int', 'uint'])
        const closeHandle = kernel32.func('CloseHandle', 'bool', ['void*'])
        const hProcess = openProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, 0, pidBuf[0])
        if (hProcess && Number(hProcess) !== 0) {
          try {
            const psapi = koffi.load('psapi.dll')
            const getModuleBaseNameW = psapi.func('GetModuleBaseNameW', 'uint32', ['void*', 'void*', 'uint16*', 'uint'])
            const nameBuf = Buffer.alloc(512)
            const len = getModuleBaseNameW(hProcess, null, nameBuf, 256)
            if (len > 0) {
              const name = nameBuf.toString('utf16le', 0, len * 2).replace(/\0+$/, '')
              if (!name.toLowerCase().includes(processName.toLowerCase())) {
                closeHandle(hProcess)
                return true
              }
            }
          } catch { /* 跳过 */ }
          closeHandle(hProcess)
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
      const w = ensureInit()
      // 如果窗口最小化，先恢复
      w.ShowWindow(hWnd, SW_RESTORE)
      return w.SetForegroundWindow(hWnd)
    })
  }

  async maximizeWindow(title?: string, processName?: string): Promise<boolean> {
    return this.findWindowAndAct(title, processName, (hWnd) => {
      return ensureInit().ShowWindow(hWnd, SW_MAXIMIZE)
    })
  }

  async minimizeWindow(title?: string, processName?: string): Promise<boolean> {
    return this.findWindowAndAct(title, processName, (hWnd) => {
      return ensureInit().ShowWindow(hWnd, SW_MINIMIZE)
    })
  }

  async restoreWindow(title?: string, processName?: string): Promise<boolean> {
    return this.findWindowAndAct(title, processName, (hWnd) => {
      return ensureInit().ShowWindow(hWnd, SW_RESTORE)
    })
  }

  async closeWindow(title?: string, processName?: string): Promise<boolean> {
    return this.findWindowAndAct(title, processName, (hWnd) => {
      ensureInit().SendMessageW(hWnd, WM_CLOSE, 0, 0)
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