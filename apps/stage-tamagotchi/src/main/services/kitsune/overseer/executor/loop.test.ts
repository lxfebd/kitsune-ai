import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createLoop } = await import('./loop')
import type { Plan, Task, TaskResult } from './planGenerator'

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

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'p1',
    status: 'running',
    tasks: [],
    title: 'test plan',
    maxConcurrency: 1,
    ...overrides,
  } as Plan
}

describe('createLoop — user-declined permission handling', () => {
  const confirmRequest = vi.fn()
  const emit = vi.fn()

  beforeEach(() => {
    confirmRequest.mockReset()
    emit.mockReset()
  })

  /** 权限需要确认，但用户拒绝 → 任务不再重试、不再弹第二次确认框 */
  it('does not retry a task the user declined', async () => {
    const runner = {
      runTask: vi.fn().mockResolvedValue({ taskId: 't1', ok: false, error: '用户拒绝', durationMs: 0 } as TaskResult),
    }
    const permission = {
      needsConfirm: vi.fn(() => true),
      addToWhitelist: vi.fn(),
      isHighRisk: vi.fn(() => false),
    }
    confirmRequest.mockResolvedValue({ approved: false, addToWhitelist: false })

    const loop = createLoop({
      runner,
      permission,
      checkAcceptance: async () => ({ ok: true }),
      emit,
      confirmRequest,
      killRunningTask: vi.fn(),
      onTaskCompleted: async () => {},
      onPlanCompleted: async () => {},
      onTaskFailed: async () => undefined,
    })

    await loop.runPlan(makePlan({ tasks: [makeTask()] }))

    // 用户拒绝：只请求一次确认（不重试），不再弹第 2/3 次框
    expect(confirmRequest).toHaveBeenCalledTimes(1)
    // 任务最终失败即终止，不触发 adjustPlan
    expect(runner.runTask).toHaveBeenCalledTimes(0) // confirm 拒绝后根本不执行任务
    const taskFailed = emit.mock.calls.filter(([type]) => type === 'task_failed')
    expect(taskFailed.length).toBeGreaterThanOrEqual(1)
    expect(taskFailed[0]?.[1]?.error).toBe('用户拒绝')
  })

  /** 确认通过但执行失败 → 走正常重试（不在此处拦截）。
   *  重试间 sleep 为真实定时器（2s+4s），需放大用例超时 */
  it('still retries when the runner fails after approval', async () => {
    const runner = {
      runTask: vi.fn().mockResolvedValue({ taskId: 't1', ok: false, error: 'boom', durationMs: 10 } as TaskResult),
    }
    const permission = {
      needsConfirm: vi.fn(() => true),
      addToWhitelist: vi.fn(),
      isHighRisk: vi.fn(() => false),
    }
    confirmRequest.mockResolvedValue({ approved: true, addToWhitelist: false })

    const loop = createLoop({
      runner,
      permission,
      checkAcceptance: async () => ({ ok: true }),
      emit,
      confirmRequest,
      killRunningTask: vi.fn(),
      onTaskCompleted: async () => {},
      onPlanCompleted: async () => {},
      onTaskFailed: async () => undefined,
    })

    await loop.runPlan(makePlan({ tasks: [makeTask()] }))

    // 确认通过 + 执行失败 → 重试 3 次，每次重新请求一次确认（这是原语义，保留）
    expect(confirmRequest).toHaveBeenCalledTimes(3)
    expect(runner.runTask).toHaveBeenCalledTimes(3)
  }, 20_000)
})

describe('createLoop — 事件载荷结果截断 (E1)', () => {
  const emit = vi.fn()

  beforeEach(() => {
    emit.mockReset()
  })

  it('大 output（screenshot base64）在 task_completed 事件中被截断', async () => {
    const bigDataUrl = `data:image/png;base64,${'A'.repeat(50_000)}`
    const runner = {
      runTask: vi.fn().mockResolvedValue({ taskId: 't1', ok: true, output: bigDataUrl, durationMs: 10 } as TaskResult),
    }
    const permission = { needsConfirm: vi.fn(() => false), addToWhitelist: vi.fn(), isHighRisk: vi.fn(() => false) }

    const loop = createLoop({
      runner,
      permission,
      checkAcceptance: async () => ({ ok: true }),
      emit,
      confirmRequest: vi.fn(),
      killRunningTask: vi.fn(),
      onTaskCompleted: vi.fn(),
      onPlanCompleted: vi.fn(),
      onTaskFailed: async () => undefined,
    })

    await loop.runPlan(makePlan({ tasks: [makeTask()] }))

    const completed = emit.mock.calls.find(([type]) => type === 'task_completed')
    expect(completed).toBeDefined()
    const emittedResult = completed![1]!.result as TaskResult
    expect(emittedResult.output!.length).toBeLessThanOrEqual(2_100)
    expect(emittedResult.output).toContain('[output truncated')
  })

  it('正常小 output 原样透传（不截断）', async () => {
    const runner = {
      runTask: vi.fn().mockResolvedValue({ taskId: 't1', ok: true, output: 'all good', durationMs: 10 } as TaskResult),
    }
    const permission = { needsConfirm: vi.fn(() => false), addToWhitelist: vi.fn(), isHighRisk: vi.fn(() => false) }

    const loop = createLoop({
      runner,
      permission,
      checkAcceptance: async () => ({ ok: true }),
      emit,
      confirmRequest: vi.fn(),
      killRunningTask: vi.fn(),
      onTaskCompleted: vi.fn(),
      onPlanCompleted: vi.fn(),
      onTaskFailed: async () => undefined,
    })

    await loop.runPlan(makePlan({ tasks: [makeTask()] }))

    const completed = emit.mock.calls.find(([type]) => type === 'task_completed')
    expect((completed![1]!.result as TaskResult).output).toBe('all good')
  })
})