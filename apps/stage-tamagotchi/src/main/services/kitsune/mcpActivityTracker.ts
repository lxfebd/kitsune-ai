/**
 * mcpActivityTracker — MCP 活动上报驱动的「工具运行状态」表
 *
 * ── 为什么需要它 ──
 * 监工模式的 UI「运行中/空闲」徽标原本只由文件/进程嗅探监控器
 * （supervisor.getStatus()[toolId].isRunning）驱动。已接入 MCP 的 agent
 * （trae / workbuddy 等）上报的 pet_report 只进入了事件流，从不更新该状态，
 * 导致「MCP 已连通且正在干活」的工具在 UI 上仍显示空闲。
 *
 * 本模块维护一张来源 → 最近活动时间戳 + 活动归一值 的纯表：
 *   - 记录非终止活动（thinking/executing/coding/building/testing/completed/code_changed…）
 *   - idle / stopped 被视为「明确停止」，清除该来源的记录
 *   - 超过 TTL（默认对齐 zcodeMonitor 的 180s 窗口）视为过期，状态回落空闲
 *
 * 本模块不依赖 SDK / electron / 端口，可单测。
 */

/** 活动窗口：与文件嗅探监控器的判断窗口对齐（zcodeMonitor = 180s） */
export const MCP_ACTIVITY_TTL_MS = 3 * 60_000

export interface McpActivityEntry {
  /** 最近一次上报时间戳 */
  lastActiveAt: number
  /** 归一化活动值（activityStates STATE 之一） */
  activity: string
}

/** 明确让工具回到空闲的终止活动 */
const STOP_ACTIVITIES = new Set(['idle', 'stopped'])

/**
 * MCP 活动表。纯内存、按来源索引，methods 均为纯函数（可注入 clock 以便测试）。
 */
export class McpActivityTracker {
  private readonly entries = new Map<string, McpActivityEntry>()
  private readonly ttlMs: number
  private readonly now: () => number

  constructor(options: { ttlMs?: number, now?: () => number } = {}) {
    this.ttlMs = options.ttlMs ?? MCP_ACTIVITY_TTL_MS
    this.now = options.now ?? Date.now
  }

  /**
   * 记录一次活动上报。idle/stopped 视为明确停止 → 清除记录。
   * 其余活动更新（或新建）最近活动时间戳。
   */
  touch(source: string, activity: string, at: number = this.now()): void {
    if (STOP_ACTIVITIES.has(activity)) {
      this.entries.delete(source)
      return
    }
    this.entries.set(source, { lastActiveAt: at, activity })
  }

  /**
   * 是否有窗口内的活动。过期条目会被惰性清理。
   * @returns true = 该来源在 TTL 内有非终止活动（UI 显示「运行中」）
   */
  isActive(source: string): boolean {
    const entry = this.entries.get(source)
    if (!entry)
      return false
    if (this.now() - entry.lastActiveAt >= this.ttlMs) {
      this.entries.delete(source)
      return false
    }
    return true
  }

  /** 来源数（供测试断言） */
  get size(): number {
    return this.entries.size
  }

  clear(): void {
    this.entries.clear()
  }
}