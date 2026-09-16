import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 纯函数直接静态导入（不触目录）
import { validatePlanIR, parseReviewResult, makeTestPlan } from './director'

// 打桩 LLM：评审恒通过，避免真实网络调用
vi.mock('./executor/llmHelper', () => ({
  callLlm: vi.fn(async () => ({
    ok: true,
    text: '{"verdict":"approved","feedback":"结构清晰，可执行"}',
  })),
}))

let tmpRoot = ''

/**
 * 目录相关 API 依赖模块级 PLANS_ROOT 常量（模块加载时读 env）。
 * 用 resetModules + 动态 import 拿到"env 已设置后"的全新模块实例，
 * 让文件读写落在临时目录，不污染仓库。
 */
async function loadDirector() {
  vi.resetModules()
  process.env.KITSUNE_PLANS_ROOT = tmpRoot
  return await import('./director')
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kitsune-director-'))
})

afterEach(() => {
  delete process.env.KITSUNE_PLANS_ROOT
  if (tmpRoot)
    rmSync(tmpRoot, { recursive: true, force: true })
  vi.resetModules()
})

describe('validatePlanIR', () => {
  it('接受合法计划', () => {
    expect(validatePlanIR(makeTestPlan()).ok).toBe(true)
  })

  it('拒绝空计划', () => {
    expect(validatePlanIR(null as never).ok).toBe(false)
    expect(validatePlanIR(undefined as never).ok).toBe(false)
  })

  it('拒绝缺 id / requirement / createdAt', () => {
    const p = makeTestPlan()
    expect(validatePlanIR({ ...p, id: '' }).ok).toBe(false)
    expect(validatePlanIR({ ...p, requirement: '  ' }).ok).toBe(false)
    expect(validatePlanIR({ ...p, createdAt: 'x' as never }).ok).toBe(false)
  })

  it('拒绝 tasks 为空或任务缺 title/类型非法', () => {
    const p = makeTestPlan()
    expect(validatePlanIR({ ...p, tasks: [] }).ok).toBe(false)
    expect(validatePlanIR({ ...p, tasks: [{ ...p.tasks[0], title: '' }] }).ok).toBe(false)
    expect(validatePlanIR({ ...p, tasks: [{ ...p.tasks[0], type: 'hack' as never }] }).ok).toBe(false)
  })

  it('拒绝 status 非法', () => {
    const p = makeTestPlan()
    expect(validatePlanIR({ ...p, status: 'paused' as never }).ok).toBe(false)
  })
})

describe('parseReviewResult', () => {
  it('解析 approved', () => {
    const r = parseReviewResult('{"verdict":"approved","feedback":"计划合理"}')
    expect(r.verdict).toBe('approved')
    expect(r.feedback).toContain('计划合理')
  })

  it('容忍 markdown 围栏', () => {
    const r = parseReviewResult('```json\n{"verdict":"rejected","feedback":"缺测试"}\n```')
    expect(r.verdict).toBe('rejected')
    expect(r.feedback).toContain('缺测试')
  })

  it('容忍 JSON 前后夹带的说明文字（无围栏）', () => {
    const r = parseReviewResult('好的，以下是评审结果：\n{"verdict":"approved","feedback":"计划合理，可以执行"}\n以上是我的意见。')
    expect(r.verdict).toBe('approved')
    expect(r.feedback).toContain('计划合理')
  })

  it('非 JSON 时安全降级为 rejected', () => {
    const r = parseReviewResult('这不是 JSON')
    expect(r.verdict).toBe('rejected')
  })
})

describe('目录 + 评审（临时目录,LLM 打桩）', () => {
  it('listPlanFiles / readPlanFile 读写 PLAN 文件', async () => {
    const d = await loadDirector()
    mkdirSync(d.PLANS_DIR, { recursive: true })
    const plan = makeTestPlan()
    writeFileSync(join(d.PLANS_DIR, `${plan.id}.json`), JSON.stringify(plan), 'utf8')
    const files = d.listPlanFiles()
    expect(files.length).toBe(1)
    expect(d.readPlanFile(files[0])?.id).toBe(plan.id)
  })

  it('reviewPlanFile 评审通过并写 review + verdict 文件', async () => {
    const d = await loadDirector()
    const plan = makeTestPlan('把 README 补充完整', 2)
    const r = await d.reviewPlanFile(plan)
    expect(r.ok).toBe(true)
    expect(r.verdict?.verdict).toBe('approved')
    expect(r.reviewPath && existsSync(r.reviewPath)).toBe(true)
    expect(r.verdictPath && existsSync(r.verdictPath)).toBe(true)
    const verdict = JSON.parse(require('node:fs').readFileSync(r.verdictPath!, 'utf8'))
    expect(verdict.verdict).toBe('approved')
  })

  it('reviewNewPlanFile 对不可解析文件返回失败', async () => {
    const d = await loadDirector()
    mkdirSync(d.PLANS_DIR, { recursive: true })
    writeFileSync(join(d.PLANS_DIR, 'bad.json'), 'not json', 'utf8')
    const r = await d.reviewNewPlanFile(join(d.PLANS_DIR, 'bad.json'))
    expect(r.ok).toBe(false)
  })

  it('已评审过的计划跳过（verdict 已存在）', async () => {
    const d = await loadDirector()
    mkdirSync(d.PLANS_DIR, { recursive: true })
    mkdirSync(d.VERDICTS_DIR, { recursive: true })
    const plan = makeTestPlan()
    const planFile = join(d.PLANS_DIR, `${plan.id}.json`)
    writeFileSync(planFile, JSON.stringify(plan), 'utf8')
    writeFileSync(join(d.VERDICTS_DIR, `${plan.id}.json`), '{}', 'utf8')
    const r = await d.reviewNewPlanFile(planFile)
    expect(r.ok).toBe(true)
    expect(r.skipped).toBe(true)
  })

  it('directorApprove 写 approved verdict', async () => {
    const d = await loadDirector()
    mkdirSync(d.PLANS_DIR, { recursive: true })
    mkdirSync(d.VERDICTS_DIR, { recursive: true })
    const plan = makeTestPlan()
    writeFileSync(join(d.PLANS_DIR, `${plan.id}.json`), JSON.stringify(plan), 'utf8')
    const r = d.directorApprove(plan.id, '工具核准')
    expect(r.ok).toBe(true)
    const verdict = JSON.parse(require('node:fs').readFileSync(join(d.VERDICTS_DIR, `${plan.id}.json`), 'utf8'))
    expect(verdict.verdict).toBe('approved')
    expect(verdict.reason).toBe('工具核准')
  })

  it('directorReject 写 rejected verdict', async () => {
    const d = await loadDirector()
    mkdirSync(d.VERDICTS_DIR, { recursive: true })
    const r = d.directorReject('p1', '缺测试')
    expect(r.ok).toBe(true)
    const verdict = JSON.parse(require('node:fs').readFileSync(join(d.VERDICTS_DIR, 'p1.json'), 'utf8'))
    expect(verdict.verdict).toBe('rejected')
    expect(verdict.reason).toContain('缺测试')
  })

  it('directorRevise 按评审意见修订任务并清空 verdict', async () => {
    // 覆盖 LLM 打桩：评审恒通过，修订返回新任务数组（原打桩 mock 对 revise 用同一条路径）
    const d = await loadDirector()
    mkdirSync(d.PLANS_DIR, { recursive: true })
    mkdirSync(d.VERDICTS_DIR, { recursive: true })
    const plan = makeTestPlan('修订演示', 1)
    const planFile = join(d.PLANS_DIR, `${plan.id}.json`)
    writeFileSync(planFile, JSON.stringify(plan), 'utf8')
    // 先驳回（写 rejected verdict）
    const reject = d.directorReject(plan.id, '任务拆分不细')
    expect(reject.ok).toBe(true)

    const llmHelper = await import('./executor/llmHelper')
    vi.mocked(llmHelper.callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({ tasks: [
        { id: 't-new-1', type: 'cli', title: '任务 1: 补充 README 结构', critical: true },
        { id: 't-new-2', type: 'cli', title: '任务 2: 补充接口说明', dependsOn: ['任务 1: 补充 README 结构'] },
      ] }),
    })

    const r = await d.directorRevise(plan.id)
    expect(r.ok).toBe(true)
    expect(r.plan?.tasks).toHaveLength(2)
    expect((r.plan?.tasks[0] as { title: string }).title).toContain('README 结构')
    // verdict 已清空 → 回到待评审
    expect(existsSync(join(d.VERDICTS_DIR, `${plan.id}.json`))).toBe(false)
    // 计划文件内容已更新（tasks 数量变化）
    const updated = d.readPlanFile(planFile)
    expect(updated?.tasks).toHaveLength(2)
  })

  it('directorRevise 对未驳回的计划拒绝修订', async () => {
    const d = await loadDirector()
    mkdirSync(d.PLANS_DIR, { recursive: true })
    const plan = makeTestPlan('不该被改', 1)
    writeFileSync(join(d.PLANS_DIR, `${plan.id}.json`), JSON.stringify(plan), 'utf8')
    const r = await d.directorRevise(plan.id)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/不存在|无需修订|无/)
  })
})