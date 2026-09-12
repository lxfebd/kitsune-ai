/**
 * ZCodeMonitor 单测 — 聚焦 transcript 活动提取与失败信号。
 * 通过 agentsRoot 注入临时会话目录，模拟 ~/.zcode/cli/agents 的真实布局。
 * 注意：_check() 首次调用建立 tail 基线，需追加数据后再检查才能读到增量。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { appendFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ZCodeMonitor } from './zcodeMonitor'

describe('ZCodeMonitor', () => {
  let root
  let agentsRoot
  let bus
  let monitor
  let transcriptFile

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms))
  }

  function writeLines(lines) {
    writeFileSync(transcriptFile, lines.map(l => JSON.stringify(l)).join('\n') + '\n')
  }

  function appendLines(lines) {
    appendFileSync(transcriptFile, lines.map(l => JSON.stringify(l)).join('\n') + '\n')
  }

  function setupTranscript() {
    const sessDir = join(agentsRoot, 'sess_test-0000')
    const agentDir = join(sessDir, 'agent_test-0000')
    mkdirSync(agentDir, { recursive: true })
    writeFileSync(join(agentDir, 'metadata.json'), JSON.stringify({ cwd: 'C:\\work\\demo' }))
    const file = join(agentDir, 'transcript.jsonl')
    writeFileSync(file, '')
    transcriptFile = file
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'zcode-mon-'))
    agentsRoot = join(root, 'agents')
    const logRoot = join(root, 'log')
    const rolloutRoot = join(root, 'rollout')
    mkdirSync(agentsRoot, { recursive: true })
    mkdirSync(logRoot, { recursive: true })
    mkdirSync(rolloutRoot, { recursive: true })
    bus = { publish: () => {}, subscribe: () => {} }
    monitor = new ZCodeMonitor({
      bus,
      pollInterval: 60000,
      watchMode: false,
      agentsRoot,
      logRoot,
      rolloutRoot,
      logger: { info: () => {}, error: () => {}, log: () => {} },
    })
    setupTranscript()
  })

  afterEach(() => {
    monitor.stop()
    rmSync(root, { recursive: true, force: true })
  })

  it('从 tool_call_scheduled 提取 lastToolCall / currentTask', async () => {
    writeLines([{ id: '1', type: 'model_streaming', timestamp: '2026-09-07T10:00:00Z' }])
    await monitor._check() // 建立基线
    await sleep(10)
    appendLines([
      { id: '2', type: 'tool_call_scheduled', payload: { toolName: 'Bash' }, timestamp: '2026-09-07T10:00:01Z' },
      { id: '3', type: 'tool_batch_complete', payload: { successCount: 1, errorCount: 0 }, timestamp: '2026-09-07T10:00:02Z' },
    ])
    await monitor._check()
    const status = monitor.getStatus()
    expect(status.isRunning).toBe(true)
    expect(status.activity).toBe('completed')
    expect(status.lastToolCall).toBe('Bash')
    expect(status.currentTask).toBe('工具调用: Bash')
  })

  it('errorCount>0 的批次置 hasError 并映射 activity=error', async () => {
    writeLines([{ id: '1', type: 'model_streaming', timestamp: '2026-09-07T10:00:00Z' }])
    await monitor._check() // 建立基线
    await sleep(10)
    appendLines([
      { id: '2', type: 'tool_call_scheduled', payload: { toolName: 'Edit' }, timestamp: '2026-09-07T10:00:01Z' },
      { id: '3', type: 'tool_batch_complete', payload: { successCount: 0, errorCount: 1 }, timestamp: '2026-09-07T10:00:02Z' },
    ])
    await monitor._check()
    const status = monitor.getStatus()
    expect(status.hasError).toBe(true)
    expect(status.activity).toBe('error')
    expect(status.errorMessage).toContain('errorCount=1')
    expect(status.lastToolCall).toBe('Edit')
  })

  it('agents 根目录不存在时上报 idle', async () => {
    // 清空 agentsRoot，模拟 ZCode 从未安装/无会话
    rmSync(agentsRoot, { recursive: true, force: true })
    await monitor._check()
    const status = monitor.getStatus()
    expect(status.isRunning).toBe(false)
    expect(status.activity).toBe('idle')
    expect(status.detectSignal).toBe('none')
  })

  it('运行日志 tool.call.started 驱动活动（主信号源，实时工具级）', async () => {
    // 注入今天的日志文件（文件名用本地日期，与实现一致），含工具调用事件；transcript 不动
    const now = new Date()
    const pad = n => String(n).padStart(2, '0')
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    const logFile = join(monitor.logRoot, `zcode-${today}.jsonl`)
    writeFileSync(logFile, [
      JSON.stringify({ timestamp: '2026-09-09T10:00:00Z', event: 'tool.call.started', level: 'info', sessionId: 'sess_x', context: { toolName: 'Edit' } }),
    ].join('\n') + '\n')
    await monitor._check()
    const status = monitor.getStatus()
    expect(status.isRunning).toBe(true)
    expect(status.activity).toBe('executing')
    expect(status.lastToolCall).toBe('Edit')
    expect(status.currentTask).toBe('工具调用: Edit')
  })

  it('运行日志 tool.call.failed 映射 error 状态', async () => {
    const now = new Date()
    const pad = n => String(n).padStart(2, '0')
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    const logFile = join(monitor.logRoot, `zcode-${today}.jsonl`)
    writeFileSync(logFile, [
      JSON.stringify({ timestamp: '2026-09-09T10:00:00Z', event: 'tool.call.failed', level: 'error', sessionId: 'sess_x', status: 'failed', context: { toolName: 'Bash' } }),
    ].join('\n') + '\n')
    await monitor._check()
    const status = monitor.getStatus()
    expect(status.isRunning).toBe(true)
    expect(status.hasError).toBe(true)
    expect(status.activity).toBe('error')
  })

  it('运行日志 tool.call.failed 携带真实错误消息进 errorMessage', async () => {
    const now = new Date()
    const pad = n => String(n).padStart(2, '0')
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    const logFile = join(monitor.logRoot, `zcode-${today}.jsonl`)
    writeFileSync(logFile, [
      JSON.stringify({ timestamp: '2026-09-09T10:00:00Z', event: 'tool.call.failed', level: 'error', sessionId: 'sess_x', status: 'failed', context: { toolName: 'Edit' }, error: { name: 'Error', message: 'File has not been read yet. Read it first before writing to it.', code: 'TOOL_EXECUTION_FAILED' } }),
    ].join('\n') + '\n')
    await monitor._check()
    const status = monitor.getStatus()
    expect(status.isRunning).toBe(true)
    expect(status.hasError).toBe(true)
    expect(status.activity).toBe('error')
    expect(status.errorMessage).toContain('File has not been read yet')
  })
})