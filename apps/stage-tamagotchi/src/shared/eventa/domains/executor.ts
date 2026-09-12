// Domain: executor — eventa IPC 契约按域拆分
import type { Plan, TaskResult, ExecutorStatus, Task } from '../../../main/services/kitsune/overseer/executor/planGenerator'
import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

// Re-exported so renderer components can consume the executor types through the shared
// eventa barrel instead of reaching into main-process source paths.
export type { ExecutorStatus, Plan, Task, TaskResult } from '../../../main/services/kitsune/overseer/executor/planGenerator'

export const electronExecutorGenerate = defineInvokeEventa<{ ok: boolean, plan?: Plan, error?: string }, { requirement: string, cwd: string }>(
  'eventa:invoke:electron:executor:generate',
)
export const electronExecutorRun = defineInvokeEventa<{ ok: boolean, error?: string }, { plan: Plan }>(
  'eventa:invoke:electron:executor:run',
)
export const electronExecutorStop = defineInvokeEventa<{ ok: boolean }>(
  'eventa:invoke:electron:executor:stop',
)
export const electronExecutorStatus = defineInvokeEventa<ExecutorStatus>(
  'eventa:invoke:electron:executor:status',
)

export interface ExecutorEventPayload {
  type: 'plan_started' | 'task_started' | 'task_completed' | 'task_failed'
    | 'plan_completed' | 'plan_aborted' | 'plan_stopped'
    | 'permission_request' | 'pet_alert'
    | 'dag_level_started' | 'plan_adjusted'
    | 'sub_plan_started' | 'sub_plan_completed'
    | 'coordination_started' | 'agent_outcome'
  planId?: string
  taskId?: string
  attempt?: number
  result?: TaskResult
  error?: string
  permKey?: string
  task?: Task
  message?: string
  /** 人格化安抚话术 — 任务失败时由 personaBuilder 生成 */
  personaMessage?: string
  /** dag_level_started — DAG 层级索引 */
  levelIndex?: number
  /** dag_level_started — 当前层级任务数 */
  taskCount?: number
  /** plan_adjusted — 失败任务 ID */
  failedTaskId?: string
  /** plan_adjusted — 新增任务数 */
  newTaskCount?: number
  /** sub_plan_started / sub_plan_completed — 子计划 ID */
  subPlanId?: string
  /** sub_plan_started — 触发子计划的任务 ID */
  sourceTaskId?: string
  /** sub_plan_completed — 子计划完成状态 */
  status?: string
  /** permission_request — 是否高风险任务（需用户显式确认） */
  highRisk?: boolean
  /** coordination_started — 编排会话涉及的 agent 数 */
  agentCount?: number
  /** coordination_started — 编排拆出的任务数 */
  coordinationTaskCount?: number
  /** agent_outcome — 派活目标 agent id */
  agentId?: string
  /** agent_outcome — 该次派活的任务标题 */
  title?: string
  /** agent_outcome — 派活完成时间戳 */
  at?: number
}
export const electronExecutorEvent = defineEventa<ExecutorEventPayload>(
  'eventa:event:electron:executor:event',
)

// ========== Overseer LLM Provider 同步 ==========
// renderer 将聊天正在用的 provider 配置（含 API key）同步到主进程，
// 让 overseer executor 与聊天共用同一套 provider，不再读 providers.yaml 查环境变量。

export interface OverseerLlmProviderConfig {
  /** renderer 侧的 providerId（如 "openai-compatible"、"openai"、"nvidia" 等） */
  providerId: string
  /** 当前模型 ID */
  model: string
  /** API key 明文（仅在 IPC 通道内传输，不落盘） */
  apiKey: string
  /** OpenAI 兼容 base URL */
  baseUrl: string
}

export const electronOverseerLlmProvider = defineInvokeEventa<{ ok: boolean }, OverseerLlmProviderConfig>(
  'eventa:invoke:electron:overseer:llm-provider',
)
