/**
 * Kitsune Overseer 类型声明（最小化）。
 * 现有实现为 CommonJS .js，此处仅暴露 Electron 主进程消费所需的构造器与回调形状。
 */

export interface PetReaction {
  type: string
  source: string
  emotion: string
  action?: string
  message: string
  summary?: string
  timestamp: number
}

/**
 * 来自 overseer.yaml 的工具配置项，Supervisor 仅消费 id 与 enabled 两个字段。
 * name / type / detect / events 等字段由上游 overseer 服务自身消费，此处保留为可选以保持结构完整。
 */
export interface SupervisorToolConfig {
  id: string
  name?: string
  type?: string
  detect?: { processName?: string }
  events?: string[]
  enabled: boolean
}

export interface SupervisorOptions {
  bus?: EventBus
  eventBus?: EventBus
  broadcastBus?: EventBus
  onPetReaction?: (reaction: PetReaction) => void
  monitorStore?: any
  live2dBridge?: any
  /**
   * 来自 overseer.yaml 的 tools[]；仅 enabled === true 的工具会被实例化为对应监控器。
   * 工具 id → 监控器映射：
   *   claude_code → ClaudeCodeMonitor
   *   trae        → TraeMonitor
   *   其它（cursor/windsurf/lobster/codex/aider...） → GenericAiToolMonitor
   * 缺省为空数组，此时不会实例化任何监控器。
   */
  tools?: SupervisorToolConfig[]
  /** 监控器轮询间隔（毫秒）。yaml 未配置时由各监控器回退到内置默认值 */
  pollInterval?: number
}

export interface EventBus {
  subscribe(topic: string, handler: (event: any) => void): void
  publish(topic: string, payload: any): void
}

export class Supervisor {
  constructor(options?: SupervisorOptions)
  isRunning: boolean
  enabled: boolean
  start(): void
  stop(): void
  setEnabled(enabled: boolean): void
  getStatus(): Record<string, any>
}

export class TaskPusher {
  constructor(options?: any)
  /** 推送任务到指定工具（白名单/净化/注入检测/超时强杀） */
  pushTask(options: { tool: string, templateKey: string, input?: string, cwd?: string, userPermission?: string }): Promise<any>
  /** 返回工具白名单配置（binary/timeoutMs/riskLevel 等） */
  getToolConfig(tool: string): any
  /** 公开的输入净化方法（控制字符剥离 + 截断） */
  sanitizeInput(raw: string, maxLength?: number): string
  /** 使用 spawn 数组传参执行命令（非 shell，防注入） */
  spawnCommand(binary: string, args: string[], cwd: string, timeoutMs: number): Promise<any>
  /** 强杀当前活跃子进程 */
  killAll(): void
  getAvailableTools(): any[]
  getHistory(limit?: number): any[]
}

export const TOOL_ALLOWLIST: Record<string, any>
export const TOOL_PRESETS: Record<string, any>

/** Monitor 内部状态归一工具：将原始 activity 映射为统一状态枚举 */
export function mapToUnifiedState(rawActivity: string, monitorType?: string): string

export class Live2dStateBridge {
  constructor(options?: any)
  start(): void
  stop(): void
}
export function loadEmotionMapping(path?: string): any
export const DEFAULT_MAPPING_PATH: string

export class ClaudeCodeMonitor {
  constructor(options?: { bus?: EventBus, eventBus?: EventBus })
  start(): void
  stop(): void
  getStatus(): Record<string, any>
}

export class TraeMonitor {
  constructor(options?: { bus?: EventBus, eventBus?: EventBus })
  start(): void
  stop(): void
  getStatus(): Record<string, any>
}

export class GenericAiToolMonitor {
  constructor(options?: any)
  start(): void
  stop(): void
  getStatus(): Record<string, any>
}
