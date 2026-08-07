import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createPlanner } from './planner'
import { generatePlan } from './planGenerator'
import type { Plan, Task, TaskResult } from './planGenerator'

// generateSubPlan 调用 generatePlan（来自 ./planGenerator）而非 deps.generateAlternative。
// 必须在此 mock generatePlan，否则测试会触发真实 LLM 调用。
vi.mock('./planGenerator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./planGenerator')>()
  return {
    ...actual,
    generatePlan: vi.fn(),
  }
})

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    type: 'cli',
    title: 'test task',
    provider: 'claude',
    prompt: 'do something',
    cwd: '/tmp',
    critical: false,
    ...overrides,
  } as Task
}

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'plan-1',
    requirement: 'test requirement',
    tasks: [makeTask()],
    status: 'pending',
    createdAt: Date.now(),
    ...overrides,
  }
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: 'task-1',
    ok: true,
    output: 'done',
    durationMs: 100,
    ...overrides,
  }
}

describe('createPlanner', () => {
  beforeEach(() => {
    vi.mocked(generatePlan).mockClear()
  })

  describe('adjustPlan', () => {
    it('calls generateAlternative with failure context', async () => {
      const generateAlternative = vi.fn().mockResolvedValue({ ok: true, plan: { tasks: [makeTask({ id: 'new-1' })] } })
      const planner = createPlanner({ generateAlternative })
      const plan = makePlan()
      const failedTask = makeTask()

      await planner.adjustPlan(plan, failedTask, 'command not found')

      expect(generateAlternative).toHaveBeenCalledTimes(1)
      const [requirement, context] = generateAlternative.mock.calls[0]
      expect(requirement).toContain('失败')
      expect(requirement).toContain(failedTask.title)
      expect(context.failedTask).toBe(failedTask)
      expect(context.error).toBe('command not found')
    })

    it('returns new tasks on success', async () => {
      const newTasks = [makeTask({ id: 'new-1' }), makeTask({ id: 'new-2' })]
      const generateAlternative = vi.fn().mockResolvedValue({ ok: true, plan: { tasks: newTasks } })
      const planner = createPlanner({ generateAlternative })

      const result = await planner.adjustPlan(makePlan(), makeTask())

      expect(result.ok).toBe(true)
      expect(result.newTasks).toHaveLength(2)
    })

    it('returns ok:false when generateAlternative fails', async () => {
      const generateAlternative = vi.fn().mockResolvedValue({ ok: false, error: 'LLM failed' })
      const planner = createPlanner({ generateAlternative })

      const result = await planner.adjustPlan(makePlan(), makeTask())

      expect(result.ok).toBe(false)
      expect(result.error).toBe('LLM failed')
    })

    it('returns ok:false on exception', async () => {
      const generateAlternative = vi.fn().mockRejectedValue(new Error('unexpected'))
      const planner = createPlanner({ generateAlternative })

      const result = await planner.adjustPlan(makePlan(), makeTask())

      expect(result.ok).toBe(false)
    })
  })

  describe('generateSubPlan', () => {
    it('generates sub-plan from task output', async () => {
      const subPlan = makePlan({ id: 'sub-1' })
      vi.mocked(generatePlan).mockResolvedValue({ ok: true, plan: subPlan })
      const planner = createPlanner({ generateAlternative: vi.fn() })
      const parentPlan = makePlan()
      const sourceTask = makeTask()
      const result = makeResult({ output: 'NEED_SUBPLAN: more work needed' })

      const subResult = await planner.generateSubPlan(parentPlan, sourceTask, result)

      expect(subResult.ok).toBe(true)
      expect(subResult.plan?.id).toBe('sub-1')
      expect(subResult.plan?.nestingLevel).toBe(1)
      expect(subResult.plan?.parentPlanId).toBe('plan-1')
    })

    it('rejects sub-plan at max depth', async () => {
      const generateAlternative = vi.fn()
      const planner = createPlanner({ generateAlternative })
      const parentPlan = makePlan({ nestingLevel: 3 })

      const subResult = await planner.generateSubPlan(parentPlan, makeTask(), makeResult())

      expect(subResult.ok).toBe(false)
      expect(subResult.error).toContain('最大深度')
      expect(generatePlan).not.toHaveBeenCalled()
    })

    it('uses parent CLI task cwd as sub-plan cwd', async () => {
      vi.mocked(generatePlan).mockResolvedValue({ ok: true, plan: makePlan() })
      const planner = createPlanner({ generateAlternative: vi.fn() })
      const parentPlan = makePlan({
        tasks: [makeTask({ cwd: '/project/src' })],
      })

      await planner.generateSubPlan(parentPlan, makeTask(), makeResult())

      expect(generatePlan).toHaveBeenCalledWith(
        expect.any(String),
        '/project/src',
        undefined,
      )
    })

    it('returns ok:false on exception', async () => {
      vi.mocked(generatePlan).mockRejectedValue(new Error('boom'))
      const planner = createPlanner({ generateAlternative: vi.fn() })

      const result = await planner.generateSubPlan(makePlan(), makeTask(), makeResult())

      expect(result.ok).toBe(false)
    })
  })
})
