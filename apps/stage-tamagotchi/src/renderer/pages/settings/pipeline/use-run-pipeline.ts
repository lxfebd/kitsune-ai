import type { ExecutorEventPayload, ExecutorStatus, Plan, TaskResult } from '../../../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { getElectronEventaContext, useElectronEventaInvoke } from '@kitsune/electron-vueuse'
import { computed, onScopeDispose, ref, type ComputedRef, type Ref } from 'vue'

import {
  electronExecutorEvent,
  electronExecutorGenerate,
  electronExecutorRun,
  electronExecutorStatus,
  electronExecutorStop,
} from '../../../../shared/eventa'
import type { PipelineSnapshot } from './stages'

export interface RunPipeline {
  // ——— 输入与执行 ———
  requirement: Ref<string>
  busy: Ref<boolean>
  isRunning: Ref<boolean>
  plan: Ref<Plan | null>
  status: Ref<ExecutorStatus>
  taskResults: Ref<Map<string, TaskResult>>
  personaMessages: Ref<Map<string, string>>
  errorMessage: Ref<string>
  // ——— 聚合 ———
  completedTaskIds: ComputedRef<Set<string>>
  failedTaskIds: ComputedRef<Set<string>>
  stats: ComputedRef<{ total: number, completed: number, failed: number, pending: number, level: number }>
  statusLabelKey: ComputedRef<string>
  statusLabelParams: ComputedRef<Record<string, unknown>>
  statusBadge: ComputedRef<string>
  snapshot: ComputedRef<PipelineSnapshot>
  // ——— 行为 ———
  generate: (requirement?: string) => Promise<void>
  execute: () => Promise<void>
  stop: () => Promise<void>
  clear: () => void
}

/** 从 ExecutorPanel 平移的主状态机 — 同一份 electronExecutorEvent 监听，事件语义不变。 */
export function useRunPipeline(): RunPipeline {
  const invokeGenerate = useElectronEventaInvoke(electronExecutorGenerate)
  const invokeRun = useElectronEventaInvoke(electronExecutorRun)
  const invokeStop = useElectronEventaInvoke(electronExecutorStop)
  const invokeStatus = useElectronEventaInvoke(electronExecutorStatus)

  const requirement = ref('')
  const busy = ref(false)
  const isRunning = ref(false)
  const plan = ref<Plan | null>(null)
  const status = ref<ExecutorStatus>({ plan: null, currentTaskId: null, currentTaskAttempt: 0, isRunning: false })
  const taskResults = ref<Map<string, TaskResult>>(new Map())
  const personaMessages = ref<Map<string, string>>(new Map())
  const errorMessage = ref('')

  // ——— 编排/总监状态（流水线投影用） ———
  const coordinationStarted = ref(false)
  const agentOutcomes = ref(0)

  const completedTaskIds = computed(() => {
    const set = new Set<string>()
    for (const [id, r] of taskResults.value) {
      if (r.ok)
        set.add(id)
    }
    return set
  })
  const failedTaskIds = computed(() => {
    const set = new Set<string>()
    for (const [id, r] of taskResults.value) {
      if (!r.ok)
        set.add(id)
    }
    return set
  })

  const stats = computed(() => {
    const total = plan.value?.tasks.length ?? 0
    return {
      total,
      completed: completedTaskIds.value.size,
      failed: failedTaskIds.value.size,
      pending: total - completedTaskIds.value.size - failedTaskIds.value.size,
      level: status.value.currentLevel ?? 0,
    }
  })

  const statusLabelKey = computed(() => {
    if (busy.value && !isRunning.value)
      return 'settings.pages.pipeline.status.generating'
    if (isRunning.value && plan.value)
      return 'settings.pages.pipeline.status.running'
    if (plan.value?.status === 'aborted')
      return 'settings.pages.pipeline.status.aborted'
    if (plan.value?.status === 'completed')
      return 'settings.pages.pipeline.status.completed'
    return 'settings.pages.pipeline.status.idle'
  })
  const statusLabelParams = computed<Record<string, unknown>>(() => ({
    current: status.value.currentTaskAttempt + 1,
    total: plan.value?.tasks.length ?? 0,
  }))
  const statusBadge = computed(() => {
    if (plan.value?.status === 'aborted')
      return 'bg-red-500/15 text-red-700 dark:text-red-300'
    if (plan.value?.status === 'completed')
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
    if (busy.value || isRunning.value)
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
    return 'bg-neutral-400/20 text-neutral-600 dark:text-neutral-300'
  })

  // ——— 流水线阶段投影 ———
  const snapshot = computed<PipelineSnapshot>(() => ({
    generating: busy.value && !isRunning.value,
    hasPlan: plan.value !== null,
    planStatus: plan.value?.status ?? null,
    isRunning: isRunning.value,
    coordinationStarted: coordinationStarted.value,
    agentOutcomes: agentOutcomes.value,
    completedCount: completedTaskIds.value.size,
    failedCount: failedTaskIds.value.size,
  }))

  async function generate(input?: string) {
    const raw = input ?? requirement.value
    if (!raw.trim())
      return
    busy.value = true
    plan.value = null
    taskResults.value.clear()
    personaMessages.value.clear()
    try {
      const result = await invokeGenerate({ requirement: raw, cwd: '' })
      if (result?.ok && result.plan) {
        plan.value = result.plan
      }
      else {
        errorMessage.value = errorMessageFrom(new Error(result?.error ?? '生成计划失败')) ?? '生成计划失败'
      }
    }
    catch (e) {
      errorMessage.value = errorMessageFrom(e) ?? 'Unknown error'
    }
    finally {
      busy.value = false
    }
  }

  async function execute() {
    if (!plan.value)
      return
    plan.value.status = 'pending'
    taskResults.value.clear()
    personaMessages.value.clear()
    // plan.value 是 Vue 响应式 Proxy，Electron IPC（structuredClone）无法克隆 Proxy，
    // 会抛「An object could not be cloned.」导致页面渲染崩溃。先深拷贝成纯对象再传。
    await invokeRun({ plan: JSON.parse(JSON.stringify(plan.value)) })
  }

  async function stop() {
    await invokeStop()
  }

  function clear() {
    plan.value = null
    taskResults.value.clear()
    personaMessages.value.clear()
    requirement.value = ''
    errorMessage.value = ''
    coordinationStarted.value = false
    agentOutcomes.value = 0
  }

  // ——— 事件流 ———
  let eventaContext: ReturnType<typeof getElectronEventaContext> | undefined
  try {
    eventaContext = getElectronEventaContext()
  }
  catch {
    // IPC bridge 不可用
  }

  const offEvent = eventaContext?.on(electronExecutorEvent, (event) => {
    if (!event?.body)
      return
    const payload = event.body as ExecutorEventPayload
    if (payload.type === 'plan_started') {
      isRunning.value = true
    }
    else if (payload.type === 'task_started') {
      status.value.currentTaskId = payload.taskId ?? null
      status.value.currentTaskAttempt = payload.attempt ?? 0
    }
    else if (payload.type === 'task_completed' && payload.result) {
      taskResults.value.set(payload.result.taskId, payload.result)
    }
    else if (payload.type === 'task_failed' && payload.result) {
      taskResults.value.set(payload.result.taskId, payload.result)
    }
    else if (payload.type === 'task_failed' && payload.personaMessage) {
      if (payload.taskId)
        personaMessages.value.set(payload.taskId, payload.personaMessage)
    }
    else if (payload.type === 'plan_completed' || payload.type === 'plan_aborted' || payload.type === 'plan_stopped') {
      isRunning.value = false
      status.value.currentTaskId = null
    }
    else if (payload.type === 'pet_alert') {
      errorMessage.value = payload.message ?? ''
    }
    else if (payload.type === 'dag_level_started') {
      status.value.currentLevel = payload.levelIndex
    }
    else if (payload.type === 'plan_adjusted') {
      errorMessage.value = `计划已调整：失败任务 ${payload.failedTaskId} 被替代为 ${payload.newTaskCount} 个新任务`
    }
    else if (payload.type === 'sub_plan_started') {
      errorMessage.value = `开始执行子计划：${payload.subPlanId}`
    }
    else if (payload.type === 'sub_plan_completed') {
      errorMessage.value = `子计划完成：${payload.subPlanId} (${payload.status})`
    }
    else if (payload.type === 'coordination_started') {
      coordinationStarted.value = true
    }
    else if (payload.type === 'agent_outcome') {
      agentOutcomes.value += 1
    }
  })
  onScopeDispose(() => offEvent?.())

  async function initStatus() {
    try {
      const s = await invokeStatus()
      if (s) {
        status.value = s
        isRunning.value = s.isRunning
      }
    }
    catch {
      // 状态查询失败不影响页面
    }
  }
  void initStatus()

  return {
    requirement, busy, isRunning, plan, status, taskResults, personaMessages, errorMessage,
    completedTaskIds, failedTaskIds, stats, statusLabelKey, statusLabelParams, statusBadge, snapshot,
    generate, execute, stop, clear,
  }
}