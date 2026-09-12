import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { WindowsKoffiAutomation } from './windows-koffi'

// 仅 Windows 平台才有 koffi FFI 自动化，非 win32 直接跳过，避免 CI(Linux) 上
// ensureInit 抛 "Windows automation is Windows only" 导致误报。
const isWindows = process.platform === 'win32'

// 可注入 koffi 假实现：断言 SendInput 字节布局 / 拖拽语义 / 滚轮事件，
// 不触碰真实 DLL。windows-koffi.ts 的 koffi 绑定是懒加载（ensureInit 内
// require('koffi')），测试用 vi.mock 注入纯 JS 假实现。
//
// INPUT 结构布局（与真实 koffi 计算一致，x64）：
//   INPUT = { type:u32(0), _pad:u32(4), union@8 }；
//   KEYBDINPUT = { wVk:u16(0), wScan:u16(2), dwFlags:u32(4), time:u32(8), dwExtraInfo:u64(12) } → 24 字节；
//   联合体 32 字节；INPUT 总 40 字节。SendInput 的 cbSize 必须为 40，
// 否则真实 API 返回 ERROR_INVALID_PARAMETER(87) 拒绝整批输入（32/24 均被实测拒绝）。
interface FakeCall { kind: string, [k: string]: any }

const koffiState = vi.hoisted(() => {
  const calls: FakeCall[] = []
  const registered: Array<{ name: string, def: Record<string, string> }> = []
  const unions: Array<{ name: string, def: Record<string, string> }> = []
  const INPUT_SIZE = 40
  const structSizes: Record<string, number> = {
    _KoffiInput: 40,
    _KoffiKeyboardInput: 24,
    _KoffiMouseInput: 32,
  }

  const koffi = {
    version: '3.1.0-test',
    load: () => ({
      func: (name: string) => {
        switch (name) {
          case 'SetCursorPos':
            return (x: number, y: number) => { calls.push({ kind: 'setcursorpos', x, y }); return true }
          case 'GetCursorPos':
            return (pt: number[]) => { pt[0] = 100; pt[1] = 200; return true }
          case 'mouse_event':
            return (flags: number, dx: number, dy: number, data: number) => {
              calls.push({ kind: 'mouse_event', flags, dx, dy, data })
            }
          case 'SendInput':
            return (count: number, ref: unknown, size: number) => {
              // 真实 API 要求 cbSize == sizeof(INPUT) == 40；尺寸不对返回 ERROR_INVALID_PARAMETER
              if (size !== INPUT_SIZE || count < 1) return 0
              const view = new DataView((ref as Uint8Array).buffer.slice(0, size))
              let sent = 0
              for (let i = 0; i < count; i++) {
                const off = i * INPUT_SIZE
                const type = view.getUint32(off, true)
                calls.push({ kind: 'sendinput-size', size })
                if (type === 1) {
                  const kiStart = off + 8
                  calls.push({
                    kind: 'sendinput',
                    type,
                    ki: {
                      wVk: view.getUint16(kiStart, true),
                      wScan: view.getUint16(kiStart + 2, true),
                      dwFlags: view.getUint32(kiStart + 4, true),
                    },
                  })
                }
                else {
                  calls.push({ kind: 'sendinput', type, ki: { wVk: 0, wScan: 0, dwFlags: 0 } })
                }
                sent++
              }
              return sent
            }
          default:
            return () => true
        }
      },
    }),
    proto: () => {},
    struct: (name: string, def: Record<string, string>) => { registered.push({ name, def }); return { name, def } },
    union: (name: string, def: Record<string, string>) => { unions.push({ name, def }); return { name, def } },
    register: () => ({ __fake: true }),
    unregister: () => {},
    alloc: (_type: string, _len = 1) => new Uint8Array(INPUT_SIZE),
    view: (ref: Uint8Array, len: number) => {
      // 真实 koffi.view 返回指向同一块内存的 ArrayBuffer；DataView 的写入
      // 必须落在 ref 的底层 buffer 上，SendInput 假实现才能读到。
      void len
      return ref.buffer
    },    sizeof: (type: string) => structSizes[type] ?? 8,
  }

  return { koffi, calls, registered, unions }
})

vi.mock('koffi', () => ({ default: koffiState.koffi }))

interface SendInputCall {
  type: number
  ki: { wVk: number, wScan: number, dwFlags: number }
}
interface MouseEventCall { flags: number, data: number }
interface CursorPosCall { x: number, y: number }

function sendInputs(): SendInputCall[] {
  return koffiState.calls.filter((c): c is SendInputCall & FakeCall => c.kind === 'sendinput')
}
function mouseEvents(): MouseEventCall[] {
  return koffiState.calls.filter((c): c is MouseEventCall & FakeCall => c.kind === 'mouse_event')
}
function cursorMoves(): CursorPosCall[] {
  return koffiState.calls.filter((c): c is CursorPosCall & FakeCall => c.kind === 'setcursorpos')
}
function resetCalls() {
  koffiState.calls.length = 0
}

let Automation: typeof WindowsKoffiAutomation
let fresh: InstanceType<typeof WindowsKoffiAutomation>

beforeAll(async () => {
  // 动态导入：经 vitest 模块图（动态 import 走 mocked module），
  // 与 windows-koffi.ts 内部的 require('koffi') 走同一个 mock。
  const mod = await import('./windows-koffi')
  Automation = mod.WindowsKoffiAutomation
})

describe.runIf(isWindows)('WindowsKoffiAutomation (fake koffi 注入)', () => {
  beforeEach(() => {
    resetCalls()
    fresh = new Automation()
  })

  it('type 走 SendInput unicode 路径（支持中文，不依赖键盘布局）', async () => {
    await fresh.type('你好')

    const inputs = sendInputs()
    // 每个字符 = KEYDOWN + KEYUP 两条输入
    expect(inputs).toHaveLength(4)
    expect(inputs.map(i => i.ki.dwFlags)).toEqual([0x0004, 0x0006, 0x0004, 0x0006]) // UNICODE | UNICODE+KEYUP
    // wScan 携带 UTF-16 码元；unicode 路径不写虚拟键
    expect(inputs[0].ki.wScan).toBe('你'.charCodeAt(0))
    expect(inputs[2].ki.wScan).toBe('好'.charCodeAt(0))
    expect(inputs.every(i => i.ki.wVk === 0)).toBe(true)
  })

  it('emoji（代理对）拆成高低代理项输入', async () => {
    await fresh.type('😀')

    const inputs = sendInputs()
    // 高代理 + 低代理，各 down/up = 4 条
    expect(inputs).toHaveLength(4)
    expect(inputs[0].ki.wScan).toBe(0xD83D)
    expect(inputs[2].ki.wScan).toBe(0xDE00)
  })

  it('pressKey 单键大写字母自动按 shift', async () => {
    await fresh.pressKey('A')

    const inputs = sendInputs()
    // shift down + A down + A up + shift up
    expect(inputs).toHaveLength(4)
    expect(inputs.map(i => i.ki.wVk)).toEqual([0x10, 0x41, 0x41, 0x10])
    expect(inputs.map(i => i.ki.dwFlags)).toEqual([0, 0, 2, 2])
  })

  it('pressKey 组合键：修饰键按下 → 主键 → 反向释放', async () => {
    await fresh.pressKey('CTRL+C')

    const inputs = sendInputs()
    expect(inputs).toHaveLength(4)
    expect(inputs.map(i => i.ki.wVk)).toEqual([0x11, 0x43, 0x43, 0x11])
    expect(inputs[3].ki.dwFlags).toBe(2) // ctrl up
  })

  it('组合键主键在发送前预校验（不触碰 OS）', async () => {
    resetCalls()
    // 非法键在初始化之前就被拒绝，不会触发任何 SendInput
    await expect(fresh.pressKey('CTRL+NOT_A_KEY')).rejects.toThrow(TypeError)
    expect(koffiState.calls.length).toBe(0)
  })

  it('drag 是真正的按下-移动-松开（不是两次点击）', async () => {
    await fresh.drag({ x: 10, y: 10 }, { x: 200, y: 300 })

    expect(cursorMoves().map(c => [c.x, c.y])).toEqual([[10, 10], [200, 300]])
    const mouse = mouseEvents()
    expect(mouse).toHaveLength(2)
    expect(mouse[0].flags).toBe(0x0002) // LEFTDOWN
    expect(mouse[1].flags).toBe(0x0004) // LEFTUP
  })

  it('scroll 使用滚轮事件而不是 PowerShell', async () => {
    await fresh.scroll('down', 240, 50, 60)

    expect(cursorMoves().map(c => [c.x, c.y])).toEqual([[50, 60]])
    const mouse = mouseEvents()
    expect(mouse.length).toBeGreaterThan(0)
    expect(mouse.every(m => m.flags === 0x0800)).toBe(true) // WHEEL
    expect(mouse.every(m => m.data < 0)).toBe(true) // 下滚 delta 为负
  })

  it('scroll 向上为正 delta，横向滚动用 HWHEEL', async () => {
    await fresh.scroll('up', 120)
    expect(mouseEvents()[0].data).toBe(120)

    resetCalls()
    await fresh.scroll('right', 120)
    expect(mouseEvents()[0].flags).toBe(0x01000) // HWHEEL
    expect(mouseEvents()[0].data).toBe(-120)
  })

  it('koffi 初始化注册 SendInput 输入结构', async () => {
    // 触发 ensureInit（首次真实操作时注册结构）
    await fresh.pressKey('A')

    const names = koffiState.registered.map(r => r.name)
    expect(names).toContain('_KoffiInput')
    expect(names).toContain('_KoffiKeyboardInput')
    expect(names).toContain('_KoffiMouseInput')
    expect(koffiState.unions.map(u => u.name)).toContain('_KoffiInputUnion')

    const inputDef = koffiState.registered.find(r => r.name === '_KoffiInput')!.def
    // type 在偏移 0，联合体在偏移 8（4 字节 type + 4 字节对齐）
    expect(inputDef.type).toBe('uint32')
    expect(inputDef.u).toBe('_KoffiInputUnion')

    const kiDef = koffiState.registered.find(r => r.name === '_KoffiKeyboardInput')!.def
    // 真实 x64 KEYBDINPUT 含 8 字节 dwExtraInfo（ULONG_PTR）；缺它 SendInput 拒绝输入
    expect(kiDef.dwExtraInfo).toBe('int64')
  })

  it('SendInput 收到的 cbSize 是真实 INPUT 大小（40，非 24/32）', async () => {
    await fresh.type('a')
    const sizes = koffiState.calls.filter((c): c is { kind: 'sendinput-size', size: number } & FakeCall => c.kind === 'sendinput-size').map(c => c.size)
    expect(sizes.length).toBeGreaterThan(0)
    expect(sizes.every(s => s === 40)).toBe(true)
  })

  it('暴露 scroll 平台能力', async () => {
    expect(typeof fresh.scroll).toBe('function')
  })
})

describe.runIf(isWindows)('WindowsKoffiAutomation (真实错误路径，不触碰 OS)', () => {
  beforeEach(() => {
    fresh = new Automation()
  })

  it('rejects non-finite cursor coordinates in moveTo', async () => {
    await expect(fresh.moveTo(NaN, 100)).rejects.toThrow(TypeError)
    await expect(fresh.moveTo(100, Infinity)).rejects.toThrow(TypeError)
  })

  it('rejects empty key in pressKey', async () => {
    await expect(fresh.pressKey('')).rejects.toThrow(TypeError)
  })

  it('rejects unsupported keys without touching the OS', async () => {
    await expect(fresh.pressKey('THIS_IS_NOT_A_KEY')).rejects.toThrow(TypeError)
  })
})
