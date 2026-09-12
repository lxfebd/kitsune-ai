import { describe, expect, it, vi } from 'vitest'

import type { ExecutorToolInvokers } from './executor-tools'

import { installStrictToolSchemaMatchers } from '../testing/strict-tool-schema'
import {
  executorTools,
  planExecutorTask,
  queryExecutorStatus,
  runExecutorPlan,
  stopExecutorRun,
  delegateCoordinatorTask,
  queryCoordinatorTeam,
} from './executor-tools'

installStrictToolSchemaMatchers()

function createMockInvokers(): ExecutorToolInvokers {
  return {
    generate: vi.fn(),
    run: vi.fn(),
    stop: vi.fn(),
    status: vi.fn(),
    coordinatorSubmit: vi.fn(),
    coordinatorTeam: vi.fn(),
  }
}

describe('executorTools factory', () => {
  it('exposes the six executor/coordinator tools with provider-safe names', async () => {
    const tools = await executorTools()
    expect(tools.map(tool => tool.function.name)).toEqual([
      'executor_plan',
      'executor_run',
      'executor_stop',
      'executor_status',
      'coordinator_delegate',
      'coordinator_team',
    ])
  })

  it('keeps every tool schema provider-strict (required keys + additionalProperties:false)', async () => {
    const tools = await executorTools()
    expect(tools).toSatisfyStrictToolSchemas()
  })
})

describe('planExecutorTask (executor_plan)', () => {
  it('trims the requirement and defaults cwd to empty (main process resolves it)', async () => {
    const invokers = createMockInvokers()
    vi.mocked(invokers.generate).mockResolvedValue({ ok: true })

    await planExecutorTask({ requirement: '  按需求生成计划  ', cwd: null }, { invokers })

    expect(invokers.generate).toHaveBeenCalledWith({ requirement: '按需求生成计划', cwd: '' })
  })

  it('forwards an explicit cwd', async () => {
    const invokers = createMockInvokers()
    vi.mocked(invokers.generate).mockResolvedValue({ ok: true })

    await planExecutorTask({ requirement: 'fix tests', cwd: ' J:/repo ' }, { invokers })

    expect(invokers.generate).toHaveBeenCalledWith({ requirement: 'fix tests', cwd: 'J:/repo' })
  })
})

describe('runExecutorPlan (executor_run)', () => {
  it('passes the plan through unchanged when waitForCompletion is false', async () => {
    const invokers = createMockInvokers()
    const plan = { id: 'p1', tasks: [{ id: 't1', title: 'run tests', type: 'cli' }] }
    vi.mocked(invokers.run).mockResolvedValue({ ok: true })

    await runExecutorPlan({ plan: plan as never, waitForCompletion: false }, { invokers })

    expect(invokers.run).toHaveBeenCalledWith({ plan })
    expect(invokers.status).not.toHaveBeenCalled()
  })

  it('returns immediately when waitForCompletion is false', async () => {
    const invokers = createMockInvokers()
    const plan = { id: 'p1', tasks: [] }
    vi.mocked(invokers.run).mockResolvedValue({ ok: true })

    const result = await runExecutorPlan({ plan: plan as never, waitForCompletion: false }, { invokers })

    expect(result).toMatchObject({ ok: true, accepted: true })
  })

  it('polls status until the plan completes and returns the final status', async () => {
    const invokers = createMockInvokers()
    const plan = { id: 'p1', tasks: [] }
    vi.mocked(invokers.run).mockResolvedValue({ ok: true })
    vi.mocked(invokers.status)
      .mockResolvedValueOnce({ plan: { ...plan, status: 'running' }, isRunning: true, currentTaskId: null, currentTaskAttempt: 0 } as never)
      .mockResolvedValueOnce({ plan: { ...plan, status: 'completed' }, isRunning: false, currentTaskId: null, currentTaskAttempt: 0 } as never)

    const result = await runExecutorPlan({ plan: plan as never }, { invokers })

    expect(result).toMatchObject({ ok: true, accepted: true, done: true })
    expect(invokers.status).toHaveBeenCalledTimes(2)
  })

  it('treats an aborted plan as settled', async () => {
    const invokers = createMockInvokers()
    const plan = { id: 'p1', tasks: [] }
    vi.mocked(invokers.run).mockResolvedValue({ ok: true })
    vi.mocked(invokers.status).mockResolvedValueOnce({ plan: { ...plan, status: 'aborted' }, isRunning: false, currentTaskId: null, currentTaskAttempt: 0 } as never)

    const result = await runExecutorPlan({ plan: plan as never }, { invokers })

    expect(result).toMatchObject({ ok: true, accepted: true, done: true })
  })

  it('surfaces a rejected plan without polling', async () => {
    const invokers = createMockInvokers()
    vi.mocked(invokers.run).mockResolvedValue({ ok: false, error: 'plan.tasks 为空' })

    const result = await runExecutorPlan({ plan: { id: 'p1', tasks: [] } as never }, { invokers })

    expect(result).toMatchObject({ ok: false, error: 'plan.tasks 为空' })
    expect(invokers.status).not.toHaveBeenCalled()
  })
})

describe('stopExecutorRun / queryExecutorStatus', () => {
  it('forwards stop and status without arguments', async () => {
    const invokers = createMockInvokers()
    vi.mocked(invokers.stop).mockResolvedValue({ ok: true })
    vi.mocked(invokers.status).mockResolvedValue({ status: 'idle' } as never)

    await stopExecutorRun({ invokers })
    await queryExecutorStatus({ invokers })

    // defineInvoke 无参调用传零个参数（not `{}`），与 web-tools 测试一致。
    expect(invokers.stop).toHaveBeenCalledWith()
    expect(invokers.status).toHaveBeenCalledWith()
  })
})

describe('coordinator tools', () => {
  it('delegateCoordinatorTask trims requirement and forwards cwd', async () => {
    const invokers = createMockInvokers()
    vi.mocked(invokers.coordinatorSubmit).mockResolvedValue({ ok: true, plan: { id: 'p1', requirement: 'r', tasks: [], status: 'pending', createdAt: 0 } })

    const result = await delegateCoordinatorTask({ requirement: '  让 codex 改一下登录逻辑  ', cwd: null }, { invokers })

    expect(invokers.coordinatorSubmit).toHaveBeenCalledWith({ requirement: '让 codex 改一下登录逻辑', cwd: '' })
    expect(result).toMatchObject({ ok: true })
  })

  it('queryCoordinatorTeam returns the roster', async () => {
    const invokers = createMockInvokers()
    const roster = [{ id: 'claude_code', name: 'Claude Code', online: true, busy: false, dispatchable: true }]
    vi.mocked(invokers.coordinatorTeam).mockResolvedValue(roster)

    const result = await queryCoordinatorTeam({ invokers })

    expect(invokers.coordinatorTeam).toHaveBeenCalledWith()
    expect(result).toEqual(roster)
  })
})