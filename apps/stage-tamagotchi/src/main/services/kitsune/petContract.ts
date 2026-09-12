/**
 * PetReactionContract — 桌宠"被触发反应"的单一真源契约
 *
 * ── 位置即立场 ──
 * 本文件位于 services/kitsune/ 层级（与 overseer/、mcp-servers/ 平级），
 * 是外部接入层（MCP Server）与内部编排层（overseer）的共同依赖源。
 * 任何一方都不拥有契约，契约不反向依赖任何消费方。
 *
 * ── 为什么是 discriminatedUnion 而不是 flat object + superRefine ──
 * 早期版本用 flat z.object({...}).superRefine()：
 *   superRefine 在运行时能强制 type-specific 必填，但 zod-to-json-schema
 *   会**静默忽略** superRefine —— 生成的 JSON Schema 里判据字段全是 optional。
 *   结果：MCP tool 的参数提示说"可选"，但 overseer 运行时 safeParse 拒绝缺字段的调用。
 *   "schema 说可以，运行时说不行" 的矛盾，会让宿主模型收到 invalid-payload 却不知为何。
 * 改用 discriminatedUnion：每个分支是独立 z.object，required 字段精确出现在 JSON Schema，
 *   MCP 规范允许 oneOf，Claude/Cursor 能正确读取每个 type 的必填项。
 *
 * ── type 判据：正向"填空句式"，而非二元判断 ──
 * 不给模型做排除法（"没有替代方案就是 warn"会让模型飘），
 * 而是给每个 type 一个结构模板，让模型做填空（pattern matching 远稳于判断）：
 *   critique: "把 X 换成 Y，因为 Z"  → suggestion 即 Y。填不出 Y 就不是 critique。
 *   warn:     "当 [C] 发生时，会 [F]" → condition + consequence。填不出"当…时"就不是 warn。
 *   error:    "它已经坏了，报错 E"    → errorMessage。确定性失败，不是"可能会"。
 *   stuck:    "我试了 A、B、C 都不行" → attempted 即 A/B/C。没试过任何方案就不是 stuck。
 *   celebrate/info 同理用句式锚定。
 *
 * ── 判据字段 fatal，素材字段 non-fatal ──
 *   判据 = 缺了 type 本身不成立（critique 没 suggestion 就不是 critique）。
 *   素材 = 缺了事件仍成立、只是台词差（celebrate 没 what 仍然是 celebrate）。
 */

import { z } from 'zod'

// ─── 来源白名单 ───
// 与 config/*/tools.yaml 的监工工具枚举、overseer.yaml 的 tools[].id 对齐。
// MCP 上报通道（pet_report / triggerReaction）任何来源都必须先过这张表，
// 否则 overseer 的 triggerPetReaction 会以 unknown-source 过滤掉。
export const PET_REACTION_SOURCE = [
  'claude_code',
  'cursor',
  'trae',
  'windsurf',
  'zcode',
  'workbuddy',
  'opencode',
  'codex',
  'aider',
  'lobster',
  'vscode_task',
  'manual',
] as const

// ─── 过滤原因闭集 ───
export const FILTER_REASON = z.enum([
  'rate-limited',
  'unknown-source',
  'invalid-payload',
  'pet-busy',
])

// ─── 各 type 的 payload ───

const celebratePayload = z.object({
  what: z.string().optional()
    .describe('庆祝什么（"PR #42 合并" / "构建通过" / "测试全绿"）。素材，非判据——没有它仍然是 celebrate。'),
})

const critiquePayload = z.object({
  suggestion: z.string()
    .describe('「把 X 换成 Y，因为 Z」里的那个 Y。如果你写不出 Y，就不是 critique。'),
  original: z.string().optional()
    .describe('当前做法 X（素材，非判据——有它台词更自然，没它仍然是 critique）。'),
  file: z.string().optional()
    .describe('相关文件路径。'),
})

const warnPayload = z.object({
  condition: z.string()
    .describe('「当 C 发生时，会 F」里的那个 C。如果你写不出「当…时」，就不是 warn。'),
  consequence: z.string()
    .describe('「当 C 发生时，会 F」里的那个 F。'),
  riskKind: z.enum(['security', 'concurrency', 'boundary', 'performance']).optional()
    .describe('风险类别（素材）。'),
  file: z.string().optional(),
})

const errorPayload = z.object({
  errorMessage: z.string()
    .describe('「已经坏了，报错是 E」里的那个 E。是「已经」不是「可能」。'),
  file: z.string().optional(),
  logExcerpt: z.string().max(500).optional()
    .describe('报错日志片段（素材）。'),
})

const stuckPayload = z.object({
  attempted: z.array(z.string())
    .describe('「我试了 A、B、C，都不行」里的 A/B/C。如果什么都没试过，那不是 stuck，是 info。'),
})

const infoPayload = z.object({
  // 无判据字段。info 是兜底，不是默认。
})

// ─── 主契约：discriminatedUnion ───

export const petReactionContractSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('celebrate'),
    source: z.enum(PET_REACTION_SOURCE),
    summary: z.string().max(2000)
      .describe('一句话说清楚发生了什么。'),
    ...celebratePayload.shape,
  }),
  z.object({
    type: z.literal('critique'),
    source: z.enum(PET_REACTION_SOURCE),
    summary: z.string().max(2000)
      .describe('一句话说清楚你发现了什么。'),
    ...critiquePayload.shape,
  }),
  z.object({
    type: z.literal('warn'),
    source: z.enum(PET_REACTION_SOURCE),
    summary: z.string().max(2000)
      .describe('一句话说清楚你担心什么。'),
    ...warnPayload.shape,
  }),
  z.object({
    type: z.literal('error'),
    source: z.enum(PET_REACTION_SOURCE),
    summary: z.string().max(2000)
      .describe('一句话说清楚哪里坏了。'),
    ...errorPayload.shape,
  }),
  z.object({
    type: z.literal('stuck'),
    source: z.enum(PET_REACTION_SOURCE),
    summary: z.string().max(2000)
      .describe('一句话说清楚卡在哪。'),
    ...stuckPayload.shape,
  }),
  z.object({
    type: z.literal('info'),
    source: z.enum(PET_REACTION_SOURCE),
    summary: z.string().max(2000)
      .describe('一句话说清楚你想让桌宠知道什么。'),
    ...infoPayload.shape,
  }),
])

// ─── type 选择指南（给 MCP tool description 用）───

export const TYPE_SELECTION_GUIDE = `
选择 type 的方法——填空，不是判断：

critique：你能完成「把 X 换成 Y，因为 Z」→ suggestion 就是 Y。写不出 Y 就别选它。
warn：    你能完成「当 C 发生时，会 F」→ condition 是 C，consequence 是 F。写不出「当…时」就别选它。
error：   你能完成「已经坏了，报错是 E」→ errorMessage 是 E。是「已经」不是「可能」。
stuck：   你能完成「我试了 A、B、C，都不行，卡在 D」→ attempted 是 A/B/C。没试过任何方案就不是 stuck。
celebrate：有明确的好事发生了（构建通过、PR 合并、测试全绿）。
info：    以上句式都填不出来，且你认为桌宠应该知道这件事但不需要它做出评价或行动。
          如果你能填出任何一个句式，就不要选 info。info 是兜底，不是默认。
`

// ─── 活动上报契约（pet_report 工具）───
// 与 triggerReaction（意义时刻的闲聊反应）并列的第二类信号：
//   triggerReaction — 事件型，低频，桌宠开口说话（celebrate/critique/warn/…）
//   pet_report      — 活动型，高频，让监工知道 agent 此刻在干什么（thinking/executing/…）
// 两套契约分离，避免「每执行一个工具都触发桌宠说话」与「监工看不到细粒度状态」互相污染。
// activity 取值与 packages/kitsune-overseer/src/activityStates.js 的 STATE 枚举保持一致
// （明细见 petReportMapper，那里用 mapToUnifiedState 归一化到统一状态集）。

export const PET_REPORT_ACTIVITY = [
  'idle',
  'thinking',
  'coding',
  'executing',
  'building',
  'testing',
  'completed',
  'error',
  'stopped',
  'code_changed',
] as const

export const petReportContractSchema = z.object({
  source: z.enum(PET_REACTION_SOURCE)
    .describe('上报来源的 agent 标识（与监工的 tool id 一致）。'),
  activity: z.enum(PET_REPORT_ACTIVITY)
    .describe('此刻的统一活动状态：thinking=思考 / executing=执行工具 / coding=写代码 / completed=一批工作完成 / error=失败 / building=构建 / testing=测试运行中。'),
  message: z.string().max(2000).optional()
    .describe('一句话说明在干什么（素材，非必填——有它监工事件流更好看）。'),
  tool: z.string().max(200).optional()
    .describe('正在执行的工具名（如 Bash / Edit / Read），非必填。'),
  errorMessage: z.string().max(2000).optional()
    .describe('activity=error 时的报错信息。'),
})

export type PetReportContract = z.infer<typeof petReportContractSchema>

// ─── 返回值 ───

export const petReactionResultSchema = z.object({
  status: z.enum(['queued', 'filtered']),
  reason: FILTER_REASON.optional()
    .describe('status 为 filtered 时给出原因。'),
  reactionId: z.string().optional()
    .describe('status 为 queued 时给出追踪 ID。'),
})

export type PetReactionContract = z.infer<typeof petReactionContractSchema>
export type PetReactionResult = z.infer<typeof petReactionResultSchema>
