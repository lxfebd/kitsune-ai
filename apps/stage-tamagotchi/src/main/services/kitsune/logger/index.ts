import { mkdir, readdir, unlink, open } from 'node:fs/promises'
import { join } from 'node:path'

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

export interface FileLogger {
  debug: (message: string, fields?: Record<string, unknown>) => void
  info: (message: string, fields?: Record<string, unknown>) => void
  warn: (message: string, fields?: Record<string, unknown>) => void
  error: (message: string, fields?: Record<string, unknown>) => void
  close: () => Promise<void>
}

export interface FileLoggerOptions {
  logsDir?: string
  retentionDays?: number
  minLevel?: LogLevel
}

const LEVEL_PRIORITY: Record<LogLevel, number> = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 }
const FILE_PREFIX = 'main-'
const DEFAULT_RETENTION_DAYS = 7

const noopLogger: FileLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  close: async () => {},
}

/** Formats a Date as `YYYY-MM-DD` for daily log file naming. */
export function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Formats a Date as `YYYY-MM-DD HH:mm:ss.SSS` for log line timestamps. */
export function formatTimestamp(d: Date): string {
  const date = formatDate(d)
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
  return `${date} ${time}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

/** Builds the daily log file name: `main-YYYY-MM-DD.log`. */
export function buildLogFileName(dateStr: string): string {
  return `${FILE_PREFIX}${dateStr}.log`
}

export function formatLogLine(level: LogLevel, message: string, fields?: Record<string, unknown>): string {
  const fieldsStr = fields && Object.keys(fields).length > 0 ? ` ${JSON.stringify(fields)}` : ''
  return `[${formatTimestamp(new Date())}] [${level}] ${message}${fieldsStr}`
}

/**
 * Deletes `main-*.log` files older than `retentionDays` from `logsDir`.
 *
 * @returns names of deleted files
 */
export async function cleanupOldLogs(logsDir: string, retentionDays: number, now: Date = new Date()): Promise<string[]> {
  const files = await readdir(logsDir).catch(() => [])
  const cutoff = now.getTime() - retentionDays * 86_400_000
  const deleted: string[] = []
  for (const file of files) {
    if (!file.startsWith(FILE_PREFIX) || !file.endsWith('.log'))
      continue
    const dateStr = file.slice(FILE_PREFIX.length, -4)
    const fileTime = new Date(dateStr).getTime()
    if (Number.isNaN(fileTime) || fileTime >= cutoff)
      continue
    await unlink(join(logsDir, file)).catch(() => {})
    deleted.push(file)
  }
  return deleted
}

/**
 * Creates a daily-rotating file logger.
 *
 * Log files live at `{logsDir}/main-YYYY-MM-DD.log` and rotate daily.
 * On creation and rotation, files older than `retentionDays` are deleted.
 * Each line is also echoed to console so existing console output is preserved.
 */
export async function createFileLogger(options: FileLoggerOptions = {}): Promise<FileLogger> {
  const retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS
  const minLevel = options.minLevel ?? 'DEBUG'
  let resolvedLogsDir = options.logsDir
  if (!resolvedLogsDir) {
    // Lazy import — avoids requiring electron in unit tests that pass logsDir explicitly.
    const { app } = await import('electron')
    resolvedLogsDir = join(app.getPath('userData'), 'logs')
  }
  // Bind to a const so closures below (rotateIfNeeded) keep the narrowed `string` type.
  const logsDir: string = resolvedLogsDir
  await mkdir(logsDir, { recursive: true })
  await cleanupOldLogs(logsDir, retentionDays)

  let currentDate = formatDate(new Date())
  let fileHandle = await open(join(logsDir, buildLogFileName(currentDate)), 'a')

  // 跨午夜轮转串行化：并发 write() 同日各调 rotateIfNeeded() 时避免同一把
  // fileHandle 被 close 后另一条 append 仍在上面的竞态（原实现每次直接 close+open）。
  let rotation: Promise<void> | null = null
  async function rotateIfNeeded(): Promise<void> {
    const today = formatDate(new Date())
    if (today === currentDate)
      return
    if (rotation) {
      await rotation
      return rotateIfNeeded()
    }
    rotation = (async () => {
      currentDate = today
      await fileHandle.close().catch(() => {})
      fileHandle = await open(join(logsDir, buildLogFileName(currentDate)), 'a')
      await cleanupOldLogs(logsDir, retentionDays)
    })()
    try {
      await rotation
    }
    finally {
      rotation = null
    }
  }

  // 待写计数：close() 需等在途的 appendFile 完成，避免退出时丢最后几行日志
  let pendingWrites = 0
  const flushResolvers: (() => void)[] = []
  function trackWriteDone(): void {
    pendingWrites--
    if (pendingWrites === 0) {
      const resolvers = flushResolvers.splice(0)
      for (const resolve of resolvers)
        resolve()
    }
  }

  function write(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[minLevel])
      return
    const line = formatLogLine(level, message, fields)
    try { console.log(line) } catch { /* EPIPE when pipe closes */ }
    // 同步代码路径绝不抛：内存/队列已满等情况下追加失败仅丢该行，不影响业务
    pendingWrites++
    void (async () => {
      try {
        await rotateIfNeeded()
        await fileHandle.appendFile(`${line}\n`)
      }
      catch {
        // 写盘失败静默（如磁盘满/句柄被轮转关闭），日志不应让主进程崩溃
      }
      finally {
        trackWriteDone()
      }
    })()
  }

  return {
    debug: (m, f) => write('DEBUG', m, f),
    info: (m, f) => write('INFO', m, f),
    warn: (m, f) => write('WARN', m, f),
    error: (m, f) => write('ERROR', m, f),
    close: async () => {
      if (pendingWrites > 0)
        await new Promise<void>(resolve => flushResolvers.push(resolve))
      await fileHandle.close().catch(() => {})
    },
  }
}

let singleton: FileLogger = noopLogger

/** Initializes the global file logger singleton. Call once at main process startup. */
export async function initFileLogger(options?: FileLoggerOptions): Promise<FileLogger> {
  singleton = await createFileLogger(options)
  return singleton
}

/**
 * Returns the global file logger.
 * Before {@link initFileLogger} is called, returns a no-op logger so instrumentation is safe.
 */
export function getFileLogger(): FileLogger {
  return singleton
}
