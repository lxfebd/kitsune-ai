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
  let logsDir = options.logsDir
  if (!logsDir) {
    // Lazy import — avoids requiring electron in unit tests that pass logsDir explicitly.
    const { app } = await import('electron')
    logsDir = join(app.getPath('userData'), 'logs')
  }
  await mkdir(logsDir, { recursive: true })
  await cleanupOldLogs(logsDir, retentionDays)

  let currentDate = formatDate(new Date())
  let fileHandle = await open(join(logsDir, buildLogFileName(currentDate)), 'a')

  async function rotateIfNeeded(): Promise<void> {
    const today = formatDate(new Date())
    if (today === currentDate)
      return
    currentDate = today
    await fileHandle.close().catch(() => {})
    fileHandle = await open(join(logsDir, buildLogFileName(currentDate)), 'a')
    await cleanupOldLogs(logsDir, retentionDays)
  }

  function write(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[minLevel])
      return
    const line = formatLogLine(level, message, fields)
    try { console.log(line) } catch { /* EPIPE when pipe closes */ }
    void rotateIfNeeded().then(() => fileHandle.appendFile(`${line}\n`).catch(() => {}))
  }

  return {
    debug: (m, f) => write('DEBUG', m, f),
    info: (m, f) => write('INFO', m, f),
    warn: (m, f) => write('WARN', m, f),
    error: (m, f) => write('ERROR', m, f),
    close: async () => { await fileHandle.close().catch(() => {}) },
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
