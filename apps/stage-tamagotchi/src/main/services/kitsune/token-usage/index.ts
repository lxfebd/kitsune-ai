import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { UsageRecord, UsageSnapshot } from '../../../../shared/eventa'

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'

import { electronUsageChanged, electronUsageSnapshot } from '../../../../shared/eventa'
import { getElectronMainDirname } from '../../../libs/electron/location'

type MainContext = ReturnType<typeof createContext>['context']

const log = useLogg('main/token-usage').useGlobalConfig()

// 只保留最近 30 天的明细，避免 usage.json 无限增长
const KEEP_DAYS = 30

function usageDir(): string {
  return join(getElectronMainDirname(), '..', '..', '..', '..', 'apps', 'stage-tamagotchi', 'storage', 'usage')
}

function usageFilePath(): string {
  return join(usageDir(), 'usage.json')
}

function todayKey(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export interface TokenUsageService {
  record: (usage: Omit<UsageRecord, 'promptTokens' | 'completionTokens'> & { promptTokens?: number, completionTokens?: number }) => void
  snapshot: () => UsageSnapshot
  dispose: () => void
}

export function createTokenUsageService(params: { context: MainContext }): TokenUsageService {
  const { context } = params

  // 内存态：dayKey → 当日累计
  let byDay = new Map<string, { requests: number, promptTokens: number, completionTokens: number }>()
  let lastModel: string | undefined

  function recomputeTotals() {
    let requests = 0
    let promptTokens = 0
    let completionTokens = 0
    for (const day of byDay.values()) {
      requests += day.requests
      promptTokens += day.promptTokens
      completionTokens += day.completionTokens
    }
    return { requests, promptTokens, completionTokens, totalTokens: promptTokens + completionTokens }
  }

  function buildSnapshot(): UsageSnapshot {
    const days = [...byDay.entries()]
      .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
      .map(([date, v]) => ({
        date,
        requests: v.requests,
        promptTokens: v.promptTokens,
        completionTokens: v.completionTokens,
        totalTokens: v.promptTokens + v.completionTokens,
      }))
    const today = days.find(d => d.date === todayKey())
    const todayStats = today ?? { date: todayKey(), requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    return {
      today: todayStats,
      recentDays: days.filter(d => d.date !== todayKey()).slice(0, 7),
      total: recomputeTotals(),
      lastModel: lastModel,
    }
  }

  async function persist() {
    try {
      await mkdir(usageDir(), { recursive: true })
      const payload = {
        updatedAt: Date.now(),
        days: [...byDay.entries()].map(([date, v]) => ({ date, ...v })),
      }
      await writeFile(usageFilePath(), JSON.stringify(payload, null, 2), 'utf-8')
    }
    catch (e) {
      log.warn('usage persist failed', { error: String(e) })
    }
  }

  async function load() {
    try {
      const raw = await readFile(usageFilePath(), 'utf-8')
      const parsed = JSON.parse(raw) as { days?: Array<{ date: string, requests: number, promptTokens: number, completionTokens: number }> }
      const days = parsed.days ?? []
      // 清理超出保留期 / 结构非法的记录
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - KEEP_DAYS)
      const cutoffKey = cutoff.toISOString().slice(0, 10)
      for (const d of days) {
        if (!d?.date || typeof d.requests !== 'number' || d.date < cutoffKey)
          continue
        byDay.set(d.date, {
          requests: d.requests,
          promptTokens: d.promptTokens ?? 0,
          completionTokens: d.completionTokens ?? 0,
        })
      }
    }
    catch {
      // 文件不存在或损坏 — 从空统计开始
      byDay = new Map()
    }
  }

  function emit() {
    const snapshot = buildSnapshot()
    context.emit(electronUsageChanged, snapshot)
    return snapshot
  }

  function record(usage: Omit<UsageRecord, 'promptTokens' | 'completionTokens'> & { promptTokens?: number, completionTokens?: number }) {
    const key = todayKey()
    const entry = byDay.get(key) ?? { requests: 0, promptTokens: 0, completionTokens: 0 }
    entry.requests += 1
    entry.promptTokens += Math.max(0, usage.promptTokens ?? 0)
    entry.completionTokens += Math.max(0, usage.completionTokens ?? 0)
    byDay.set(key, entry)
    if (usage.model)
      lastModel = usage.model
    // 落盘（异步，不阻塞业务）
    void persist()
    emit()
  }

  defineInvokeHandler(context, electronUsageSnapshot, async () => buildSnapshot())

  // 启动时加载历史，然后广播一次给订阅方
  void load().then(() => {
    emit()
  })

  log.log('token usage service started')

  return {
    record,
    snapshot: buildSnapshot,
    dispose: () => {
      byDay.clear()
    },
  }
}