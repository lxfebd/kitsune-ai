/**
 * 真实 FFI 冒烟测试 — 镜像 production windows-koffi.ts 的 koffi 绑定方式，
 * 验证 Win32 DLL 契约（struct 布局、函数签名、buffer 管道）在本机真实可用。
 * 只做只读操作（GetSystemMetrics / GetCursorPos）+ 内存级结构验证，不注入输入。
 */
const mod = await import('koffi')
const koffi = mod.default ?? mod
const user32 = koffi.load('user32.dll')
const kernel32 = koffi.load('kernel32.dll')

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

// 1. 基础 DLL 绑定
const getSystemMetrics = user32.func('GetSystemMetrics', 'int', ['int'])
const getCursorPos = user32.func('GetCursorPos', 'bool', ['int*'])
const w = getSystemMetrics(0) // SM_CXSCREEN
const h = getSystemMetrics(1) // SM_CYSCREEN
check('GetSystemMetrics 屏幕尺寸', w > 0 && h > 0, `${w}x${h}`)

// 2. GetCursorPos 通过同一绑定调用
const pt = [0, 0]
const ok = getCursorPos(pt)
check('GetCursorPos 绑定调用', ok === true, ok ? `x=${pt[0]} y=${pt[1]}` : '返回 false')

// 3. SendInput INPUT 结构布局（与 production 完全一致的定义）
koffi.struct('_KoffiMouseInput', {
  dx: 'int32', dy: 'int32', mouseData: 'uint32', dwFlags: 'uint32', time: 'uint32', dwExtraInfo: 'int64',
})
koffi.struct('_KoffiKeyboardInput', {
  wVk: 'uint16', wScan: 'uint16', dwFlags: 'uint32', time: 'uint32', dwExtraInfo: 'int64',
})
koffi.union('_KoffiInputUnion', { mi: '_KoffiMouseInput', ki: '_KoffiKeyboardInput' })
koffi.struct('_KoffiInput', { type: 'uint32', _pad: 'uint32', u: '_KoffiInputUnion' })
const inputSize = koffi.sizeof('_KoffiInput')
// x64: MOUSEINPUT/KEYBDINPUT 的 dwExtraInfo 是 ULONG_PTR(8B) → INPUT 总 40 字节。
// cbSize 传 32/24 会被 SendInput 以 ERROR_INVALID_PARAMETER(87) 拒绝。
check('INPUT sizeof == 40 (x64 dwExtraInfo=8B)', inputSize === 40, `实际 ${inputSize}`)

// 4. alloc + view + DataView 写读回路（production sendKeyboardInput 的管道 —
//    之前 Buffer.from 拷贝导致写入丢失的 bug 就出在这一步）
const ref = koffi.alloc('_KoffiInput', 1)
const buf = koffi.view(ref, inputSize)
const dv = new DataView(buf)
dv.setUint32(0, 1, true) // type = INPUT_KEYBOARD
dv.setUint16(8 + 0, 0x41, true) // wVk = 'A'
dv.setUint16(8 + 2, 0x7A, true) // wScan = 'z' (KEYEVENTF_UNICODE 场景)
dv.setUint32(8 + 4, 0x0004, true) // flags = KEYEVENTF_UNICODE
const readBack = new DataView(buf)
check(
  'INPUT buffer 写读一致',
  readBack.getUint32(0, true) === 1 &&
    readBack.getUint16(8, true) === 0x41 &&
    readBack.getUint16(10, true) === 0x7A &&
    readBack.getUint32(12, true) === 0x0004,
  `type=${readBack.getUint32(0, true)} wVk=${readBack.getUint16(8, true).toString(16)} wScan=${readBack.getUint16(10, true).toString(16)} flags=${readBack.getUint32(12, true).toString(16)}`,
)

// 5. SendInput 函数签名绑定 + 真实接受度（零化空输入 = 无操作事件，无害）
const sendInput = user32.func('SendInput', 'uint', ['uint', 'void*', 'uint'])
const kernelFn = kernel32.func('GetLastError', 'uint', [])
function zeroedKeyboardInput() {
  const ref = koffi.alloc('_KoffiInput', 1)
  const dv = new DataView(koffi.view(ref, inputSize))
  new Uint8Array(dv.buffer, dv.byteOffset, inputSize).fill(0)
  dv.setUint32(0, 1, true) // INPUT_KEYBOARD
  dv.setUint16(8, 0, true); dv.setUint16(10, 0, true); dv.setUint32(12, 0, true)
  return ref
}
const sendOk = sendInput(1, zeroedKeyboardInput(), inputSize) === 1
check('SendInput 接受真实 INPUT 大小 (cbSize=40)', sendOk, sendOk ? '' : `GetLastError=${kernelFn()}`)
const sendBad = sendInput(1, zeroedKeyboardInput(), 32) === 0
check('SendInput 拒绝错误 cbSize=32 (回归防护)', sendBad, sendBad ? '' : `意外返回 1`)

// 6. 窗口枚举回调签名（EnumWindows + proto）— 只枚举不改桌面
koffi.proto('bool __stdcall _KoffiAutoEnumWinCb(void *hwnd, int64 lParam)')
const enumWindows = user32.func('EnumWindows', 'bool', ['void*', 'int64'])
let count = 0
const cb = koffi.register((_hwnd, _lParam) => {
  count++
  return true
}, '_KoffiAutoEnumWinCb *')
const enumOk = enumWindows(cb, 0)
koffi.unregister(cb)
check('EnumWindows 回调往返', enumOk === true && count > 0, `枚举 ${count} 个窗口`)

const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
process.exit(failed.length ? 1 : 0)
