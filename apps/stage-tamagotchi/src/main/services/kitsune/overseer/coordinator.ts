/**
 * Coordinator — 编排者（"头头"的代理人）
 *
 * 在 executor（执行流水线）之上加一层统筹：把用户需求拆成"给谁的活"，
 * 派给不同的子 agent（claude/codex/opencode/trae/cursor…），收回结果后
 * 判断下一步（继续派 / 返工 / 换人再派 / 收尾），全流程事件流可见。
 *
 * 设计边界：
 * - 不自己跑任务：派活复用 executor 通道（generatePlan + runPlan）
 * - 只做编排决策：拆解需求 → 生成带画像分派的计划 → 交给 executor 执行 →
 *   执行结果回喂 → 决定是否调整
 * - 与 planner.adjustPlan 的关系：adjustPlan 在"单任务失败"时替换任务；
 *   coordinator 在"计划级别"观察结果并给出编排建议（谁返工、谁换人），
 *   两者正交，coordinator 优先。
 *
 * 事件通道：复用 ExecutorEventPayload 流（plan_started/task_completed/task_failed…）
 * 渲染层团队面板订阅同一事件流，天然可见"谁在干、干得怎样"。
 */

import { randomUUID } from 'node:crypto'

import { callLlm } from './executor/llmHelper'
import type { Plan, ToolInventoryItem } from './executor/planGenerator'

export interface CoordinatorAgentStatus {
  id: string
  name: string
  /** 感知层是否探测到进程在跑 */
  online: boolean
  /** 是否有 CLI 可派活（false = perceiveOnly，只感知不派活） */
  dispatchable: boolean
  /** 当前是否正被派活执行 */
  busy: boolean
  /** 最近一次派活结果 */
  lastOutcome?: { taskId: string, title: string, ok: boolean, error?: string, at: number }
}

export interface CoordinatorDeps {
  /** 可用工具清单（含画像）— 来自 overseer.yaml tools[] */
  inventory: ToolInventoryItem[]
  /** 子 agent 在线状态查询（来自 Supervisor / mcpActivity） */
  isAgentOnline: (id: string) => boolean
  /** 工具二进制可用性探针（taskPusher.probeToolAvailability 的同步包）— 供 headless CLI 判在线 */
  probeAvailability?: () => Record<string, boolean>
  /** 执行计划（复用 executor） */
  runPlan: (plan: Plan) => Promise<void>
  /** 查询执行器当前状态 */
  getExecutorStatus: () => { isRunning: boolean, plan: Plan | null }
  /** 通知渲染层（团队面板 / 事件流） */
  emit: (type: string, payload: Record<string, unknown>) => void
}

interface DispatchRecord {
  taskId: string
  title: string
  provider: string
  ok: boolean
  error?: string
  at: number
}

const DISPATCH_HISTORY_MAX = 200

/** 编排提示词 — 让 LLM 把需求拆成"派给谁的活"，而不是泛泛的任务清单 */
function buildDispatchPrompt(
  requirement: string,
  inventory: ToolInventoryItem[],
  onlineIds: string[],
  history: DispatchRecord[],
): string {
  const lines = [
    '你是 AI 团队的编排者（coordinator）。用户（老板）给了需求，你负责拆活并派给合适的子 agent 干活。',
    '',
    '可用的子 agent（只能从这些里面选，id 即派活目标）：',
    ...inventory.map(t => `- ${t.id}（${t.name}）${t.personality ? `：${t.personality}` : ''}`),
    '',
    `当前在线（感知到进程在跑）：${onlineIds.length > 0 ? onlineIds.join(', ') : '（无，派活可能无人响应）'}`,
  ]

  if (history.length > 0) {
    lines.push(
      '',
      '[最近派活记录（供参考谁刚干过/谁失败了）]',
      ...history.slice(-8).map(h =>
        `${h.at ? new Date(h.at).toLocaleTimeString() : ''} 派给 ${h.provider}「${h.title}」 → ${h.ok ? '成功' : `失败: ${h.error ?? ''}`}`,
      ),
    )
  }

  lines.push(
    '',
    `需求：${requirement}`,
    '',
    '请输出拆解结果（JSON）：',
    '{',
    '  "tasks": [',
    '    { "title": "任务简述", "provider": "claude_code", "prompt": "给该 agent 的具体指令", "critical": false, "dependsOn": ["前置任务title"] }',
    '  ]',
    '}',
    '规则：',
    '1. 每个任务只派给一个最合适的 agent（按画像选人，不要雨露均沾）',
    '2. 有依赖的任务用 dependsOn 标前置（数组）；无依赖的将并行执行',
    '3. 关键任务（失败必须停）标 critical: true',
    '4. prompt 是对该 agent 的具体指令，要可执行、说清楚交付物',
    '5. 只输出 JSON',
  )

  return lines.join('\n')
}

/**
 * 创建编排者。返回 coordinator 实例：submit 拆解需求并开始编排，snapshot 给面板。
 */
export function createCoordinator(deps: CoordinatorDeps) {
  const { inventory, isAgentOnline, runPlan, getExecutorStatus, emit } = deps
  // dsh 收敛：dsh 是 headless CLI，空闲时不保持进程 —— 按进程检测恒「离线」。
  // 改为「可用性优先」：binary 存在（安装即启用）即视为可用/在线，让团队页如实显示
  // 桌宠派工已就绪；进程信号仍保留给 GUI 工具（cursor/trae 等开着才算在线）。
  const onlineByAvailability = (id: string) => {
    if (id !== 'dsh') return false
    const probe = deps.probeAvailability?.() ?? {}
    return Boolean(probe[id])
  }
  /** 统一在线判定：进程/MCP 信号 或 dsh 可用性（binary 存在即就绪） */
  const isOnline = (id: string) => isAgentOnline(id) || onlineByAvailability(id)
  const dispatchHistory: DispatchRecord[] = []
  /** 当前编排中的活跃任务 provider → taskId 映射（面板展示 busy 用） */
  const activeAssignments = new Map<string, string>()

  /** 记录一次派活结果并推事件 */
  function recordDispatch(record: DispatchRecord) {
    dispatchHistory.push(record)
    if (dispatchHistory.length > DISPATCH_HISTORY_MAX)
      dispatchHistory.shift()
    activeAssignments.delete(record.provider)
    emit('agent_outcome', { agentId: record.provider, ...record })
  }

  /** 团队快照 — 面板每次拉取（或事件刷新）时用 */
  function snapshot(): CoordinatorAgentStatus[] {
    const busy = new Set(activeAssignments.keys())
    return inventory.map(t => ({
      id: t.id,
      name: t.name,
      online: isOnline(t.id),
      dispatchable: true,
      busy: busy.has(t.id),
      lastOutcome: dispatchHistory
        .filter(h => h.provider === t.id)
        .at(-1),
    }))
  }

  /**
   * 把需求交给 coordinator：拆解 → 生成带分派的计划 → 交给 executor 执行。
   * 执行期间任务级结果会经 recordDispatch 回传（由 loop 的任务完成钩子桥接）。
   */
  async function submit(
    requirement: string,
    cwd: string,
  ): Promise<{ ok: boolean, plan?: Plan, error?: string }> {
    if (getExecutorStatus().isRunning)
      return { ok: false, error: '执行器正在运行中，请等待当前计划完成后再提交' }

    const onlineIds = inventory.filter(t => isOnline(t.id)).map(t => t.id)
    const dispatchPrompt = buildDispatchPrompt(requirement, inventory, onlineIds, dispatchHistory)
    const llmResult = await callLlm(
      '你是任务编排者。只输出 JSON，不要其他文字。',
      dispatchPrompt,
    )
    if (!llmResult.ok || !llmResult.text)
      return { ok: false, error: llmResult.error ?? '编排拆解失败' }

    let parsed: { tasks?: Array<{ title?: string, provider?: string, prompt?: string, critical?: boolean, dependsOn?: string | string[] }> }
    try {
      const json = llmResult.text.replace(/```(?:json)?\s*([\s\S]*?)```/, '$1').trim()
      parsed = JSON.parse(json)
    }
    catch {
      return { ok: false, error: '编排拆解失败：LLM 返回格式错误' }
    }

    if (!parsed?.tasks || !Array.isArray(parsed.tasks) || parsed.tasks.length === 0)
      return { ok: false, error: '编排拆解失败：tasks 为空' }

    // 把编排结果转成 executor 的 Plan（复用 generatePlan 的 normalize 逻辑由
    // generatePlan 再做一次轻量规整；这里直接构造 plan，保持 DAG 依赖语义）
    const plan: Plan = {
      id: randomUUID(),
      requirement,
      tasks: parsed.tasks.map((raw) => {
        const id = randomUUID().slice(0, 8)
        const critical = raw.critical === true
        const dependsOn = raw.dependsOn
          ? (Array.isArray(raw.dependsOn) ? raw.dependsOn.map(String) : [String(raw.dependsOn)])
          : undefined
        // provider 必须落在可派发清单里；不在则回退到第一个可派发 agent，
        // 而不是静默替换成 claude（原 planGenerator 的坑在这里显式规避）
        const valid = inventory.map(t => t.id)
        const provider = raw.provider && valid.includes(raw.provider) ? raw.provider : valid[0] ?? 'claude_code'
        return {
          id,
          type: 'cli' as const,
          title: String(raw.title ?? ''),
          provider,
          prompt: String(raw.prompt ?? ''),
          cwd,
          critical,
          dependsOn,
        }
      }),
      status: 'pending' as const,
      createdAt: Date.now(),
    }

    // 注册活跃派活（executor 开始后任务级结果会回喂）
    for (const task of plan.tasks) {
      if (task.type === 'cli')
        activeAssignments.set(task.provider, task.id)
    }
    emit('coordination_started', { planId: plan.id, agentCount: activeAssignments.size, taskCount: plan.tasks.length })

    // 不 await — executor 异步执行，事件流推送进度
    void runPlan(plan)
    return { ok: true, plan }
  }

  return { submit, snapshot, recordDispatch }
}

export type Coordinator = ReturnType<typeof createCoordinator>
