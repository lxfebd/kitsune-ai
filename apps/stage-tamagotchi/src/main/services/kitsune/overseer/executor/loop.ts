import type { Plan, Task, TaskResult } from './planGenerator'
import { buildDagLevels } from './dag'
import type { DagLevel } from './dag'
import type { ExecutorEventPayload } from '../../../../../shared/eventa'

import { getFileLogger } from '../../logger'

const RETRY_DELAYS_MS = [2000, 4000, 8000]
const MAX_SUBPLAN_DEPTH = 3

export interface PlannerInstance {
  adjustPlan: (plan: Plan, failedTask: Task, error?: string) => Promise<{ ok: boolean, newTasks?: Task[], error?: string }>
  generateSubPlan: (parentPlan: Plan, sourceTask: Task, result: TaskResult) => Promise<{ ok: boolean, plan?: Plan, error?: string }>
}

interface LoopDeps {
  runner: {
    runTask: (task: Task) => Promise<TaskResult>
  }
  permission: {
    needsConfirm: (input: { source: string, assertion: { type: string } }) => boolean
    confirmRun: (task: Task) => Promise<boolean>
    addToWhitelist: (source: string, assertionType: string) => void
    isHighRisk: (task: { prompt?: string, command?: string, assertionType?: string }) => boolean
  }
  checkAcceptance: (task: Task, result: TaskResult) => Promise<{ ok: boolean, error?: string }>
  emit: (event: ExecutorEventPayload['type'], payload: Omit<ExecutorEventPayload, 'type'>) => void
  confirmRequest: (taskId: string) => Promise<{ approved: boolean, addToWhitelist: boolean }>
  killRunningTask: () => void
  /** 任务完成回调 — 写入程序性记忆 */
  onTaskCompleted?: (task: Task, result: TaskResult) => Promise<void>
  /** 计划完成回调 — 写入总结性记忆 */
  onPlanCompleted?: (plan: Plan, status: 'completed' | 'aborted') => Promise<void>
  /** 任务失败回调 — 人格化安抚话术 */
  onTaskFailed?: (task: Task, error: string | undefined, attempt: number) => Promise<string | undefined>
  /** 审计日志 */
  auditLog?: { append: (entry: { timestamp: string, taskId: string, type: 'cli' | 'ide', source: string, result: 'success' | 'failure', error?: string, durationMs: number }) => Promise<void> }
  /** 规划器 — 动态调整 + 子计划生成 */
  planner?: PlannerInstance
}

/**
 * 共享中止信号 — 父计划和子计划共享同一个 signal 实例。
 * stop() 设置 stopRequested 后，所有层级的 runPlan/runLevel 都能感知。
 */
interface AbortSignal {
  aborted: boolean
}

export function createLoop(deps: LoopDeps) {
  const { runner, permission, checkAcceptance, emit, confirmRequest, killRunningTask, onTaskCompleted, onPlanCompleted, onTaskFailed, auditLog, planner } = deps
  const fileLogger = getFileLogger()

  let currentPlan: Plan | null = null
  let isRunning = false
  let stopRequested = false
  // 全局 abortSignal — stop() 可直接设置，所有 runLevel 感知
  let globalAbortSignal: AbortSignal | null = null

  function getStatus() {
    return {
      currentPlan,
      currentTaskId: null as string | null,
      currentTaskAttempt: 0,
      isRunning,
    }
  }

  // ——— 子计划处理 ———

  async function handleSubPlan(
    task: Task,
    result: TaskResult,
    parentPlan: Plan,
    abortSignal: AbortSignal,
  ): Promise<void> {
    if (!planner)
      return
    const currentDepth = parentPlan.nestingLevel ?? 0
    if (currentDepth >= MAX_SUBPLAN_DEPTH)
      return
    if (task.type !== 'cli' || !result.output?.includes('NEED_SUBPLAN:'))
      return

    const subResult = await planner.generateSubPlan(parentPlan, task, result)
    if (!subResult.ok || !subResult.plan)
      return

    emit('sub_plan_started', { planId: parentPlan.id, subPlanId: subResult.plan.id, sourceTaskId: task.id })
    // 子计划共享父计划的 abortSignal — 父计划中止时子计划也能感知
    await runPlan(subResult.plan, abortSignal)
    emit('sub_plan_completed', { planId: parentPlan.id, subPlanId: subResult.plan.id, status: subResult.plan.status })
  }

  // ——— 单任务执行（带权限 + 重试） ———

  async function runTaskWithPermission(task: Task): Promise<TaskResult> {
    const permInput = buildPermInput(task)
    const isHighRisk = permission.isHighRisk?.({
      prompt: task.type === 'cli' ? task.prompt : undefined,
      command: task.type === 'ide' && task.action === 'run_command' ? task.payload?.command : undefined,
      assertionType: permInput.assertion.type,
    }) ?? false
    const isWhitelisted = !permission.needsConfirm(permInput)
    if (isWhitelisted && !isHighRisk)
      return runner.runTask(task)

    emit('permission_request', { taskId: task.id, permKey: `${permInput.source}:${permInput.assertion.type}`, task, highRisk: isHighRisk })

    const { approved, addToWhitelist } = await confirmRequest(task.id)
    if (!approved)
      return { taskId: task.id, ok: false, error: '用户拒绝', durationMs: 0 }

    if (addToWhitelist && !isHighRisk)
      permission.addToWhitelist(permInput.source, permInput.assertion.type)

    const result = await runner.runTask(task)

    try {
      await auditLog?.append({
        timestamp: new Date().toISOString(),
        taskId: task.id,
        type: task.type,
        source: task.type === 'cli' ? task.provider : task.connectorId,
        result: result.ok ? 'success' : 'failure',
        error: result.error,
        durationMs: result.durationMs ?? 0,
      })
    }
    catch { /* 审计失败不阻塞 */ }

    return result
  }

  function buildPermInput(task: Task): { source: string, assertion: { type: string } } {
    if (task.type === 'cli')
      return { source: task.provider, assertion: { type: 'cli:run' } }
    return { source: task.connectorId, assertion: { type: `ide:${task.action}` } }
  }

  // ——— 并行层级执行 ———

  async function runLevel(
    level: DagLevel,
    plan: Plan,
    abortSignal: AbortSignal,
  ): Promise<void> {
    const maxCon = plan.maxConcurrency ?? 3
    const queue = [...level.tasks]
    const pool = new Set<Promise<void>>()

    const processTask = async (task: Task): Promise<void> => {
      if (abortSignal.aborted || plan.status === 'aborted')
        return

      // 局部变量 — 避免并行任务间竞态
      let taskResult: TaskResult | null = null
      let taskError: string | undefined

      for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
        if (abortSignal.aborted || plan.status === 'aborted' || stopRequested)
          return

        emit('task_started', { taskId: task.id, attempt })
        const result = await runTaskWithPermission(task)

        if (result.ok) {
          const accept = await checkAcceptance(task, result)
          if (!accept.ok) {
            result.ok = false
            result.error = accept.error
          }
        }

        if (result.ok) {
          emit('task_completed', { taskId: task.id, result })
          fileLogger.debug('[loop] task_completed', { eventId: 'task_completed', node: task.id, action: task.type, result: 'success' })
          try { await onTaskCompleted?.(task, result) } catch { /* 忽略 */ }
          await handleSubPlan(task, result, plan, abortSignal)
          return
        }

        taskResult = result
        taskError = result.error
        emit('task_failed', { taskId: task.id, attempt, error: result.error, result })
        fileLogger.debug('[loop] task_failed', { eventId: 'task_failed', node: task.id, action: task.type, result: result.error })
        let personaMessage: string | undefined
        try { personaMessage = await onTaskFailed?.(task, result.error, attempt) } catch { /* 忽略 */ }
        if (personaMessage)
          emit('task_failed', { taskId: task.id, attempt, error: result.error, personaMessage })
        if (attempt < RETRY_DELAYS_MS.length - 1)
          await sleep(RETRY_DELAYS_MS[attempt])
      }

      // 全部重试失败 — 使用局部变量判断，不依赖共享状态
      if (task.critical) {
        abortSignal.aborted = true
        plan.status = 'aborted'
        emit('plan_aborted', { planId: plan.id, taskId: task.id, error: taskError })
        emit('pet_alert', { message: '关键任务失败，请人工介入' })
        fileLogger.debug('[loop] pet_alert', { eventId: 'pet_alert', node: task.id, action: 'critical_failed', result: 'aborted' })
      }
      else if (planner) {
        const adjusted = await planner.adjustPlan(plan, task, taskError)
        if (adjusted?.ok && adjusted.newTasks?.length) {
          emit('plan_adjusted', { planId: plan.id, failedTaskId: task.id, newTaskCount: adjusted.newTasks.length })
          // 将新任务加入队列（保持依赖顺序 — 新任务会在当前层结束后在下一层处理）
          for (const newTask of adjusted.newTasks) {
            plan.tasks.push(newTask)
            queue.push(newTask)
          }
        }
      }
    }

    // 并发池：从队列取任务，直到队列为空
    while (queue.length > 0 && !abortSignal.aborted && !stopRequested) {
      const task = queue.shift()!
      const p = processTask(task).catch(() => { /* 防止 unhandled rejection */ })
      pool.add(p)
      p.finally(() => pool.delete(p))
      if (pool.size >= maxCon)
        await Promise.race(pool)
    }

    await Promise.all(pool)
  }

  // ——— 计划执行入口（可重入） ———

  async function runPlan(plan: Plan, parentAbortSignal?: AbortSignal): Promise<void> {
    const savedPlan = currentPlan

    currentPlan = plan
    plan.status = 'running'
    isRunning = true
    // 子计划共享父计划的 abortSignal；根计划创建新的
    const abortSignal: AbortSignal = parentAbortSignal ?? { aborted: false }
    if (!parentAbortSignal) {
      globalAbortSignal = abortSignal
      stopRequested = false
    }

    emit('plan_started', { planId: plan.id })

    // 构建 DAG 层级
    const dagResult = buildDagLevels(plan.tasks)
    if (dagResult.error) {
      plan.status = 'aborted'
      emit('plan_aborted', { planId: plan.id, taskId: '', error: dagResult.error })
      emit('pet_alert', { message: '计划包含无效的依赖关系' })
      isRunning = false
      currentPlan = savedPlan
      return
    }

    // 逐层执行
    for (const level of dagResult.levels) {
      if (plan.status === 'aborted' || abortSignal.aborted || stopRequested)
        break
      emit('dag_level_started', { planId: plan.id, levelIndex: level.index, taskCount: level.tasks.length })
      await runLevel(level, plan, abortSignal)
    }

    // 完成状态
    if (plan.status === 'running')
      plan.status = 'completed'
    emit('plan_completed', { planId: plan.id, status: plan.status })
    try { await onPlanCompleted?.(plan, plan.status as 'completed' | 'aborted') } catch { /* 忽略 */ }

    // 恢复父计划状态
    currentPlan = savedPlan
    if (!parentAbortSignal) {
      isRunning = false
      globalAbortSignal = null
    }
  }

  // ——— 停止相关 ———

  function stop() {
    stopRequested = true
    // 直接设置全局 abortSignal — 所有层级的 runLevel 立即感知
    if (globalAbortSignal)
      globalAbortSignal.aborted = true
    if (currentPlan) {
      currentPlan.status = 'aborted'
      emit('plan_stopped', { planId: currentPlan.id, message: '用户请求停止' })
    }
  }

  function forceStop() {
    stop()
    killRunningTask()
  }

  return { runPlan, stop, forceStop, getStatus }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}