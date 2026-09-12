import type { Tool } from '@xsai/shared-chat'
import type { JsonSchema } from 'xsschema'

import { defineInvoke } from '@moeru/eventa'
import { getElectronEventaContext } from '@kitsune/electron-vueuse'
import { normalizeNullableAnyOf } from '@kitsune/stage-shared/json-schema'
import { rawTool } from '@xsai/tool'
import { toJsonSchema } from 'xsschema'
import { z } from 'zod'

import { electronMemoryAddEntry, electronMemoryListEntries } from '../../../../shared/eventa'

// NOTICE: build the eventa context lazily instead of at module scope. Module-scope
// `getElectronEventaContext()` throws when imported without an Electron IPC bridge
// (unit tests, web runtime), which broke tool definition resolution.
let sharedContext: ReturnType<typeof getElectronEventaContext> | undefined

function getContext() {
  sharedContext ??= getElectronEventaContext()
  return sharedContext
}

function createInvokers() {
  const context = getContext()
  return {
    addEntry: defineInvoke(context, electronMemoryAddEntry),
    listEntries: defineInvoke(context, electronMemoryListEntries),
  }
}

export type MemoryToolInvokers = ReturnType<typeof createInvokers>

let memoryToolInvokers: MemoryToolInvokers | undefined

function resolveInvokers(override?: MemoryToolInvokers): MemoryToolInvokers {
  if (override)
    return override
  memoryToolInvokers ??= createInvokers()
  return memoryToolInvokers
}

// NOTICE: OpenAI-compatible tool validators reject strict object schemas when
// some nested properties are omitted from `required`. Keep these fields
// required-but-nullable, then collapse `null` back to omitted runtime fields.
const memoryWriteParams = z.object({
  content: z.string().min(1).max(2000).describe('Memory content to store — a fact, preference, or lesson worth remembering.'),
  type: z.union([z.string().max(40), z.null()]).describe('Memory category: fact / preference / event / emotion / procedural. Omit or null for "fact".'),
  source: z.union([z.string().max(60), z.null()]).describe('Origin of this memory (e.g. "chat", "executor"). Omit for default.'),
}).strict()

type MemoryWriteToolInput = z.infer<typeof memoryWriteParams>

const memorySearchParams = z.object({
  query: z.string().min(1).max(500).describe('Search query to recall related memories (semantic/BM25 match).'),
  limit: z.union([z.number().int().min(1).max(20), z.null()]).describe('Max results to return (1-20). Omit or null for the default of 5.'),
}).strict()

type MemorySearchToolInput = z.infer<typeof memorySearchParams>

/**
 * memory_write — 把一条事实/偏好/经验写入长期记忆库。
 */
export async function writeMemory(input: MemoryWriteToolInput, deps?: { invokers?: MemoryToolInvokers }) {
  const invokers = resolveInvokers(deps?.invokers)
  const entry = await invokers.addEntry({
    content: input.content.trim(),
    type: input.type ?? 'fact',
    source: input.source ?? 'llm',
  })
  return { ok: true, id: entry.id }
}

/**
 * memory_search — 在长期记忆库中检索相关记忆（BM25 语义匹配）。
 */
export async function searchMemory(input: MemorySearchToolInput, deps?: { invokers?: MemoryToolInvokers }) {
  const invokers = resolveInvokers(deps?.invokers)
  const entries = await invokers.listEntries({
    q: input.query.trim(),
    limit: input.limit ?? 5,
  })
  return {
    entries: entries.map(e => ({
      id: e.id,
      content: e.content,
      type: e.type,
      source: e.source,
    })),
    total: entries.length,
  }
}

const tools: Promise<Tool>[] = [
  (async () => rawTool({
    name: 'memory_write',
    description: 'Write a fact, preference, or lesson into the pet\'s long-term memory. Use when the user states a durable preference, a personal fact, or you discover something worth remembering across sessions.',
    execute: params => writeMemory(params as MemoryWriteToolInput),
    parameters: normalizeNullableAnyOf(await toJsonSchema(memoryWriteParams) as JsonSchema),
  }))(),
  (async () => rawTool({
    name: 'memory_search',
    description: 'Search the pet\'s long-term memory for relevant past entries (facts, preferences, lessons). Use before answering when the user references something you might have been told before, or when context from earlier sessions could matter.',
    execute: params => searchMemory(params as MemorySearchToolInput),
    parameters: normalizeNullableAnyOf(await toJsonSchema(memorySearchParams) as JsonSchema),
  }))(),
]

export const memoryTools = async () => Promise.all(tools)
