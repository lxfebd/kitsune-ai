// Domain: coordinator — eventa IPC 契约按域拆分
import type { Plan } from '../../../main/services/kitsune/overseer/executor/planGenerator'
import { defineInvokeEventa } from '@moeru/eventa'

// ========== Coordinator 编排者（头头→子 agent 派活） ==========

/** 编排者提交一个需求：拆解 → 按画像派给子 agent → 交给 executor 执行。 */
export const electronCoordinatorSubmit = defineInvokeEventa<
  { ok: boolean, plan?: Plan, error?: string },
  { requirement: string, cwd?: string }
>('eventa:invoke:electron:coordinator:submit')

/** 团队快照 — 渲染层「我的 AI 团队」面板拉取（谁在线/谁在干/画像）。 */
export interface CoordinatorAgentStatusView {
  id: string
  name: string
  online: boolean
  dispatchable: boolean
  busy: boolean
  personality?: string
  lastOutcome?: { taskId: string, title: string, ok: boolean, error?: string, at: number }
}

export const electronCoordinatorTeam = defineInvokeEventa<
  CoordinatorAgentStatusView[],
  void
>('eventa:invoke:electron:coordinator:team')
