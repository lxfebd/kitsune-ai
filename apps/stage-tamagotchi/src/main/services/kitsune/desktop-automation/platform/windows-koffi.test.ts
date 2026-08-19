import { describe, expect, it } from 'vitest'

import { WindowsKoffiAutomation } from './windows-koffi'

describe('WindowsKoffiAutomation', () => {
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