import { describe, expect, it, vi } from 'vitest'

import type { MemoryToolInvokers } from './memory'

import { installStrictToolSchemaMatchers } from '../testing/strict-tool-schema'
import { memoryTools, searchMemory, writeMemory } from './memory'

installStrictToolSchemaMatchers()

function createMockInvokers(): MemoryToolInvokers {
  return {
    addEntry: vi.fn(),
    listEntries: vi.fn(),
  }
}

describe('memoryTools factory', () => {
  it('exposes memory_write and memory_search tools', async () => {
    const tools = await memoryTools()
    expect(tools.map(tool => tool.function.name)).toEqual([
      'memory_write',
      'memory_search',
    ])
  })

  it('keeps every tool schema provider-strict (required keys + additionalProperties:false)', async () => {
    const tools = await memoryTools()
    expect(tools).toSatisfyStrictToolSchemas()
  })
})

describe('writeMemory (memory_write)', () => {
  it('writes content with defaults (type=fact, source=llm)', async () => {
    const invokers = createMockInvokers()
    vi.mocked(invokers.addEntry).mockResolvedValue({ id: 'mem-1' } as never)
    const result = await writeMemory({ content: '  用户喜欢抹茶拿铁  ', type: null, source: null }, { invokers })
    expect(invokers.addEntry).toHaveBeenCalledWith({
      content: '用户喜欢抹茶拿铁',
      type: 'fact',
      source: 'llm',
    })
    expect(result).toEqual({ ok: true, id: 'mem-1' })
  })

  it('passes through explicit type and source', async () => {
    const invokers = createMockInvokers()
    vi.mocked(invokers.addEntry).mockResolvedValue({ id: 'mem-2' } as never)
    await writeMemory({ content: '编译失败优先查 ENOENT', type: 'procedural', source: 'executor' }, { invokers })
    expect(invokers.addEntry).toHaveBeenCalledWith({
      content: '编译失败优先查 ENOENT',
      type: 'procedural',
      source: 'executor',
    })
  })
})

describe('searchMemory (memory_search)', () => {
  it('queries with default limit 5 and maps results', async () => {
    const invokers = createMockInvokers()
    vi.mocked(invokers.listEntries).mockResolvedValue([
      { id: 'a', content: '用户偏好 TypeScript', type: 'preference', source: 'chat' },
      { id: 'b', content: '项目用 pnpm', type: 'fact', source: 'chat' },
    ] as never)
    const result = await searchMemory({ query: '  用户偏好  ', limit: null }, { invokers })
    expect(invokers.listEntries).toHaveBeenCalledWith({ q: '用户偏好', limit: 5 })
    expect(result.total).toBe(2)
    expect(result.entries[0]).toEqual({ id: 'a', content: '用户偏好 TypeScript', type: 'preference', source: 'chat' })
  })

  it('passes through explicit limit', async () => {
    const invokers = createMockInvokers()
    vi.mocked(invokers.listEntries).mockResolvedValue([] as never)
    await searchMemory({ query: 'test', limit: 10 }, { invokers })
    expect(invokers.listEntries).toHaveBeenCalledWith({ q: 'test', limit: 10 })
  })
})
