import type { MemoryEntry, MemoryExtractRule, MemorySettings, MemoryUserProfile } from '../../../../shared/eventa'

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { app } from 'electron'

import { createBM25Index } from './bm25'

const DEFAULT_EXTRACT_RULES: MemoryExtractRule[] = [
  { id: 'rule_preference', name: '偏好表达', pattern: '我(?:喜欢|想要|需要|偏好|倾向于)', category: 'preference', enabled: true, priority: 10 },
  { id: 'rule_identity', name: '身份信息', pattern: '我(?:是|叫|名字是|生日是)', category: 'fact', enabled: true, priority: 20 },
  { id: 'rule_location', name: '位置信息', pattern: '我(?:在|住|位于)', category: 'fact', enabled: true, priority: 15 },
  { id: 'rule_memory_request', name: '记忆请求', pattern: '请(?:记住|帮我记住|记一下)', category: 'fact', enabled: true, priority: 30 },
  { id: 'rule_event', name: '事件记录', pattern: '我(?:今天|昨天|刚才|刚刚)(?:做了|去了|看到|遇到)', category: 'event', enabled: true, priority: 10 },
  { id: 'rule_emotion', name: '情绪表达', pattern: '我(?:觉得|感觉|感到)(?:开心|难过|兴奋|沮丧|紧张|放松)', category: 'emotion', enabled: true, priority: 5 },
]

const DEFAULT_SETTINGS: MemorySettings = {
  retentionDays: 90,
  maxEntries: 10000,
  autoCleanup: true,
  autoExtract: true,
  expirationDays: 90,
  retrievalTopK: 5,
  provider: 'local',
  apiKey: '',
}

interface EntriesFile {
  entries: MemoryEntry[]
  updated_at?: string
}

export interface MemoryStoreOptions {
  namespace?: string
  rootDir?: string
  defaultSettings?: MemorySettings
  defaultRules?: MemoryExtractRule[]
}

export class MemoryStore {
  private entriesFile: string
  private settingsFile: string
  private profileFile: string
  private rulesFile: string
  private rootDir: string
  private defaultSettings: MemorySettings
  private defaultRules: MemoryExtractRule[]

  /** 内存中的条目列表，首次访问时从文件加载 */
  private entries: MemoryEntry[] = []
  /** BM25 检索索引，与 entries 同步 */
  private bm25Index = createBM25Index()
  /** 是否已从文件加载到内存 */
  private loaded = false

  constructor(options: MemoryStoreOptions = {}) {
    const namespace = options.namespace ?? 'memory'
    this.entriesFile = `${namespace}-entries.json`
    this.settingsFile = `${namespace}-settings.json`
    this.profileFile = `${namespace}-user-profile.json`
    this.rulesFile = `${namespace}-extract-rules.json`
    this.rootDir = options.rootDir ?? app.getPath('userData')
    this.defaultSettings = options.defaultSettings ?? DEFAULT_SETTINGS
    this.defaultRules = options.defaultRules ?? DEFAULT_EXTRACT_RULES
  }

  /** 从文件加载条目到内存并重建 BM25 索引 */
  private async ensureLoaded(): Promise<void> {
    if (this.loaded)
      return
    const file = await this.readEntriesFile()
    this.entries = file.entries
    this.bm25Index = createBM25Index()
    for (const entry of this.entries) {
      this.bm25Index.add(entry.id, `${entry.content} ${entry.type} ${entry.source ?? ''}`)
    }
    this.loaded = true
  }

  /** 持久化当前内存条目到文件 */
  private async persist(): Promise<void> {
    await this.writeEntriesFile({ entries: this.entries })
  }

  private path(file: string) {
    return join(this.rootDir, file)
  }

  private async ensureDir() {
    await mkdir(this.rootDir, { recursive: true })
  }

  private async readJson<T>(file: string, fallback: T): Promise<T> {
    try {
      const raw = await readFile(this.path(file), 'utf-8')
      return JSON.parse(raw) as T
    }
    catch {
      return fallback
    }
  }

  private async writeJson(file: string, data: unknown) {
    await this.ensureDir()
    await writeFile(this.path(file), `${JSON.stringify(data, null, 2)}\n`, 'utf-8')
  }

  private async readEntriesFile(): Promise<EntriesFile> {
    const file = await this.readJson<EntriesFile>(this.entriesFile, { entries: [] })
    return {
      entries: Array.isArray(file.entries) ? file.entries : [],
      updated_at: file.updated_at,
    }
  }

  private async writeEntriesFile(file: EntriesFile) {
    file.updated_at = new Date().toISOString()
    await this.writeJson(this.entriesFile, file)
  }

  private estimateSize(entry: MemoryEntry): number {
    return JSON.stringify(entry).length * 2
  }

  async getSettings(): Promise<MemorySettings> {
    const stored = await this.readJson<Partial<MemorySettings>>(this.settingsFile, {})
    return { ...this.defaultSettings, ...stored }
  }

  async setSettings(patch: Partial<MemorySettings>): Promise<MemorySettings> {
    const current = await this.getSettings()
    const next = { ...current, ...patch }
    await this.writeJson(this.settingsFile, next)
    return next
  }

  async getStats(): Promise<{ totalEntries: number, totalSizeBytes: number, lastCleanedAt: string | null, nextCleanupAt: string | null }> {
    await this.ensureLoaded()
    const settings = await this.getSettings()
    const totalSizeBytes = this.entries.reduce((sum, e) => sum + this.estimateSize(e), 0)
    let nextCleanupAt: string | null = settings.nextCleanupAt ?? null
    if (settings.autoCleanup && settings.retentionDays && !nextCleanupAt) {
      nextCleanupAt = new Date(Date.now() + settings.retentionDays * 86400000).toISOString()
    }
    return {
      totalEntries: this.entries.length,
      totalSizeBytes,
      lastCleanedAt: settings.lastCleanedAt ?? null,
      nextCleanupAt,
    }
  }

  async listEntries(options?: { limit?: number, offset?: number, q?: string, type?: string, sessionId?: string, crossSession?: boolean }): Promise<MemoryEntry[]> {
    await this.ensureLoaded()
    let entries = this.entries
    // crossSession 模式：优先当前会话，无结果时回退到全局检索
    if (options?.sessionId && !options?.crossSession) {
      entries = entries.filter(e => e.sessionId === options.sessionId)
    }
    if (options?.type) {
      entries = entries.filter(e => (e.type || e.metadata?.type) === options.type)
    }
    if (options?.q?.trim()) {
      const results = this.bm25Index.search(options.q.trim(), options.limit ?? 50)
      const scoreMap = new Map(results.map(r => [r.id, r.score]))
      entries = entries.filter(e => scoreMap.has(e.id))
        .sort((a, b) => (scoreMap.get(b.id) ?? 0) - (scoreMap.get(a.id) ?? 0))
      // 跨会话回退：如果当前会话无匹配结果，回退到全局 BM25 检索
      if (entries.length === 0 && options?.sessionId && options?.crossSession) {
        let globalEntries = this.entries
        if (options?.type) {
          globalEntries = globalEntries.filter(e => (e.type || e.metadata?.type) === options.type)
        }
        const globalResults = this.bm25Index.search(options.q.trim(), options.limit ?? 50)
        const globalScoreMap = new Map(globalResults.map(r => [r.id, r.score]))
        entries = globalEntries.filter(e => globalScoreMap.has(e.id))
          .sort((a, b) => (globalScoreMap.get(b.id) ?? 0) - (globalScoreMap.get(a.id) ?? 0))
      }
    }
    else {
      entries.sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime())
    }
    const offset = Math.max(0, options?.offset ?? 0)
    const limit = Math.max(1, Math.min(options?.limit ?? 50, 200))
    return entries.slice(offset, offset + limit)
  }

  async addEntry(payload: Omit<MemoryEntry, 'id' | 'created_at' | 'updated_at'> & { sessionId?: string }): Promise<MemoryEntry> {
    await this.ensureLoaded()
    const now = new Date().toISOString()
    const entry: MemoryEntry = {
      ...payload,
      sessionId: payload.sessionId,
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      created_at: now,
      updated_at: now,
    }
    this.entries.unshift(entry)
    this.bm25Index.add(entry.id, `${entry.content} ${entry.type} ${entry.source ?? ''}`)
    await this.persist()
    return entry
  }

  async removeEntry(id: string): Promise<boolean> {
    await this.ensureLoaded()
    const before = this.entries.length
    const entry = this.entries.find(e => e.id === id)
    this.entries = this.entries.filter(e => e.id !== id)
    if (this.entries.length === before) {
      return false
    }
    if (entry)
      this.bm25Index.remove(entry.id)
    await this.persist()
    return true
  }

  async clearAll(): Promise<{ cleared: number }> {
    await this.ensureLoaded()
    const cleared = this.entries.length
    this.entries = []
    this.bm25Index = createBM25Index()
    await this.persist()
    return { cleared }
  }

  async cleanup(): Promise<{ removed: number }> {
    await this.ensureLoaded()
    const settings = await this.getSettings()
    const retentionMs = (settings.retentionDays ?? 90) * 86400000
    const cutoff = new Date(Date.now() - retentionMs).toISOString()
    const before = this.entries.length
    this.entries = this.entries.filter(e => (e.updated_at || e.created_at || '') >= cutoff)
    const removed = before - this.entries.length
    if (removed > 0) {
      this.bm25Index = createBM25Index()
      for (const entry of this.entries) {
        this.bm25Index.add(entry.id, `${entry.content} ${entry.type} ${entry.source ?? ''}`)
      }
      await this.persist()
    }
    await this.setSettings({ lastCleanedAt: new Date().toISOString() })
    return { removed }
  }

  async importData(data: { entries?: MemoryEntry[], userProfile?: MemoryUserProfile, settings?: MemorySettings, extractRules?: MemoryExtractRule[] }): Promise<{ imported: number }> {
    await this.ensureLoaded()
    const existingIds = new Set(this.entries.map(e => e.id))
    let imported = 0
    for (const entry of data.entries || []) {
      if (!existingIds.has(entry.id)) {
        this.entries.push(entry)
        this.bm25Index.add(entry.id, `${entry.content} ${entry.type} ${entry.source ?? ''}`)
        imported++
      }
    }
    if (imported > 0) {
      await this.persist()
    }
    if (data.userProfile) {
      await this.setProfile(data.userProfile)
    }
    if (data.settings) {
      await this.setSettings(data.settings)
    }
    if (data.extractRules) {
      await this.setRules(data.extractRules)
    }
    return { imported }
  }

  async exportData(): Promise<{ json: string }> {
    await this.ensureLoaded()
    const profile = await this.getProfile()
    const settings = await this.getSettings()
    const rules = await this.getRules()
    const blob = {
      version: 2,
      exportedAt: new Date().toISOString(),
      entries: this.entries,
      userProfile: profile,
      settings,
      extractRules: rules,
    }
    return { json: JSON.stringify(blob, null, 2) }
  }

  async getProfile(): Promise<MemoryUserProfile | null> {
    return this.readJson<MemoryUserProfile | null>(this.profileFile, null)
  }

  async setProfile(payload: { name?: string, preferences?: Record<string, string> }): Promise<MemoryUserProfile> {
    const existing = await this.getProfile()
    const profile: MemoryUserProfile = {
      name: payload.name ?? existing?.name ?? '',
      preferences: payload.preferences ?? existing?.preferences ?? {},
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await this.writeJson(this.profileFile, profile)
    return profile
  }

  async getRules(): Promise<MemoryExtractRule[]> {
    return this.readJson<MemoryExtractRule[]>(this.rulesFile, this.defaultRules)
  }

  async setRules(rules: MemoryExtractRule[]): Promise<MemoryExtractRule[]> {
    for (const rule of rules) {
      if (!rule.id || !rule.name || !rule.pattern) {
        throw new Error(`Invalid rule: id, name, pattern are required (rule: ${rule.id || 'unknown'})`)
      }
      const _regex = new RegExp(rule.pattern)
      void _regex
    }
    await this.writeJson(this.rulesFile, rules)
    return rules
  }

  async testRules(text: string, rules?: MemoryExtractRule[]): Promise<Array<{ ruleId: string, ruleName: string, category: string, priority: number }>> {
    const rulesToTest = rules ?? await this.getRules()
    const matches: Array<{ ruleId: string, ruleName: string, category: string, priority: number }> = []
    for (const rule of rulesToTest) {
      if (!rule.enabled)
        continue
      try {
        const regex = new RegExp(rule.pattern)
        if (regex.test(text)) {
          matches.push({ ruleId: rule.id, ruleName: rule.name, category: rule.category, priority: rule.priority })
        }
      }
      catch {
        // 跳过无效正则
      }
    }
    return matches.sort((a, b) => b.priority - a.priority)
  }
}
