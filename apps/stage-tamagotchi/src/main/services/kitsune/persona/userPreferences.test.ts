import { describe, expect, it } from 'vitest'

import { extractPreferences } from './userPreferences'

describe('extractPreferences', () => {
  it('extracts style preference from a remember-style request', () => {
    const prefs = extractPreferences('记住我以后都这么回复，简洁一点', '好的，以后都用简短风格回复你。')
    const stylePref = prefs.find(p => p.category === 'style')
    expect(stylePref).toBeTruthy()
    expect(stylePref!.content).toMatch(/(记住|以后|这样)/)
  })

  it('extracts code indent preference (tab/space)', () => {
    const prefs = extractPreferences('我习惯用空格缩进', '好的，用 2 空格缩进。')
    const indent = prefs.find(p => p.category === 'code_indent')
    expect(indent).toBeTruthy()
    expect(indent!.content).toContain('空格')
  })

  it('extracts code naming preference (camelCase/snake_case)', () => {
    const prefs = extractPreferences('我偏好 camelCase 命名', '收到，变量用 camelCase。')
    const naming = prefs.find(p => p.category === 'code_naming')
    expect(naming).toBeTruthy()
    expect(naming!.content).toContain('camelCase')
  })

  it('deduplicates by category keeping the first match', () => {
    // 同一句同时命中两条 style 规则的变体：只保留第一条
    const prefs = extractPreferences('以后都这样回复，记住这个风格', '好的。')
    const stylePrefs = prefs.filter(p => p.category === 'style')
    expect(stylePrefs).toHaveLength(1)
  })

  it('returns empty when no pattern matches', () => {
    const prefs = extractPreferences('今天天气如何', '多云转晴。')
    expect(prefs).toHaveLength(0)
  })

  it('matches english "from now on" style patterns', () => {
    const prefs = extractPreferences('from now on use concise replies', 'Got it.')
    const style = prefs.find(p => p.category === 'style')
    expect(style).toBeTruthy()
  })

  it('scans both user and assistant messages', () => {
    // 偏好藏在 assistant 消息里也要命中
    const prefs = extractPreferences('随便聊聊', '以后我用详细一点的方式回复你。')
    const length = prefs.find(p => p.category === 'response_length')
    expect(length).toBeTruthy()
  })
})