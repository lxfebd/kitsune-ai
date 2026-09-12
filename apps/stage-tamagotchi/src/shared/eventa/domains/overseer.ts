// Domain: overseer — eventa IPC 契约按域拆分
import { defineInvokeEventa, defineEventa } from '@moeru/eventa'

export enum OverseerEventType {
  PermissionRequest = 'permission_request',
  TaskEnd = 'task_end',
  TaskFailed = 'task_failed',
  CompileFailed = 'compile_failed',
  TestFailed = 'test_failed',
  ProcessCrash = 'process_crash',
  Timeout = 'timeout',
  StatusUpdate = 'status_update',
  /** 工具级细粒度事件 — 结构化信号直达（P0.3 Adapter 分发用） */
  ToolInvocation = 'tool_invocation',
  ToolResult = 'tool_result',
  /**
   * 操作指导 — 重复失败命中内置规则时，给用户可操作修复步骤。
   * 由 GuidanceService 触发，事件流卡片 + 桌宠反应呈现（无系统弹窗）。
   */
  Guidance = 'guidance',
}

export enum OverseerSeverity {
  Info = 'info',
  Warn = 'warn',
  Error = 'error',
}

/**
 * 事件粗粒度分类 — 用于过滤/路由（PushFilter 白名单、autoFix 决策）。
 * Adapter 把工具私有信号归一到这里，避免消费方依赖细粒度 action 枚举。
 */
export enum OverseerEventCategory {
  /** 生命周期：任务开始/结束/崩溃/超时 */
  Lifecycle = 'lifecycle',
  /** 工具调用：tool_use / tool_result（感知层结构化信号） */
  ToolInvocation = 'tool_invocation',
  /** 诊断：编译/测试失败等错误信号 */
  Diagnostic = 'diagnostic',
}

export interface OverseerEvent<T = unknown> {
  id: string
  type: OverseerEventType
  source: string
  timestamp: number
  severity: OverseerSeverity
  data: T
  /**
   * 粗粒度分类 — Adapter 归一产出；现有消费方（PushFilter/autoFix）只读
   * type/severity，此字段为增量，向后兼容。
   */
  category?: OverseerEventCategory
}

/** 结构化信号负载 — P0.3 感知层直通编排层的字段（感知层 .js 按形状对齐） */
export interface StructuredToolSignal {
  /** 真实工具名（如 Bash / Write / Edit / Read） */
  toolName?: string
  /** 感知层是否检测到错误（errorMessage 伴随） */
  hasError?: boolean
  /** 错误信息（hasError 时存在） */
  errorMessage?: string
  /** 感知层原始信号超出 schema 定义时的兜底通道 */
  raw?: unknown
}

/**
 * 操作指导事件负载 — GuidanceService 触发时内嵌到 OverseerEvent.data。
 * 两端（主进程 emitGuidance / 渲染层卡片）共享此类型，避免靠约定强转。
 */
export interface GuidanceEventData {
  /** 命中的内置规则 id（如 zcode-edit-not-read） */
  ruleId: string
  /** 卡片标题 + 桌宠台词（按主进程当前语言本地化） */
  suggestion: string
  /** 有序修复步骤（本地化） */
  steps: string[]
  /** 与 suggestion 相同的标题，供渲染层统一取标题字段 */
  title: string
  /** 触发失败的工具名（可选） */
  toolName?: string
  /** 原始错误消息（截断 200） */
  errorMessage?: string
  /** 事件流摘要行 */
  message: string
  /** 摘要（与 suggestion 相同，兼容现有 summary 渲染） */
  summary: string
}

export interface OverseerStatus {
  enabled: boolean
  running: boolean
  tools: Array<{ id: string, name: string, enabled: boolean, running: boolean }>
  updatedAt: number
}

export interface OverseerStats {
  eventsTotal: number
  eventsPushed: number
  eventsFiltered: number
  lastEventAt: number | null
  perTool: Record<string, { total: number, pushed: number }>
}

export const electronOverseerToggle = defineInvokeEventa<{ enabled: boolean }, { enabled: boolean }>('eventa:invoke:electron:overseer:toggle')
export const electronOverseerStatus = defineInvokeEventa<OverseerStatus>('eventa:invoke:electron:overseer:status')
export const electronOverseerStats = defineInvokeEventa<OverseerStats>('eventa:invoke:electron:overseer:stats')
export const electronOverseerEvent = defineEventa<OverseerEvent>('eventa:event:electron:overseer:event')

// ——— 操作指导（guidance）运行时控制 ———
export interface GuidanceRuntimeState {
  enabled: boolean
  /** 当前失败计数记录（最近若干条） */
  records: Array<{ source: string, count: number, ruleId: string | null, lastSeen: number }>
  /** 各规则最近触发指导时间（调试/展示用） */
  lastGuidanceAt: Record<string, number>
  /** 阈值与窗口（只读展示；改值走 config/overseer.yaml） */
  threshold?: number
  windowMs?: number
  cooldownMs?: number
}

export const electronOverseerGuidanceState = defineInvokeEventa<GuidanceRuntimeState>('eventa:invoke:electron:overseer:guidance:state')
export const electronOverseerGuidanceToggle = defineInvokeEventa<{ enabled: boolean }, { enabled: boolean }>('eventa:invoke:electron:overseer:guidance:toggle')
export const electronOverseerGuidanceReset = defineInvokeEventa<{ reset?: boolean }, { reset: boolean }>('eventa:invoke:electron:overseer:guidance:reset')

// Connectors — IDE 连接器管理（vscode / trae / idea 等）
export type OverseerCorrectionTaskType = 'compile' | 'test' | 'refactor' | 'edit' | 'unknown'

export type OverseerAssertionType = 'compile_success' | 'test_pass' | 'file_exists'

export interface OverseerCorrectionAssertion {
  type: OverseerAssertionType
  command?: string
  cwd?: string
  filePath?: string
}

export interface OverseerCorrectionTask {
  /** 任务唯一标识，用于死循环保护计数 */
  id: string
  /** 任务来源（claude / trae / cursor 等），与白名单 key 拼接 */
  source: string
  type: OverseerCorrectionTaskType
  /** 估算时长（秒），缺失时按 type 查默认表 */
  estimatedDuration?: number
  /** 程序化断言，优先于 expectedDescription */
  assertion?: OverseerCorrectionAssertion
  /** 自然语言预期描述，走视觉 LLM 对比 */
  expectedDescription?: string
  /** 推送到 IDE 的任务数据，原样下发给连接器 */
  payload?: unknown
}

export interface OverseerCorrectionResult {
  taskId: string
  state: 'passed' | 'corrected' | 'needs_manual' | 'rejected'
  attempts: number
  reason: string
}

export const electronOverseerPushWithVerification = defineInvokeEventa<OverseerCorrectionResult, { task: OverseerCorrectionTask }>('eventa:invoke:electron:overseer:push-with-verification')
