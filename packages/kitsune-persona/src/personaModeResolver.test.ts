import { describe, expect, it } from 'vitest'

import { detectModeFromInput, resolvePersonaMode } from './personaModeResolver'

describe('detectModeFromInput', () => {
  it('detects rational mode in Chinese', () => {
    expect(detectModeFromInput('切换到理性模式')).toBe('rational')
  })

  it('detects rational mode in English', () => {
    expect(detectModeFromInput('switch to rational mode')).toBe('rational')
  })

  it('detects idol mode', () => {
    expect(detectModeFromInput('偶像模式')).toBe('idol')
    expect(detectModeFromInput('idol mode please')).toBe('idol')
  })

  it('detects strict mode', () => {
    expect(detectModeFromInput('严格模式')).toBe('strict')
    expect(detectModeFromInput('strict mode')).toBe('strict')
  })

  it('detects hybrid mode', () => {
    expect(detectModeFromInput('混合模式')).toBe('hybrid')
    expect(detectModeFromInput('hybrid mode')).toBe('hybrid')
  })

  it('returns null for no match', () => {
    expect(detectModeFromInput('hello world')).toBeNull()
    expect(detectModeFromInput('')).toBeNull()
  })

  it('returns null for null/undefined input', () => {
    expect(detectModeFromInput(null as any)).toBeNull()
    expect(detectModeFromInput(undefined as any)).toBeNull()
  })
})

describe('resolvePersonaMode', () => {
  it('uses session state mode when available', () => {
    const result = resolvePersonaMode({
      sessionState: { mode: 'idol' },
    })
    expect(result).toEqual({ mode: 'idol', source: 'session' })
  })

  it('detects mode from input', () => {
    const result = resolvePersonaMode({
      input: '理性模式',
    })
    expect(result).toEqual({ mode: 'rational', source: 'input' })
  })

  it('falls back to config default', () => {
    const result = resolvePersonaMode({
      config: { defaults: { mode: 'strict' } } as any,
    })
    expect(result).toEqual({ mode: 'strict', source: 'default' })
  })

  it('falls back to hybrid when no config', () => {
    const result = resolvePersonaMode({})
    expect(result).toEqual({ mode: 'hybrid', source: 'default' })
  })

  it('session state takes priority over input', () => {
    const result = resolvePersonaMode({
      input: '理性模式',
      sessionState: { mode: 'idol' },
    })
    expect(result).toEqual({ mode: 'idol', source: 'session' })
  })
})
