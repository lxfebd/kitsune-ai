import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Plan } from './executor/planGenerator'

import { createCoordinator } from './coordinator'
import { callLlm } from './executor/llmHelper'

// coordinator.submit 通过 callLlm 做拆解；必须 mock，否则触发真实 LLM 调用。
vi.mock('./executor/llmHelper', () => ({
  callLlm: vi.fn(),
}))

const INVENTORY = [
  { id: 'claude_code', name: 'Claude Code', binary: 'claude', personality: '代码重构', timeoutMs: 120_000 },
  { id: 'opencode', name: 'Opencode', binary: 'opencode', personality: '独立小任务', timeoutMs: 120_000 },
  { id: 'trae', name: 'Trae', binary: 'trae', personality: 'IDE 编辑', timeoutMs: 30_000 },
]

function makeDeps(overrides: Partial<Parameters<typeof createCoordinator>[0]> = {}) {
  const emit = vi.fn()
  const runPlan = vi.fn().mockResolvedValue(undefined)
  const getExecutorStatus = vi.fn(() => ({ isRunning: false, plan: null as Plan | null }))
  const deps = {
    inventory: INVENTORY,
    isAgentOnline: () => false,
    runPlan,
    getExecutorStatus,
    emit,
    ...overrides,
  }
  const coordinator = createCoordinator(deps)
  return { coordinator, deps, emit, runPlan, getExecutorStatus }
}

function mockLlmTasks(tasks: unknown[]) {
  vi.mocked(callLlm).mockResolvedValue({ ok: true, text: JSON.stringify({ tasks }) })
}

describe('createCoordinator', () => {
  beforeEach(() => {
    vi.mocked(callLlm).mockReset()
  })

  describe('submit', () => {
    it('分解需求并按画像派活（provider 校验通过）', async () => {
      mockLlmTasks([
        { title: '重构 auth', provider: 'claude_code', prompt: '重构 src/auth.ts', critical: true },
        { title: '修测试', provider: 'opencode', prompt: '重写 auth 相关测试', critical: false },
      ])
      const { coordinator, deps, emit, runPlan } = makeDeps()

      const result = await coordinator.submit('优化登录模块', '/project')

      expect(result.ok).toBe(true)
      expect(result.plan).toBeTruthy()
      expect(result.plan!.tasks).toHaveLength(2)
      expect(result.plan!.tasks[0]).toMatchObject({ type: 'cli', provider: 'claude_code', title: '重构 auth', critical: true })
      expect((result.plan!.tasks[1] as { provider: string }).provider).toBe('opencode')
      // 派活后交给 executor 执行
      expect(runPlan).toHaveBeenCalledTimes(1)
      expect(runPlan).toHaveBeenCalledWith(expect.objectContaining({ requirement: '优化登录模块' }))
      // 事件：coordination_started
      expect(emit).toHaveBeenCalledWith('coordination_started', expect.objectContaining({
        planId: result.plan!.id,
        agentCount: 2,
        taskCount: 2,
      }))
      expect(deps.getExecutorStatus).toHaveBeenCalled()
    })

    it('provider 不在清单内时回退到第一个可派发 agent，而不是静默改道 claude', async () => {
      mockLlmTasks([
        { title: '神秘任务', provider: 'not-a-real-agent', prompt: 'do it' },
      ])
      const { coordinator } = makeDeps()

      const result = await coordinator.submit('需求', '/project')

      expect(result.ok).toBe(true)
      expect((result.plan!.tasks[0] as { provider: string }).provider).toBe('claude_code')
    })

    it('执行器运行中时拒绝提交', async () => {
      const { coordinator } = makeDeps({
        getExecutorStatus: () => ({ isRunning: true, plan: null }),
      })

      const result = await coordinator.submit('需求', '/project')

      expect(result.ok).toBe(false)
      expect(result.error).toMatch(/运行中|running/i)
      expect(callLlm).not.toHaveBeenCalled()
    })

    it('LLM 返回非法 JSON 时返回错误', async () => {
      vi.mocked(callLlm).mockResolvedValue({ ok: true, text: 'not json at all' })
      const { coordinator } = makeDeps()

      const result = await coordinator.submit('需求', '/project')

      expect(result.ok).toBe(false)
      expect(result.error).toBeTruthy()
    })

    it('LLM 调用失败时返回错误', async () => {
      vi.mocked(callLlm).mockResolvedValue({ ok: false, error: 'provider down' })
      const { coordinator } = makeDeps()

      const result = await coordinator.submit('需求', '/project')

      expect(result.ok).toBe(false)
      expect(result.error).toContain('provider down')
    })

    it('tasks 为空时返回错误', async () => {
      mockLlmTasks([])
      const { coordinator } = makeDeps()

      const result = await coordinator.submit('需求', '/project')

      expect(result.ok).toBe(false)
      expect(result.error).toMatch(/空|empty/i)
    })

    it('dependsOn 支持字符串与数组，且保留 DAG 依赖', async () => {
      mockLlmTasks([
        { title: '先重构', provider: 'claude_code', prompt: 'p1' },
        { title: '后修测试', provider: 'opencode', prompt: 'p2', dependsOn: ['先重构', '其他前置'] },
      ])
      const { coordinator } = makeDeps()

      const result = await coordinator.submit('需求', '/project')

      expect(result.ok).toBe(true)
      const task = result.plan!.tasks[1]
      expect(task.dependsOn).toEqual(['先重构', '其他前置'])
    })
  })

  describe('recordDispatch + snapshot', () => {
    it('recordDispatch 后 snapshot 展示 lastOutcome 且 busy 解除', async () => {
      const online = { claude_code: true, opencode: false, trae: false }
      const { coordinator, emit } = makeDeps({
        isAgentOnline: (id: string) => Boolean(online[id as keyof typeof online]),
      })

      const before = coordinator.snapshot()
      expect(before.find(a => a.id === 'claude_code')?.online).toBe(true)
      expect(before.find(a => a.id === 'opencode')?.online).toBe(false)

      coordinator.recordDispatch({
        taskId: 't-1', title: '重构 auth', provider: 'claude_code', ok: true, at: 1000,
      })

      const after = coordinator.snapshot()
      expect(after.find(a => a.id === 'claude_code')?.lastOutcome).toMatchObject({ taskId: 't-1', ok: true })
      // 事件：agent_outcome
      expect(emit).toHaveBeenCalledWith('agent_outcome', expect.objectContaining({ agentId: 'claude_code', taskId: 't-1', ok: true }))
    })

    it('活跃派活中的 agent 在 snapshot 里 busy=true', async () => {
      mockLlmTasks([{ title: '干活', provider: 'claude_code', prompt: 'go' }])
      const { coordinator, runPlan } = makeDeps()
      // runPlan 挂起以保持活跃派活
      let resolvePlan!: (v?: unknown) => void
      const pending = new Promise<unknown>((r) => { resolvePlan = r })
      runPlan.mockReturnValue(pending)

      // submit 内部同步设置 activeAssignments；用微任务让 submit 走完 set 步骤
      const submitPromise = coordinator.submit('需求', '/project')
      await Promise.resolve()
      await Promise.resolve()

      const snap = coordinator.snapshot()
      expect(snap.find(a => a.id === 'claude_code')?.busy).toBe(true)
      expect(snap.find(a => a.id === 'opencode')?.busy).toBe(false)

      resolvePlan(undefined)
      await submitPromise
    })
  })
})
