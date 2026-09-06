import { describe, expect, it } from 'vitest'

import { extractMemoryFromConversation } from './extractRules'

describe('extractMemoryFromConversation', () => {
  it('should extract preference from user message', () => {
    const entries = extractMemoryFromConversation(
      '我喜欢用 Vue 开发前端',
      '好的，了解了你的偏好。',
    )
    expect(entries.length).toBeGreaterThanOrEqual(1)
    expect(entries.some(e => e.type === 'preference')).toBe(true)
    expect(entries.some(e => e.content.includes('喜欢'))).toBe(true)
  })

  it('should extract fact from user message', () => {
    const entries = extractMemoryFromConversation(
      '我是前端工程师',
      '了解，你是一名前端工程师。',
    )
    expect(entries.length).toBeGreaterThanOrEqual(1)
    expect(entries.some(e => e.type === 'fact')).toBe(true)
  })

  it('should extract event from assistant message', () => {
    const entries = extractMemoryFromConversation(
      '帮我修复这个 bug',
      '已经完成了修复，测试通过。',
    )
    expect(entries.some(e => e.type === 'event')).toBe(true)
    expect(entries.some(e => e.content.includes('完成'))).toBe(true)
  })

  it('should deduplicate overlapping matches', () => {
    const entries = extractMemoryFromConversation(
      '我喜欢 Vue，我喜欢 React，我喜欢 Angular',
      '',
    )
    const contents = entries.map(e => e.content)
    const uniqueContents = new Set(contents)
    expect(contents.length).toBe(uniqueContents.size)
  })

  it('should limit to 5 entries max', () => {
    const entries = extractMemoryFromConversation(
      '我喜欢a。我是b。我做c。完成了d。决定了e。我喜欢f。我是g。',
      '完成了h。决定了i。',
    )
    expect(entries.length).toBeLessThanOrEqual(5)
  })

  it('should return empty for irrelevant conversation', () => {
    const entries = extractMemoryFromConversation(
      '你好',
      '你好，有什么可以帮你的？',
    )
    expect(entries).toEqual([])
  })

  it('should extract from both user and assistant messages', () => {
    const entries = extractMemoryFromConversation(
      '我喜欢用 TypeScript',
      '好的，我是 AI 助手，我打算帮你完成任务。',
    )
    // Should have both preference (from user) and fact (from assistant)
    expect(entries.some(e => e.type === 'preference')).toBe(true)
    expect(entries.some(e => e.type === 'fact')).toBe(true)
  })
})
