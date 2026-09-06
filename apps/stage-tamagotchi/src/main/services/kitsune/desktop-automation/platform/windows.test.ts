import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WindowsAutomation } from './windows'

const execFileMock = vi.hoisted(() => ({
  execFile: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  execFile: execFileMock.execFile,
}))

describe('WindowsAutomation', () => {
  beforeEach(() => {
    execFileMock.execFile.mockReset()
    execFileMock.execFile.mockImplementation((_file: string, _args: string[], opts: unknown, cb: (err: unknown, res: { stdout: string }) => void) => {
      cb(null, { stdout: '' })
      void opts
    })
  })

  it('escapes single quotes so text cannot break out of the PowerShell string', async () => {
    const automation = new WindowsAutomation()
    await automation.type("'); calc; #")

    expect(execFileMock.execFile).toHaveBeenCalledTimes(1)
    const [, args] = execFileMock.execFile.mock.calls[0] as [string, string[]]
    // execFile args are: ['-NoProfile', '-NonInteractive', '-Command', <cmd>]
    const cmd = args[3]
    // The payload must be wrapped in a single-quoted PowerShell string.
    expect(cmd).toContain(".SendKeys('")
    // The original `'` must be doubled to `''`, so it cannot close the string
    // and then run `; calc; #` as a new statement.
    expect(cmd).toContain("SendKeys('''")
    // No raw `'); ` breakout sequence may survive the escaping.
    expect(cmd).not.toContain("'); ")
    // The payload content is still emitted (escaped), not dropped.
    expect(cmd).toContain('calc')
  })

  it('rejects non-allowlisted SendKeys key names in pressKey', async () => {
    const automation = new WindowsAutomation()
    await expect(automation.pressKey("'; calc; #")).rejects.toThrow()
    await expect(automation.pressKey('ALT+F4')).rejects.toThrow()
    expect(execFileMock.execFile).not.toHaveBeenCalled()
  })

  it('allows allowlisted SendKeys key names in pressKey', async () => {
    const automation = new WindowsAutomation()
    await automation.pressKey('ENTER')
    expect(execFileMock.execFile).toHaveBeenCalledTimes(1)
  })

  it('rejects non-finite cursor coordinates in moveTo', async () => {
    const automation = new WindowsAutomation()
    await expect(automation.moveTo(Number.NaN, 10)).rejects.toThrow()
    await expect(automation.moveTo(10, Number.POSITIVE_INFINITY)).rejects.toThrow()
    expect(execFileMock.execFile).not.toHaveBeenCalled()
  })
})
