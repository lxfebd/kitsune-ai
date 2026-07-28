import type { createContext } from '@moeru/eventa/adapters/electron/main'

import { defineInvokeHandler } from '@moeru/eventa'

import {
  electronMemoryAddEntry,
  electronMemoryCleanup,
  electronMemoryClearAll,
  electronMemoryExport,
  electronMemoryExtractAndSave,
  electronMemoryGetProfile,
  electronMemoryGetRules,
  electronMemoryGetSettings,
  electronMemoryGetStats,
  electronMemoryImport,
  electronMemoryListEntries,
  electronMemoryRemoveEntry,
  electronMemorySearchForChat,
  electronMemorySetProfile,
  electronMemorySetRules,
  electronMemorySetSettings,
  electronMemoryTestRules,
  electronShortTermMemoryAddEntry,
  electronShortTermMemoryCleanup,
  electronShortTermMemoryClearAll,
  electronShortTermMemoryExport,
  electronShortTermMemoryGetSettings,
  electronShortTermMemoryGetStats,
  electronShortTermMemoryImport,
  electronShortTermMemoryListEntries,
  electronShortTermMemoryRemoveEntry,
  electronShortTermMemorySetSettings,
} from '../../../../shared/eventa'
import { extractMemoryFromConversation } from '@kitsune/stage-shared/memory'

import { createMemoryAdapters } from './adapters'
import { MemoryStore } from './store'

export function createMemoryService(params: { context: ReturnType<typeof createContext>['context'] }) {
  const longTermStore = new MemoryStore()
  const shortTermStore = new MemoryStore({
    namespace: 'short-term',
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

  const adapters = createMemoryAdapters({ longTermStore, shortTermStore })

  defineInvokeHandler(params.context, electronMemoryGetStats, async () => longTermStore.getStats())
  defineInvokeHandler(params.context, electronMemoryListEntries, async payload => longTermStore.listEntries(payload))
  defineInvokeHandler(params.context, electronMemoryAddEntry, async payload => longTermStore.addEntry(payload))
  defineInvokeHandler(params.context, electronMemoryRemoveEntry, async payload => longTermStore.removeEntry(payload.id))
  defineInvokeHandler(params.context, electronMemoryClearAll, async () => longTermStore.clearAll())
  defineInvokeHandler(params.context, electronMemoryCleanup, async () => longTermStore.cleanup())
  defineInvokeHandler(params.context, electronMemoryImport, async payload => longTermStore.importData(payload))
  defineInvokeHandler(params.context, electronMemoryExport, async () => longTermStore.exportData())
  defineInvokeHandler(params.context, electronMemoryGetSettings, async () => longTermStore.getSettings())
  defineInvokeHandler(params.context, electronMemorySetSettings, async payload => longTermStore.setSettings(payload))
  defineInvokeHandler(params.context, electronMemoryGetProfile, async () => longTermStore.getProfile())
  defineInvokeHandler(params.context, electronMemorySetProfile, async payload => longTermStore.setProfile(payload))
  defineInvokeHandler(params.context, electronMemoryGetRules, async () => longTermStore.getRules())
  defineInvokeHandler(params.context, electronMemorySetRules, async payload => longTermStore.setRules(payload.rules))
  defineInvokeHandler(params.context, electronMemoryTestRules, async payload => longTermStore.testRules(payload.text, payload.rules))

  // 记忆提取 + 写入（供 chat-sync.ts 流式完成后调用）
  defineInvokeHandler(params.context, electronMemoryExtractAndSave, async (payload) => {
    const entries = extractMemoryFromConversation(payload.userMessage, payload.assistantMessage)
    let saved = 0
    for (const entry of entries) {
      await longTermStore.addEntry({
        content: entry.content,
        type: entry.type,
        source: 'chat',
        sessionId: payload.sessionId,
      })
      saved++
    }
    if (saved > 0)
      console.log(`[memory] extracted ${saved} entries`)
    return { saved }
  })

  // 记忆检索（供 chat-sync.ts 流式发送前注入上下文）
  // crossSession: 优先当前会话，无匹配结果时回退到全局检索（跨会话记忆）
  defineInvokeHandler(params.context, electronMemorySearchForChat, async (payload) => {
    const entries = await longTermStore.listEntries({
      q: payload.query,
      sessionId: payload.sessionId,
      limit: 5,
      crossSession: true,
    })
    if (entries.length > 0)
      console.log(`[memory] search hit: ${entries.length} entries for "${payload.query.slice(0, 30)}"`)
    return entries.map(e => ({ content: e.content }))
  })

  defineInvokeHandler(params.context, electronShortTermMemoryGetStats, async () => shortTermStore.getStats())
  defineInvokeHandler(params.context, electronShortTermMemoryListEntries, async payload => shortTermStore.listEntries(payload))
  defineInvokeHandler(params.context, electronShortTermMemoryAddEntry, async payload => shortTermStore.addEntry(payload))
  defineInvokeHandler(params.context, electronShortTermMemoryRemoveEntry, async payload => shortTermStore.removeEntry(payload.id))
  defineInvokeHandler(params.context, electronShortTermMemoryClearAll, async () => shortTermStore.clearAll())
  defineInvokeHandler(params.context, electronShortTermMemoryCleanup, async () => shortTermStore.cleanup())
  defineInvokeHandler(params.context, electronShortTermMemoryImport, async payload => shortTermStore.importData(payload))
  defineInvokeHandler(params.context, electronShortTermMemoryExport, async () => shortTermStore.exportData())
  defineInvokeHandler(params.context, electronShortTermMemoryGetSettings, async () => shortTermStore.getSettings())
  defineInvokeHandler(params.context, electronShortTermMemorySetSettings, async payload => shortTermStore.setSettings(payload))

  return {
    longTermStore,
    shortTermStore,
    adapters,
  }
}

export { MemoryStore } from './store'
export { createMemoryAdapters } from './adapters'
export { type MemoryAdapters } from './adapters'