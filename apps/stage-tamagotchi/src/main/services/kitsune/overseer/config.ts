/**
 * Overseer 配置 — yaml 读取与降级默认值。
 *
 * 从 index.ts 析出：ToolConfig / OverseerConfig / ExecutorParams 类型、
 * 内置降级工具清单、默认配置与 loadOverseerConfig 读取逻辑。
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import * as yaml from 'yaml'

import { getElectronMainDirname } from '../../../libs/electron/location'

export interface ToolConfig {
  id: string
  name: string
  type: string
  detect?: { processName?: string }
  events?: string[]
  enabled: boolean
  /**
   * 子 agent 画像 — 谁擅长什么，供 coordinator/规划器拆活派活时选人。
   */
  personality?: {
    strengths?: string[]
    bestFor?: string
    avoidFor?: string
    maxPromptLen?: number
  }
  /**
   * 只感知不派活：没有 CLI 可执行入口的 agent（如 zcode）标 true，
   * 注册 TaskPusher / 规划器可派活清单时被跳过，避免派活即失败。
   */
  perceiveOnly?: boolean
  /**
   * P2：CLI 控制协议声明。yaml 中给工具配了 cli 段，编排层启动时
   * 就会把它注册进 TaskPusher 运行时注册表，自动获得 autoFix 的 cli 路由：
   *   cli:
   *     binary: gemini
   *     timeoutMs: 60000
   *     riskLevel: medium
   *     templates:
   *       - key: prompt
   *         args: [--print]
   *         inputParam: -p
   */
  cli?: {
    binary: string
    timeoutMs?: number
    riskLevel?: 'low' | 'medium' | 'high'
    /**
     * 受信工具标记（如 dsh）。受信来源的普通 CLI 操作自动放行（不弹权限确认），
     * 高风险操作（rm -rf / 等）仍强制二次确认。「安装即启用」型工具应标 true。
     */
    trusted?: boolean
    templates?: Array<{ key: string, label?: string, args?: string[], inputParam?: string | null, maxLen?: number }>
    /**
     * 工具级环境变量（spawn 时合并进进程 env）— 供 dsh 等「安装即启用」型工具
     * 指定 home 目录（如 DSH_HOME），二进制在 PATH 即可探活可用。
     */
    env?: Record<string, string>
  }
}

/** 执行器参数 — 原来散落在 loop/planner/taskRunner 里的硬编码，收进配置统一管理 */
export interface ExecutorParams {
  /** 并行执行的最大任务数（loop 默认 maxConcurrency） */
  maxConcurrency?: number
  /** 非关键任务失败后的重试延迟（毫秒，依次递增） */
  retryDelaysMs?: number[]
  /** 子计划最大嵌套深度 */
  maxSubPlanDepth?: number
  /** 动态调整（失败→替代任务）最大轮数 */
  maxAdjustments?: number
  /** 单个计划任务总数上限 */
  maxTasks?: number
  /** CLI 任务默认超时（毫秒） */
  cliTimeoutMs?: number
  /** 桌面自动化任务外层硬超时（毫秒） */
  desktopTimeoutMs?: number
  /** IDE 任务按 action 超时（毫秒） */
  ideTimeoutMs?: Record<string, number>
}

export interface OverseerConfig {
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
  /** 执行器参数（超时/并行度/重试等）— yaml executor 节 */
  executor?: ExecutorParams
  /**
   * 操作指导（重复失败 → 桌宠方法指导）配置节。缺省时按默认值工作。
   */
  guidance?: {
    /** 是否启用重复失败指导（默认 true，仅关掉指导不关监工本身） */
    enabled?: boolean
    /** 指导文案语言（zh-Hans / en），事件内嵌双语由渲染进程取；此值用于主进程预选 */
    locale?: string
    /** 同一失败（source+归一化错误）在窗口内累计多少次触发指导（默认 3） */
    threshold?: number
    /** 失败计数窗口（毫秒，默认 900000=15min） */
    windowMs?: number
    /** 同一条规则两次指导的最小间隔（毫秒，默认 600000=10min） */
    cooldownMs?: number
  }
}

// 配置缺失时的内置降级清单 — 监控 Claude Code / Trae / Cursor / Codex
const DEFAULT_TOOLS: ToolConfig[] = [
  { id: 'claude_code', name: 'Claude Code', type: 'process', detect: { processName: 'claude' }, events: ['permission_request', 'task_end', 'task_failed', 'compile_failed', 'test_failed'], enabled: true },
  { id: 'opencode', name: 'Opencode', type: 'process', detect: { processName: 'opencode' }, events: ['permission_request', 'task_end', 'task_failed'], enabled: true },
  { id: 'trae', name: 'Trae', type: 'process', detect: { processName: 'trae' }, events: ['permission_request', 'task_end', 'task_failed'], enabled: true },
  { id: 'cursor', name: 'Cursor', type: 'process', detect: { processName: 'cursor' }, events: ['permission_request', 'task_end', 'task_failed'], enabled: true },
  { id: 'codex', name: 'OpenAI Codex', type: 'process', detect: { processName: 'codex' }, events: ['permission_request', 'task_end', 'task_failed'], enabled: true },
]

function defaultConfig(): OverseerConfig {
  // 默认不自动启动 — 配置缺失时也保持关闭，避免意外监工
  return { version: 1, enabled: false, tools: DEFAULT_TOOLS.map(t => ({ ...t })), pollInterval: 10000, executor: {} }
}

function getConfigPath(): string {
  // 与 llmHelper.ts 的 getConfigDir() 同路径策略：
  // 开发环境 → <monorepoRoot>/config/overseer.yaml
  // 打包环境 → <distRoot>/config/overseer.yaml（由 extraResources 拷入）
  const electronMainDirname = getElectronMainDirname()
  const root = join(electronMainDirname, '..', '..', '..', '..')
  return join(root, 'config', 'overseer.yaml')
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
        executor: parsed.executor ?? {},
        guidance: parsed.guidance ?? {},
      }
    }
  }
  catch {
    // 配置缺失或解析失败 — 使用内置默认配置
  }
  return defaultConfig()
}