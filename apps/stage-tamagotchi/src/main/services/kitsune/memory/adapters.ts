import type { MemoryStore } from './store'

/**
 * memory.write / memory.search 工具 adapter 实现。
 *
 * 对应 config/yachiyo/tools.yaml:180-207 的声明。
 * 由 createMemoryService 实例化并暴露给主进程 tool registry。
 */

export interface MemoryWriteArgs {
  content: string
  type?: string
  source?: string
  sessionId?: string
  store?: 'long' | 'short'
}

export interface MemorySearchArgs {
  query: string
  sessionId?: string
  store?: 'long' | 'short'
  topK?: number
}

export interface MemorySearchResult {
  entries: Array<{ content: string, type: string, score: number }>
}

export function createMemoryAdapters(params: {
  longTermStore: MemoryStore
  shortTermStore: MemoryStore
}) {
  const { longTermStore, shortTermStore } = params

  /**
   * memory.write — LLM 调用此工具写入记忆。
   * 写入到目标存储（默认长期），自动添加 sessionId 隔离。
   */
  async function write(args: MemoryWriteArgs): Promise<{ ok: boolean, id: string }> {
    const targetStore = args.store === 'short' ? shortTermStore : longTermStore
    const entry = await targetStore.addEntry({
      content: args.content,
      type: args.type ?? 'fact',
      source: args.source ?? 'llm',
      sessionId: args.sessionId,
    })
    return { ok: true, id: entry.id }
  }

  /**
   * memory.search — LLM 调用此工具检索记忆。
   * 按 query 进行 BM25 检索（按 sessionId 过滤），返回 topK 条匹配。
   */
  async function search(args: MemorySearchArgs): Promise<MemorySearchResult> {
    const targetStore = args.store === 'short' ? shortTermStore : longTermStore
    const entries = await targetStore.listEntries({
      q: args.query,
      sessionId: args.sessionId,
      limit: args.topK ?? 5,
    })
    return {
      entries: entries.map(e => ({
        content: e.content,
        type: e.type,
        score: 1,
      })),
    }
  }

  return { write, search }
}

export type MemoryAdapters = ReturnType<typeof createMemoryAdapters>