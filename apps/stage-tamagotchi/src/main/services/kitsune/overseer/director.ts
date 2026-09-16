/**
 * 总监模式（Director Mode）— 桌宠作为"监工"，评审外部 AI 工具生成的计划。
 *
 * V1 设计（只读评审，不篡改执行）：
 *   1. 外部 AI 工具（Claude/Codex/ZCode 等）把待评审计划写入
 *      `.kitsune/plans/<id>.json`（PLAN 文件，含 Plan 对象）
 *   2. 本模块监听 .kitsune/plans/ 目录，发现新 PLAN 后立即评审：
 *      - 先做 IR 校验（结构合法性：requirement/tasks/status/createdAt）
 *      - 合法则调 LLM 写评审意见并写入 `.kitsune/plans/reviews/<id>.md`
 *   3. 评审意见可被渲染层 LLM 工具（director_review/director_approve/director_reject）
 *      消费：approve/reject 会把结论以 verdict JSON 回写到 `.kitsune/plans/verdicts/<id>.json`
 *   4. verdict 由外部 AI 工具（或人）读取，决定放行或修改 —— 不改变执行器本身
 *
 * 这样总监与执行器解耦：总监只审不执行，执行队列仍由 executor 管。
 */

import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

import { useLogg } from '@guiiai/logg'
import { callLlm } from './executor/llmHelper'

const log = useLogg('director').useGlobalConfig()

/** 计划存放根目录（相对 app 工作区；可被环境变量覆盖）。 */
export const PLANS_ROOT = process.env.KITSUNE_PLANS_ROOT
  ?? join(process.cwd(), '.kitsune', 'plans')

export const PLANS_DIR = join(PLANS_ROOT, 'plans')
export const REVIEWS_DIR = join(PLANS_ROOT, 'reviews')
export const VERDICTS_DIR = join(PLANS_ROOT, 'verdicts')

// ——— Plan IR 类型（与 executor/planGenerator 最小对齐，避免引用 app 模块） ———
export interface PlannerTask {
  id: string
  type: 'cli' | 'ide' | 'desktop'
  title: string
  [k: string]: unknown
}

export interface PlanIR {
  id: string
  requirement: string
  tasks: PlannerTask[]
  status: 'pending' | 'running' | 'completed' | 'aborted'
  createdAt: number
  [k: string]: unknown
}

/** 评审结论。 */
export interface ReviewVerdict {
  planId: string
  verdict: 'approved' | 'rejected'
  reason: string
  reviewedAt: number
}

interface ReviewResult {
  verdict: 'approved' | 'rejected'
  feedback: string
}

const SYSTEM_PROMPT = `你是桌宠的"总监"。外部 AI 工具把一份计划（PLAN）交给你评审。
你的职责是判断它是否值得执行：目标是否明确、任务拆分是否合理、有无明显遗漏或风险。
评审标准：计划只要目标清晰、任务可执行、无明显风险，就应当通过（approved）；
只有在存在会导致执行失败或产出不可用的实质缺陷时，才驳回（rejected）。
不要因为"可以做得更好"就驳回 —— 那是优化建议，不是缺陷。
输出格式必须是 JSON，仅含两个字段：
{
  "verdict": "approved" 或 "rejected",
  "feedback": "不超过 8 句话的评审意见；approved 时给可执行建议，rejected 时明确指出缺什么、怎么改"
}`

function buildPlanPrompt(plan: PlanIR): string {
  const tasks = plan.tasks
    .map((t, i) => `  ${i + 1}. [${t.type}] ${t.title}${t.id ? ` (id:${String(t.id).slice(0, 8)})` : ''}`)
    .join('\n')
  return [
    '待评审计划：',
    `ID: ${plan.id}`,
    `需求: ${plan.requirement}`,
    `任务数量: ${plan.tasks.length}`,
    '任务列表：',
    tasks,
    '',
    '请评审并输出 JSON（只输出 JSON）。',
  ].join('\n')
}

/** 提取纯 JSON（容忍 ```json 围栏与前后缀说明文字）。 */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced)
    return fenced[1].trim()
  // 无围栏：从第一个 { 到最后一个 } 截取（LLM 常在 JSON 前后夹带说明文字）
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end > start)
    return text.slice(start, end + 1).trim()
  return text.trim()
}

/** 解析 LLM 输出为 ReviewResult；解析失败时按 rejected 兜底（安全方向：宁可打回也不放行）。 */
export function parseReviewResult(text: string | undefined): ReviewResult {
  try {
    if (!text)
      throw new Error('空响应')
    const parsed = JSON.parse(extractJson(text))
    const verdict = parsed.verdict === 'approved' ? 'approved' : 'rejected'
    return {
      verdict,
      feedback: String(parsed.feedback ?? (verdict === 'approved' ? '计划合理，可执行。' : '计划有缺口，建议补充后重提。')),
    }
  } catch {
    return { verdict: 'rejected', feedback: '评审响应无法解析（非 JSON），已按不通过处理。' }
  }
}

/** 基础结构校验（Plan IR 的最小合法性）。 */
export function validatePlanIR(plan: PlanIR): { ok: boolean, error?: string } {
  if (!plan || typeof plan !== 'object')
    return { ok: false, error: '计划为空或不是对象' }
  if (typeof plan.id !== 'string' || !plan.id)
    return { ok: false, error: '计划缺 id' }
  if (typeof plan.requirement !== 'string' || !plan.requirement.trim())
    return { ok: false, error: '计划缺 requirement' }
  if (!Array.isArray(plan.tasks) || plan.tasks.length === 0)
    return { ok: false, error: '计划 tasks 缺失或为空' }
  for (const t of plan.tasks) {
    if (typeof t.title !== 'string' || !t.title.trim())
      return { ok: false, error: '任务缺 title' }
    if (!['cli', 'ide', 'desktop'].includes(t.type))
      return { ok: false, error: `任务类型不合法: ${String(t.type)}` }
  }
  if (!['pending', 'running', 'completed', 'aborted'].includes(plan.status))
    return { ok: false, error: `计划 status 不合法: ${String(plan.status)}` }
  if (typeof plan.createdAt !== 'number')
    return { ok: false, error: '计划缺 createdAt' }
  return { ok: true }
}

/** 调 LLM 评审一份计划。 */
export async function reviewPlan(
  plan: PlanIR,
): Promise<{ ok: boolean, result?: ReviewResult, error?: string }> {
  const check = validatePlanIR(plan)
  if (!check.ok)
    return { ok: false, error: check.error }

  const llmResult = await callLlm(SYSTEM_PROMPT, buildPlanPrompt(plan))
  if (!llmResult.ok)
    return { ok: false, error: llmResult.error }

  return { ok: true, result: parseReviewResult(llmResult.text) }
}

function ensureDirs(): void {
  for (const dir of [PLANS_DIR, REVIEWS_DIR, VERDICTS_DIR]) {
    try { mkdirSync(dir, { recursive: true }) } catch { /* 忽略 */ }
  }
}

/** 显式评审一份计划（供 LLM 工具 / 测试注入）并落盘 review + verdict。 */
export async function reviewPlanFile(plan: PlanIR): Promise<{ ok: boolean, reviewPath?: string, verdictPath?: string, verdict?: ReviewVerdict, error?: string }> {
  ensureDirs()
  const r = await reviewPlan(plan)
  if (!r.ok || !r.result)
    return { ok: false, error: r.error ?? '评审失败' }

  const reviewPath = join(REVIEWS_DIR, `${plan.id}.md`)
  const reviewContent = [
    `# 计划评审 — ${plan.id}`,
    '',
    `**判定**: ${r.result.verdict === 'approved' ? '✅ 通过' : '❌ 打回'}`,
    '',
    r.result.feedback,
    '',
    `_评审时间: ${new Date().toISOString()}_`,
    '',
  ].join('\n')
  try {
    writeFileSync(reviewPath, reviewContent, 'utf8')
  } catch (e) {
    return { ok: false, error: `评审文件写入失败: ${e instanceof Error ? e.message : String(e)}` }
  }

  // 判定即写 verdict —— 让外部工具（或人）可读，决定是否放行
  const verdict: ReviewVerdict = {
    planId: plan.id,
    verdict: r.result.verdict,
    reason: r.result.feedback,
    reviewedAt: Date.now(),
  }
  const verdictPath = join(VERDICTS_DIR, `${plan.id}.json`)
  try {
    writeFileSync(verdictPath, JSON.stringify(verdict, null, 2), 'utf8')
  } catch (e) {
    return { ok: false, error: `verdict 写入失败: ${e instanceof Error ? e.message : String(e)}` }
  }

  log.log('review complete', { planId: plan.id, verdict: verdict.verdict })
  return { ok: true, reviewPath, verdictPath, verdict }
}

/** 读取 .kitsune/plans/plans/ 下所有 PLAN 文件（.json）。 */
export function listPlanFiles(): string[] {
  try {
    if (!existsSync(PLANS_DIR)) return []
    return readdirSync(PLANS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => join(PLANS_DIR, f))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  } catch {
    return []
  }
}

/** 读取单个 PLAN 文件内容并解析为 PlanIR。 */
export function readPlanFile(filePath: string): PlanIR | null {
  try {
    const raw = readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw) as PlanIR
    return parsed
  } catch {
    return null
  }
}

/** 读取指定计划 ID 的 verdict（若已评审）。 */
export function readVerdict(planId: string): ReviewVerdict | null {
  try {
    const path = join(VERDICTS_DIR, `${planId}.json`)
    if (!existsSync(path)) return null
    return JSON.parse(readFileSync(path, 'utf8')) as ReviewVerdict
  } catch {
    return null
  }
}

/** 读取指定计划 ID 的评审 markdown 内容（若已评审）。 */
export function readReviewMarkdown(planId: string): string | null {
  try {
    const path = join(REVIEWS_DIR, `${planId}.md`)
    if (!existsSync(path)) return null
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

/** 计划列表条目（供 renderer 总监页展示，不含完整任务图）。 */
export interface DirectorPlanSummary {
  id: string
  requirement: string
  taskCount: number
  status: PlanIR['status']
  createdAt: number
  verdict: ReviewVerdict | null
}

/** 汇总 .kitsune/plans/plans/ 下全部计划为摘要列表（按时间倒序）。 */
export function listDirectorPlans(): DirectorPlanSummary[] {
  const files = listPlanFiles()
  const summaries: DirectorPlanSummary[] = []
  for (const file of files) {
    const plan = readPlanFile(file)
    if (!plan) continue
    summaries.push({
      id: plan.id,
      requirement: plan.requirement,
      taskCount: Array.isArray(plan.tasks) ? plan.tasks.length : 0,
      status: plan.status,
      createdAt: plan.createdAt,
      verdict: readVerdict(plan.id),
    })
  }
  return summaries
}

/** 单个计划详情：完整 PlanIR + verdict + review markdown。 */
export function getDirectorPlanDetail(planId: string): { plan: PlanIR | null, verdict: ReviewVerdict | null, reviewMarkdown: string | null } {
  const files = listPlanFiles()
  const file = files.find((f) => readPlanFile(f)?.id === planId)
  const plan = file ? readPlanFile(file) : null
  return {
    plan,
    verdict: plan ? readVerdict(plan.id) : null,
    reviewMarkdown: plan ? readReviewMarkdown(plan.id) : null,
  }
}

/** 端到端评审一份为新出现的 PLAN：写 review + verdict；若已评审过（verdict 文件已存在）则跳过。 */
export async function reviewNewPlanFile(filePath: string): Promise<{ ok: boolean, skipped?: boolean, error?: string }> {
  const plan = readPlanFile(filePath)
  if (!plan) {
    log.warn('skip unparseable plan', { filePath })
    return { ok: false, error: '无法解析计划文件' }
  }

  const verdictPath = join(VERDICTS_DIR, `${plan.id}.json`)
  if (existsSync(verdictPath)) {
    log.log('plan already reviewed, skip', { planId: plan.id })
    return { ok: true, skipped: true }
  }

  const r = await reviewPlanFile(plan)
  return { ok: r.ok, error: r.error }
}

/** 供 renderer LLM 工具调用的显式 review（选择最新未评审计划）。 */
export async function directorReviewLatest(): Promise<{ ok: boolean, planId?: string, verdict?: string, feedback?: string, error?: string }> {
  const files = listPlanFiles()
  if (files.length === 0)
    return { ok: false, error: '没有待评审的计划（.kitsune/plans/plans/ 为空）' }

  const plan = readPlanFile(files[0])
  if (!plan)
    return { ok: false, error: '最新计划文件无法解析' }

  const r = await reviewPlanFile(plan)
  if (!r.ok || !r.verdict)
    return { ok: false, error: r.error ?? '评审失败' }

  return { ok: true, planId: plan.id, verdict: r.verdict.verdict, feedback: r.verdict.reason }
}

/** 供 renderer LLM 工具调用：直接给出通过判定（不调 LLM）并写 verdict。 */
export function directorApprove(planId: string, reason: string): { ok: boolean, verdict?: ReviewVerdict, error?: string } {
  ensureDirs()
  const files = listPlanFiles()
  const file = files.find((f) => readPlanFile(f)?.id === planId)
  if (!file) {
    // 未找到指定 ID 的计划 → 允许按"最新计划"兜底（LLM 常只知 ID 不全）
    if (!planId && files.length > 0)
      return directorApprove(readPlanFile(files[0])!.id, reason)
    return { ok: false, error: `未找到计划 ID: ${planId || '(空)'}` }
  }

  const verdict: ReviewVerdict = {
    planId,
    verdict: 'approved',
    reason: reason || '人工/工具核准',
    reviewedAt: Date.now(),
  }
  try {
    writeFileSync(join(VERDICTS_DIR, `${planId}.json`), JSON.stringify(verdict, null, 2), 'utf8')
    return { ok: true, verdict }
  } catch (e) {
    return { ok: false, error: `verdict 写入失败: ${e instanceof Error ? e.message : String(e)}` }
  }
}

/** 供 renderer LLM 工具调用：直接打回（不调 LLM）并写 verdict。 */
export function directorReject(planId: string, reason: string): { ok: boolean, verdict?: ReviewVerdict, error?: string } {
  ensureDirs()
  const verdict: ReviewVerdict = {
    planId,
    verdict: 'rejected',
    reason: reason || '计划未达要求，需修订后重提',
    reviewedAt: Date.now(),
  }
  try {
    writeFileSync(join(VERDICTS_DIR, `${planId}.json`), JSON.stringify(verdict, null, 2), 'utf8')
    return { ok: true, verdict }
  } catch (e) {
    return { ok: false, error: `verdict 写入失败: ${e instanceof Error ? e.message : String(e)}` }
  }
}

// ——— 修订通道（revise）———
// 总监「驳回」之后，桌宠不能只打回 —— 用户要的是把计划改成能用的样子。
// revise 把原计划 + 评审意见交给 LLM，生成修订后的任务清单，写回同一 plan 文件并
// 清空旧 verdict（回到 pending），外部 agent / 用户可再次提审。改动只落到
// .kitsune/plans/ 目录，不触碰执行器本身（与总监「只评审不执行」边界一致）。

const REVISE_SYSTEM_PROMPT = `你是桌宠的"总监"助理。桌宠驳回了一份计划，现在需要你根据评审意见修订它。
计划文件里 requirement 保持不变，只允许增删改 tasks（保持 tasks 的字段结构：
title/type/id/critical/dependsOn/prompt 等原有字段形式）。
输出必须是 JSON，仅含一个字段 "tasks"（修订后的任务数组）。
任务之间可用 dependsOn 表达依赖；关键任务（失败必须停）标 critical: true。`

function buildRevisePrompt(plan: PlanIR, feedback: string): string {
  const tasks = plan.tasks
    .map((t, i) => `  ${i + 1}. [${t.type}] ${t.title}`)
    .join('\n')
  return [
    '原计划：',
    `ID: ${plan.id}`,
    `需求: ${plan.requirement}`,
    '任务列表：',
    tasks,
    '',
    `评审意见：${feedback}`,
    '',
    '请按评审意见修订任务列表，输出 JSON（只输出 JSON）。',
  ].join('\n')
}

/**
 * 修订一份已驳回的计划：LLM 按评审 feedback 生成新任务清单，写回 plan 文件并清空 verdict。
 * 返回修订后的计划；失败时不落盘。
 */
export async function directorRevise(
  planId: string,
): Promise<{ ok: boolean, plan?: PlanIR, error?: string }> {
  ensureDirs()
  const files = listPlanFiles()
  const file = files.find((f) => readPlanFile(f)?.id === planId)
  if (!file) {
    // 未找到指定 ID 时按"最新计划"兜底（与 approve/reject 行为一致）
    if (files.length > 0)
      return directorRevise(readPlanFile(files[0])!.id)
    return { ok: false, error: `未找到计划 ID: ${planId || '(空)'}` }
  }

  const plan = readPlanFile(file)
  if (!plan)
    return { ok: false, error: '计划文件无法解析' }

  const verdict = readVerdict(plan.id)
  if (!verdict || verdict.verdict !== 'rejected') {
    // 只允许修订被驳回的计划（approved 直接放行，无修订必要）
    return { ok: false, error: `计划 ${plan.id} 当前无需修订（verdict: ${verdict?.verdict ?? '无'}）` }
  }

  const llmResult = await callLlm(REVISE_SYSTEM_PROMPT, buildRevisePrompt(plan, verdict.reason))
  if (!llmResult.ok)
    return { ok: false, error: llmResult.error }

  let parsed: { tasks?: PlannerTask[] } | null = null
  try {
    if (!llmResult.text)
      return { ok: false, error: '修订响应为空' }
    parsed = JSON.parse(extractJson(llmResult.text))
  }
  catch {
    return { ok: false, error: '修订响应无法解析（非 JSON）' }
  }
  const newTasks = parsed?.tasks
  if (!Array.isArray(newTasks) || newTasks.length === 0)
    return { ok: false, error: '修订结果 tasks 缺失或为空' }

  const revised: PlanIR = { ...plan, tasks: newTasks, status: 'pending' }
  try {
    writeFileSync(file, JSON.stringify(revised, null, 2), 'utf8')
    // 清空旧 verdict（回到待评审）
    try { unlinkSync(join(VERDICTS_DIR, `${plan.id}.json`)) } catch { /* verdict 不存在则跳过 */ }
  }
  catch (e) {
    return { ok: false, error: `修订写入失败: ${e instanceof Error ? e.message : String(e)}` }
  }

  log.log('plan revised', { planId: plan.id, taskCount: newTasks.length })
  return { ok: true, plan: revised }
}

/** 在内存中模拟一个 PlanIR（便于测试/演示），不落盘。 */
export function makeTestPlan(requirement = '把项目 README 补充完整', taskCount = 3): PlanIR {
  const id = randomUUID().slice(0, 8)
  const tasks: PlannerTask[] = Array.from({ length: taskCount }, (_, i) => ({
    id: randomUUID().slice(0, 8),
    type: 'cli',
    title: `任务 ${i + 1}: 处理 ${requirement}`,
  }))
  return { id, requirement, tasks, status: 'pending', createdAt: Date.now() }
}