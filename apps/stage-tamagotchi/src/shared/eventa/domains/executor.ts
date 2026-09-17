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

// ——— dsh 会话可见性 ———
// renderer 请求主进程扫描 dsh home 下的会话（DSH_HOME 来自 overseer.yaml 的 dsh 工具 cli.env），
// 让用户能看到「给 dsh 派了什么活、dsh 是否真的在干活」。
export interface DshSessionSummary {
  /** 会话 id（如 session-<uuid>） */
  id: string
  /** 会话所属项目目录（sessions 下的顶层目录名，去掉 '--' 包裹） */
  project: string
  /** 会话创建时间戳（毫秒） */
  createdAt: number
  /** 会话工作目录（header.cwd） */
  cwd?: string
  /** 会话业务事件数（projcache 最大 seq；0 表示从未真正对话） */
  messageCount: number
  /** 会话标题（projcache rows.title，降级取首条用户指令文本；截断） */
  title?: string
  /** 最近一条消息的文本预览（截断，用于面板展示） */
  lastPreview?: string
  /** 本会话是否有真实工作内容（messageCount > 0） */
  content: boolean
  /** 会话文件最后修改时间（毫秒） */
  modifiedAt: number
  /** 压缩文件大小（字节） */
  sizeBytes: number
  /** 记录来源：projcache=投影缓存（真实工作），jsonl=事件流文件（空壳降级） */
  source?: 'projcache' | 'jsonl'
}
export type DshSessionsResult = {
  ok: true
  /** 扫描到的全部会话（按 modifiedAt 降序） */
  sessions: DshSessionSummary[]
  /** 会话根目录（DSH_HOME/sessions），未配置时为空字符串 */
  root: string
} | {
  ok: false
  error: string
}
export const electronDshSessions = defineInvokeEventa<DshSessionsResult>(
  'eventa:invoke:electron:dsh-sessions',
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
  /** dag_level_started / coordination_started — 当前层级（或编排拆出）的任务数 */
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
  /** agent_outcome — 派活目标 agent id */
  agentId?: string
  /** agent_outcome — 该次派活的任务标题 */
  title?: string
  /** agent_outcome — 派活是否成功（DispatchRecord.ok 平铺发出） */
  ok?: boolean
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

// 渲染进程 Chat 的 LLM 请求经主进程代理转发（Node fetch 无 CORS 限制）。
// 中转服务（如 llm.941-fitness-studio.top）对带 Authorization 的跨域 OPTIONS 预检返回 401，
// 渲染进程直接 fetch 会撞 CORS（Failed to fetch），必须走主进程。
export interface LlmProxyFetchRequest {
  url: string
  init?: {
    method?: string
    headers?: Record<string, string>
    body?: string
  }
}
export interface LlmProxyFetchResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
}
export const electronLlmProxyFetch = defineInvokeEventa<LlmProxyFetchResponse, LlmProxyFetchRequest>(
  'eventa:invoke:electron:llm-proxy-fetch',
)
