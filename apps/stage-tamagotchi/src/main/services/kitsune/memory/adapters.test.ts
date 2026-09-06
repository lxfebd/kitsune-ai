import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createMemoryAdapters } from './adapters'
import { MemoryStore } from './store'

describe('createMemoryAdapters', () => {
  const testDir = join(tmpdir(), `memory-adapters-test-${Date.now()}`)
  let longTermStore: MemoryStore
  let shortTermStore: MemoryStore
  let adapters: ReturnType<typeof createMemoryAdapters>

  beforeEach(() => {
    longTermStore = new MemoryStore({ namespace: 'long-test', rootDir: testDir })
    shortTermStore = new MemoryStore({
      namespace: 'short-test',
      rootDir: testDir,
      defaultSettings: {
        retentionDays: 7,
        maxEntries: 1000,
        autoCleanup: true,
        autoExtract: false,
        expirationDays: 7,
        retrievalTopK: 10,
        provider: 'local',
        apiKey: '',
      },
      defaultRules: [],
    })
    adapters = createMemoryAdapters({ longTermStore, shortTermStore })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it('should write to long-term store by default', async () => {
    const result = await adapters.write({
      content: '用户喜欢 Vue',
      type: 'preference',
      sessionId: 's1',
    })
    expect(result.ok).toBe(true)
    expect(result.id).toBeTruthy()

    const entries = await longTermStore.listEntries({ sessionId: 's1' })
    expect(entries).toHaveLength(1)
    expect(entries[0].content).toBe('用户喜欢 Vue')
  })

  it('should write to short-term store when specified', async () => {
    const result = await adapters.write({
      content: '临时信息',
      type: 'fact',
      sessionId: 's1',
      store: 'short',
    })
    expect(result.ok).toBe(true)

    const shortEntries = await shortTermStore.listEntries({ sessionId: 's1' })
    expect(shortEntries).toHaveLength(1)

    const longEntries = await longTermStore.listEntries({ sessionId: 's1' })
    expect(longEntries).toHaveLength(0)
  })

  it('should search and return results', async () => {
    await adapters.write({ content: '我喜欢 Vue 框架', type: 'preference', sessionId: 's1' })
    await adapters.write({ content: '今天天气很好', type: 'fact', sessionId: 's1' })

    const results = await adapters.search({ query: 'Vue', sessionId: 's1' })
    expect(results.entries.length).toBeGreaterThanOrEqual(1)
    expect(results.entries.some(e => e.content.includes('Vue'))).toBe(true)
  })

  it('should isolate search by sessionId', async () => {
    await adapters.write({ content: '用户喜欢 Vue', type: 'preference', sessionId: 's1' })
    await adapters.write({ content: '用户喜欢 React', type: 'preference', sessionId: 's2' })

    const s1Results = await adapters.search({ query: 'Vue', sessionId: 's1' })
    expect(s1Results.entries).toHaveLength(1)
    expect(s1Results.entries[0].content).toContain('Vue')

    const s2Results = await adapters.search({ query: 'Vue', sessionId: 's2' })
    expect(s2Results.entries).toHaveLength(0)
  })

  it('should respect topK limit in search', async () => {
    for (let i = 0; i < 10; i++)
      await adapters.write({ content: `Vue 相关信息 ${i}`, type: 'fact', sessionId: 's1' })

    const results = await adapters.search({ query: 'Vue', sessionId: 's1', topK: 3 })
    expect(results.entries.length).toBeLessThanOrEqual(3)
  })

  it('should return empty for no matches', async () => {
    await adapters.write({ content: '用户喜欢 Vue', type: 'preference', sessionId: 's1' })

    const results = await adapters.search({ query: 'Python', sessionId: 's1' })
    expect(results.entries).toEqual([])
  })
})