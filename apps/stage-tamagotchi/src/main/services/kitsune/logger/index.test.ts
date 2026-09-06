import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  buildLogFileName,
  cleanupOldLogs,
  createFileLogger,
  formatDate,
  formatLogLine,
  formatTimestamp,
} from './index'

describe('formatDate', () => {
  it('formats as YYYY-MM-DD with zero-padding', () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('formats double-digit month and day without extra padding', () => {
    expect(formatDate(new Date(2026, 10, 15))).toBe('2026-11-15')
  })
})

describe('formatTimestamp', () => {
  it('formats as YYYY-MM-DD HH:mm:ss.SSS', () => {
    expect(formatTimestamp(new Date(2026, 6, 8, 14, 30, 5, 123))).toBe('2026-07-08 14:30:05.123')
  })
})

describe('formatLogLine', () => {
  it('formats level and message without fields', () => {
    const line = formatLogLine('DEBUG', '[connectors] event')
    expect(line).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\] \[DEBUG\] \[connectors\] event$/)
  })

  it('appends fields as JSON when provided', () => {
    const line = formatLogLine('INFO', '[overseer] event', { eventId: 'evt-1' })
    expect(line).toContain('[INFO] [overseer] event {"eventId":"evt-1"}')
  })

  it('omits fields section when fields object is empty', () => {
    const line = formatLogLine('WARN', '[loop] retry', {})
    expect(line).not.toContain('{')
  })
})

describe('buildLogFileName', () => {
  it('builds main-YYYY-MM-DD.log', () => {
    expect(buildLogFileName('2026-07-08')).toBe('main-2026-07-08.log')
  })
})

describe('cleanupOldLogs', () => {
  let dir: string

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'kitsune-log-'))
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('deletes files older than retentionDays and keeps recent', async () => {
    // 2026-07-08 as the "current" date
    const now = new Date(2026, 6, 8)
    await writeFile(join(dir, 'main-2026-06-28.log'), 'old') // 10 days old — delete
    await writeFile(join(dir, 'main-2026-07-05.log'), 'recent') // 3 days old — keep
    await writeFile(join(dir, 'main-2026-07-08.log'), 'today') // today — keep
    await writeFile(join(dir, 'other.log'), 'other') // non-matching — keep

    const deleted = await cleanupOldLogs(dir, 7, now)
    expect(deleted).toEqual(['main-2026-06-28.log'])
    const remaining = (await readdir(dir)).sort()
    expect(remaining).toEqual(['main-2026-07-05.log', 'main-2026-07-08.log', 'other.log'])
  })

  it('returns empty array when no matching files exist', async () => {
    const cleanDir = await mkdtemp(join(tmpdir(), 'kitsune-empty-'))
    try {
      const deleted = await cleanupOldLogs(cleanDir, 7)
      expect(deleted).toEqual([])
    }
    finally {
      await rm(cleanDir, { recursive: true, force: true })
    }
  })
})

describe('createFileLogger', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'kitsune-log-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('writes structured log lines to main-YYYY-MM-DD.log', async () => {
    const logger = await createFileLogger({ logsDir: dir })
    logger.debug('[connectors] event', { eventId: 'evt-1', node: 'peer-1', action: 'task:result', result: true })
    // write() is fire-and-forget — wait for async file append to complete
    await new Promise(resolve => setTimeout(resolve, 150))
    await logger.close()

    const files = await readdir(dir)
    const logFile = files.find(f => f.startsWith('main-') && f.endsWith('.log'))
    expect(logFile).toBeTruthy()
    const content = await readFile(join(dir, logFile!), 'utf-8')
    expect(content).toContain('[DEBUG] [connectors] event')
    expect(content).toContain('"eventId":"evt-1"')
    expect(content).toContain('"node":"peer-1"')
  })

  it('filters out logs below minLevel', async () => {
    const logger = await createFileLogger({ logsDir: dir, minLevel: 'WARN' })
    logger.debug('[test] hidden')
    logger.warn('[test] visible')
    await new Promise(resolve => setTimeout(resolve, 150))
    await logger.close()

    const files = await readdir(dir)
    const logFile = files.find(f => f.startsWith('main-'))!
    const content = await readFile(join(dir, logFile), 'utf-8')
    expect(content).not.toContain('hidden')
    expect(content).toContain('visible')
  })

  it('cleans up old log files on initialization', async () => {
    // Seed an old file that should be deleted on init (7-day retention)
    const oldDate = new Date(Date.now() - 10 * 86_400_000)
    const oldName = buildLogFileName(formatDate(oldDate))
    await writeFile(join(dir, oldName), 'stale')
    await createFileLogger({ logsDir: dir })
    const remaining = await readdir(dir)
    expect(remaining).not.toContain(oldName)
  })
})
