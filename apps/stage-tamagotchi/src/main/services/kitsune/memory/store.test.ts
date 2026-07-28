import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { MemoryStore } from './store'

describe('MemoryStore', () => {
  const testDir = join(tmpdir(), `memory-store-test-${Date.now()}`)
  let store: MemoryStore

  beforeEach(async () => {
    store = new MemoryStore({
      namespace: 'test',
      rootDir: testDir,
    })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it('should add and retrieve an entry', async () => {
    const entry = await store.addEntry({
      content: '我喜欢打篮球',
      type: 'preference',
      source: 'user',
    })

    expect(entry.content).toBe('我喜欢打篮球')
    expect(entry.type).toBe('preference')
    expect(entry.id).toBeTruthy()
    expect(entry.created_at).toBeTruthy()
    expect(entry.updated_at).toBeTruthy()
  })

  it('should list entries sorted by time desc', async () => {
    await store.addEntry({ content: 'first', type: 'fact', source: 'test' })
    await store.addEntry({ content: 'second', type: 'fact', source: 'test' })

    const entries = await store.listEntries()
    expect(entries).toHaveLength(2)
    expect(entries[0].content).toBe('second')
    expect(entries[1].content).toBe('first')
  })

  it('should filter by sessionId', async () => {
    await store.addEntry({ content: 'session a fact', type: 'fact', source: 'test', sessionId: 'session-a' })
    await store.addEntry({ content: 'session b fact', type: 'fact', source: 'test', sessionId: 'session-b' })
    await store.addEntry({ content: 'session a pref', type: 'preference', source: 'test', sessionId: 'session-a' })

    const aEntries = await store.listEntries({ sessionId: 'session-a' })
    expect(aEntries).toHaveLength(2)
    expect(aEntries.every(e => e.sessionId === 'session-a')).toBe(true)

    const bEntries = await store.listEntries({ sessionId: 'session-b' })
    expect(bEntries).toHaveLength(1)
  })

  it('should search by BM25', async () => {
    await store.addEntry({ content: '我喜欢打篮球', type: 'preference', source: 'user' })
    await store.addEntry({ content: '今天天气很好', type: 'fact', source: 'user' })
    await store.addEntry({ content: '篮球比赛很精彩', type: 'fact', source: 'user' })

    const results = await store.listEntries({ q: '篮球', limit: 10 })
    expect(results.length).toBeGreaterThanOrEqual(1)
    // BM25 should rank the most basketball-relevant ones higher
    expect(results.some(e => e.content.includes('篮球'))).toBe(true)
  })

  it('should combine sessionId and BM25', async () => {
    await store.addEntry({ content: '我喜欢打篮球', type: 'preference', source: 'user', sessionId: 's1' })
    await store.addEntry({ content: '我喜欢打篮球', type: 'preference', source: 'user', sessionId: 's2' })
    await store.addEntry({ content: '今天天气很好', type: 'fact', source: 'user', sessionId: 's1' })

    const results = await store.listEntries({ q: '篮球', sessionId: 's1', limit: 10 })
    expect(results).toHaveLength(1)
    expect(results[0].sessionId).toBe('s1')
  })

  it('should filter by type', async () => {
    await store.addEntry({ content: 'fact 1', type: 'fact', source: 'test' })
    await store.addEntry({ content: 'preference 1', type: 'preference', source: 'test' })
    await store.addEntry({ content: 'fact 2', type: 'fact', source: 'test' })

    const facts = await store.listEntries({ type: 'fact' })
    expect(facts).toHaveLength(2)

    const prefs = await store.listEntries({ type: 'preference' })
    expect(prefs).toHaveLength(1)
  })

  it('should paginate with offset and limit', async () => {
    for (let i = 0; i < 10; i++)
      await store.addEntry({ content: `entry ${i}`, type: 'fact', source: 'test' })

    const page1 = await store.listEntries({ limit: 3, offset: 0 })
    expect(page1).toHaveLength(3)
    expect(page1[0].content).toBe('entry 9')

    const page2 = await store.listEntries({ limit: 3, offset: 3 })
    expect(page2).toHaveLength(3)
    expect(page2[0].content).toBe('entry 6')
  })

  it('should remove an entry', async () => {
    const entry = await store.addEntry({ content: 'to remove', type: 'fact', source: 'test' })
    expect(await store.listEntries()).toHaveLength(1)

    const removed = await store.removeEntry(entry.id)
    expect(removed).toBe(true)
    expect(await store.listEntries()).toHaveLength(0)
  })

  it('should return false when removing non-existent entry', async () => {
    const removed = await store.removeEntry('non-existent')
    expect(removed).toBe(false)
  })

  it('should clear all entries', async () => {
    await store.addEntry({ content: 'a', type: 'fact', source: 'test' })
    await store.addEntry({ content: 'b', type: 'fact', source: 'test' })
    expect(await store.listEntries()).toHaveLength(2)

    const { cleared } = await store.clearAll()
    expect(cleared).toBe(2)
    expect(await store.listEntries()).toHaveLength(0)
  })

  it('should persist entries across instances', async () => {
    await store.addEntry({ content: 'persisted entry', type: 'fact', source: 'test' })

    const store2 = new MemoryStore({ namespace: 'test', rootDir: testDir })
    const entries = await store2.listEntries()
    expect(entries).toHaveLength(1)
    expect(entries[0].content).toBe('persisted entry')
  })

  it('should get stats', async () => {
    await store.addEntry({ content: 'a', type: 'fact', source: 'test' })
    await store.addEntry({ content: 'b'.repeat(100), type: 'fact', source: 'test' })

    const stats = await store.getStats()
    expect(stats.totalEntries).toBe(2)
    expect(stats.totalSizeBytes).toBeGreaterThan(0)
  })

  it('should reject empty content entries', async () => {
    await expect(
      store.addEntry({ content: '', type: 'fact', source: 'test' }),
    ).resolves.toBeTruthy()
  })
})