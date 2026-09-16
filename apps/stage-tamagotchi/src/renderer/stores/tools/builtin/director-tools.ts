import type { Tool } from '@xsai/shared-chat'
import type { JsonSchema } from 'xsschema'

import { defineInvoke } from '@moeru/eventa'
import { getElectronEventaContext } from '@kitsune/electron-vueuse'
import { normalizeNullableAnyOf } from '@kitsune/stage-shared/json-schema'
import { rawTool } from '@xsai/tool'
import { toJsonSchema } from 'xsschema'
import { z } from 'zod'

import {
  electronDirectorReview,
  electronDirectorApprove,
  electronDirectorReject,
  electronDirectorRevise,
} from '../../../../shared/eventa'

let sharedContext: ReturnType<typeof getElectronEventaContext> | undefined

function getContext() {
  sharedContext ??= getElectronEventaContext()
  return sharedContext
}

function createInvokers() {
  const context = getContext()
  return {
    review: defineInvoke(context, electronDirectorReview),
    approve: defineInvoke(context, electronDirectorApprove),
    reject: defineInvoke(context, electronDirectorReject),
    revise: defineInvoke(context, electronDirectorRevise),
  }
}

export type DirectorToolInvokers = ReturnType<typeof createInvokers>

let directorToolInvokers: DirectorToolInvokers | undefined

function resolveInvokers(override?: DirectorToolInvokers): DirectorToolInvokers {
  if (override)
    return override
  directorToolInvokers ??= createInvokers()
  return directorToolInvokers
}

const planIdParams = z.object({
  planId: z.string().describe('Plan id as reported by director_review (or from the review markdown header).'),
  reason: z.string().describe('Brief reason for the decision, e.g. "计划清晰，按此执行".'),
}).strict()

type PlanIdToolInput = z.infer<typeof planIdParams>

const noInputSchema = { type: 'object', required: [], additionalProperties: false } satisfies JsonSchema

/**
 * director_review — 桌宠作为总监，评审 .kitsune/plans/ 下最新一份外部 AI 计划。
 * 主进程调 LLM 生成评审意见，并把判定写入 verdict 文件。
 */
export async function directorReview(deps?: { invokers?: DirectorToolInvokers }) {
  const invokers = resolveInvokers(deps?.invokers)
  return invokers.review()
}

/** director_approve — 直接通过某计划（不调 LLM），写 approved verdict。 */
export async function directorApprovePlan(input: PlanIdToolInput, deps?: { invokers?: DirectorToolInvokers }) {
  const invokers = resolveInvokers(deps?.invokers)
  return invokers.approve({ planId: input.planId.trim(), reason: input.reason.trim() })
}

/** director_reject — 打回某计划，写 rejected verdict 及修订意见。 */
export async function directorRejectPlan(input: PlanIdToolInput, deps?: { invokers?: DirectorToolInvokers }) {
  const invokers = resolveInvokers(deps?.invokers)
  return invokers.reject({ planId: input.planId.trim(), reason: input.reason.trim() })
}

const revisePlanIdParams = z.object({
  planId: z.string().describe('Plan id of a previously rejected plan.'),
}).strict()

type RevisePlanToolInput = z.infer<typeof revisePlanIdParams>

/** director_revise — 驳回后按评审意见修订任务清单并写回（清空 verdict 回到待评审）。 */
export async function directorRevisePlan(input: RevisePlanToolInput, deps?: { invokers?: DirectorToolInvokers }) {
  const invokers = resolveInvokers(deps?.invokers)
  return invokers.revise({ planId: input.planId.trim() })
}

const tools: Promise<Tool>[] = [
  (async () => rawTool({
    name: 'director_review',
    description: 'Act as the pet\'s director: review the latest plan dropped into .kitsune/plans/ by an external AI tool. Runs an LLM review, writes a review markdown + verdict JSON, and returns the verdict. Use when an external agent reports a plan awaiting approval.',
    execute: () => directorReview(),
    parameters: normalizeNullableAnyOf(noInputSchema),
  }))(),
  (async () => rawTool({
    name: 'director_approve',
    description: 'Approve a plan previously reviewed by director_review (or known by id), writing an approved verdict JSON. Pass the planId and a one-line reason.',
    execute: params => directorApprovePlan(params as PlanIdToolInput),
    parameters: normalizeNullableAnyOf(await toJsonSchema(planIdParams) as JsonSchema),
  }))(),
  (async () => rawTool({
    name: 'director_reject',
    description: 'Reject a plan previously reviewed by director_review (or known by id), writing a rejected verdict JSON with a reason describing what to fix. After rejecting, call director_revise to have the pet amend the task list per the feedback.',
    execute: params => directorRejectPlan(params as PlanIdToolInput),
    parameters: normalizeNullableAnyOf(await toJsonSchema(planIdParams) as JsonSchema),
  }))(),
  (async () => rawTool({
    name: 'director_revise',
    description: 'Amend a rejected plan: the pet (director) rewrites the task list according to the review feedback, writes it back to the plan file, clears the verdict, and the plan goes back to pending for re-review. Use only after director_reject on the same planId.',
    execute: params => directorRevisePlan(params as RevisePlanToolInput),
    parameters: normalizeNullableAnyOf(await toJsonSchema(revisePlanIdParams) as JsonSchema),
  }))(),
]

export const directorTools = async () => Promise.all(tools)