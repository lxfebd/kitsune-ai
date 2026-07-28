import { describe, expect, it } from 'vitest'

import { adjustPersonaMode } from './personaAdjuster'

describe('adjustPersonaMode', () => {
  it('keyword detection takes priority', () => {
    const result = adjustPersonaMode({
      input: '切换到理性模式',
      currentMode: 'idol',
      memoryHints: [],
    })
    expect(result.mode).toBe('rational')
    expect(result.source).toBe('keyword')
  })

  it('technical words trigger rational mode', () => {
    const result = adjustPersonaMode({
      input: '帮我 debug 这个 error',
      currentMode: 'hybrid',
      memoryHints: [],
    })
    expect(result.mode).toBe('rational')
    expect(result.source).toBe('semantic')
  })

  it('creative words trigger idol mode', () => {
    const result = adjustPersonaMode({
      input: '帮我写首诗',
      currentMode: 'hybrid',
      memoryHints: [],
    })
    expect(result.mode).toBe('idol')
    expect(result.source).toBe('semantic')
  })

  it('strict words trigger strict mode', () => {
    const result = adjustPersonaMode({
      input: '必须严格按照规范，不要输出多余内容',
      currentMode: 'hybrid',
      memoryHints: [],
    })
    expect(result.mode).toBe('strict')
    expect(result.source).toBe('semantic')
  })

  it('memory preference overrides current mode', () => {
    const result = adjustPersonaMode({
      input: '今天天气怎么样',
      currentMode: 'rational',
      memoryHints: ['- Persona preference: preferred mode=idol; signal=以后都这样回复'],
    })
    expect(result.mode).toBe('idol')
    expect(result.source).toBe('memory')
  })

  it('keeps current mode when no match', () => {
    const result = adjustPersonaMode({
      input: '你好',
      currentMode: 'hybrid',
      memoryHints: [],
    })
    expect(result.mode).toBe('hybrid')
    expect(result.source).toBe('default')
  })

  it('keyword takes priority over memory', () => {
    const result = adjustPersonaMode({
      input: '切换到严格模式',
      currentMode: 'hybrid',
      memoryHints: ['- Persona preference: preferred mode=idol; signal=xxx'],
    })
    expect(result.mode).toBe('strict')
    expect(result.source).toBe('keyword')
  })

  it('handles empty input', () => {
    const result = adjustPersonaMode({
      input: '',
      currentMode: 'rational',
      memoryHints: [],
    })
    expect(result.mode).toBe('rational')
    expect(result.source).toBe('default')
  })
})