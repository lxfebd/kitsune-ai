import { describe, expect, it } from 'vitest'

import { EmotionMapper } from './emotionMapper'

describe('EmotionMapper', () => {
  it('maps tool names to emotions', () => {
    const mapper = new EmotionMapper()

    expect(mapper.getEmotionFromTool('execute_command')).toBe('thinking')
    expect(mapper.getEmotionFromTool('file_read')).toBe('thinking')
    expect(mapper.getEmotionFromTool('web_fetch')).toBe('alert')
    expect(mapper.getEmotionFromTool('debug_test')).toBe('alert')
    expect(mapper.getEmotionFromTool('git_commit')).toBe('thinking')
    expect(mapper.getEmotionFromTool('deploy_production')).toBe('alert')
  })

  it('returns default emotion for unknown tools', () => {
    const mapper = new EmotionMapper()
    expect(mapper.getEmotionFromTool('unknown_tool_xyz')).toBe('thinking')
  })

  it('returns default emotion for empty input', () => {
    const mapper = new EmotionMapper()
    expect(mapper.getEmotionFromTool('')).toBe('thinking')
    expect(mapper.getEmotionFromTool('  ')).toBe('thinking')
  })

  it('respects priority in tool matching', () => {
    const mapper = new EmotionMapper()
    // 'debug' has priority 6, 'test' has priority 5
    expect(mapper.getEmotionFromTool('debug_test')).toBe('alert')
  })

  it('maps text content to emotions', () => {
    const mapper = new EmotionMapper()

    expect(mapper.getEmotionFromText('太好了，成功了！')).toBe('happy')
    expect(mapper.getEmotionFromText('失败了，抱歉')).toBe('sad')
    expect(mapper.getEmotionFromText('讨厌，气死我了')).toBe('angry')
    expect(mapper.getEmotionFromText('哇，居然成功了')).toBe('surprised')
    expect(mapper.getEmotionFromText('分析一下为什么')).toBe('thinking')
    expect(mapper.getEmotionFromText('注意，危险！')).toBe('alert')
  })

  it('maps English text to emotions', () => {
    const mapper = new EmotionMapper()

    expect(mapper.getEmotionFromText('success! great job!')).toBe('happy')
    expect(mapper.getEmotionFromText('error, failed')).toBe('sad')
    expect(mapper.getEmotionFromText('wow, amazing!')).toBe('surprised')
  })

  it('maps response categories to emotions', () => {
    const mapper = new EmotionMapper()

    expect(mapper.getEmotionFromResponseCategory('success')).toBe('happy')
    expect(mapper.getEmotionFromResponseCategory('error')).toBe('alert')
    expect(mapper.getEmotionFromResponseCategory('running')).toBe('thinking')
    expect(mapper.getEmotionFromResponseCategory('warning')).toBe('alert')
    expect(mapper.getEmotionFromResponseCategory('unknown')).toBe('thinking')
  })

  it('supports adding custom tool emotions', () => {
    const mapper = new EmotionMapper()
    mapper.addToolEmotion({
      pattern: 'custom',
      matchMode: 'exact',
      emotion: 'happy',
      priority: 100,
    })

    expect(mapper.getEmotionFromTool('custom')).toBe('happy')
  })

  it('supports removing tool emotions', () => {
    const mapper = new EmotionMapper()
    mapper.removeToolEmotion('execute')
    // After removal, 'execute_command' should fall through to default
    expect(mapper.getEmotionFromTool('execute_command')).toBe('thinking')
  })

  it('supports changing default emotion', () => {
    const mapper = new EmotionMapper()
    mapper.setDefaultEmotion('happy')
    expect(mapper.getDefaultEmotion()).toBe('happy')
    expect(mapper.getEmotionFromTool('unknown')).toBe('happy')
  })

  it('returns frozen copies from getters', () => {
    const mapper = new EmotionMapper()
    const tools = mapper.getToolEmotions()
    expect(() => { (tools as any).push({}) }).toThrow()

    const texts = mapper.getTextEmotions()
    expect(() => { (texts as any).push({}) }).toThrow()

    const cats = mapper.getCategoryEmotions()
    expect(() => { (cats as any).push({}) }).toThrow()
  })

  it('resets to defaults', () => {
    const mapper = new EmotionMapper()
    mapper.setDefaultEmotion('angry')
    mapper.addToolEmotion({ pattern: 'x', matchMode: 'exact', emotion: 'sad', priority: 999 })

    mapper.reset()
    expect(mapper.getDefaultEmotion()).toBe('thinking')
    expect(mapper.getEmotionFromTool('x')).toBe('thinking')
  })

  it('supports prefix match mode', () => {
    const mapper = new EmotionMapper()
    // 'git' is prefix match
    expect(mapper.getEmotionFromTool('git_push')).toBe('thinking')
    expect(mapper.getEmotionFromTool('git_merge')).toBe('thinking')
  })

  it('supports contains match mode', () => {
    const mapper = new EmotionMapper()
    // 'search' is contains match
    expect(mapper.getEmotionFromTool('code_search')).toBe('thinking')
    expect(mapper.getEmotionFromTool('search_files')).toBe('thinking')
  })
})
