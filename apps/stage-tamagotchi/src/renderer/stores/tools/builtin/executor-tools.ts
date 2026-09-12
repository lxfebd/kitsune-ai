import type { Tool } from '@xsai/shared-chat'
import type { JsonSchema } from 'xsschema'

import { defineInvoke } from '@moeru/eventa'
import { getElectronEventaContext } from '@kitsune/electron-vueuse'
import { normalizeNullableAnyOf } from '@kitsune/stage-shared/json-schema'
import { rawTool } from '@xsai/tool'
import { toJsonSchema } from 'xsschema'
import { z } from 'zod'

import {
  electronExecutorGenerate,
  electronExecutorRun,
  electronExecutorStatus,
  electronExecutorStop,
  electronCoordinatorSubmit,
  electronCoordinatorTeam,
} from '../../../../shared/eventa'

// NOTICE: build the eventa context lazily instead of at module scope. Module-scope
// `getElectronEventaContext()` throws when imported without an Electron IPC bridge
// (unit tests, web runtime), which broke tool definition resolution. Production
// behavior is unchanged: the context is still created once, on first invocation.
let sharedContext: ReturnType<typeof getElectronEventaContext> | undefined

function getContext() {
  sharedContext ??= getElectronEventaContext()
  return sharedContext
}

function createInvokers() {
  const context = getContext()
  return {
    generate: defineInvoke(context, electronExecutorGenerate),
    run: defineInvoke(context, electronExecutorRun),
    stop: defineInvoke(context, electronExecutorStop),
    status: defineInvoke(context, electronExecutorStatus),
    coordinatorSubmit: defineInvoke(context, electronCoordinatorSubmit),
    coordinatorTeam: defineInvoke(context, electronCoordinatorTeam),
  }
}

export type ExecutorToolInvokers = ReturnType<typeof createInvokers>

let executorToolInvokers: ExecutorToolInvokers | undefined

function resolveInvokers(override?: ExecutorToolInvokers): ExecutorToolInvokers {
  if (override)
    return override
  executorToolInvokers ??= createInvokers()
  return executorToolInvokers
}

const generateParams = z.object({
  requirement: z.string().min(1).max(4000).describe('Natural-language task requirement. The main-process planner turns it into a DAG plan with ordered tasks.'),
  cwd: z.string().nullable().describe('Working directory for the plan. Omit to default to the app process cwd.'),
}).strict()

type GenerateToolInput = z.infer<typeof generateParams>

const runParams = z.object({
  plan: z.record(z.string(), z.unknown()).describe('Plan JSON as returned by executor_plan (pass the plan through unchanged; do not hand-write it).'),
  waitForCompletion: z.boolean().nullable().describe('Wait for the plan to finish and return its final status before replying (true), or return immediately after the plan is accepted (false). Pass null for the default of true.'),
}).strict()

type RunToolInput = {
  plan: Record<string, unknown>
  /** 缺省/为 null 时按 true 处理（runExecutorPlan 内兜底）。schema 保持 required+nullable 以过 provider 严格校验。 */
  waitForCompletion?: boolean | null
}

// Stop/status 零输入工具：手写 JSON Schema（type: object + required:[]），
// 避免 xsschema 对 `z.object({}).strict()` 产出带空 properties 却缺 required
// 的 schema（会被 strict-tool-schema 检查拒绝）。
const noInputSchema = { type: 'object', required: [], additionalProperties: false } satisfies JsonSchema

// 等待执行完成的轮询间隔与总上限。执行进度仍通过 electronExecutorEvent 流式
// 推送到渲染层面板；这里只补上"聊天里也能拿到最终结果"，避免模型对执行结果
// 一无所知地继续编造后续步骤。
const EXECUTOR_POLL_INTERVAL_MS = 1000
const EXECUTOR_WAIT_CAP_MS = 120_000

/** 从 status 快照判断目标计划是否已结束（completed / aborted）。 */
function isPlanSettled(
  planId: string | undefined,
  status: Awaited<ReturnType<ExecutorToolInvokers['status']>>,
): boolean {
  if (status?.plan?.status === 'completed' || status?.plan?.status === 'aborted')
    return true
  // isRunning=false 且当前计划就是目标计划 → 计划已结束。completed/aborted 由上面
  // 覆盖，这里兜底旧 loop 未把 status 落到 plan 上的情形。
  if (status?.isRunning === false && status?.plan?.id === planId)
    return true
  return false
}

/**
 * executor_run — 把 executor_plan 生成的计划交给主进程执行器闭环异步执行。
 * 执行进度通过 electronExecutorEvent 流式推送到渲染层（executor 面板 /
 * useExecutorEmotion 消费）。
 *
 * 默认 waitForCompletion=true：run 接受计划后轮询主进程状态直到完成（上限
 * EXECUTOR_WAIT_CAP_MS），把最终 status/结果回传给聊天里的模型，避免模型
 * "假装完成"或对执行结果一无所知。超时返回已接受+运行中快照，不阻断回合。
 */
export async function runExecutorPlan(input: RunToolInput, deps?: { invokers?: ExecutorToolInvokers }) {
  const invokers = resolveInvokers(deps?.invokers)
  const planId = (input.plan as { id?: string } | null | undefined)?.id
  const runResult = await invokers.run({ plan: input.plan as never })

  if (!runResult.ok)
    return { ok: false, error: runResult.error ?? 'plan 未被接受' }

  const waitForCompletion = input.waitForCompletion ?? true
  if (!waitForCompletion)
    return { ok: true, accepted: true, note: '执行已开始，进度见执行面板。' }

  // 轮询等待最终状态（有上限，不无限挂回合）
  const deadline = Date.now() + EXECUTOR_WAIT_CAP_MS
  for (;;) {
    const status = await invokers.status()
    if (isPlanSettled(planId, status))
      return { ok: true, accepted: true, done: true, status }

    if (Date.now() >= deadline)
      return { ok: true, accepted: true, done: false, status, note: '执行仍在进行，已超过等待上限，进度见执行面板。' }

    await new Promise(resolve => setTimeout(resolve, EXECUTOR_POLL_INTERVAL_MS))
  }
}

/**
 * executor_plan — 让对话里的 LLM 生成一份可执行的 DAG 计划（不执行）。
 * 主进程 generatePlan 会沿用聊天正在使用的 LLM provider（App.vue 已同步，
 * 见 syncOverseerLlmProvider），因此计划质量与聊天同源。
 */
export async function planExecutorTask(input: GenerateToolInput, deps?: { invokers?: ExecutorToolInvokers }) {
  const invokers = resolveInvokers(deps?.invokers)
  return invokers.generate({
    requirement: input.requirement.trim(),
    cwd: input.cwd?.trim() ?? '',
  })
}

/** executor_stop — 停止当前正在执行的计划。 */
export async function stopExecutorRun(deps?: { invokers?: ExecutorToolInvokers }) {
  const invokers = resolveInvokers(deps?.invokers)
  return invokers.stop()
}

/** executor_status — 查询执行器当前状态（是否空闲、当前计划/任务）。 */
export async function queryExecutorStatus(deps?: { invokers?: ExecutorToolInvokers }) {
  const invokers = resolveInvokers(deps?.invokers)
  return invokers.status()
}

// ——— Coordinator 编排者（头头→子 agent 派活）———

const coordinatorSubmitParams = z.object({
  requirement: z.string().min(1).max(4000).describe('Natural-language user requirement. The coordinator decomposes it and assigns work to sub-agents.'),
  cwd: z.string().nullable().describe('Working directory for the delegated work. Omit to default to the app process cwd.'),
}).strict()

type CoordinatorSubmitInput = z.infer<typeof coordinatorSubmitParams>

/** coordinator_delegate — 把需求交给编排者：拆解 → 按画像派给子 agent → 交给 executor 执行。 */
export async function delegateCoordinatorTask(input: CoordinatorSubmitInput, deps?: { invokers?: ExecutorToolInvokers }) {
  const invokers = resolveInvokers(deps?.invokers)
  return invokers.coordinatorSubmit({
    requirement: input.requirement.trim(),
    cwd: input.cwd?.trim() ?? '',
  })
}

/** coordinator_team — 查询团队花名册（谁在线/谁在干/画像）。 */
export async function queryCoordinatorTeam(deps?: { invokers?: ExecutorToolInvokers }) {
  const invokers = resolveInvokers(deps?.invokers)
  return invokers.coordinatorTeam()
}

const tools: Promise<Tool>[] = [
  (async () => rawTool({
    name: 'executor_plan',
    description: 'Generate an execution plan (DAG of ordered tasks) from a natural-language requirement, using the same LLM provider as this chat. Returns a Plan object you must pass unchanged to executor_run. Use this to plan work before executing it.',
    execute: params => planExecutorTask(params as GenerateToolInput),
    parameters: normalizeNullableAnyOf(await toJsonSchema(generateParams) as JsonSchema),
  }))(),
  (async () => rawTool({
    name: 'executor_run',
    description: 'Execute a plan previously produced by executor_plan. Pass the plan object through unchanged. By default waits for the plan to finish (up to 120s) and returns its final status so you know the actual result. Set waitForCompletion=false to return immediately after the plan is accepted; progress is always streamed to the executor panel.',
    execute: params => runExecutorPlan(params as RunToolInput),
    parameters: normalizeNullableAnyOf(await toJsonSchema(runParams) as JsonSchema),
  }))(),
  (async () => rawTool({
    name: 'executor_stop',
    description: 'Stop the currently running plan (if any). Use after a plan is aborted or stuck.',
    execute: () => stopExecutorRun(),
    parameters: normalizeNullableAnyOf(noInputSchema),
  }))(),
  (async () => rawTool({
    name: 'executor_status',
    description: 'Query the current executor status: idleness, active plan id, current task. Use before planning new work to avoid overlapping plans.',
    execute: () => queryExecutorStatus(),
    parameters: normalizeNullableAnyOf(noInputSchema),
  }))(),
  (async () => rawTool({
    name: 'coordinator_delegate',
    description: 'As the "team lead" coordinator: decompose a user requirement into work items, assign each to the most suitable sub-agent (claude/codex/opencode/trae/cursor) based on its profile, and start executing them. Returns the accepted plan. Monitor progress via executor_status or the team panel. Do NOT hand-write plans — this tool does the delegation for you.',
    execute: params => delegateCoordinatorTask(params as CoordinatorSubmitInput),
    parameters: normalizeNullableAnyOf(await toJsonSchema(coordinatorSubmitParams) as JsonSchema),
  }))(),
  (async () => rawTool({
    name: 'coordinator_team',
    description: 'Query the AI team roster: which sub-agents are online, which are busy, and each one\'s profile (strengths/forbidden use). Use before coordinating to pick the right agent.',
    execute: () => queryCoordinatorTeam(),
    parameters: normalizeNullableAnyOf(noInputSchema),
  }))(),
]

export const executorTools = async () => Promise.all(tools)