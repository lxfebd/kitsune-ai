import { randomUUID } from 'node:crypto'
import { callLlm } from './llmHelper'
import { analyzeCodeStyle, type CodeStyleProfile } from './codeStyleAnalyzer'
import type { MemoryStore } from '../../memory/store'

// ——— 类型定义（内联，不建 types.ts） ———

export interface CliTask {
  id: string
  type: 'cli'
  title: string
  /** TaskPusher 注册表内的工具 key（内置 claude/codex/opencode 或 yaml 运行时注册的 CLI 工具） */
  provider: string
  prompt: string
  cwd: string
  timeoutMs?: number
  critical: boolean
  /** 依赖的任务 ID 列表 — 这些任务完成后才能执行当前任务 */
  dependsOn?: string[]
}

export interface IdeTask {
  id: string
  type: 'ide'
  title: string
  connectorId: string
  action: 'open_file' | 'insert_code' | 'run_command'
  payload: {
    path?: string
    line?: number
    column?: number
    code?: string
    position?: 'cursor' | 'end'
    command?: string
    args?: string[]
  }
  critical: boolean
  assertion?: { type: 'compile_success' | 'test_pass' | 'file_exists', command?: string, cwd?: string, filePath?: string }
  expectedDescription?: string
  /** 依赖的任务 ID 列表 — 这些任务完成后才能执行当前任务 */
  dependsOn?: string[]
}

export interface DesktopTask {
  id: string
  type: 'desktop'
  title: string
  action: 'click' | 'moveTo' | 'type' | 'pressKey' | 'drag' | 'findAndClick' | 'screenshot' | 'findElement'
  params: {
    x?: number
    y?: number
    text?: string
    key?: string
    button?: 'left' | 'right' | 'middle'
    elementDescription?: string
    from?: { x: number, y: number }
    to?: { x: number, y: number }
  }
  critical: boolean
  dependsOn?: string[]
  /** 桌面任务外层硬超时（毫秒）— 缺省用 DESKTOP_TASK_TIMEOUT_MS=60s */
  timeoutMs?: number
}

export type Task = CliTask | IdeTask | DesktopTask

export interface Plan {
  id: string
  requirement: string
  tasks: Task[]
  status: 'pending' | 'running' | 'completed' | 'aborted'
  createdAt: number
  /** 最大并行度 — 默认 3 */
  maxConcurrency?: number
  /** 嵌套深度 — 根计划为 0，子计划 +1 */
  nestingLevel?: number
  /** 父计划 ID */
  parentPlanId?: string
  /** 已进行的动态调整轮次（非关键失败 → adjustPlan 生成替代任务）— 防无限调整 */
  adjustmentCount?: number
}

export interface TaskResult {
  taskId: string
  ok: boolean
  output?: string
  error?: string
  exitCode?: number
  /** 结果来源分类：TIMEOUT/SPAWN_ERROR 等，供验收/重试策略识别（超时 vs 普通失败） */
  code?: string
  durationMs: number
  /** P3：结构化模板（claude --output-format=json）解析出的结果信号 */
  structured?: { subtype: string | null, error: string | null, toolUses: Array<{ name: string, id?: string }> } | null
}

export interface ExecutorStatus {
  plan: Plan | null
  currentTaskId: string | null
  currentTaskAttempt: number
  isRunning: boolean
  /** 当前正在执行的 DAG 层级序号（planGenerator 分层规划时递增）。 */
  currentLevel?: number
}

// ——— 实现 ———

const SYSTEM_PROMPT = '你是任务规划器。把用户需求拆解成可执行的任务列表。只输出 JSON，不要其他文字。'

/**
 * 可用工具清单项 — 从 overseer.yaml 动态派生，替代原来写死的
 * claude/codex/aider/vscode/intellij 清单（那份与 TaskPusher 实际白名单漂移，
 * 且曾把非白名单 provider 静默替换成 claude，导致派活被悄悄改道）。
 */
export interface ToolInventoryItem {
  id: string
  name: string
  /** 可执行 CLI 的 binary（感知-only 工具不在清单里） */
  binary?: string
  personality?: string
  timeoutMs?: number
}

/** 缺省可用工具清单 — 未传入 inventory 时的向后兼容默认（与可执行配置对齐） */
const DEFAULT_TOOL_INVENTORY: ToolInventoryItem[] = [
  { id: 'claude', name: 'Claude Code', binary: 'claude', personality: '擅长代码重构/审查/commit，可输出 JSON 结构化结果', timeoutMs: 120_000 },
  { id: 'codex', name: 'OpenAI Codex', binary: 'codex', personality: '擅长全自动编码（可 --full-auto）', timeoutMs: 120_000 },
  { id: 'opencode', name: 'Opencode', binary: 'opencode', personality: '全自动独立小任务（可 --full-auto）', timeoutMs: 120_000 },
  { id: 'trae', name: 'Trae', binary: 'trae', personality: 'IDE 内编辑/打开文件', timeoutMs: 30_000 },
  { id: 'cursor', name: 'Cursor', binary: 'cursor', personality: 'IDE 内编辑/打开文件', timeoutMs: 30_000 },
]

/** 从传入的清单（或默认清单）派生 CLI 任务默认超时 — 取第一个有 timeoutMs 的，否则 120s */
function defaultCliTimeout(toolInventory?: ToolInventoryItem[]): number {
  const items = toolInventory && toolInventory.length > 0 ? toolInventory : DEFAULT_TOOL_INVENTORY
  return items.find(t => typeof t.timeoutMs === 'number')?.timeoutMs ?? 120_000
}

function inventoryLines(toolInventory?: ToolInventoryItem[]): string[] {
  const items = toolInventory && toolInventory.length > 0 ? toolInventory : DEFAULT_TOOL_INVENTORY
  return [
    '可用工具（只能从这些里面选，CLI 任务的 provider 填 id；IDE 任务填 connectorId）：',
    ...items.map((t) => {
      const desc = t.personality ? `（${t.personality}）` : ''
      const time = typeof t.timeoutMs === 'number' ? `，超时 ${t.timeoutMs}ms` : ''
      return `- ${t.id}: ${t.name}${desc}${time}`
    }),
  ]
}

function buildUserPrompt(requirement: string, cwd: string, codeStyleProfile?: CodeStyleProfile, proceduralHints?: string[], toolInventory?: ToolInventoryItem[]): string {
  const lines = [
    ...inventoryLines(toolInventory),
    '',
    `需求：${requirement}`,
    `工作目录：${cwd}`,
  ]

  // 代码风格要求 — 当 codeStyleProfile 可用时注入
  if (codeStyleProfile && codeStyleProfile.summary) {
    lines.push(
      '',
      '[代码风格要求]',
      codeStyleProfile.summary,
      `- Commit 消息使用 ${codeStyleProfile.commitStyle} 风格`,
      `- 缩进使用 ${codeStyleProfile.indentStyle}`,
      `- 文件命名使用 ${codeStyleProfile.namingStyle} 风格`,
    )
  }

  // 程序性记忆 — 从历史执行经验中提取的相关 hint
  if (proceduralHints && proceduralHints.length > 0) {
    lines.push(
      '',
      '[历史执行经验]',
      ...proceduralHints.slice(0, 5).map(h => `- ${h}`),
    )
  }

  lines.push(
      '',
      '输出 JSON 格式：',
      '{',
      '  "tasks": [',
      '    { "title": "任务A简述", "type": "cli", "provider": "claude", "prompt": "具体指令", "critical": true },',
      '    { "title": "任务B", "type": "cli", "provider": "codex", "prompt": "具体指令", "critical": false, "dependsOn": ["任务A简述"] },',
      '    { "title": "任务C", "type": "ide", "connectorId": "trae", "action": "open_file", "payload": { "path": "src/auth.ts" }, "critical": false },',
      '    { "title": "桌面任务", "type": "desktop", "action": "click", "params": { "x": 100, "y": 200 }, "critical": true }',
      '  ]',
      '}',
      '规则：',
      '1. 任务按执行顺序排列',
      '2. 关键任务（失败需停止）标 critical: true',
      '3. CLI 任务的 provider 只能填「可用工具」列表里的 id（感知-only 工具不在列表里，不能派活）',
      '4. CLI 任务的 prompt 要具体可执行',
      '5. IDE 任务用于辅助，复杂逻辑用 CLI',
      '6. 桌面自动化任务：click（鼠标点击）, moveTo（移动鼠标）, type（输入文本）, pressKey（按键）, drag（拖拽）, findAndClick（按描述查找并点击元素）, screenshot（截图）, findElement（查找元素坐标）',
      '7. 只输出 JSON',
      '8. 如果有任务依赖关系，用 dependsOn 字段指定依赖任务的 title（数组）',
      '9. 无依赖关系的任务将并行执行',
  )

  return lines.join('\n')
}

function extractJson(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  return match ? match[1].trim() : text.trim()
}

function normalizeTask(cwd: string, toolInventory?: ToolInventoryItem[]): (raw: any) => Task {
  return (raw) => {
    const id = randomUUID().slice(0, 8)
    const critical = raw.critical === true
    // dependsOn 可以是数组或单字符串 — 统一归一化为数组
    const dependsOn = raw.dependsOn
      ? (Array.isArray(raw.dependsOn) ? raw.dependsOn.map(String) : [String(raw.dependsOn)])
      : undefined
    if (raw.type === 'cli') {
      // provider 必须落在可用清单里，否则视为非法（不再静默替换成 claude —
      // 原实现把非白名单 provider 悄悄改道，模型派活被吞掉却不自知）
      const items = toolInventory && toolInventory.length > 0 ? toolInventory : DEFAULT_TOOL_INVENTORY
      const validIds = new Set(items.map(t => t.id))
      const requested = String(raw.provider ?? '')
      const provider = validIds.has(requested) ? requested : (validIds.has('claude') ? 'claude' : items[0]?.id ?? 'claude')
      const fallbackTimeout = defaultCliTimeout(items)
      const timeoutMs = raw.timeoutMs ?? (provider === 'claude' ? Math.min(fallbackTimeout, 60_000) : fallbackTimeout)
      return { id, type: 'cli', title: String(raw.title ?? ''), provider, prompt: String(raw.prompt ?? ''), cwd: raw.cwd ?? cwd, timeoutMs, critical, dependsOn } as CliTask
    }
    if (raw.type === 'desktop') {
      const desktopActions = ['click', 'moveTo', 'type', 'pressKey', 'drag', 'findAndClick', 'screenshot', 'findElement']
      const action = desktopActions.includes(raw.action) ? raw.action : 'click'
      return { id, type: 'desktop', title: String(raw.title ?? ''), action, params: raw.params ?? {}, critical, dependsOn } as DesktopTask
    }
    const action = ['open_file', 'insert_code', 'run_command'].includes(raw.action) ? raw.action : 'open_file'
    return { id, type: 'ide', title: String(raw.title ?? ''), connectorId: String(raw.connectorId ?? ''), action, payload: raw.payload ?? {}, critical, assertion: raw.assertion, expectedDescription: raw.expectedDescription, dependsOn } as IdeTask
  }
}

/** 把用户需求拆成可执行的任务列表 */
export async function generatePlan(
  requirement: string,
  cwd: string,
  memoryStore?: MemoryStore,
  toolInventory?: ToolInventoryItem[],
): Promise<{ ok: boolean, plan?: Plan, error?: string }> {
  // 分析项目代码风格（带缓存，5 分钟内不重复执行）
  let codeStyleProfile: CodeStyleProfile | undefined
  try {
    codeStyleProfile = await analyzeCodeStyle(cwd)
  }
  catch {
    // 代码风格分析失败不阻塞计划生成
  }

  // 检索相关程序性记忆 — 按 requirement 关键词检索历史执行经验
  let proceduralHints: string[] = []
  if (memoryStore) {
    try {
      const entries = await memoryStore.listEntries({
        q: requirement.slice(0, 200),
        type: 'procedural',
        limit: 5,
      })
      proceduralHints = entries.map(e => e.content)
    }
    catch {
      // 记忆检索失败不阻塞计划生成
    }
  }

  const userPrompt = buildUserPrompt(requirement, cwd, codeStyleProfile, proceduralHints, toolInventory)
  const llmResult = await callLlm(SYSTEM_PROMPT, userPrompt)
  if (!llmResult.ok)
    return { ok: false, error: llmResult.error }

  let parsed: { tasks: any[] }
  try {
    const json = extractJson(llmResult.text!)
    parsed = JSON.parse(json)
  }
  catch {
    return { ok: false, error: '计划生成失败：LLM 返回格式错误' }
  }

  // 校验 parsed.tasks 为数组
  if (!parsed || !Array.isArray(parsed.tasks)) {
    return { ok: false, error: '计划生成失败：LLM 返回的 tasks 不是数组' }
  }

  const tasks: Task[] = parsed.tasks.map(normalizeTask(cwd, toolInventory))

  // 将 dependsOn 中的 title 引用映射为实际任务 id
  // LLM 用 title 标识依赖关系，normalizeTask 为每个任务生成随机 UUID
  const titleToId = new Map<string, string>()
  for (const task of tasks) {
    if (task.title)
      titleToId.set(task.title, task.id)
  }
  for (const task of tasks) {
    if (!task.dependsOn || task.dependsOn.length === 0)
      continue
    task.dependsOn = task.dependsOn.map((ref: string) => titleToId.get(ref) ?? ref)
  }
  const plan: Plan = {
    id: randomUUID(),
    requirement,
    tasks,
    status: 'pending',
    createdAt: Date.now(),
  }
  return { ok: true, plan }
}