// Domain: director — eventa IPC 契约按域拆分
import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

// ========== Director Mode（总监模式）事件 ==========
// 桌宠作为"监工"，对 .kitsune/plans/ 下的外部 AI 计划做评审并回写 verdict。
// 每条走 invoke，renderer 用 director_review / director_approve / director_reject 工具调用。

export const electronDirectorReview = defineInvokeEventa<
  { ok: boolean, planId?: string, verdict?: string, feedback?: string, error?: string },
  void
>('eventa:invoke:electron:director:review')

export const electronDirectorApprove = defineInvokeEventa<
  { ok: boolean, error?: string },
  { planId: string, reason: string }
>('eventa:invoke:electron:director:approve')

export const electronDirectorReject = defineInvokeEventa<
  { ok: boolean, error?: string },
  { planId: string, reason: string }
>('eventa:invoke:electron:director:reject')

/** 总监页只读：计划摘要列表（按时间倒序）。 */
export interface DirectorPlanSummary {
  id: string
  requirement: string
  taskCount: number
  status: 'pending' | 'running' | 'completed' | 'aborted'
  createdAt: number
  verdict: {
    planId: string
    verdict: 'approved' | 'rejected'
    reason: string
    reviewedAt: number
  } | null
}

export const electronDirectorList = defineInvokeEventa<
  DirectorPlanSummary[],
  void
>('eventa:invoke:electron:director:list')

/** 总监页只读：单个计划详情（完整 IR + verdict + 评审 markdown）。 */
export interface DirectorPlanDetail {
  plan: {
    id: string
    requirement: string
    tasks: unknown[]
    status: string
    createdAt: number
    [k: string]: unknown
  } | null
  verdict: DirectorPlanSummary['verdict']
  reviewMarkdown: string | null
  error?: string
}

export const electronDirectorDetail = defineInvokeEventa<
  DirectorPlanDetail,
  { planId: string }
>('eventa:invoke:electron:director:detail')

/** 总监裁决事件 — approve/reject 落盘后广播，桌宠以"总监身份"表达（表情 + 朗读）。 */
export interface DirectorVerdictEventPayload {
  planId: string
  verdict: 'approved' | 'rejected'
  reason: string
  reviewedAt: number
}
export const electronDirectorEvent = defineEventa<DirectorVerdictEventPayload>('eventa:event:electron:director:event')
