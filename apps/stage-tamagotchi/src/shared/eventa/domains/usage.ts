// Domain: usage — LLM token 消耗统计（桌宠侧累积）
import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

export interface UsageDayStats {
  /** 本地日期 key，格式 YYYY-MM-DD */
  date: string
  /** 当天请求次数 */
  requests: number
  /** 当天输入 token 累计 */
  promptTokens: number
  /** 当天输出 token 累计 */
  completionTokens: number
  /** 当天总 token（输入+输出） */
  totalTokens: number
}

export interface UsageSnapshot {
  /** 今日统计 */
  today: UsageDayStats
  /** 今日前 N 天（不含今天），新到旧 */
  recentDays: UsageDayStats[]
  /** 累计统计 */
  total: { requests: number, promptTokens: number, completionTokens: number, totalTokens: number }
  /** 最近一次上报的模型名（如有） */
  lastModel?: string
}

export interface UsageRecord {
  model?: string
  promptTokens: number
  completionTokens: number
  timestamp: number
}

export const electronUsageSnapshot = defineInvokeEventa<UsageSnapshot>('eventa:invoke:electron:usage:snapshot')
export const electronUsageChanged = defineEventa<UsageSnapshot>('eventa:event:electron:usage:changed')
