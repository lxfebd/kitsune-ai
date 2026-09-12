/**
 * 内置规则库测试 — 正/负样本、source 限定、多规则命中确定性。
 */
import { describe, expect, it } from 'vitest'

import { BUILT_IN_GUIDANCE_RULES, localize, matchRule } from './builtInRules'

describe('builtInRules', () => {
  it('规则 id 唯一且按字典序排列（多规则命中取第一条确定性）', () => {
    const ids = BUILT_IN_GUIDANCE_RULES.map(r => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort()).toEqual(ids)
  })

  it('zcode-edit-not-read：命中「File has not been read yet」', () => {
    const rule = matchRule('File has not been read yet. Please read the file first.', 'Edit', 'zcode')
    expect(rule?.id).toBe('zcode-edit-not-read')
  })

  it('zcode-edit-not-read：source 限定 — 非 zcode 来源不命中', () => {
    const rule = matchRule('File has not been read yet.', 'Edit', 'cursor')
    expect(rule).toBeNull()
  })

  it('zcode-edit-mismatch：命中 old_string 未匹配信息', () => {
    const rule = matchRule('The old_string to replace is not found in the file', 'Edit', 'zcode')
    expect(rule?.id).toBe('zcode-edit-mismatch')
  })

  it('read-not-found：命中 ENOENT / no such file', () => {
    expect(matchRule('ENOENT: no such file or directory, open src/a.ts', 'Read')?.id).toBe('read-not-found')
    expect(matchRule('Cannot find module', 'Bash')?.id).toBe('read-not-found')
  })

  it('network-failure：命中 timeout / ETIMEDOUT', () => {
    expect(matchRule('Request timed out after 30000ms', 'WebFetch')?.id).toBe('network-failure')
    expect(matchRule('ETIMEDOUT connect', 'WebFetch')?.id).toBe('network-failure')
  })

  it('model-json-corrupt：命中 Invalid JSON', () => {
    expect(matchRule('Invalid JSON response from model', 'Bash')?.id).toBe('model-json-corrupt')
    expect(matchRule('Unexpected token < in JSON', 'Bash')?.id).toBe('model-json-corrupt')
  })

  it('mcp-connection：命中 MCP 连接关闭', () => {
    expect(matchRule('MCP connection closed unexpectedly', 'CallTool')?.id).toBe('mcp-connection')
    expect(matchRule('transport closed', 'CallTool')?.id).toBe('mcp-connection')
  })

  it('空 errorMessage 不命中任何规则', () => {
    expect(matchRule('', 'Edit', 'zcode')).toBeNull()
    expect(matchRule('   ', 'Bash')).toBeNull()
  })

  it('无关错误不误命中', () => {
    expect(matchRule('Division by zero', 'Bash')).toBeNull()
    expect(matchRule('git: command not found', 'Bash')).toBeNull()
  })

  it('多规则同时命中时取 id 字典序第一条', () => {
    // "MCP connection refused" 同时命 network-failure 的 econnrefused 与 mcp-connection 的 refused
    const rule = matchRule('MCP connection refused', 'CallTool')
    // 字典序：mcp-connection < network-failure
    expect(rule?.id).toBe('mcp-connection')
  })

  it('localize：按语言取文案，en 回退 zh', () => {
    const rule = BUILT_IN_GUIDANCE_RULES[0]!
    expect(localize(rule.title, 'zh-Hans')).toBe(rule.title.zh)
    expect(localize(rule.title, 'en')).toBe(rule.title.en)
  })
})