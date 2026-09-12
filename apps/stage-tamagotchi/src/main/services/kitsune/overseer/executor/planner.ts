import type { Plan, Task, TaskResult } from './planGenerator'
import { generatePlan, type ToolInventoryItem } from './planGenerator'
import type { MemoryStore } from '../../memory/store'

export interface PlannerDeps {
  /** 生成替代计划的回调 — 复用 generatePlan */
  generateAlternative: (
    requirement: string,
    context: { failedTask: Task, error?: string },
  ) => Promise<{ ok: boolean, plan?: Plan, error?: string }>
  /** 程序性记忆存储 — 供子计划检索历史执行经验 */
  memoryStore?: MemoryStore
  /** 可用工具清单 — 透传给子计划生成，保证子计划也只能派能执行的活 */
  toolInventory?: ToolInventoryItem[]
  /** 规划器参数（调整轮数/任务上限，可选） */
  params?: PlannerParams
}

/**
 * 规划器 — 初始计划生成、动态调整、子计划生成。
 *
 * 设计原则：
 * - 不直接持有 LLM 引用，通过回调注入，保持可测试性
 * - 所有方法返回 { ok, ... } 结构，失败永不抛出
 * - 调整失败时不阻塞，返回 { ok: false } 让调用方跳过
 */

/** 动态调整最大轮数 — 超出即停止生成替代任务，防「失败→调整→再失败→再调整」死循环 */
export const MAX_ADJUSTMENTS_PER_PLAN = 3
/** 单个计划的任务总数上限 — 防止每次调整都塞回多个任务导致任务无限膨胀 */
export const MAX_TASKS_PER_PLAN = 20

/** 规划器参数 — 从 overseer.yaml executor 节注入，缺省回退硬编码 */
export interface PlannerParams {
  maxAdjustments?: number
  maxTasks?: number
}

export function createPlanner(deps: PlannerDeps) {
  const { generateAlternative, memoryStore, toolInventory, params } = deps
  const maxAdjustments = params?.maxAdjustments ?? MAX_ADJUSTMENTS_PER_PLAN
  const maxTasks = params?.maxTasks ?? MAX_TASKS_PER_PLAN

  /**
   * 动态调整计划 — 非关键任务失败时生成替代方案。
   * 新任务通过返回值返回，由调用方（loop）插入执行队列。
   */
  async function adjustPlan(
    plan: Plan,
    failedTask: Task,
    error?: string,
  ): Promise<{ ok: boolean, newTasks?: Task[], error?: string }> {
    const adjustments = plan.adjustmentCount ?? 0
    if (adjustments >= maxAdjustments) {
      return { ok: false, error: `已超过最大调整轮次 (${maxAdjustments})，不再生成替代任务` }
    }
    if (plan.tasks.length >= maxTasks) {
      return { ok: false, error: `计划任务数已达上限 (${maxTasks})，拒绝继续膨胀` }
    }
    try {
      const requirement = `任务 "${failedTask.title}" 失败（${error ?? '未知错误'}），需要替代方案。\n原需求：${plan.requirement}`
      const result = await generateAlternative(requirement, { failedTask, error })
      if (!result.ok || !result.plan)
        return { ok: false, error: result.error }
      // 生成一次替代即累计一轮；调用方把新任务 push 进 plan.tasks，
      // 任务数增长受 MAX_TASKS_PER_PLAN 二次钳制
      plan.adjustmentCount = adjustments + 1
      return { ok: true, newTasks: result.plan.tasks }
    }
    catch {
      return { ok: false, error: 'planner.adjustPlan 异常' }
    }
  }

  /**
   * 生成子计划 — 任务完成后的输出表明需要进一步拆解时调用。
   * 嵌套深度由 plan.nestingLevel 控制，上限 3 层。
   */
  async function generateSubPlan(
    parentPlan: Plan,
    sourceTask: Task,
    result: TaskResult,
  ): Promise<{ ok: boolean, plan?: Plan, error?: string }> {
    const maxDepth = 3
    const currentDepth = parentPlan.nestingLevel ?? 0
    if (currentDepth >= maxDepth)
      return { ok: false, error: `达到子计划最大深度 (${maxDepth})` }

    try {
      const requirement = `基于任务 "${sourceTask.title}" 的输出，需要进一步处理。\n输出：${(result.output ?? '').slice(0, 500)}\n上下文：${parentPlan.requirement}`
      // 使用父计划第一个任务的 cwd，或回退到 process.cwd()
      // NOTICE: Plan 无顶层 cwd 字段，取第一个 CLI 任务的 cwd 作为子计划的工作目录
      const parentCwd = parentPlan.tasks.find(t => t.type === 'cli')?.cwd ?? process.cwd()
      const planResult = await generatePlan(requirement, parentCwd, memoryStore, toolInventory)
      if (!planResult.ok || !planResult.plan)
        return { ok: false, error: planResult.error }

      planResult.plan.nestingLevel = currentDepth + 1
      planResult.plan.parentPlanId = parentPlan.id
      return { ok: true, plan: planResult.plan }
    }
    catch {
      return { ok: false, error: 'planner.generateSubPlan 异常' }
    }
  }

  return { adjustPlan, generateSubPlan }
}