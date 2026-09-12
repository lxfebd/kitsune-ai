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
 *
 * ── 目录结构（D2 拆聚合根后） ──
 *   index.ts            聚合根：createOverseerService 闭包 + IPC 处理器 + 事件分发
 *   config.ts           配置读取：ToolConfig / OverseerConfig / ExecutorParams + loadOverseerConfig
 *   bus.ts              极简 pub/sub 总线（Supervisor ↔ TaskPusher 事件通道）
 *   reactionMapping.ts  Supervisor 桌宠反应 → OverseerEvent 映射（纯函数）
 *   coordinator.ts      编排者：拆需求按画像派活 / director.ts 总监评审 / director.watcher.ts
 *   executor/           执行层：loop / taskRunner / planner / planGenerator / acceptance / llmHelper
 *   permission.ts       权限白名单模型 / pushFilter.ts 推送过滤 / correctionTracker.ts 修正计数
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

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { Supervisor, type PetReaction } from '@kitsune/overseer'
import { TaskPusher } from '@kitsune/overseer'
import { stringify } from 'superjson'

import {
  OverseerEventType,
  OverseerSeverity,
  electronOverseerEvent,
  electronOverseerLlmProvider,
  electronOverseerPushWithVerification,
  electronOverseerStats,
  electronOverseerStatus,
  electronOverseerToggle,
  electronOverseerGuidanceState,
  electronOverseerGuidanceToggle,
  electronOverseerGuidanceReset,
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
  electronDirectorReview,
  electronDirectorApprove,
  electronDirectorReject,
  electronDirectorEvent,
  electronDirectorList,
  electronDirectorDetail,
  electronCoordinatorSubmit,
  electronCoordinatorTeam,
  type GuidanceRuntimeState,
} from '../../../../shared/eventa'
import { AuditLog } from './auditLog'
import { CorrectionTracker } from './correctionTracker'
import { calcDelay, resolveTaskType } from './delayStrategy'
import { PermissionModel } from './permission'
import { PushFilter } from './pushFilter'
import { checkResult, type CheckResult, type VisionCompareFn } from './resultChecker'
import { createPetMcpBridge } from '../petMcpBridge'
import { createPetMcpHttpServer } from '../petMcpHttpServer'
import { mapPetReportToReaction } from '../petReportMapper'
import { normalizePetReportActivity } from '../petReportMapper'
import { McpActivityTracker } from '../mcpActivityTracker'
import {
  petReactionContractSchema,
  petReactionResultSchema,
  petReportContractSchema,
  PET_REACTION_SOURCE,
  type PetReactionResult,
} from '../petContract'
import { captureScreenshot } from './capture'
import { createTaskRunner } from './executor/taskRunner'
import { createLoop } from './executor/loop'
import { createAcceptance } from './executor/acceptance'
import { generatePlan } from './executor/planGenerator'
import type { Task, TaskResult, ToolInventoryItem } from './executor/planGenerator'
import { createPlanner } from './executor/planner'
import { setSyncedProviderConfig } from './executor/llmHelper'
import { directorReviewLatest, directorApprove, directorReject, listDirectorPlans, getDirectorPlanDetail } from './director'
import { createDirectorWatcher } from './director.watcher'
import { createCoordinator } from './coordinator'
import { createGuidanceService, type GuidanceService, type GuidanceTrigger } from './guidance'
import { getFileLogger } from '../logger'

type MainContext = ReturnType<typeof createContext>['context']

/** 视觉对比与权限确认的 IPC 响应超时，超时后按未通过 / 拒绝处理 */
const VISION_CHECK_TIMEOUT_MS = 30_000
const PERMISSION_CONFIRM_TIMEOUT_MS = 60_000

import type { OverseerConfig } from './config'
import { createSimpleBus } from './bus'
import { mapReactionToEvent } from './reactionMapping'

export type { ExecutorParams, ToolConfig, OverseerConfig } from './config'
export { loadOverseerConfig } from './config'
export { mapReactionToEvent } from './reactionMapping'

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

export function createOverseerService(params: { context: MainContext, config: OverseerConfig, connectors: ConnectorService, memoryStore?: MemoryStore, personaBuilder?: PersonaContextBuilder, desktopAutomation?: DesktopAutomationService, channel?: { broadcast: (message: string) => number } }): OverseerService {
  const { context, config, connectors, memoryStore: _memoryStore, personaBuilder: _personaBuilder, desktopAutomation, channel } = params
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

  // MCP 活动上报驱动的「工具运行状态」表 — 解决 MCP 已接入但 UI 仍显示空闲的问题。
  // 已接入 MCP 的 agent（trae / workbuddy…）的 pet_report 会 touch 这张表；
  // 状态快照把「文件嗅探 running 或 MCP 活动在窗口内」合并为工具 running。
  // idle/stopped 上报会让来源立即回落空闲；TTL 与文件嗅探窗口（180s）对齐。
  const mcpActivity = new McpActivityTracker()

  // 操作指导服务 — 重复失败命中内置规则时给用户可操作修复步骤。
  // 计数独立持久化（userData/guidance-failure-counter.json），跨会话记忆。
  // 服务始终创建（状态/重置 IPC 需要），触发开关由 guidanceRuntimeEnabled 门控，
  // 初始值来自 config.guidance.enabled（yaml 关闭则默认不指导，UI 可实时开启）。
  const guidanceService: GuidanceService = createGuidanceService({
    locale: config.guidance?.locale ?? 'zh-Hans',
    threshold: config.guidance?.threshold,
    windowMs: config.guidance?.windowMs,
    cooldownMs: config.guidance?.cooldownMs,
  })
  let guidanceRuntimeEnabled = config.guidance?.enabled ?? true

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
  // P2：把 yaml 中声明了 cli 协议的工具注册进 TaskPusher 运行时注册表，
  // 使它们获得与内置 CLI 工具一致的 pushTask / autoFix 能力（provider = 工具 id）。
  // perceiveOnly 工具（无 CLI 可执行入口，如 zcode）跳过注册 —— 只感知不派活，
  // 否则规划器/协调者会给它派任务 → 执行时必然报「不支持的 provider」。
  for (const tool of config.tools) {
    if (!tool.enabled || !tool.cli?.binary || tool.perceiveOnly) continue
    const registered = taskPusher.registerTool(tool.id, {
      name: tool.name,
      binary: tool.cli.binary,
      timeoutMs: tool.cli.timeoutMs,
      riskLevel: tool.cli.riskLevel,
      templates: tool.cli.templates?.length
        ? tool.cli.templates
        : [{ key: 'prompt', label: '发送指令', args: [], inputParam: null, maxLen: 2000 }],
    })
    if (registered) {
      fileLogger.info('[overseer] 已注册 CLI 工具到 TaskPusher', { toolId: tool.id, binary: tool.cli.binary })
    } else {
      fileLogger.warn('[overseer] CLI 工具注册失败（配置非法）', { toolId: tool.id })
    }
  }
  const runner = createTaskRunner({ taskPusher, connectors, context, allowedRoots: config.allowedRoots ?? [], desktopAutomation, timeouts: config.executor })
  const auditLog = new AuditLog()
  const acceptance = createAcceptance({ visionCompare })
  // 可用工具清单 — 从 yaml 的 tools[] 派生（perceiveOnly / 无 cli 的工具不进入可派活清单）。
  // 规划器提示词与 coordinator 拆活都基于这份清单，确保「能派的」与「提示词说有的」一致。
  const toolInventory: ToolInventoryItem[] = config.tools
    .filter(t => t.enabled && !t.perceiveOnly && t.cli?.binary)
    .map(t => ({
      id: t.id,
      name: t.name,
      binary: t.cli!.binary,
      personality: t.personality
        ? `${[t.personality.bestFor, t.personality.avoidFor ? `避免: ${t.personality.avoidFor}` : ''].filter(Boolean).join('；')}`
        : undefined,
      timeoutMs: t.cli!.timeoutMs,
    }))
  const planner = createPlanner({
    generateAlternative: async (requirement, context) => {
      return generatePlan(
        `${requirement}\n\n失败上下文:\n失败任务: ${context.failedTask.title}\n错误: ${context.error ?? '未知'}`,
        process.cwd(),
        _memoryStore,
        toolInventory,
      )
    },
    memoryStore: _memoryStore,
    toolInventory,
  })
  const pendingExecutorConfirms = new Map<string, { resolve: (r: { approved: boolean, addToWhitelist: boolean }) => void, timer: NodeJS.Timeout }>()

  function confirmRequest(task: Task): Promise<{ approved: boolean, addToWhitelist: boolean }> {
    const taskKey = task.id
    return new Promise((resolve) => {
      // 同一 task.id 的旧请求被覆盖前先清掉旧 timer — 否则旧 timer 到点后
      // delete(taskKey) 会删掉新请求的条目，用户确认到达时 resolve 已丢失 → 死锁。
      const previous = pendingExecutorConfirms.get(taskKey)
      if (previous)
        clearTimeout(previous.timer)

      const timer = setTimeout(() => {
        // 仅当条目仍属于本次请求时才删除/解决，避免误伤后一次请求
        if (pendingExecutorConfirms.get(taskKey)?.timer === timer) {
          pendingExecutorConfirms.delete(taskKey)
          resolve({ approved: false, addToWhitelist: false })
        }
      }, PERMISSION_CONFIRM_TIMEOUT_MS)
      pendingExecutorConfirms.set(taskKey, { resolve, timer })

      // 向渲染进程发起授权弹窗 — 与 correction loop 的 confirmPermission 使用同一事件源，
      // 由 PermissionConfirmDialog 监听展示，用户确认后经 electronPermissionResult 回传。
      // 修复前此处只设超时不发事件，导致执行层权限确认永远无人响应、60s 后自动拒绝。
      const source = task.type === 'cli' ? task.provider : task.type === 'ide' ? task.connectorId : 'desktop'
      const assertionType = task.type === 'cli' ? 'cli:run' : task.type === 'ide' ? `ide:${task.action}` : `desktop:${task.action}`
      const payload: PermissionConfirmPayload = {
        taskId: taskKey,
        source,
        assertionType,
        diff: '执行器任务需要授权后执行',
        summary: `任务「${task.title}」请求执行 ${assertionType}（来源 ${source}）`,
      }
      context.emit(electronPermissionConfirm, payload)
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

  const loop = createLoop({
    runner,
    permission: permissionModel,
    checkAcceptance: acceptance.checkAcceptance,
    emit: emitExecutorEvent,
    confirmRequest,
    killRunningTask,
    onTaskCompleted: async (task, result) => {
      await writeTaskMemory(task, result)
      await coordinatorTaskOutcome(task, result)
    },
    onPlanCompleted: writePlanMemory,
    onTaskFailed: generatePersonaFeedback,
    auditLog,
    planner,
    params: config.executor,
  })

  // ——— Coordinator 编排者（"头头"的代理人）———
  // 在 executor 之上统筹：拆需求 → 按画像派给子 agent → 收回结果 → 判断下一步。
  // 复用 executor 的 generatePlan/runPlan 通道与事件流，不重复造轮子。
  const coordinator = createCoordinator({
    inventory: toolInventory,
    isAgentOnline: (id) => {
      const s = supervisor.getStatus()
      return Boolean(s[id]?.isRunning) || mcpActivity.isActive(id)
    },
    runPlan: plan => loop.runPlan(plan),
    getExecutorStatus: () => loop.getStatus(),
    emit: (type, payload) => emitExecutorEvent(type as ExecutorEventPayload['type'], payload),
  })
  // 任务级结果回喂 coordinator（agent_outcome 事件 + 面板 busy 更新）
  const coordinatorTaskOutcome = async (task: Task, result: TaskResult): Promise<void> => {
    if (task.type !== 'cli') return
    coordinator.recordDispatch({
      taskId: task.id,
      title: task.title,
      provider: task.provider,
      ok: result.ok,
      error: result.error,
      at: Date.now(),
    })
  }

  // ——— 浏览器视图桥（pet-mcp-bridge /overseer/events SSE + 快照端点）———
  // 浏览器 view 无 Electron IPC 桥，通过 localhost HTTP 订阅监工事件流。
  // 在 handleEvent 的两个分支（filtered / pushed）都推送，保证 UI 上完整可见。
  let bridgeEventSink: ((entry: { event: OverseerEvent, pushed: boolean }) => void) | undefined
  function pushToBridge(entry: { event: OverseerEvent, pushed: boolean }) {
    if (bridgeEventSink) {
      try {
        bridgeEventSink(entry)
      }
      catch {
        bridgeEventSink = undefined
      }
    }
  }
  const getStatsSnapshot = () => ({ ...stats, perTool: { ...stats.perTool } })

  // 工具运行状态合并：文件/进程嗅探（supervisor 各 monitor 的 isRunning）
  // 或 MCP 活动上报在 TTL 窗口内 → running。三处工具状态构建（bridge 快照/
  // IPC/服务 getStatus）统一走这里，避免分散重复且漏掉 MCP 信号。
  function buildToolStatusList() {
    const supervisorStatus = supervisor.getStatus()
    return config.tools.map(t => ({
      id: t.id,
      name: t.name,
      enabled: t.enabled,
      running: Boolean(supervisorStatus[t.id]?.isRunning) || mcpActivity.isActive(t.id),
    }))
  }

  const getStatusSnapshot = () => {
    const supervisorStatus = supervisor.getStatus()
    return {
      enabled: supervisorStatus.enabled,
      running: Boolean(supervisorStatus.isRunning),
      tools: buildToolStatusList(),
      updatedAt: Date.now(),
    } satisfies OverseerStatus
  }

  // 外部接入桥：MCP Server 子进程（宿主 spawn）→ HTTP localhost → triggerPetReaction
  // 不污染 channel-server WS（6121 仍只收内部 IPC）。桥常驻监听，独立于 overseer 开关，
  // 因为宿主 spawn 的 MCP 子进程生命周期不受 overseer toggle 控制。
  const petMcpBridge = createPetMcpBridge({
    onReaction: async (contract) => {
      const result = await triggerPetReaction(contract)
      return { status: result.status, reason: result.reason }
    },
    onPetReport: async (report) => {
      const result = await handlePetReport(report)
      return { status: result.status, reason: result.reason }
    },
    getStats: () => getStatsSnapshot(),
    getStatus: () => getStatusSnapshot(),
    onEvent: (handler) => {
      bridgeEventSink = handler
      return () => { bridgeEventSink = undefined }
    },
  })
  petMcpBridge.start()

  // 主进程内嵌 MCP HTTP server — AI agent（Claude Code/Cursor/Trae/Windsurf/ZCode…）
  // 直接配置 localhost URL 接入，不依赖本机 agent 安装路径（换机零配置成本）。
  // 与 stdio 子进程桥并列的第二接入方式，工具 handler 直达 handlePetReport /
  // triggerPetReaction，业务校验/白名单/限流都在同一管线完成。
  const petMcpHttpServer = createPetMcpHttpServer({
    onPetReport: async (report) => handlePetReport(report),
    onPetReaction: async (contract) => {
      const result = await triggerPetReaction(contract)
      return { status: result.status, reason: result.reason }
    },
  })
  void petMcpHttpServer.start().catch((err: Error) => {
    // 端口占用等启动失败不应阻断 overseer 主流程——MCP 接入是可降级能力
    fileLogger.warn('[overseer] petMcpHttpServer 启动失败（MCP 接入降级，stdio 桥不受影响）', { error: err.message })
  })

  // 总监模式目录监听 — 对 .kitsune/plans/plans/ 下外部 AI 新计划自动评审
  const directorWatcher = createDirectorWatcher()

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

    // ——— 操作指导：重复失败计数（必须放在 pushFilter.shouldPush 之前） ———
    // pushFilter 按 type:source 去重，重复失败会被白名单吞掉；
    // 放在这里才能统计到第 2、3 次，做到「重复才指导、且不刷屏」。
    if (isGuidanceFailure(event))
      recordGuidanceFailure(event)

    if (!pushFilter.shouldPush(event)) {
      stats.eventsFiltered += 1
      bumpTool(event.source, false)
      fileLogger.debug('[overseer] handleEvent', { eventId: event.id, node: event.source, action: event.type, result: 'filtered' })
      broadcastToChannel(event, false)
      pushToBridge({ event, pushed: false })
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
    if (isAutoFixableFailure(event) && !autoFixActive.has(event.source) && AUTO_FIX_ROUTE.get(event.source)) {
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
    broadcastToChannel(event, true)
    pushToBridge({ event, pushed: true })
    fileLogger.debug('[overseer] handleEvent', { eventId: event.id, node: event.source, action: event.type, result: 'pushed' })
  }

  /**
   * 将监工事件广播到 channel-server WS（6121），供浏览器 view（stage-web，无 Electron IPC 桥）订阅。
   * 封装为 spark:notify 帧，payload.kitsune_overseer 标记来源，UI 侧按 event.id 去重。
   * 不依赖过滤结果——filtered 事件也广播，让"被白名单拦下"在 UI 上可见。
   */
  function broadcastToChannel(event: OverseerEvent, pushed: boolean) {
    if (!channel)
      return
    try {
      const data = (event.data ?? {}) as Record<string, unknown>
      const frame = {
        type: 'spark:notify',
        data: {
          id: randomUUID(),
          eventId: `overseer-${event.id}`,
          kind: 'reminder',
          urgency: 'soon',
          headline: `overseer:${event.source}`,
          note: data.summary ?? data.message ?? event.type,
          payload: { kitsune_overseer: true, pushed, event },
          destinations: ['*'],
        },
      }
      channel.broadcast(stringify(frame))
    }
    catch (err) {
      fileLogger.debug('[overseer] broadcastToChannel', { eventId: event.id, error: err instanceof Error ? err.message : String(err) })
    }
  }

  /**
   * 可进行自动修复的来源路由表（P2：运行时动态构建）。
   * - mode 'cli'：来源具备 CLI 控制协议（claude_code / codex / yaml 注册的工具），走 TaskPusher 发指令
   * - mode 'connector'：来源是 IDE 且有在线连接器（trae / cursor），走 WebSocket 连接器发指令
   * - mode 'desktop'：来源是 GUI 编辑器且无连接器在线，走桌面自动化（聚焦窗口 → 视觉定位 → 粘贴 → 回车）
   */
  type AutoFixRoute =
    | { mode: 'cli', provider: string }
    | { mode: 'connector', connectorId: string }
    | { mode: 'desktop', processName: string }

  const autoFixRoutes = new Map<string, AutoFixRoute>()
  // 内置路由：CLI 工具（provider 即 TaskPusher 注册表中的工具 key）
  for (const [source, provider] of Object.entries({ claude_code: 'claude', codex: 'codex', opencode: 'opencode' })) {
    autoFixRoutes.set(source, { mode: 'cli', provider })
  }
  // 内置路由：IDE 连接器
  autoFixRoutes.set('trae', { mode: 'connector', connectorId: 'trae' })
  autoFixRoutes.set('cursor', { mode: 'connector', connectorId: 'cursor' })
  // P2：yaml 中声明了 cli 协议的工具 → 自动获得 cli autoFix 路由（provider = 工具 id）
  for (const tool of config.tools) {
    if (tool.enabled && tool.cli?.binary) {
      autoFixRoutes.set(tool.id, { mode: 'cli', provider: tool.id })
    }
  }
  const AUTO_FIX_ROUTE = autoFixRoutes

  /** 正在自动修复中的来源集合，防止重复触发 */
  const autoFixActive = new Set<string>()

  /** 外部反应（MCP 等）的来源级去抖表：source:type → 上次触发时间 */
  const reactionRateLimit = new Map<string, number>()
  const REACTION_DEBOUNCE_MS = 5_000

  /** pet_report 高频活动信号的来源级去抖表（与 triggerReaction 分开，互不饿死） */
  const reportRateLimit = new Map<string, number>()
  const REPORT_DEBOUNCE_MS = 3_000

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

  /**
   * 是否属于「可触发操作指导」的失败事件 — 与 isAutoFixableFailure 判定一致，
   * 但要求携带真实错误消息（errorMessage 非空才有指导素材）。
   */
  function isGuidanceFailure(event: OverseerEvent): boolean {
    if (event.severity !== OverseerSeverity.Error)
      return false
    if (event.type !== OverseerEventType.CompileFailed
      && event.type !== OverseerEventType.TestFailed
      && event.type !== OverseerEventType.TaskFailed
      && event.type !== OverseerEventType.ProcessCrash
      && event.type !== OverseerEventType.Timeout)
      return false
    const data = event.data as { errorMessage?: unknown, message?: unknown, reason?: unknown } | undefined
    const err = typeof data?.errorMessage === 'string' && data.errorMessage.trim()
      ? data.errorMessage
      : (typeof data?.message === 'string' ? data.message : (typeof data?.reason === 'string' ? data.reason : ''))
    return err.trim().length > 0
  }

  /**
   * 记录失败并触发操作指导（重复失败命中内置规则时）。
   * 发出 Guidance 事件（事件流卡片 + 桌宠经现有事件→演出管线开口）。
   * 两条失败入口共用：监控器 handleEvent 与 MCP error 反应。
   */
  function recordGuidanceFailure(event: OverseerEvent): void {
    if (!guidanceRuntimeEnabled)
      return
    const data = event.data as { errorMessage?: unknown, message?: unknown, toolName?: unknown, reason?: unknown } | undefined
    const errorMessage = typeof data?.errorMessage === 'string' && data.errorMessage.trim()
      ? data.errorMessage
      : (typeof data?.message === 'string' ? data.message : (typeof data?.reason === 'string' ? data.reason : ''))
    const toolName = typeof data?.toolName === 'string' ? data.toolName : undefined
    void guidanceService.recordFailure({
      source: event.source,
      errorMessage: errorMessage || extractErrorText(event),
      toolName,
    }).then(trigger => emitGuidance(event.source, trigger, errorMessage, toolName))
  }

  /**
   * 触发后发出 Guidance 事件 — 事件流卡片 + 桌宠开口统一出口。
   * trigger 为 null（未达阈值 / 冷却期）时静默返回。
   */
  function emitGuidance(source: string, trigger: GuidanceTrigger | null, errorMessage: string, toolName?: string): void {
    if (!trigger)
      return
    const localized = guidanceService!.localizeRule(trigger.rule)
    const guidanceEvent: OverseerEvent = {
      id: randomUUID(),
      type: OverseerEventType.Guidance,
      source,
      timestamp: Date.now(),
      severity: trigger.rule.severity === 'warn' ? OverseerSeverity.Warn : OverseerSeverity.Info,
      data: {
        ruleId: trigger.rule.id,
        suggestion: localized.title,
        steps: localized.steps,
        title: localized.title,
        toolName,
        errorMessage: errorMessage.slice(0, 200),
        message: `${localized.title} — 重复失败 ${trigger.count} 次`,
        summary: localized.title,
      },
    }
    stats.eventsTotal += 1
    stats.eventsPushed += 1
    stats.lastEventAt = guidanceEvent.timestamp
    bumpTool(source, true)
    context.emit(electronOverseerEvent, guidanceEvent)
    fileLogger.info('[overseer] guidance triggered', {
      ruleId: trigger.rule.id,
      source,
      count: trigger.count,
    })
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
    const route = AUTO_FIX_ROUTE.get(event.source)
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
      // 检查 CLI 二进制是否在 PATH 中，避免 spawn 失败
      const availability = taskPusher.probeToolAvailability()
      if (!availability[route.provider]) {
        fileLogger.warn('[overseer] autoFix: CLI 工具不可用，跳过自动修复', { source: event.source, provider: route.provider })
        autoFixActive.delete(event.source)
        return
      }
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
    else if (route.mode === 'connector') {
      // IDE 连接器：通过 WebSocket 向已注册的 IDE 连接器发送 task:execute
      const conn = connectors.getStatus(route.connectorId)
      if (conn) {
        const instruction = `以下是运行过程中出现的失败，请分析并修复：\n${errorText}`
        const sent = connectors.sendTask(route.connectorId, { type: 'prompt', payload: { text: instruction } })
        if (!sent.ok) {
          fileLogger.warn('[overseer] autoFix: 连接器发送任务失败', { source: event.source, connectorId: route.connectorId, error: sent.error })
          autoFixActive.delete(event.source)
          return
        }
        fileLogger.info('[overseer] autoFix: 通过连接器发送修复指令', { source: event.source, connectorId: route.connectorId })
      }
      else {
        fileLogger.warn('[overseer] autoFix: 连接器未在线，跳过自动修复', { source: event.source, connectorId: route.connectorId })
        autoFixActive.delete(event.source)
        return
      }
    }
    else {
      // GUI 工具：桌面自动化注入（无 CLI 控制协议，且无连接器在线时降级）
      if (!desktopAutomation) {
        fileLogger.warn('[overseer] autoFix: 缺少 desktopAutomation 服务，跳过 GUI 修复', { source: event.source })
        autoFixActive.delete(event.source)
        return
      }
      // 前置：把目标 AI 工具窗口拉到前台，确保后续视觉定位/输入落在正确窗口
      try {
        await desktopAutomation.focusWindow(undefined, 'trae')
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
          title: `定位 ${event.source} 聊天输入框`,
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

    // 3.5) 操作指导钩子 — MCP 直连的 error 型反应不走 handleEvent，这里补计数。
    //   （pet_report activity='error' 已走 handleEvent → hook ①，无需二次处理）
    if (guidanceRuntimeEnabled && contract.type === 'error') {
      const errText = 'errorMessage' in contract && typeof contract.errorMessage === 'string'
        ? contract.errorMessage
        : contract.summary
      const toolName = 'toolName' in contract && typeof contract.toolName === 'string' ? contract.toolName : undefined
      void guidanceService.recordFailure({
        source: contract.source,
        errorMessage: errText,
        toolName,
      }).then(trigger => emitGuidance(contract.source, trigger, errText, toolName))
    }

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

  /**
   * 处理 pet_report 活动上报（MCP HTTP server / stdio 子进程 → petMcpBridge /pet-report）。
   *
   * 调用链：safeParse 校验 → 白名单 → 来源级去抖 → mapPetReportToReaction →
   *        mapReactionToEvent（活动信号优先映射 ToolInvocation/TaskEnd/TaskFailed）→ handleEvent。
   * 与 triggerPetReaction 的区别：前者是低频闲聊（桌宠开口），这里是高频活动信号
   * （thinking/executing/…），去抖更短（3s）且互不共享限流表，避免互相饿死。
   *
   * @returns petReactionResultSchema：queued=已并入事件流；filtered=被白名单/限流/校验挡下
   */
  async function handlePetReport(input: unknown): Promise<PetReactionResult> {
    // 1) 校验：契约单一真源 .safeParse()
    const parsed = petReportContractSchema.safeParse(input)
    if (!parsed.success) {
      fileLogger.warn('[overseer] handlePetReport: invalid-payload', { error: parsed.error.message })
      return petReactionResultSchema.parse({ status: 'filtered', reason: 'invalid-payload' })
    }
    const report = parsed.data

    // 2) 白名单：source 必须是登记来源（与 triggerPetReaction 同源）
    if (!PET_REACTION_SOURCE.includes(report.source as any)) {
      fileLogger.warn('[overseer] handlePetReport: unknown-source', { source: report.source })
      return petReactionResultSchema.parse({ status: 'filtered', reason: 'unknown-source' })
    }

    // 2.5) MCP 活跃表：记录活动驱动「运行中」徽标（trae/workbuddy 等 MCP 接入工具）。
    // 放在限流之前 — 高频上报突发时即使被 3s 去抖挡住，来源仍保持运行状态新鲜。
    // idle/stopped 会让来源立即回落空闲，不占 TTL 窗口。
    mcpActivity.touch(report.source, normalizePetReportActivity(report.activity))

    // 3) 来源级去抖：同一 agent 3s 内多条活动上报只透传第一条（细粒度信号没必要全量入事件流）
    const nowTs = Date.now()
    const lastTs = reportRateLimit.get(report.source)
    if (lastTs !== undefined && nowTs - lastTs < REPORT_DEBOUNCE_MS) {
      fileLogger.debug('[overseer] handlePetReport: rate-limited', { source: report.source, activity: report.activity })
      return petReactionResultSchema.parse({ status: 'filtered', reason: 'rate-limited' })
    }
    reportRateLimit.set(report.source, nowTs)

    // 4) 映射：活动信号 → 结构化 PetReaction（completed/error 语义化，thinking/executing 中性信息）
    const reaction = mapPetReportToReaction(report)

    // 5) 并入现有事件管线：结构化信号优先 → ToolInvocation/TaskEnd/TaskFailed/StatusUpdate
    const event = mapReactionToEvent(reaction)
    handleEvent(event)

    return petReactionResultSchema.parse({ status: 'queued', reactionId: event.id })
  }

  function start() {
    if (running)
      return
    running = true
    supervisor.start()
    petMcpBridge.start()
    directorWatcher.start()
    log.log('overseer supervisor started')
  }

  function stop() {
    running = false
    supervisor.stop()
    petMcpBridge.stop()
    void petMcpHttpServer.stop()
    pushFilter.reset()
    reactionRateLimit.clear()
    reportRateLimit.clear()
    mcpActivity.clear()
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
    directorWatcher.stop()
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
  defineInvokeHandler(context, electronOverseerLlmProvider, async (payload) => {
    if (!payload || !payload.apiKey || !payload.baseUrl) {
      log.warn('[overseer] llm-provider sync: 无效配置（缺少 apiKey 或 baseUrl），已清除')
      setSyncedProviderConfig(null)
      return { ok: false }
    }
    setSyncedProviderConfig({
      baseUrl: payload.baseUrl,
      model: payload.model,
      apiKey: payload.apiKey,
    })
    log.log('[overseer] llm-provider synced', { providerId: payload.providerId, model: payload.model, baseUrl: payload.baseUrl })
    return { ok: true }
  })

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
    return {
      enabled: supervisorStatus.enabled,
      running: Boolean(supervisorStatus.isRunning),
      tools: buildToolStatusList(),
      updatedAt: Date.now(),
    } satisfies OverseerStatus
  })

  defineInvokeHandler(context, electronOverseerStats, async () => {
    return { ...stats, perTool: { ...stats.perTool } } satisfies OverseerStats
  })

  // ——— 操作指导（guidance）运行时控制 IPC ———
  defineInvokeHandler(context, electronOverseerGuidanceState, async (): Promise<GuidanceRuntimeState> => {
    const records = await guidanceService.getRecords()
    return {
      enabled: guidanceRuntimeEnabled,
      records: records.slice(0, 50).map(r => ({
        source: r.source,
        count: r.count,
        ruleId: r.ruleId,
        lastSeen: r.lastSeen,
      })),
      lastGuidanceAt: {},
    }
  })

  defineInvokeHandler(context, electronOverseerGuidanceToggle, async (payload): Promise<{ enabled: boolean }> => {
    guidanceRuntimeEnabled = payload?.enabled ?? true
    fileLogger.info('[overseer] guidance toggle', { enabled: guidanceRuntimeEnabled })
    return { enabled: guidanceRuntimeEnabled }
  })

  defineInvokeHandler(context, electronOverseerGuidanceReset, async (): Promise<{ reset: boolean }> => {
    await guidanceService.reset()
    fileLogger.info('[overseer] guidance memory reset')
    return { reset: true }
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
    return generatePlan(req.requirement, req.cwd ?? process.cwd(), _memoryStore ?? undefined, toolInventory)
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

  // ——— 编排者（coordinator）IPC ———
  defineInvokeHandler(context, electronCoordinatorSubmit, async (req) => {
    if (!req?.requirement)
      return { ok: false, error: 'requirement 不能为空' }
    return coordinator.submit(req.requirement, req.cwd ?? process.cwd())
  })

  defineInvokeHandler(context, electronCoordinatorTeam, async () => {
    return coordinator.snapshot()
  })

  // ——— 总监模式（Director Mode）IPC 处理器 ———
  defineInvokeHandler(context, electronDirectorReview, async () => {
    return directorReviewLatest()
  })

  defineInvokeHandler(context, electronDirectorApprove, async (req) => {
    if (!req?.planId)
      return { ok: false, error: 'planId 不能为空' }
    const result = directorApprove(req.planId, req.reason)
    // 桌宠以"总监身份"表达 — approve/reject 落盘成功后广播（renderer useDirectorEmotion 消费）
    if (result.ok && result.verdict) {
      context.emit(electronDirectorEvent, result.verdict)
    }
    return result
  })

  defineInvokeHandler(context, electronDirectorReject, async (req) => {
    if (!req?.planId)
      return { ok: false, error: 'planId 不能为空' }
    const result = directorReject(req.planId, req.reason)
    if (result.ok && result.verdict) {
      context.emit(electronDirectorEvent, result.verdict)
    }
    return result
  })

  // 总监页只读查询 — 计划列表 / 单个详情
  defineInvokeHandler(context, electronDirectorList, async () => {
    return listDirectorPlans()
  })

  defineInvokeHandler(context, electronDirectorDetail, async (req) => {
    if (!req?.planId)
      return { plan: null, verdict: null, reviewMarkdown: null, error: 'planId 不能为空' }
    return getDirectorPlanDetail(req.planId)
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
        tools: buildToolStatusList(),
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
