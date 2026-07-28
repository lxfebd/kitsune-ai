import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 先 mock app.getPath 返回临时目录
vi.mock('electron', () => ({
  app: {
    getPath: () => testLogDir,
  },
}))

let testLogDir = ''

describe('AuditLog', () => {
  beforeEach(async () => {
    testLogDir = mkdtempSync(join(tmpdir(), 'audit-log-test-'))
  })

  afterEach(() => {
    rmSync(testLogDir, { recursive: true, force: true })
  })

  it('writes a jsonl entry', async () => {
    const { AuditLog } = await import('./auditLog')
    const log = new AuditLog()
    await log.append({
      timestamp: '2026-01-01T00:00:00.000Z',
      taskId: 'task-1',
      type: 'cli',
      source: 'claude',
      result: 'success',
      durationMs: 1000,
    })

    const content = readFileSync(join(testLogDir, 'executor-audit.jsonl'), 'utf-8')
    const lines = content.trim().split('\n')
    expect(lines).toHaveLength(1)
    const parsed = JSON.parse(lines[0])
    expect(parsed.taskId).toBe('task-1')
    expect(parsed.result).toBe('success')
    expect(parsed.type).toBe('cli')
    expect(parsed.durationMs).toBe(1000)
  })

  it('appends multiple entries', async () => {
    const { AuditLog } = await import('./auditLog')
    const log = new AuditLog()
    await log.append({ timestamp: '2026-01-01T00:00:00.000Z', taskId: 't1', type: 'cli', source: 'claude', result: 'success', durationMs: 100 })
    await log.append({ timestamp: '2026-01-01T00:00:01.000Z', taskId: 't2', type: 'ide', source: 'trae', result: 'failure', error: 'timeout', durationMs: 5000 })

    const content = readFileSync(join(testLogDir, 'executor-audit.jsonl'), 'utf-8')
    const lines = content.trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]).taskId).toBe('t1')
    expect(JSON.parse(lines[1]).taskId).toBe('t2')
    expect(JSON.parse(lines[1]).error).toBe('timeout')
  })

  it('includes error field when present', async () => {
    const { AuditLog } = await import('./auditLog')
    const log = new AuditLog()
    await log.append({
      timestamp: '2026-01-01T00:00:00.000Z',
      taskId: 't-err',
      type: 'cli',
      source: 'codex',
      result: 'failure',
      error: 'LLM HTTP 500',
      durationMs: 30000,
    })

    const content = readFileSync(join(testLogDir, 'executor-audit.jsonl'), 'utf-8')
    const parsed = JSON.parse(content.trim())
    expect(parsed.error).toBe('LLM HTTP 500')
  })
})