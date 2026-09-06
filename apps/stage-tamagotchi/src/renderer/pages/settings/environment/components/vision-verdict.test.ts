import { describe, expect, it } from 'vitest'

import { parseVerification } from './vision-verdict'

describe('parseVerification', () => {
  it('passes on strict PASS prefix', () => {
    const v = parseVerification('PASS: the button is visible')
    expect(v.passed).toBe(true)
    expect(v.unrecognized).toBe(false)
    expect(v.reason).toContain('visible')
  })

  it('passes on PASSED (loose口语)', () => {
    const v = parseVerification('PASSED')
    expect(v.passed).toBe(true)
    expect(v.unrecognized).toBe(false)
  })

  it('accepts optional ✅ emoji prefix', () => {
    const v = parseVerification('✅ PASS the dialog opened')
    expect(v.passed).toBe(true)
    expect(v.unrecognized).toBe(false)
  })

  it('fails on strict FAIL prefix', () => {
    const v = parseVerification('FAIL: modal did not appear')
    expect(v.passed).toBe(false)
    expect(v.unrecognized).toBe(false)
    expect(v.reason).toContain('modal')
  })

  it('fails on FAILED', () => {
    const v = parseVerification('FAILED')
    expect(v.passed).toBe(false)
    expect(v.unrecognized).toBe(false)
  })

  it('accepts ❌ prefix with FAIL', () => {
    const v = parseVerification('❌ FAIL timeout')
    expect(v.passed).toBe(false)
    expect(v.unrecognized).toBe(false)
  })

  it('loose fallback: PASS anywhere → pass', () => {
    const v = parseVerification('The result is PASS: everything looks good')
    expect(v.passed).toBe(true)
    expect(v.unrecognized).toBe(false)
  })

  it('loose fallback: FAIL anywhere → fail', () => {
    const v = parseVerification('The verification FAILED because the text is missing')
    expect(v.passed).toBe(false)
    expect(v.unrecognized).toBe(false)
  })

  it('unrecognized when neither keyword present', () => {
    const v = parseVerification('The screen shows a loading spinner and no error.')
    expect(v.passed).toBe(false)
    expect(v.unrecognized).toBe(true)
    expect(v.reason).toContain('unrecognized')
  })

  // NOTICE: Strict regex matches PASS at the beginning, so it's treated as passed
  it('passes when PASS is at the start even if FAIL also present', () => {
    const v = parseVerification('PASS and FAIL are both mentioned somehow')
    expect(v.passed).toBe(true)
    expect(v.unrecognized).toBe(false)
  })

  it('trims and is case-insensitive', () => {
    const v = parseVerification('   pass: ok   ')
    expect(v.passed).toBe(true)
    expect(v.unrecognized).toBe(false)
  })

  it('returns unrecognized reason capped at 200 chars', () => {
    const long = 'x'.repeat(500)
    const v = parseVerification(long)
    expect(v.unrecognized).toBe(true)
    expect(v.reason.length).toBeLessThanOrEqual(200 + 'unrecognized vision verdict: '.length)
  })
})
