/**
 * 指导失败计数器 — 桌宠「重复失败才指导」的持久化记忆。
 *
 * ── 为什么独立 JSON，不接 MemoryStore ──
 * MemoryStore 是 BM25 索引的记忆条目库，存「这句话是什么意思」；
 * 这里存的是结构化计数表（source:error → count/窗口/冷却），语义完全不同，
 * 混进记忆索引只会互相污染。独立文件 `guidance-failure-counter.json`，
 * 跨会话保留 —— 用户重启应用后，重复失败的历史依然记得。
 *
 * ── 触发语义 ──
 *   key = `${source}|${normalizedErrorMessage}`（归一：小写/去空白/截断 120）
 *   滑动窗口：距上次失败超过 windowMs → 视为新一轮，计数重置为 1
 *   计数达到 threshold 且该规则不在冷却期 → 返回触发（携带规则与当前次数）
 *   冷却按 ruleId 记（持久化），冷却期内不再重复触发同类指导
 *
 * 注入 now()（默认 Date.now）供测试精确控制窗口/冷却边界，不用 fake timers。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { matchRule, type BuiltInGuidanceRule } from './builtInRules'

export interface FailureRecord {
  key: string
  source: string
  count: number
  firstSeen: number
  lastSeen: number
  /** 该 key 命中过的规则 id（未命中规则也计数，为将来补规则留统计） */
  ruleId: string | null
}

export interface GuidanceTrigger {
  rule: BuiltInGuidanceRule
  key: string
  count: number
}

export interface GuidedFailureCounterOptions {
  rootDir: string
  windowMs?: number
  cooldownMs?: number
  /** 阈值：同一失败（source+归一化错误）在窗口内累计多少次触发指导（默认 3） */
  threshold?: number
  now?: () => number
}

interface PersistedState {
  records: Record<string, FailureRecord>
  /** ruleId → 上次触发指导时间戳（跨会话防重启后立刻二刷） */
  lastGuidanceAt: Record<string, number>
}

const DEFAULT_WINDOW_MS = 15 * 60_000
const DEFAULT_COOLDOWN_MS = 10 * 60_000
const DEFAULT_THRESHOLD = 3

/** 归一化错误消息作为计数键：小写、去空白、截断，同因异文归一 */
export function normalizeErrorMessage(message: string): string {
  return message
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 120)
}

export class GuidedFailureCounter {
  private file: string
  private windowMs: number
  private cooldownMs: number
  private threshold: number
  private now: () => number
  private state: PersistedState = { records: {}, lastGuidanceAt: {} }
  private loaded = false

  constructor(options: GuidedFailureCounterOptions) {
    this.file = join(options.rootDir, 'guidance-failure-counter.json')
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS
    this.cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS
    this.threshold = options.threshold ?? DEFAULT_THRESHOLD
    this.now = options.now ?? Date.now
  }

  /** 记录一次失败；返回触发信息当且仅当 计数达阈值且规则不在冷却期 */
  async recordFailure(input: { source: string, errorMessage: string, toolName?: string }): Promise<GuidanceTrigger | null> {
    const errorMessage = (input.errorMessage ?? '').trim()
    if (!errorMessage)
      return null
    await this.ensureLoaded()

    const now = this.now()
    const key = `${input.source}|${normalizeErrorMessage(errorMessage)}`
    const rule = matchRule(errorMessage, input.toolName, input.source)

    let record = this.state.records[key]
    if (!record || now - record.lastSeen > this.windowMs) {
      record = { key, source: input.source, count: 1, firstSeen: now, lastSeen: now, ruleId: rule?.id ?? null }
    }
    else {
      record.count += 1
      record.lastSeen = now
      if (rule)
        record.ruleId = rule.id
    }
    this.state.records[key] = record
    await this.persist()

    if (!rule || record.count < this.threshold)
      return null
    // 冷却检查：同一规则上次触发未过冷却期则不再触发
    const lastAt = this.state.lastGuidanceAt[rule.id]
    if (lastAt !== undefined && now - lastAt < this.cooldownMs)
      return null
    this.state.lastGuidanceAt[rule.id] = now
    await this.persist()
    return { rule, key, count: record.count }
  }

  /** 清空计数记忆（设置页「清空失败记忆」） */
  async reset(): Promise<void> {
    this.state = { records: {}, lastGuidanceAt: {} }
    await this.persist()
  }

  /** 全部失败记录（供统计/展示） */
  async getRecords(): Promise<FailureRecord[]> {
    await this.ensureLoaded()
    return Object.values(this.state.records)
      .sort((a, b) => b.lastSeen - a.lastSeen)
  }

  /** 各规则最近触发指导的时间戳（ruleId → epoch ms；调试/设置页展示用） */
  async getLastGuidanceAt(): Promise<Record<string, number>> {
    await this.ensureLoaded()
    return { ...this.state.lastGuidanceAt }
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded)
      return
    try {
      const raw = await readFile(this.file, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<PersistedState> | null
      this.state = {
        records: (parsed?.records && typeof parsed.records === 'object') ? parsed.records : {},
        lastGuidanceAt: (parsed?.lastGuidanceAt && typeof parsed.lastGuidanceAt === 'object') ? parsed.lastGuidanceAt : {},
      }
    }
    catch {
      // 首次运行或文件损坏 — 从空状态开始
    }
    this.loaded = true
  }

  private async persist(): Promise<void> {
    await mkdir(join(this.file, '..'), { recursive: true })
    await writeFile(this.file, `${JSON.stringify(this.state, null, 2)}\n`, 'utf-8')
  }
}