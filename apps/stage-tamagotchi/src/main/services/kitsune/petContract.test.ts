/**
 * petContract / petReportContract 契约测试
 *
 * ── 防回归点 ──
 * 1. discriminatedUnion 6 类型：判据字段缺失必须 fail（superRefine 会被 zodToJsonSchema
 *    静默丢弃的历史坑，这里用真实 stableParse 断言 required 存在）。
 * 2. 白名单扩展：12 个 source 全接受（MCP 上报 zcode/workbuddy/opencode 不被过滤）。
 * 3. zodToJsonSchema 派生出的 JSON Schema required 字段存在（给 MCP tool 参数提示）。
 */

import { describe, expect, it } from 'vitest'

import {
  PET_REACTION_SOURCE,
  PET_REPORT_ACTIVITY,
  petReactionContractSchema,
  petReportContractSchema,
} from './petContract'

describe('petReactionContractSchema', () => {
  it('接受全部 12 个来源', () => {
    for (const source of PET_REACTION_SOURCE) {
      const parsed = petReactionContractSchema.safeParse({
        type: 'info',
        source,
        summary: '测试来源',
      })
      expect(parsed.success, `source=${source} 应被接受`).toBe(true)
    }
  })

  it('info 型只需 type/source/summary', () => {
    const parsed = petReactionContractSchema.safeParse({
      type: 'info',
      source: 'zcode',
      summary: '开始处理任务',
    })
    expect(parsed.success).toBe(true)
  })

  it('unknown source 被拒绝', () => {
    const parsed = petReactionContractSchema.safeParse({
      type: 'info',
      source: 'not-a-tool',
      summary: 'x',
    })
    expect(parsed.success).toBe(false)
  })

  it('critique 缺判据字段 suggestion 被拒绝', () => {
    const parsed = petReactionContractSchema.safeParse({
      type: 'critique',
      source: 'zcode',
      summary: '这段代码不好',
      // 缺 suggestion
    })
    expect(parsed.success).toBe(false)
  })

  it('warn 缺判据字段 condition/consequence 被拒绝', () => {
    const parsed = petReactionContractSchema.safeParse({
      type: 'warn',
      source: 'claude_code',
      summary: '小心',
      // 缺 condition / consequence
    })
    expect(parsed.success).toBe(false)
  })

  it('error 缺 errorMessage 被拒绝', () => {
    const parsed = petReactionContractSchema.safeParse({
      type: 'error',
      source: 'cursor',
      summary: '构建失败',
    })
    expect(parsed.success).toBe(false)
  })

  it('stuck 缺 attempted 被拒绝', () => {
    const parsed = petReactionContractSchema.safeParse({
      type: 'stuck',
      source: 'trae',
      summary: '卡住了',
    })
    expect(parsed.success).toBe(false)
  })

  it('celebrate 的 what 是可选素材，缺失仍通过', () => {
    const parsed = petReactionContractSchema.safeParse({
      type: 'celebrate',
      source: 'opencode',
      summary: '测试全绿',
    })
    expect(parsed.success).toBe(true)
  })

  it('summary 超 2000 字被拒绝', () => {
    const parsed = petReactionContractSchema.safeParse({
      type: 'info',
      source: 'zcode',
      summary: 'x'.repeat(2001),
    })
    expect(parsed.success).toBe(false)
  })
})

describe('petReportContractSchema', () => {
  it('接受全部 10 个活动状态', () => {
    for (const activity of PET_REPORT_ACTIVITY) {
      const parsed = petReportContractSchema.safeParse({
        source: 'zcode',
        activity,
      })
      expect(parsed.success, `activity=${activity} 应被接受`).toBe(true)
    }
  })

  it('接受可选字段 message/tool/errorMessage', () => {
    const parsed = petReportContractSchema.safeParse({
      source: 'workbuddy',
      activity: 'error',
      message: '构建失败了',
      tool: 'Bash',
      errorMessage: 'exit code 1',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.tool).toBe('Bash')
      expect(parsed.data.errorMessage).toBe('exit code 1')
    }
  })

  it('未知 activity 被拒绝', () => {
    const parsed = petReportContractSchema.safeParse({
      source: 'zcode',
      activity: 'hacking',
    })
    expect(parsed.success).toBe(false)
  })

  it('unknown source 被拒绝', () => {
    const parsed = petReportContractSchema.safeParse({
      source: 'nope',
      activity: 'thinking',
    })
    expect(parsed.success).toBe(false)
  })

  it('message 超 2000 字被拒绝', () => {
    const parsed = petReportContractSchema.safeParse({
      source: 'zcode',
      activity: 'thinking',
      message: 'x'.repeat(2001),
    })
    expect(parsed.success).toBe(false)
  })
})

describe('zod4 toJSONSchema 派生（MCP tool 参数一致性）', () => {
  it('petReactionContractSchema 派生后的每个分支 required 含自己的判据字段', () => {
    // zod4 原生 toJSONSchema：discriminatedUnion → oneOf 数组，每个分支一个 object schema
    const schema = petReactionContractSchema.toJSONSchema() as any

    const branches: any[] = schema.oneOf ?? [schema]
    expect(branches.length).toBeGreaterThanOrEqual(6)

    for (const branch of branches) {
      const required: string[] = branch.required ?? []
      // 每个分支都必须要求 type/source/summary
      expect(required).toContain('type')
      expect(required).toContain('source')
      expect(required).toContain('summary')
    }

    // 专门挑 critique 分支检查 suggestion 必填
    const critique = branches.find((b: any) =>
      (b.properties?.type?.const ?? b.properties?.type?.enum?.[0]) === 'critique')
    expect(critique, 'critique 分支应存在').toBeTruthy()
    expect(critique.required).toContain('suggestion')
  })

  it('petReportContractSchema 派生后 source/activity 必填', () => {
    const schema = petReportContractSchema.toJSONSchema() as any
    const required: string[] = schema.required ?? []
    expect(required).toContain('source')
    expect(required).toContain('activity')
  })
})