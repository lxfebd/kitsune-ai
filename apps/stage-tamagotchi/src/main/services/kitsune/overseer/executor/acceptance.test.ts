import { describe, expect, it, vi } from 'vitest'

// acceptacne.ts 依赖 capture.ts（import electron）+ resultChecker（import node:child_process）：
// 纯函数测试不碰真实截屏 / 视觉对比，mock 掉外部副作用
vi.mock('electron', () => ({
  desktopCapturer: { getSources: vi.fn() },
}))

const { createAcceptance } = await import('./acceptance')
import type { Task, TaskResult } from './planGenerator'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    type: 'cli',
    title: 'run tests',
    provider: 'claude',
    prompt: 'run the tests',
    cwd: '/tmp/proj',
    timeoutMs: 30_000,
    critical: false,
    ...overrides,
  } as Task
}

function makeCliResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: 't1',
    ok: false,
    output: 'some build output',
    error: undefined,
    exitCode: 1,
    durationMs: 100,
    ...overrides,
  } as TaskResult
}

describe('createAcceptance — checkCli', () => {
  it('TIMEOUT 结果不被误报成「退出码非 0」', async () => {
    const { checkAcceptance } = createAcceptance({ visionCompare: vi.fn() })
    // 修复前：TIMEOUT 分支返回 exitCode: undefined → 0 !== undefined 恒真 → 误报
    const blocking = makeCliResult({ code: 'TIMEOUT', error: '命令超时 (30s)', exitCode: undefined })
    const r = await checkAcceptance(makeTask(), blocking)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('命令超时 (30s)') // 保留原超时文案，未被覆盖
  })

  it('TIMEOUT 且带 exitCode=124 时同样识别为超时（先于 exitCode 判定）', async () => {
    const { checkAcceptance } = createAcceptance({ visionCompare: vi.fn() })
    const r = await checkAcceptance(makeTask(), makeCliResult({ code: 'TIMEOUT', error: undefined }))
    expect(r.ok).toBe(false)
    expect(r.error).toBe('命令超时') // 无 error 时兜底文案
  })

  it('普通非 0 退出码仍走 exitCode 判定（语义保留）', async () => {
    const { checkAcceptance } = createAcceptance({ visionCompare: vi.fn() })
    const r = await checkAcceptance(makeTask(), makeCliResult({ exitCode: 2, error: '进程退出码: 2' }))
    expect(r.ok).toBe(false)
    expect(r.error).toBe('退出码非 0: 2')
  })

  it('exitCode=0 但输出含错误关键词 → 失败', async () => {
    const { checkAcceptance } = createAcceptance({ visionCompare: vi.fn() })
    const r = await checkAcceptance(makeTask(), makeCliResult({ ok: true, exitCode: 0, output: 'build failed with error' }))
    expect(r.ok).toBe(false)
    expect(r.error).toContain('error')
  })

  it('干净输出 → 通过', async () => {
    const { checkAcceptance } = createAcceptance({ visionCompare: vi.fn() })
    const r = await checkAcceptance(makeTask(), makeCliResult({ ok: true, exitCode: 0, output: 'all tests passed' }))
    expect(r.ok).toBe(true)
  })

  it('非 cli 任务（desktop）无校验字段 → 直接通过', async () => {
    const { checkAcceptance } = createAcceptance({ visionCompare: vi.fn() })
    const r = await checkAcceptance(makeTask({ type: 'desktop' }), makeCliResult({ ok: true }))
    expect(r.ok).toBe(true)
  })
})

describe('createAcceptance — checkIde 分支不进真实截屏', () => {
  it('ide 任务无 assertion/expectedDescription → 直接通过（不触发截屏）', async () => {
    const { checkAcceptance } = createAcceptance({ visionCompare: vi.fn() })
    const r = await checkAcceptance(
      makeTask({ type: 'ide', connectorId: 'c1', action: 'insert_code', payload: {}, }), // 无 assertion / expectedDescription
      makeCliResult({ ok: true }),
    )
    expect(r.ok).toBe(true)
  })
})