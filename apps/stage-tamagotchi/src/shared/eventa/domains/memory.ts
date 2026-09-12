// Domain: memory — eventa IPC 契约按域拆分
import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

export interface MemoryEntry {
  id: string
  content: string
  type: string
  source?: string
  /** 会话隔离 — 同一 sessionId 的记忆只在同一会话中可见 */
  sessionId?: string
  created_at?: string
  updated_at?: string
  metadata?: Record<string, any>
}

export interface MemoryStats {
  totalEntries: number
  totalSizeBytes: number
  lastCleanedAt: string | null
  nextCleanupAt: string | null
}

export interface MemorySettings {
  retentionDays: number
  maxEntries: number
  autoCleanup: boolean
  autoExtract: boolean
  expirationDays: number
  retrievalTopK: number
  provider: 'local' | 'mem0'
  apiKey: string
  lastCleanedAt?: string
  nextCleanupAt?: string
}

export interface MemoryUserProfile {
  name: string
  preferences: Record<string, string>
  createdAt: string
  updatedAt: string
}

export type MemoryExtractRuleCategory = 'preference' | 'fact' | 'event' | 'emotion' | 'other'

export interface MemoryExtractRule {
  id: string
  name: string
  pattern: string
  category: MemoryExtractRuleCategory
  enabled: boolean
  priority: number
}

export const electronMemoryGetStats = defineInvokeEventa<MemoryStats>('eventa:invoke:electron:memory:get-stats')
export const electronMemoryListEntries = defineInvokeEventa<MemoryEntry[], { limit?: number, offset?: number, q?: string, type?: string, sessionId?: string }>('eventa:invoke:electron:memory:list-entries')
export const electronMemoryAddEntry = defineInvokeEventa<MemoryEntry, Omit<MemoryEntry, 'id' | 'created_at' | 'updated_at'>>('eventa:invoke:electron:memory:add-entry')
export const electronMemoryRemoveEntry = defineInvokeEventa<boolean, { id: string }>('eventa:invoke:electron:memory:remove-entry')
export const electronMemoryClearAll = defineInvokeEventa<{ cleared: number }>('eventa:invoke:electron:memory:clear-all')
export const electronMemoryCleanup = defineInvokeEventa<{ removed: number }>('eventa:invoke:electron:memory:cleanup')
export const electronMemoryImport = defineInvokeEventa<{ imported: number }, { entries: MemoryEntry[], userProfile?: MemoryUserProfile, settings?: MemorySettings, extractRules?: MemoryExtractRule[] }>('eventa:invoke:electron:memory:import')
export const electronMemoryExport = defineInvokeEventa<{ json: string }>('eventa:invoke:electron:memory:export')
export const electronMemoryGetSettings = defineInvokeEventa<MemorySettings>('eventa:invoke:electron:memory:get-settings')
export const electronMemorySetSettings = defineInvokeEventa<MemorySettings, Partial<MemorySettings>>('eventa:invoke:electron:memory:set-settings')
export const electronMemoryGetProfile = defineInvokeEventa<MemoryUserProfile | null>('eventa:invoke:electron:memory:get-profile')
export const electronMemorySetProfile = defineInvokeEventa<MemoryUserProfile, { name?: string, preferences?: Record<string, string> }>('eventa:invoke:electron:memory:set-profile')
export const electronMemoryGetRules = defineInvokeEventa<MemoryExtractRule[]>('eventa:invoke:electron:memory:get-rules')
export const electronMemorySetRules = defineInvokeEventa<MemoryExtractRule[], { rules: MemoryExtractRule[] }>('eventa:invoke:electron:memory:set-rules')
export const electronMemoryTestRules = defineInvokeEventa<Array<{ ruleId: string, ruleName: string, category: string, priority: number }>, { text: string, rules?: MemoryExtractRule[] }>('eventa:invoke:electron:memory:test-rules')
export const electronMemoryExtractAndSave = defineInvokeEventa<{ saved: number }, { userMessage: string, assistantMessage: string, sessionId: string }>('eventa:invoke:electron:memory:extract-and-save')
export const electronMemorySearchForChat = defineInvokeEventa<Array<{ content: string }>, { query: string, sessionId: string }>('eventa:invoke:electron:memory:search-for-chat')

/** 记忆新增事件 — memory_write 工具 / 对话自动抽取落盘成功后广播，桌宠可表达"我记住了"。 */
export interface MemoryEntryAddedPayload {
  id: string
  content: string
  type: string
  source?: string
  sessionId?: string
}
export const electronMemoryEntryAdded = defineEventa<MemoryEntryAddedPayload>('eventa:event:electron:memory:entry-added')

export const electronShortTermMemoryGetStats = defineInvokeEventa<MemoryStats>('eventa:invoke:electron:short-term-memory:get-stats')
export const electronShortTermMemoryListEntries = defineInvokeEventa<MemoryEntry[], { limit?: number, offset?: number, q?: string, type?: string }>('eventa:invoke:electron:short-term-memory:list-entries')
export const electronShortTermMemoryAddEntry = defineInvokeEventa<MemoryEntry, Omit<MemoryEntry, 'id' | 'created_at' | 'updated_at'>>('eventa:invoke:electron:short-term-memory:add-entry')
export const electronShortTermMemoryRemoveEntry = defineInvokeEventa<boolean, { id: string }>('eventa:invoke:electron:short-term-memory:remove-entry')
export const electronShortTermMemoryClearAll = defineInvokeEventa<{ cleared: number }>('eventa:invoke:electron:short-term-memory:clear-all')
export const electronShortTermMemoryCleanup = defineInvokeEventa<{ removed: number }>('eventa:invoke:electron:short-term-memory:cleanup')
export const electronShortTermMemoryImport = defineInvokeEventa<{ imported: number }, { entries: MemoryEntry[], settings?: MemorySettings }>('eventa:invoke:electron:short-term-memory:import')
export const electronShortTermMemoryExport = defineInvokeEventa<{ json: string }>('eventa:invoke:electron:short-term-memory:export')
export const electronShortTermMemoryGetSettings = defineInvokeEventa<MemorySettings>('eventa:invoke:electron:short-term-memory:get-settings')
export const electronShortTermMemorySetSettings = defineInvokeEventa<MemorySettings, Partial<MemorySettings>>('eventa:invoke:electron:short-term-memory:set-settings')
