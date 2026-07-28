import { appendFile, mkdir, rename, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'

const MAX_LOG_SIZE = 10 * 1024 * 1024 // 10MB — 超出则轮转

export interface AuditEntry {
  timestamp: string
  taskId: string
  type: 'cli' | 'ide'
  source: string
  result: 'success' | 'failure'
  error?: string
  durationMs: number
}

/**
 * 执行层审计日志 — 每次 runTask 写入一条 jsonl。
 *
 * 单文件超过 10MB 自动轮转为 .1.jsonl（覆盖旧 .1）。
 * 写入失败不阻塞主流程（try-catch 由调用方负责）。
 * 路径：userData/executor-audit.jsonl
 */
export class AuditLog {
  private logFile: string

  constructor() {
    this.logFile = join(app.getPath('userData'), 'executor-audit.jsonl')
  }

  async append(entry: AuditEntry): Promise<void> {
    await mkdir(join(this.logFile, '..'), { recursive: true })
    // 轮转检查 — 文件超过 10MB 时重命名
    try {
      const stats = await stat(this.logFile)
      if (stats.size > MAX_LOG_SIZE) {
        await rename(this.logFile, `${this.logFile}.1`).catch(() => {})
      }
    }
    catch {
      // 文件不存在，跳过轮转
    }
    await appendFile(this.logFile, `${JSON.stringify(entry)}\n`, 'utf-8')
  }
}