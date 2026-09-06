import { describe, expect, it } from 'vitest'

import { SafetyError, assertSafe, isSensitiveAction, safetyCheck } from './safety'

describe('safetyCheck', () => {
  it('allows whitelisted actions', () => {
    expect(safetyCheck('click', '').allowed).toBe(true)
    expect(safetyCheck('type', 'hello').allowed).toBe(true)
    expect(safetyCheck('screenshot', '').allowed).toBe(true)
  })

  it('rejects actions not in the whitelist', () => {
    const r = safetyCheck('launchRocket', '')
    expect(r.allowed).toBe(false)
    expect(r.reason).toContain('不在白名单')
  })

  it('blocks sensitive keys passed as semantic detail', () => {
    const r = safetyCheck('pressKey', 'ALT+F4')
    expect(r.allowed).toBe(false)
    expect(r.reason).toContain('敏感')
  })

  it('does NOT block non-sensitive keys', () => {
    expect(safetyCheck('pressKey', 'A').allowed).toBe(true)
    expect(safetyCheck('pressKey', 'ENTER').allowed).toBe(true)
  })

  it('is case-insensitive on sensitive keys', () => {
    expect(safetyCheck('pressKey', 'alt+f4').allowed).toBe(false)
    expect(safetyCheck('pressKey', 'Ctrl+Esc').allowed).toBe(false)
  })

  it('only applies sensitive check to pressKey action', () => {
    // 非 pressKey 动作即使 detail 含敏感词也不拦截
    expect(safetyCheck('type', 'ALT+F4').allowed).toBe(true)
  })

  it('honors custom allowedActions override', () => {
    expect(safetyCheck('click', '', { allowedActions: ['type'] }).allowed).toBe(false)
    expect(safetyCheck('type', '', { allowedActions: ['type'] }).allowed).toBe(true)
  })
})

describe('assertSafe', () => {
  it('throws SafetyError when blocked', () => {
    expect(() => assertSafe('pressKey', 'ALT+F4')).toThrow(SafetyError)
  })

  it('does not throw when allowed', () => {
    expect(() => assertSafe('click', '')).not.toThrow()
  })
})

describe('isSensitiveAction', () => {
  it('true only for pressKey + sensitive key', () => {
    expect(isSensitiveAction('pressKey', 'ALT+F4')).toBe(true)
    expect(isSensitiveAction('pressKey', 'A')).toBe(false)
    expect(isSensitiveAction('type', 'ALT+F4')).toBe(false)
  })
})
