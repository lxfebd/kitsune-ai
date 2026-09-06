import { describe, expect, it } from 'vitest'

import { WindowsKoffiAutomation } from './windows-koffi'

// 仅 Windows 平台才有 koffi FFI 自动化，非 win32 直接跳过，避免 CI(Linux) 上
// ensureInit 抛 "Windows automation is Windows only" 导致误报。
const isWindows = process.platform === 'win32'

describe.runIf(isWindows)('WindowsKoffiAutomation', () => {
  it('rejects non-finite cursor coordinates in moveTo', async () => {
    const automation = new WindowsKoffiAutomation()
    await expect(automation.moveTo(NaN, 100)).rejects.toThrow(TypeError)
    await expect(automation.moveTo(100, Infinity)).rejects.toThrow(TypeError)
  })

  it('rejects empty key in pressKey', async () => {
    const automation = new WindowsKoffiAutomation()
    await expect(automation.pressKey('')).rejects.toThrow(TypeError)
  })
})