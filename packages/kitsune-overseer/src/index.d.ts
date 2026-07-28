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
  push(tool: string, templateKey: string, input?: string): Promise<any>
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
