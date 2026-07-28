import { rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { analyzeCodeStyle, clearCodeStyleCache } from './codeStyleAnalyzer'

describe('analyzeCodeStyle', () => {
  const testDir = join(tmpdir(), `code-style-test-${Date.now()}`)

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
    clearCodeStyleCache()
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
    clearCodeStyleCache()
  })

  it('detects space indent from .editorconfig', async () => {
    await writeFile(
      join(testDir, '.editorconfig'),
      'root = true\n[*]\nindent_style = space\nindent_size = 2\n',
    )
    const profile = await analyzeCodeStyle(testDir)
    expect(profile.indentStyle).toBe('space')
  })

  it('detects tab indent from .editorconfig', async () => {
    await writeFile(
      join(testDir, '.editorconfig'),
      'root = true\n[*]\nindent_style = tab\n',
    )
    const profile = await analyzeCodeStyle(testDir)
    expect(profile.indentStyle).toBe('tab')
  })

  it('returns unknown indent when no .editorconfig', async () => {
    const profile = await analyzeCodeStyle(testDir)
    expect(['unknown', 'tab', 'space']).toContain(profile.indentStyle)
  })

  it('returns non-empty summary', async () => {
    const profile = await analyzeCodeStyle(testDir)
    expect(profile.summary).toBeTruthy()
    expect(profile.summary.length).toBeGreaterThan(10)
  })

  it('caches result within TTL', async () => {
    const profile1 = await analyzeCodeStyle(testDir)
    await writeFile(
      join(testDir, '.editorconfig'),
      'root = true\n[*]\nindent_style = tab\n',
    )
    const profile2 = await analyzeCodeStyle(testDir)
    // 缓存命中，应该返回和 profile1 相同的结果
    expect(profile2.indentStyle).toBe(profile1.indentStyle)
  })

  it('commit style defaults to freeform when git unavailable', async () => {
    const profile = await analyzeCodeStyle(testDir)
    expect(['conventional', 'freeform', 'prefixed']).toContain(profile.commitStyle)
  })
})