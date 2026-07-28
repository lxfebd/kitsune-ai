/**
 * 修正权限模型 — 首次修正弹窗确认，白名单内自动执行。
 *
 * 白名单 key = `source + ':' + assertion.type`，例如 `claude:compile_success`。
 * 用户在确认弹窗中勾选「此类修正自动执行」后加入白名单，后续同 key 跳过弹窗。
 *
 * 白名单持久化到 JSON 文件，进程重启后保留（修复原内存 Map 重启即丢失的问题）。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'

export interface PermissionTask {
  source?: string
  assertion?: { type: string }
}

export interface WhitelistEntry {
  /** 白名单键，格式 `${source}:${assertionType}` */
  key: string
  source: string
  assertionType: string
  createdAt: number
}

/** 由 source 与 assertion.type 拼接而成的稳定键 */
export function buildWhitelistKey(source: string, assertionType: string): string {
  return `${source}:${assertionType}`
}

function whitelistPath(): string {
  // 存放于 Electron 用户数据目录，打包后（Windows/macOS/Linux）路径稳定且可写，
  // 不再依赖主进程 bundle 目录的 4 级 .. 回溯（后者在打包产物中指向不存在的位置）。
  return join(app.getPath('userData'), 'permission-whitelist.json')
}

// NOTICE: 高风险模式 — 即使白名单内也强制二次确认
// 匹配 CLI prompt 或 IDE command 中的危险操作
// 来源：通用 shell 安全最佳实践
const HIGH_RISK_PATTERNS: RegExp[] = [
  /rm\s+-rf?\s+\//i,              // rm -rf /
  /rm\s+-rf?\s+\*|rm\s+-rf?\s+\./i, // rm -rf * 或 rm -rf .
  /git\s+push\s+--force/i,        // git push --force
  /git\s+push\s+-f\b/i,           // git push -f
  /git\s+reset\s+--hard/i,        // git reset --hard
  /DROP\s+TABLE/i,                // SQL DROP TABLE
  /DELETE\s+FROM\s+\w+\s*$/i,     // SQL DELETE FROM 无 WHERE
  /TRUNCATE\s+TABLE/i,            // SQL TRUNCATE
  /format\s+[a-z]:/i,             // Windows format
  /mkfs\./i,                       // Linux mkfs
  /\bshutdown\b|\breboot\b/i,     // 系统关机/重启
]

export class PermissionModel {
  private whitelist = new Map<string, WhitelistEntry>()

  /** 从磁盘加载已持久化的白名单（进程启动时调用一次） */
  async load(): Promise<void> {
    const raw = await readFile(whitelistPath()).catch(() => null)
    if (!raw)
      return
    try {
      const entries = JSON.parse(raw.toString('utf-8')) as WhitelistEntry[]
      for (const e of entries)
        this.whitelist.set(e.key, e)
    }
    catch {
      // 损坏的文件忽略，使用内存中的空表
    }
  }

  private async persist(): Promise<void> {
    try {
      await mkdir(join(whitelistPath(), '..'), { recursive: true })
      await writeFile(whitelistPath(), JSON.stringify([...this.whitelist.values()], null, 2), 'utf-8')
    }
    catch {
      // 持久化失败不阻塞主流程（仅内存状态可用）
    }
  }

  /** 当前任务是否需要弹窗确认；白名单内返回 false */
  needsConfirm(task: PermissionTask): boolean {
    const source = task.source
    const assertionType = task.assertion?.type
    if (!source || !assertionType)
      return true
    return !this.whitelist.has(buildWhitelistKey(source, assertionType))
  }

  /**
   * 高风险检测 — 扫描 prompt/command 中的危险操作模式。
   * 高风险操作即使白名单内也强制二次确认，且不允许加入白名单自动执行。
   */
  isHighRisk(task: { prompt?: string, command?: string, assertionType?: string }): boolean {
    const text = `${task.prompt ?? ''} ${task.command ?? ''} ${task.assertionType ?? ''}`
    return HIGH_RISK_PATTERNS.some(p => p.test(text))
  }

  addToWhitelist(source: string, assertionType: string): WhitelistEntry {
    const key = buildWhitelistKey(source, assertionType)
    const existing = this.whitelist.get(key)
    if (existing)
      return existing
    const entry: WhitelistEntry = { key, source, assertionType, createdAt: Date.now() }
    this.whitelist.set(key, entry)
    void this.persist()
    return entry
  }

  removeFromWhitelist(key: string): boolean {
    const removed = this.whitelist.delete(key)
    if (removed)
      void this.persist()
    return removed
  }

  listWhitelist(): WhitelistEntry[] {
    return [...this.whitelist.values()].sort((a, b) => b.createdAt - a.createdAt)
  }

  clearWhitelist(): number {
    const count = this.whitelist.size
    this.whitelist.clear()
    void this.persist()
    return count
  }
}
