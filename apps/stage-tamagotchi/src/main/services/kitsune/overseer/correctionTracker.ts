/**
 * 任务修正次数追踪 — 防止推送 → 校验失败 → 修正 → 再推送 死循环。
 *
 * 按 taskId 计数，跨任务不累计。达到上限后任务状态置 needs_manual，
 * Overseer 服务据此推送桌宠「请人工介入」并停止继续修正。
 */

/** 单个任务的最大修正次数，超出即转人工 */
export const MAX_CORRECTIONS = 3

export type CorrectionState = 'active' | 'needs_manual'

interface TrackEntry {
  count: number
  state: CorrectionState
  lastReason: string
  updatedAt: number
}

export class CorrectionTracker {
  private tasks = new Map<string, TrackEntry>()

  /** 增加修正计数，返回当前次数；达到上限时自动转 needs_manual */
  increment(taskId: string, reason = ''): number {
    const entry = this.tasks.get(taskId) ?? {
      count: 0,
      state: 'active' as CorrectionState,
      lastReason: '',
      updatedAt: Date.now(),
    }
    entry.count += 1
    entry.lastReason = reason
    entry.updatedAt = Date.now()
    if (entry.count >= MAX_CORRECTIONS)
      entry.state = 'needs_manual'
    this.tasks.set(taskId, entry)
    return entry.count
  }

  /** 是否已达修正上限（isExhausted 后不应再触发自动修正） */
  isExhausted(taskId: string): boolean {
    const entry = this.tasks.get(taskId)
    if (!entry)
      return false
    return entry.count >= MAX_CORRECTIONS || entry.state === 'needs_manual'
  }

  /** 强制标记为需要人工介入，不论当前计数 */
  markNeedsManual(taskId: string, reason = ''): void {
    const entry = this.tasks.get(taskId) ?? {
      count: 0,
      state: 'active' as CorrectionState,
      lastReason: '',
      updatedAt: Date.now(),
    }
    entry.state = 'needs_manual'
    entry.lastReason = reason
    entry.updatedAt = Date.now()
    this.tasks.set(taskId, entry)
  }

  getState(taskId: string): CorrectionState {
    return this.tasks.get(taskId)?.state ?? 'active'
  }

  getCount(taskId: string): number {
    return this.tasks.get(taskId)?.count ?? 0
  }

  /** 任务终态后清理，避免 Map 无限增长 */
  reset(taskId: string): void {
    this.tasks.delete(taskId)
  }

  clear(): void {
    this.tasks.clear()
  }
}
