/**
 * Overseer — 现代编排入口（TypeScript）
 *
 * ── 架构定位 ──
 * 本文件是监工系统的「现代编排层」，负责：
 *   - 接收 @kitsune/overseer（CommonJS 感知层）产出的状态事件
 *   - 经 PushFilter / PermissionModel 过滤与授权
 *   - 路由到 executor 闭环（loop → taskRunner → 委托 TaskPusher / desktop-automation）
 *   - 暴露 IPC 给渲染进程驱动桌宠反应
 *
 * ── 与 @kitsune/overseer(.js) 的边界 ──
 *   @kitsune/overseer                本文件（services/kitsune/overseer）
 *   ───────────────────────          ────────────────────────────────
 *   感知层：Supervisor / 各类 Monitor  编排层：createOverseerService
 *   命令原语：TaskPusher（CLI 引擎）   执行层：executor/{loop,taskRunner,planner,acceptance}
 *   mapToUnifiedState（状态归一）      风控/授权：permission / pushFilter / correctionTracker
 *
 * 主进程仅从 @kitsune/overseer 消费 Supervisor 与 TaskPusher 两个节点；
 * 该包内其余「自主执行链」模块（UnifiedSmartRouter / DecisionEngine /
 * ActionExecutor / RiskController / SuggestionPusher 等）为遗留实现，
 * 已由本文件的 executor 闭环取代，生产路径不再使用（详见该包 index.js 标注）。
 */

import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type {
  ExecutorEventPayload,
  OverseerCorrectionResult,
  OverseerCorrectionTask,
  OverseerEvent,
  OverseerStatus,
  OverseerStats,
  PermissionConfirmPayload,
  PermissionConfirmResult,
  PermissionWhitelistEntry,
  VisionCheckRequestPayload,
  VisionCheckResult,
} from '../../../../shared/eventa'

import type { ConnectorService } from '../connectors'
import type { DesktopAutomationService } from '../desktop-automation'
import type { MemoryStore } from '../memory/store'
import type { PersonaContextBuilder } from '@kitsune/persona'

import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { Supervisor, type PetReaction } from '@kitsune/overseer'
import { TaskPusher } from '@kitsune/overseer'
import * as yaml from 'yaml'

import {
  OverseerEventType,
  OverseerSeverity,
  electronOverseerEvent,
  electronOverseerPushWithVerification,
  electronOverseerStats,
  electronOverseerStatus,
  electronOverseerToggle,
  electronOverseerVisionCheck,
  electronOverseerVisionCheckResult,
  electronPermissionConfirm,
  electronPermissionResult,
  electronPermissionWhitelistClear,
  electronPermissionWhitelistList,
  electronPermissionWhitelistRemove,
  electronExecutorGenerate,
  electronExecutorRun,
  electronExecutorStop,
  electronExecutorStatus,
  electronExecutorEvent,
} from '../../../../shared/eventa'
import { AuditLog } from './auditLog'
import { CorrectionTracker } from './correctionTracker'
import { calcDelay, resolveTaskType } from './delayStrategy'
import { PermissionModel } from './permission'
import { PushFilter } from './pushFilter'
import { checkResult, type CheckResult, type VisionCompareFn } from './resultChecker'
import { createPetMcpBridge } from '../petMcpBridge'
import {
  petReactionContractSchema,
  petReactionResultSchema,
  PET_REACTION_SOURCE,
  type PetReactionContract,
  type PetReactionResult,
} from '../petContract'
import { getElectronMainDirname } from '../../../libs/electron/location'
import { captureScreenshot } from './capture'
import { createTaskRunner } from './executor/taskRunner'
import { createLoop } from './executor/loop'
import { createAcceptance } from './executor/acceptance'
import { generatePlan } from './executor/planGenerator'
import type { Task, TaskResult } from './executor/planGenerator'
import { createPlanner } from './executor/planner'
import { getFileLogger } from '../logger'

type MainContext = ReturnType<typeof createContext>['context']

/** 视觉对比与权限确认的 IPC 响应超时，超时后按未通过 / 拒绝处理 */
const VISION_CHECK_TIMEOUT_MS = 30_000
const PERMISSION_CONFIRM_TIMEOUT_MS = 60_000

interface ToolConfig {
  id: string
  name: string
  type: string
  detect?: { processName?: string }
  events?: string[]
  enabled: boolean
}

interface OverseerConfig {
  version: number
  /**
   * 顶层启动开关 — 默认 false。
   * 控制服务创建时是否自动调用 start()；运行时仍可通过 IPC toggle 主动开启。
   */
  enabled: boolean
  tools: ToolConfig[]
  /** CLI 任务的合法 cwd 根目录 — 空数组=不限制（向后兼容） */
  allowedRoots?: string[]
  /**
   * 监控器轮询间隔（毫秒）。yaml 未配置时回退到 10000。
   * 之前 ClaudeCodeMonitor 硬编码 3000ms，频繁触发进程检测与文件读取导致 CPU 偏高；
   * 提升到 10s 以降低空载开销，状态感知延迟在可接受范围内。
   */
  pollInterval?: number
}

// 配置缺失时的内置降级清单 — 监控 Claude Code / Trae / Cursor / Codex
const DEFAULT_TOOLS: ToolConfig[] = [
  { id: 'claude_code', name: 'Claude Code', type: 'process', detect: { processName: 'claude' }, events: ['permission_request', 'task_end', 'task_failed', 'compile_failed', 'test_failed'], enabled: true },
  { id: 'trae', name: 'Trae', type: 'process', detect: { processName: 'trae' }, events: ['permission_request', 'task_end', 'task_failed'], enabled: true },
  { id: 'cursor', name: 'Cursor', type: 'process', detect: { processName: 'cursor' }, events: ['permission_request', 'task_end', 'task_failed'], enabled: true },
  { id: 'codex', name: 'OpenAI Codex', type: 'process', detect: { processName: 'codex' }, events: ['permission_request', 'task_end', 'task_failed'], enabled: true },
]

function defaultConfig(): OverseerConfig {
  // 默认不自动启动 — 配置缺失时也保持关闭，避免意外监工
  return { version: 1, enabled: false, tools: DEFAULT_TOOLS.map(t => ({ ...t })), pollInterval: 10000 }
}

function getConfigPath(): string {
  // electronMainDirname 指向 apps/stage-tamagotchi/src/main
  // 向上四级回到项目根目录，再进入 config 目录
  const electronMainDirname = getElectronMainDirname()
  const projectRoot = join(electronMainDirname, '..', '..', '..', '..')
  return join(projectRoot, 'apps', 'stage-tamagotchi', 'config', 'overseer.yaml')
}

export async function loadOverseerConfig(): Promise<OverseerConfig> {
  const configPath = getConfigPath()
  try {
    const raw = await readFile(configPath, 'utf-8')
    const parsed = yaml.parse(raw) as Partial<OverseerConfig> | null
    if (parsed?.tools?.length) {
      return {
        version: parsed.version ?? 1,
        // 顶层 enabled 默认 false — yaml 未显式开启时保持关闭
        enabled: parsed.enabled ?? false,
        tools: parsed.tools,
        allowedRoots: parsed.allowedRoots ?? [],
        // 轮询间隔缺失时回退到 10s，避免回退到旧的 3s 硬编码
        pollInterval: parsed.pollInterval ?? 10000,
      }
    }
  }
  catch {
    // 配置缺失或解析失败 — 使用内置默认配置
  }
  return defaultConfig()
}

/**
 * 将 Supervisor 的桌宠反应映射为 OverseerEvent。
 *
 * NOTICE: 现有 .js 监控器只产出 emotion/message/status 等模糊信号，
 * 不直接区分 permission_request / compile_failed / test_failed 等离散类型。
 * 此处按关键词近似映射，待 .js 监控器升级为原生事件类型后可移除。
 */
function mapReactionToEvent(reaction: PetReaction): OverseerEvent {
  const text = `${reaction.message} ${reaction.summary}`.toLowerCase()
  let type: OverseerEventType
  let severity: OverseerSeverity

  if (/permission|confirm|allow|授权|确认/.test(text)) {
    type = OverseerEventType.PermissionRequest
    severity = OverseerSeverity.Warn
  }
  else if (/crash|崩溃/.test(text)) {
    type = OverseerEventType.ProcessCrash
    severity = OverseerSeverity.Error
  }
  else if (/timeout|超时/.test(text)) {
    type = OverseerEventType.Timeout
    severity = OverseerSeverity.Error
  }
  else if (/test|测试/.test(text) && /fail|error|失败/.test(text)) {
    type = OverseerEventType.TestFailed
    severity = OverseerSeverity.Error
  }
  else if (/compile|build|编译/.test(text) && /fail|error|失败/.test(text)) {
    type = OverseerEventType.CompileFailed
    severity = OverseerSeverity.Error
  }
  else if (/fail|error|失败|错误/.test(text)) {
    type = OverseerEventType.TaskFailed
    severity = OverseerSeverity.Error
  }
  else if (/done|complete|finish|完成|结束/.test(text)) {
    type = OverseerEventType.TaskEnd
    severity = OverseerSeverity.Info
  }
  else {
    // 普通状态更新 — 仅更新内部状态，不推送桌宠
    type = OverseerEventType.StatusUpdate
    severity = OverseerSeverity.Info
  }

  return {
    id: randomUUID(),
    type,
    source: reaction.source,
    timestamp: reaction.timestamp,
    severity,
    data: { emotion: reaction.emotion, action: reaction.action, message: reaction.message, summary: reaction.summary },
  }
}

/** Supervisor 内部连接监控器与事件订阅的最小 pub/sub 总线 */
function createSimpleBus<T = unknown>() {
  const handlers = new Map<string, Set<(event: T) => void>>()
  return {
    subscribe(topic: string, handler: (event: T) => void) {
      let set = handlers.get(topic)
      if (!set) {
        set = new Set()
        handlers.set(topic, set)
      }
      set.add(handler)
    },
    publish(topic: string, payload: T) {
      handlers.get(topic)?.forEach((h) => {
        try { h(payload) }
        catch { /* 单个处理器失败不影响其他订阅者 */ }
      })
    },
  }
}

export interface OverseerService {
  toggle: (enabled: boolean) => Promise<{ enabled: boolean }>
  getStatus: () => OverseerStatus
  getStats: () => OverseerStats
  /** 反向任务推送 — 绕过过滤策略，立即下发到渲染进程 */
  emitTaskExecute: (source: string, data: unknown) => void
  /** 推送任务并启动联动校验循环：延迟截屏 → 对比预期 → 修正建议 → 再推送 */
  pushWithVerification: (task: OverseerCorrectionTask) => Promise<OverseerCorrectionResult>
  /** 外部触发桌宠反应（MCP / 其他程序入口）：校验 → 白名单 → 限流 → 人格化点评 → 演出 */
  triggerPetReaction: (input: unknown) => Promise<PetReactionResult>
  stop: () => void
}

export function createOverseerService(params: { context: MainContext, config: OverseerConfig, connectors: ConnectorService, memoryStore?: MemoryStore, personaBuilder?: PersonaContextBuilder, desktopAutomation?: DesktopAutomationService }): OverseerService {
  const { context, config, connectors, memoryStore: _memoryStore, personaBuilder: _personaBuilder, desktopAutomation } = params
  const log = useLogg('main/overseer').useGlobalConfig()
  const fileLogger = getFileLogger()
  const pushFilter = new PushFilter()
  const correctionTracker = new CorrectionTracker()
  const permissionModel = new PermissionModel()
  // 启动时加载持久化的白名单，避免重启后用户需重新确认所有权限
  void permissionModel.load()

  // 视觉对比请求与权限确认的 pending 表，由渲染进程 invoke 响应后 resolve
  const pendingVisionChecks = new Map<string, { resolve: (r: VisionCheckResult) => void, timer: NodeJS.Timeout }>()
  const pendingPermissionConfirms = new Map<string, { resolve: (r: PermissionConfirmResult) => void, timer: NodeJS.Timeout }>()

  const stats: OverseerStats = {
    eventsTotal: 0,
    eventsPushed: 0,
    eventsFiltered: 0,
    lastEventAt: null,
    perTool: {},
  }

  const bus = createSimpleBus()
  // 将 yaml 解析出的 tools[] 传入 Supervisor，由其按 id+enabled 实例化对应监控器；
  // 顶层 enabled === false 时 Supervisor 仍会构造，但不自动 start()，仅响应 IPC 查询
  const supervisor = new Supervisor({
    bus,
    tools: config.tools,
    pollInterval: config.pollInterval,
    onPetReaction: (reaction: PetReaction) => {
      const event = mapReactionToEvent(reaction)
      handleEvent(event)
    },
  })

  /**
   * 视觉对比回调 — 通过 IPC 把截图与描述发给渲染进程的 vision orchestrator，
   * 渲染进程推理后通过 electronOverseerVisionCheckResult 回传结果。
   * 超时按未通过处理，避免阻塞联动循环。
   */
  const visionCompare: VisionCompareFn = (imageDataUrl, expectedDescription) =>
    new Promise<CheckResult>((resolve) => {
      const requestId = randomUUID()
      const timer = setTimeout(() => {
        pendingVisionChecks.delete(requestId)
        resolve({ passed: false, reason: 'vision check timeout' })
      }, VISION_CHECK_TIMEOUT_MS)

      pendingVisionChecks.set(requestId, {
        resolve: result => resolve({ passed: result.passed, reason: result.reason }),
        timer,
      })

      const payload: VisionCheckRequestPayload = { requestId, imageDataUrl, expectedDescription }
      context.emit(electronOverseerVisionCheck, payload)
    })

  // ——— 执行层初始化 ———
  const taskPusher = new TaskPusher({ bus })
  const runner = createTaskRunner({ taskPusher, connectors, context, allowedRoots: config.allowedRoots ?? [], desktopAutomation })
  const auditLog = new AuditLog()
  const acceptance = createAcceptance({ visionCompare })
  const planner = createPlanner({
    generateAlternative: async (requirement, context) => {
      return generatePlan(
        `${requirement}\n\n失败上下文:\n失败任务: ${context.failedTask.title}\n错误: ${context.error ?? '未知'}`,
        process.cwd(),
        _memoryStore,
      )
    },
    memoryStore: _memoryStore,
  })
  const pendingExecutorConfirms = new Map<string, { resolve: (r: { approved: boolean, addToWhitelist: boolean }) => void, timer: NodeJS.Timeout }>()

  function confirmRequest(permKey: string, _task: Task): Promise<{ approved: boolean, addToWhitelist: boolean }> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingExecutorConfirms.delete(permKey)
        resolve({ approved: false, addToWhitelist: false })
      }, PERMISSION_CONFIRM_TIMEOUT_MS)
      pendingExecutorConfirms.set(permKey, { resolve, timer })
    })
  }

  function emitExecutorEvent(
    type: ExecutorEventPayload['type'],
    payload: Omit<ExecutorEventPayload, 'type'>,
  ): void {
    context.emit(electronExecutorEvent, { type, ...payload })
  }

  // TaskPusher 维护当前活跃子进程引用，killAll 用于 stop 时强杀
  function killRunningTask() {
    taskPusher.killAll?.()
  }

  /**
   * 任务完成后写入程序性记忆 — 记录「某类型任务用某方法执行成功」。
   * 无论成功或失败都写入，使未来 planGenerator 能检索到历史执行经验。
   * try-catch 包裹，写入失败不阻塞执行流程。
   */
  async function writeTaskMemory(task: Task, result: TaskResult): Promise<void> {
    if (!_memoryStore) return
    const status = result.ok ? '成功' : '失败'
    // task.type === 'cli' 时收窄到 CliTask；否则 IdeTask 有 connectorId，DesktopTask 无
    const taskDetail = task.type === 'cli'
      ? `工具: ${task.provider}，prompt: ${task.prompt?.slice(0, 200) ?? ''}`
      : `连接器: ${task.type === 'ide' ? task.connectorId : ''}，action: ${task.action}`
    const content = `任务「${task.title}」执行${status}。类型: ${task.type}，${taskDetail}` +
      (result.error ? `，错误: ${result.error.slice(0, 300)}` : '')
    try {
      await _memoryStore.addEntry({
        content,
        type: 'procedural',
        source: 'executor',
      })
    }
    catch {
      // 记忆写入失败不阻塞
    }
  }

  /**
   * 计划完成后写入总结性程序性记忆。
   * 供 planGenerator 在类似需求时检索到「上次这类计划的结果」。
   */
  async function writePlanMemory(plan: { requirement?: string, tasks?: unknown[] }, status: 'completed' | 'aborted'): Promise<void> {
    if (!_memoryStore) return
    const content = `计划「${plan.requirement?.slice(0, 100) ?? ''}」${status === 'completed' ? '完成' : '中止'}。` +
      `共 ${plan.tasks?.length ?? 0} 个任务。`
    try {
      await _memoryStore.addEntry({
        content,
        type: 'procedural',
        source: 'executor_plan',
      })
    }
    catch {
      // 同上
    }
  }

  /**
   * 任务失败时生成人格化安抚话术 — 通过 personaBuilder 构建包含人格语气的反馈。
   *
   * NOTICE: 当前直接返回 personaBuilder.build() 的 prompt 前 200 字作为临时方案。
   * 更合适的方案是在 PersonaContextBuilder 新增 buildFeedback(input) 方法，
   * 专门生成用户可见的简短安抚话术，而非系统提示词片段。
   * 此优化推迟到角色卡系统后续迭代。
   */
  async function generatePersonaFeedback(task: Task, error: string | undefined, _attempt: number): Promise<string | undefined> {
    if (!_personaBuilder) return undefined
    try {
      const input = `任务「${task.title}」第 ${_attempt + 1} 次尝试失败：${error ?? '未知错误'}`
      const result = await _personaBuilder.build({ input })
      return result.prompt.slice(0, 200)
    }
    catch {
      return undefined
    }
  }

  const loop = createLoop({ runner, permission: permissionModel, checkAcceptance: acceptance.checkAcceptance, emit: emitExecutorEvent, confirmRequest, killRunningTask, onTaskCompleted: writeTaskMemory, onPlanCompleted: writePlanMemory, onTaskFailed: generatePersonaFeedback, auditLog, planner, maxConcurrency: 3 })

  // 外部接入桥：MCP Server 子进程（宿主 spawn）→ HTTP localhost → triggerPetReaction
  // 不污染 channel-server WS（6121 仍只收内部 IPC）。桥常驻监听，独立于 overseer 开关，
  // 因为宿主 spawn 的 MCP 子进程生命周期不受 overseer toggle 控制。
  const petMcpBridge = createPetMcpBridge({
    onReaction: async (contract) => {
      const result = await triggerPetReaction(contract)
      return { status: result.status, reason: result.reason }
    },
  })
  petMcpBridge.start()

  function bumpTool(source: string, pushed: boolean) {
    const entry = stats.perTool[source] ?? { total: 0, pushed: 0 }
    entry.total += 1
    if (pushed)
      entry.pushed += 1
    stats.perTool[source] = entry
  }

  // 事件桥接：经过推送过滤后，通过 Eventa 推送到渲染进程驱动桌宠
  function handleEvent(event: OverseerEvent) {
    stats.eventsTotal += 1
    stats.lastEventAt = event.timestamp

    if (!pushFilter.shouldPush(event)) {
      stats.eventsFiltered += 1
      bumpTool(event.source, false)
      fileLogger.debug('[overseer] handleEvent', { eventId: event.id, node: event.source, action: event.type, result: 'filtered' })
      return
    }

    // ——— 监控 → 自动修复闭环 ———
    // 当监工检测到 AI 工具出现编译/测试/任务失败时，在权限允许的前提下，
    // 自动构造一个最小修复 Plan 交给已有的 executor loop 执行：
    //   - 具备 CLI 控制协议的来源（claude_code / codex）→ 走 TaskPusher 发指令
    //   - GUI 编辑器（trae / cursor，无公开 CLI 协议）→ 走桌面自动化注入指令
    // 约束：
    //   1) 仅处理错误类失败事件（compile_failed / test_failed / task_failed）
    //   2) 仅对 AUTO_FIX_ROUTE 中登记、且 permissionModel 确认通过（白名单/autonomous）的来源
    //   3) 同一来源在修复进行中不去重触发，避免刷屏
    if (isAutoFixableFailure(event) && !autoFixActive.has(event.source) && AUTO_FIX_ROUTE[event.source]) {
      const allowed = !permissionModel.needsConfirm({ source: event.source, assertion: { type: 'auto_fix' } })
      if (allowed) {
        void triggerAutoFix(event)
      }
      else {
        fileLogger.debug('[overseer] autoFix skipped (needs confirm)', { source: event.source, allowed })
      }
    }

    stats.eventsPushed += 1
    bumpTool(event.source, true)
    context.emit(electronOverseerEvent, event)
    fileLogger.debug('[overseer] handleEvent', { eventId: event.id, node: event.source, action: event.type, result: 'pushed' })
  }

  /**
   * 可进行自动修复的来源路由表。
   * - mode 'cli'：来源具备 CLI 控制协议（claude_code / codex），走 TaskPusher 发指令
   * - mode 'desktop'：来源是 GUI 编辑器（trae / cursor），无公开 CLI 协议，
   *                   走桌面自动化（聚焦窗口 → 视觉定位输入框 → 粘贴指令 → 回车）
   */
  const AUTO_FIX_ROUTE: Record<string, { mode: 'cli', provider: 'claude' | 'codex' } | { mode: 'desktop', processName: string }> = {
    claude_code: { mode: 'cli', provider: 'claude' },
    codex: { mode: 'cli', provider: 'codex' },
    trae: { mode: 'desktop', processName: 'trae' },
    cursor: { mode: 'desktop', processName: 'cursor' },
  }

  /** 正在自动修复中的来源集合，防止重复触发 */
  const autoFixActive = new Set<string>()

  /** 外部反应（MCP 等）的来源级去抖表：source:type → 上次触发时间 */
  const reactionRateLimit = new Map<string, number>()
  const REACTION_DEBOUNCE_MS = 5_000

  /** 判断事件是否属于可自动修复的失败类型 */
  function isAutoFixableFailure(event: OverseerEvent): boolean {
    if (event.severity !== OverseerSeverity.Error)
      return false
    return (
      event.type === OverseerEventType.CompileFailed
      || event.type === OverseerEventType.TestFailed
      || event.type === OverseerEventType.TaskFailed
    )
  }

  /** 提取事件中的失败原因文本（兼容多种 data 结构） */
  function extractErrorText(event: OverseerEvent): string {
    const reason = typeof event.data === 'object' && event.data
      ? (event.data as any).reason ?? (event.data as any).message ?? (event.data as any).summary ?? ''
      : ''
    return String(reason || event.type).slice(0, 1500)
  }

  /**
   * 触发自动修复：依来源路由构造最小修复 Plan，交给 executor loop。
   * - CLI 工具：单个 CliTask（`claude -p` / `codex`）
   * - GUI 工具：先聚焦目标窗口，再用三步 DesktopTask 序列在 AI 聊天框注入修复指令
   *             （视觉定位输入框 → 粘贴 → 回车），全程受 taskRunner 的 safetyCheck 约束。
   * 错误被吞掉，绝不影响主事件流；修复结束（成功/失败）后清理 autoFixActive。
   */
  async function triggerAutoFix(event: OverseerEvent): Promise<void> {
    const route = AUTO_FIX_ROUTE[event.source]
    if (!route) {
      fileLogger.debug('[overseer] autoFix: 来源无自动修复路由', { source: event.source })
      return
    }
    autoFixActive.add(event.source)
    const errorText = extractErrorText(event)
    const cwd = (config.allowedRoots && config.allowedRoots[0]) || process.cwd()
    const taskId = `autofix-${event.source}-${Date.now()}`
    const plan = {
      id: `plan-${taskId}`,
      requirement: `自动修复 ${event.source} 的失败：${errorText.slice(0, 200)}`,
      status: 'pending' as const,
      createdAt: Date.now(),
      maxConcurrency: 1,
      tasks: [] as Task[],
    }

    if (route.mode === 'cli') {
      plan.tasks.push({
        id: taskId,
        type: 'cli' as const,
        title: `修复 ${event.source} 报错`,
        provider: route.provider,
        prompt: `以下是 ${event.source} 运行过程中出现的失败，请分析并修复：
${errorText}`,
        cwd,
        timeoutMs: route.provider === 'codex' ? 120_000 : 60_000,
        critical: false,
      })
    }
    else {
      // GUI 工具：桌面自动化注入（无 CLI 控制协议）
      if (!desktopAutomation) {
        fileLogger.warn('[overseer] autoFix: 缺少 desktopAutomation 服务，跳过 GUI 修复', { source: event.source })
        autoFixActive.delete(event.source)
        return
      }
      // 前置：把目标 AI 工具窗口拉到前台，确保后续视觉定位/输入落在正确窗口
      try {
        await desktopAutomation.focusWindow(undefined, route.processName)
      }
      catch (err) {
        fileLogger.warn('[overseer] autoFix: focusWindow 失败，继续尝试', { source: event.source, error: (err as Error)?.message })
      }
      const clickId = `${taskId}-click`
      const typeId = `${taskId}-type`
      const enterId = `${taskId}-enter`
      const instruction = `以下是运行过程中出现的失败，请分析并修复：\n${errorText}`
      plan.tasks.push(
        {
          id: clickId,
          type: 'desktop' as const,
          title: `定位 ${route.processName} 聊天输入框`,
          action: 'findAndClick',
          params: { elementDescription: 'AI 聊天输入框，用于输入指令并发送给 AI' },
          critical: false,
        },
        {
          id: typeId,
          type: 'desktop' as const,
          title: `粘贴修复指令`,
          action: 'type',
          params: { text: instruction },
          critical: false,
          dependsOn: [clickId],
        },
        {
          id: enterId,
          type: 'desktop' as const,
          title: `发送指令`,
          action: 'pressKey',
          params: { key: 'Enter' },
          critical: false,
          dependsOn: [typeId],
        },
      )
    }

    fileLogger.info('[overseer] autoFix triggered', { source: event.source, mode: route.mode, taskId })
    emitExecutorEvent('plan_started', { planId: plan.id })
    try {
      await loop.runPlan(plan)
    }
    catch (err) {
      fileLogger.error('[overseer] autoFix loop error', { source: event.source, error: (err as Error)?.message })
    }
    finally {
      autoFixActive.delete(event.source)
    }
  }

  let running = false

  /**
   * 外部触发桌宠反应（MCP / 其他程序入口）。
   *
   * 调用链：safeParse 校验 → 白名单 → PushFilter 限流 → 人格化点评 → 演出。
   * 这是「让其他程序触发桌宠回复」的统一入口，MCP 桥、未来 HTTP 入口都汇入此处。
   *
   * @returns petReactionResultSchema：queued=已演出；filtered=被白名单/限流/校验挡下，带 reason
   */
  async function triggerPetReaction(input: unknown): Promise<PetReactionResult> {
    // 1) 校验：契约单一真源 .safeParse()
    const parsed = petReactionContractSchema.safeParse(input)
    if (!parsed.success) {
      fileLogger.warn('[overseer] triggerPetReaction: invalid-payload', { error: parsed.error.message })
      stats.eventsTotal += 1
      stats.eventsFiltered += 1
      return petReactionResultSchema.parse({ status: 'filtered', reason: 'invalid-payload' })
    }
    const contract = parsed.data

    // 2) 白名单：source 必须是登记来源（与 PushFilter 同源）
    if (!PET_REACTION_SOURCE.includes(contract.source as any)) {
      fileLogger.warn('[overseer] triggerPetReaction: unknown-source', { source: contract.source })
      stats.eventsTotal += 1
      stats.eventsFiltered += 1
      return petReactionResultSchema.parse({ status: 'filtered', reason: 'unknown-source' })
    }

    // 3) 限流：key 只用 source（防同一来源 1 秒内多类型刷屏）
    const nowTs = Date.now()
    const lastTs = reactionRateLimit.get(contract.source)
    if (lastTs !== undefined && nowTs - lastTs < REACTION_DEBOUNCE_MS) {
      fileLogger.debug('[overseer] triggerPetReaction: rate-limited', { source: contract.source, type: contract.type })
      stats.eventsTotal += 1
      stats.eventsFiltered += 1
      bumpTool(contract.source, false)
      return petReactionResultSchema.parse({ status: 'filtered', reason: 'rate-limited' })
    }
    reactionRateLimit.set(contract.source, nowTs)

    // 4) v1：模板渲染，零 token 成本，不调 LLM
    const message = `[${contract.type}] ${contract.summary}`

    // 5) 演出：转成 OverseerEvent 经 eventa 推给渲染进程驱动桌宠
    const reactionId = randomUUID()
    const event: OverseerEvent = {
      id: reactionId,
      type: contract.type as OverseerEventType,
        source: contract.source,
        timestamp: Date.now(),
        severity: contract.type === 'error' ? OverseerSeverity.Error
          : contract.type === 'warn' || contract.type === 'critique' ? OverseerSeverity.Warn
            : OverseerSeverity.Info,
        data: {
          message,
          summary: contract.summary,
          ...('suggestion' in contract ? { suggestion: contract.suggestion } : {}),
          ...('original' in contract ? { original: contract.original } : {}),
          ...('file' in contract ? { file: contract.file } : {}),
          ...('condition' in contract ? { condition: contract.condition } : {}),
          ...('consequence' in contract ? { consequence: contract.consequence } : {}),
          ...('errorMessage' in contract ? { errorMessage: contract.errorMessage } : {}),
          ...('what' in contract ? { what: contract.what } : {}),
          ...('attempted' in contract ? { attempted: contract.attempted } : {}),
        },
    }

    stats.eventsTotal += 1
    stats.eventsPushed += 1
    bumpTool(contract.source, true)
    context.emit(electronOverseerEvent, event)
    fileLogger.debug('[overseer] triggerPetReaction', { eventId: reactionId, node: contract.source, type: contract.type, result: 'pushed' })

    return petReactionResultSchema.parse({ status: 'queued', reactionId })
  }

  function start() {
    if (running)
      return
    running = true
    supervisor.start()
    petMcpBridge.start()
    log.log('overseer supervisor started')
  }

  function stop() {
    running = false
    supervisor.stop()
    petMcpBridge.stop()
    pushFilter.reset()
    reactionRateLimit.clear()
    // 强制终止执行器 — 立即 kill 当前任务
    loop.forceStop()
    // 强杀所有活跃子进程 — 防止应用退出后残留僵尸进程
    taskPusher.killAll?.()
    // 清理 pending 表，避免渲染进程响应后写入已销毁的 resolve
    for (const { resolve, timer } of pendingVisionChecks.values()) {
      clearTimeout(timer)
      resolve({ requestId: '', passed: true, reason: 'overseer stopping, skip check' })
    }
    pendingVisionChecks.clear()
    for (const { resolve, timer } of pendingPermissionConfirms.values()) {
      clearTimeout(timer)
      resolve({ taskId: '', approved: false, addToWhitelist: false })
    }
    pendingPermissionConfirms.clear()
    // 清理执行层 pending 表
    for (const { resolve, timer } of pendingExecutorConfirms.values()) {
      clearTimeout(timer)
      resolve({ approved: false, addToWhitelist: false })
    }
    pendingExecutorConfirms.clear()
    log.log('overseer supervisor stopped')
  }


  /**
   * 首次修正弹窗确认 — 通过 IPC 请渲染进程展示 diff，等待用户选择。
   * 超时按拒绝处理；白名单内的 source+assertion 组合跳过弹窗。
   */
  function confirmPermission(task: OverseerCorrectionTask, reason: string): Promise<PermissionConfirmResult> {
    return new Promise<PermissionConfirmResult>((resolve) => {
      const timer = setTimeout(() => {
        pendingPermissionConfirms.delete(task.id)
        resolve({ taskId: task.id, approved: false, addToWhitelist: false })
      }, PERMISSION_CONFIRM_TIMEOUT_MS)

      pendingPermissionConfirms.set(task.id, { resolve, timer })

      const payload: PermissionConfirmPayload = {
        taskId: task.id,
        source: task.source,
        assertionType: task.assertion?.type ?? 'unknown',
        diff: reason,
        summary: `任务 ${task.id} 校验未通过：${reason}`,
      }
      context.emit(electronPermissionConfirm, payload)
    })
  }

  /** 推送修正建议到渲染进程，由渲染进程路由到连接器或 TaskPusher */
  function emitCorrection(task: OverseerCorrectionTask, reason: string): void {
    const correctionPayload = {
      taskId: task.id,
      source: task.source,
      type: 'correction',
      reason,
      suggestion: `针对 ${task.assertion?.type ?? task.expectedDescription ?? 'unknown'} 的修正建议`,
      originalPayload: task.payload,
    }
    emitTaskExecute(task.source, correctionPayload)
  }

  /** 达到修正上限后推送桌宠「请人工介入」并置 needs_manual 状态 */
  function emitNeedsManual(task: OverseerCorrectionTask, reason: string): void {
    log.warn(`task ${task.id} exhausted corrections, needs manual: ${reason}`)
    const event: OverseerEvent = {
      id: randomUUID(),
      type: OverseerEventType.TaskFailed,
      source: task.source,
      timestamp: Date.now(),
      severity: OverseerSeverity.Warn,
      data: { taskId: task.id, state: 'needs_manual', reason, attempts: correctionTracker.getCount(task.id) },
    }
    stats.eventsTotal += 1
    stats.eventsPushed += 1
    stats.lastEventAt = event.timestamp
    bumpTool(task.source, true)
    context.emit(electronOverseerEvent, event)
    fileLogger.debug('[overseer] needs_manual', { eventId: task.id, node: task.source, action: 'needs_manual', result: reason })
  }

  function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 联动校验循环：等待延迟 → 截屏 → 对比预期 → 失败则修正 → 再推送。
   * 达到修正上限或用户拒绝时退出；通过则清理计数。
   */
  async function runCorrectionLoop(task: OverseerCorrectionTask): Promise<OverseerCorrectionResult> {
    while (true) {
      if (correctionTracker.isExhausted(task.id)) {
        emitNeedsManual(task, 'correction limit reached')
        return { taskId: task.id, state: 'needs_manual', attempts: correctionTracker.getCount(task.id), reason: 'correction limit reached' }
      }

      await sleep(calcDelay({ type: resolveTaskType(task.type), estimatedDuration: task.estimatedDuration }))

      const screenshot = await captureScreenshot()
      if (!screenshot) {
        // 截屏失败 — 视为未通过，但不消耗修正次数
        log.warn('screenshot capture failed, skip verification')
        continue
      }

      const result = await checkResult(task, screenshot, visionCompare)

      if (result.passed) {
        correctionTracker.reset(task.id)
        fileLogger.debug('[overseer] correction_loop', { eventId: task.id, node: task.source, action: 'verify', result: 'passed' })
        return { taskId: task.id, state: 'passed', attempts: correctionTracker.getCount(task.id), reason: result.reason }
      }

      correctionTracker.increment(task.id, result.reason)

      if (correctionTracker.isExhausted(task.id)) {
        emitNeedsManual(task, result.reason)
        return { taskId: task.id, state: 'needs_manual', attempts: correctionTracker.getCount(task.id), reason: result.reason }
      }

      // 首次修正需用户确认；白名单内自动执行
      if (permissionModel.needsConfirm({ source: task.source, assertion: task.assertion ? { type: task.assertion.type } : undefined })) {
        const confirmed = await confirmPermission(task, result.reason)
        if (!confirmed.approved) {
          fileLogger.debug('[overseer] correction_loop', { eventId: task.id, node: task.source, action: 'confirm', result: 'rejected' })
          return { taskId: task.id, state: 'rejected', attempts: correctionTracker.getCount(task.id), reason: 'user rejected correction' }
        }
        if (confirmed.addToWhitelist)
          permissionModel.addToWhitelist(task.source, task.assertion?.type ?? 'unknown')
      }

      emitCorrection(task, result.reason)
      fileLogger.debug('[overseer] correction_loop', { eventId: task.id, node: task.source, action: 'correct', result: result.reason })
    }
  }

  // IPC 处理器
  defineInvokeHandler(context, electronOverseerToggle, async (payload) => {
    const enabled = payload?.enabled ?? false
    if (enabled)
      start()
    else
      stop()
    return { enabled }
  })

  defineInvokeHandler(context, electronOverseerStatus, async () => {
    const supervisorStatus = supervisor.getStatus()
    const tools = config.tools.map(t => ({
      id: t.id,
      name: t.name,
      enabled: t.enabled,
      running: Boolean(supervisorStatus[t.id]?.isRunning),
    }))
    return {
      enabled: supervisorStatus.enabled,
      running: Boolean(supervisorStatus.isRunning),
      tools,
      updatedAt: Date.now(),
    } satisfies OverseerStatus
  })

  defineInvokeHandler(context, electronOverseerStats, async () => {
    return { ...stats, perTool: { ...stats.perTool } } satisfies OverseerStats
  })

  // 权限白名单管理 IPC
  defineInvokeHandler(context, electronPermissionWhitelistList, async (): Promise<PermissionWhitelistEntry[]> =>
    permissionModel.listWhitelist(),
  )

  defineInvokeHandler(context, electronPermissionWhitelistRemove, async (req): Promise<{ removed: number }> => {
    const removed = permissionModel.removeFromWhitelist(req?.key ?? '') ? 1 : 0
    return { removed }
  })

  defineInvokeHandler(context, electronPermissionWhitelistClear, async (): Promise<{ cleared: number }> => {
    const cleared = permissionModel.clearWhitelist()
    return { cleared }
  })

  // 渲染进程回传的权限确认结果 — 关联 pending 表并 resolve
  defineInvokeHandler(context, electronPermissionResult, async (result): Promise<PermissionConfirmResult> => {
    // 原有 correction loop 的 pending
    const pendingCorrection = result?.taskId ? pendingPermissionConfirms.get(result.taskId) : undefined
    if (pendingCorrection) {
      clearTimeout(pendingCorrection.timer)
      pendingPermissionConfirms.delete(result.taskId)
      pendingCorrection.resolve(result)
    }
    // 执行层的 pending（按 permKey 索引）
    const pendingExecutor = result?.taskId ? pendingExecutorConfirms.get(result.taskId) : undefined
    if (pendingExecutor) {
      clearTimeout(pendingExecutor.timer)
      pendingExecutorConfirms.delete(result.taskId)
      pendingExecutor.resolve({ approved: result.approved, addToWhitelist: result.addToWhitelist })
    }
    return result ?? { taskId: '', approved: false, addToWhitelist: false }
  })

  // 渲染进程回传的视觉对比结果 — 关联 pending 表并 resolve
  defineInvokeHandler(context, electronOverseerVisionCheckResult, async (result): Promise<VisionCheckResult> => {
    const pending = result?.requestId ? pendingVisionChecks.get(result.requestId) : undefined
    if (pending) {
      clearTimeout(pending.timer)
      pendingVisionChecks.delete(result.requestId)
      pending.resolve(result)
    }
    return result ?? { requestId: '', passed: false, reason: 'no result' }
  })

  // 联动推送入口 — 推送任务后启动校验循环
  defineInvokeHandler(context, electronOverseerPushWithVerification, async (req): Promise<OverseerCorrectionResult> => {
    const task = req?.task
    if (!task?.id || !task.source)
      return { taskId: task?.id ?? '', state: 'rejected', attempts: 0, reason: 'missing task id or source' }

    // 先推送初始任务到渲染进程
    emitTaskExecute(task.source, task.payload)
    return runCorrectionLoop(task)
  })

  // ——— 执行层 IPC 处理器 ———
  defineInvokeHandler(context, electronExecutorGenerate, async (req) => {
    if (!req?.requirement)
      return { ok: false, error: 'requirement 不能为空' }
    return generatePlan(req.requirement, req.cwd ?? process.cwd(), _memoryStore ?? undefined)
  })

  defineInvokeHandler(context, electronExecutorRun, async (req) => {
    if (!req?.plan)
      return { ok: false, error: 'plan 不能为空' }
    const plan = req.plan
    if (!Array.isArray(plan.tasks) || plan.tasks.length === 0)
      return { ok: false, error: 'plan.tasks 为空或格式错误' }
    // 不 await，异步执行；执行状态通过 electronExecutorEvent 流式推送到渲染进程
    loop.runPlan(plan)
    return { ok: true }
  })

  defineInvokeHandler(context, electronExecutorStop, async () => {
    loop.stop()
    return { ok: true }
  })

  defineInvokeHandler(context, electronExecutorStatus, async () => {
    return loop.getStatus()
  })

  /** 反向任务推送 — 不经过滤策略，立即下发到渲染进程 */
  function emitTaskExecute(source: string, data: unknown): void {
    const event: OverseerEvent = {
      id: randomUUID(),
      type: OverseerEventType.TaskEnd,
      source,
      timestamp: Date.now(),
      severity: OverseerSeverity.Info,
      data,
    }
    stats.eventsTotal += 1
    stats.eventsPushed += 1
    stats.lastEventAt = event.timestamp
    bumpTool(source, true)
    context.emit(electronOverseerEvent, event)
    fileLogger.debug('[overseer] emitTaskExecute', { eventId: event.id, node: source, action: 'task_execute', result: 'emitted' })
  }

  // 顶层 enabled 开关 — 默认关闭，需在 overseer.yaml 显式设置 enabled: true 才会自动启动
  // 关闭时服务仍可响应 IPC（status/stats 查询、toggle 主动开启），仅不自动 start()
  if (config.enabled)
    start()
  else
    log.log('overseer disabled by config, skip auto start')

  return {
    toggle: async (enabled) => {
      if (enabled)
        start()
      else
        stop()
      return { enabled }
    },
    getStatus: () => {
      const supervisorStatus = supervisor.getStatus()
      return {
        enabled: supervisorStatus.enabled,
        running: Boolean(supervisorStatus.isRunning),
        tools: config.tools.map(t => ({ id: t.id, name: t.name, enabled: t.enabled, running: Boolean(supervisorStatus[t.id]?.isRunning) })),
        updatedAt: Date.now(),
      }
    },
    getStats: () => ({ ...stats, perTool: { ...stats.perTool } }),
    emitTaskExecute,
    pushWithVerification: async (task) => {
      emitTaskExecute(task.source, task.payload)
      return runCorrectionLoop(task)
    },
    triggerPetReaction,
    stop,
  }
}
