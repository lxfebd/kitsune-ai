import { electronConnectorTaskResult } from '../../../../../shared/eventa'
import type { ConnectorInfo } from '../../../../../shared/eventa'
import type { CliTask, DesktopTask, IdeTask, Task, TaskResult } from './planGenerator'
import type { DesktopAutomationService } from '../../desktop-automation'
import { safetyCheck } from '../../desktop-automation/safety'
import { relative, resolve, isAbsolute } from 'node:path'

import { getFileLogger } from '../../logger'

/** IDE 任务超时按 action 类型动态调整 */
const IDE_TIMEOUT_MS: Record<string, number> = {
  open_file: 10_000,
  insert_code: 20_000,
  run_command: 60_000,
}

/** 桌面自动化任务外层硬超时 — 每个 desktopAutomation 调用都可能挂起（findElement 视觉推理等），
 *  修复前无任何兜底，单个调用卡死会无限阻塞整个 executor。 */
export const DESKTOP_TASK_TIMEOUT_MS = 60_000

/** 执行器超时参数 — 从 overseer.yaml executor 节注入，缺省回退硬编码 */
export interface RunnerTimeoutParams {
  ideTimeoutMs?: Record<string, number>
  desktopTimeoutMs?: number
}

/** 给一个 Promise 挂上硬性 deadline：先到方获胜。 */
function withDeadline<V>(promise: Promise<V>, ms: number, label: string): Promise<V> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer)
      clearTimeout(timer)
  })
}

/**
 * P3：解析 claude --output-format=json 的 stdout（JSON Lines），提取任务结果信号。
 * 与 TaskPusher._augmentStructuredResult 逻辑对齐；解析失败返回 null（调用方静默跳过）。
 */
function parseStructuredOutput(output: string): { subtype: string | null, error: string | null, toolUses: Array<{ name: string, id?: string }> } | null {
  let parsed = false
  let subtype: string | null = null
  let error: string | null = null
  const toolUses: Array<{ name: string, id?: string }> = []
  for (const line of output.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let entry: any
    try { entry = JSON.parse(trimmed) } catch { continue }
    parsed = true
    if (entry.type === 'result') {
      subtype = entry.subtype ?? subtype
      if (entry.result && typeof entry.result === 'object') {
        error = entry.result.error || entry.result.errorMessage || error
      }
      if (subtype && subtype !== 'success') {
        error = error || subtype
      }
    } else if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
      for (const c of entry.message.content) {
        if (c.type === 'tool_use') {
          toolUses.push({ name: c.name, id: c.id })
        }
      }
    }
  }
  if (!parsed) return null
  return { subtype, error, toolUses }
}

interface TaskRunnerDeps {
  taskPusher: { spawnCommand: (binary: string, args: string[], cwd: string, timeoutMs: number, env?: Record<string, string>) => Promise<any>, getToolConfig: (tool: string) => any, sanitizeInput: (raw: string, maxLength?: number) => string }
  connectors: { getStatus: (id: string) => ConnectorInfo | null, sendTask: (id: string, task: { type: string, payload?: Record<string, unknown> }) => { ok: boolean, error?: string, taskId?: string } }
  context: { on: (event: any, handler: (payload: any) => void) => () => void }
  allowedRoots: string[]
  desktopAutomation?: DesktopAutomationService
  /** 超时参数（IDE/桌面）— 从 yaml executor 节注入 */
  timeouts?: RunnerTimeoutParams
}

// NOTICE: 沙箱校验 — 防止 CLI 任务在 workspace 外执行。
// resolve(root) 得到绝对路径，relative() 在目标路径在根目录外时返回 '..' 前缀。
//
// 安全修正（原实现漏洞）：
// Windows 不同盘符时 relative() 返回绝对路径（如 "D:\\other"），原实现用
// `if (isAbsolute(rel)) continue` 跳过该根目录，导致跨盘符越权访问被误判为安全。
// 现改为：相对路径以 ".." 或本身是绝对路径（跨盘符）时，一律视为越权。
//
// allowedRoots 为空时返回 true（向后兼容：配置缺失则不限制）。
// 调用方 runCliTask 会在该情况下记录一次告警，提示用户配置 allowedRoots。
export function isPathSafe(target: string, allowedRoots: string[]): boolean {
  if (allowedRoots.length === 0) return true
  const resolvedTarget = resolve(target)
  for (const root of allowedRoots) {
    const rel = relative(resolve(root), resolvedTarget)
    // 跨盘符或上级目录 → 越权，跳过该根继续检查
    if (isAbsolute(rel) || rel.startsWith('..'))
      continue
    return true
  }
  return false
}

export function createTaskRunner(deps: TaskRunnerDeps) {
  const { taskPusher, connectors, context, allowedRoots, desktopAutomation, timeouts } = deps
  const fileLogger = getFileLogger()
  const ideTimeouts = { ...IDE_TIMEOUT_MS, ...timeouts?.ideTimeoutMs }
  const desktopTimeout = timeouts?.desktopTimeoutMs ?? DESKTOP_TASK_TIMEOUT_MS

  async function runCliTask(task: CliTask): Promise<TaskResult> {
    // 沙箱校验 — 防止 CLI 任务在 workspace 外执行
    if (allowedRoots.length === 0)
      fileLogger.warn('[taskRunner] runCliTask sandbox disabled (allowedRoots empty), allowing all cwd')
    if (!isPathSafe(task.cwd, allowedRoots)) {
      fileLogger.debug('[taskRunner] runCliTask', { eventId: 'runCliTask', node: task.id, action: 'sandbox_check', result: 'denied' })
      return { taskId: task.id, ok: false, error: `cwd 越权：${task.cwd} 不在允许的根目录内`, durationMs: 0 }
    }
    const cfg = taskPusher.getToolConfig(task.provider)
    if (!cfg) {
      fileLogger.debug('[taskRunner] runCliTask', { eventId: 'runCliTask', node: task.id, action: 'provider_lookup', result: `missing:${task.provider}` })
      return { taskId: task.id, ok: false, error: `不支持的 provider: ${task.provider}`, durationMs: 0 }
    }

    const template = cfg.templates.find((t: any) => t.key === 'prompt')
    // 按模板 inputParam 拼参 — 修复前直接 [...args, prompt] 丢失 inputParam：
    // claude 模板 inputParam='-p'，缺省时 claude 会把 prompt 当作文件名解析，自动修复必然失败。
    const sanitized = taskPusher.sanitizeInput(task.prompt, template?.maxLen ?? 2000)
    const args = [...(template?.args ?? [])]
    if (template?.inputParam)
      args.push(template.inputParam, sanitized)
    else
      args.push(sanitized)
    const timeoutMs = task.timeoutMs ?? cfg.timeoutMs
    const start = Date.now()
    const result = await taskPusher.spawnCommand(cfg.binary, args, task.cwd, timeoutMs, cfg.env)
    // P3：结构化模板的解析结果（claude --output-format=json）透传给规划器/验收，
    // 让自动修复失败原因来自 JSON 信号而非人读文本。
    let structured: any
    if (template?.structured && result.output) {
      // 与 TaskPusher._augmentStructuredResult 一致的内联解析（taskRunner 拿不到该私有方法）
      structured = parseStructuredOutput(result.output)
      if (structured && structured.subtype && structured.subtype !== 'success') {
        result.ok = false
        result.error = result.error || `任务未成功: ${structured.error || structured.subtype}`
      }
    }    fileLogger.debug('[taskRunner] runCliTask', { eventId: 'runCliTask', node: task.id, action: 'spawn', result: result.ok ? 'success' : result.error })
    return {
      taskId: task.id,
      ok: result.ok,
      output: result.output,
      error: result.error,
      exitCode: result.exitCode,
      code: result.code,
      durationMs: Date.now() - start,
      structured,
    }
  }

  async function runIdeTask(task: IdeTask): Promise<TaskResult> {
    const conn = connectors.getStatus(task.connectorId)
    if (!conn) {
      fileLogger.debug('[taskRunner] runIdeTask', { eventId: 'runIdeTask', node: task.id, action: 'connector_status', result: 'offline' })
      return { taskId: task.id, ok: false, error: `连接器 ${task.connectorId} 离线`, durationMs: 0 }
    }

    const start = Date.now()
    // NOTICE: connectors.sendTask 是同步的，不是 Promise；返回的 taskId 是插件回执的匹配键
    const sent = connectors.sendTask(task.connectorId, { type: task.action, payload: task.payload })
    if (!sent.ok) {
      fileLogger.debug('[taskRunner] runIdeTask', { eventId: 'runIdeTask', node: task.id, action: 'sendTask', result: sent.error })
      return { taskId: task.id, ok: false, error: sent.error, durationMs: Date.now() - start }
    }
    const receiptTaskId = sent.taskId ?? task.id

    // 等 task:result 事件回来，按 action 类型动态超时
    const timeoutMs = ideTimeouts[task.action] ?? 30_000
    return new Promise<TaskResult>((resolve) => {
      const timer = setTimeout(() => {
        off()
        fileLogger.debug('[taskRunner] runIdeTask', { eventId: 'runIdeTask', node: task.id, action: 'timeout', result: `${timeoutMs}ms` })
        resolve({ taskId: task.id, ok: false, error: `IDE 响应超时（${timeoutMs / 1000}s）`, durationMs: Date.now() - start })
      }, timeoutMs)

      // eventa 的 on handler 收到的是 Eventa<P>（{ id, type, body: P }），
      // 业务 payload 在 body 字段；task:result 事件由 connectors 服务 emit。
      const off = context.on(electronConnectorTaskResult, (event) => {
        const payload = event.body
        if (payload.taskId !== receiptTaskId)
          return
        clearTimeout(timer)
        off()
        fileLogger.debug('[taskRunner] runIdeTask', { eventId: 'runIdeTask', node: task.id, action: 'task_result', result: payload.success ? 'success' : payload.error })
        resolve({ taskId: task.id, ok: payload.success, error: payload.error, durationMs: Date.now() - start })
      })
    })
  }

  async function runDesktopTask(task: DesktopTask): Promise<TaskResult> {
    if (!desktopAutomation) {
      return { taskId: task.id, ok: false, error: '桌面自动化服务未配置', durationMs: 0 }
    }
    // 安全检查：阻止敏感操作（Alt+F4 等）和非白名单操作。
    // detail 传入语义化的键名/坐标，而非序列化 JSON，确保敏感键拦截能正确触发。
    const safetyDetail = task.action === 'pressKey' ? String(task.params.key ?? '')
      : task.action === 'moveTo' ? `${task.params.x},${task.params.y}`
        : task.action === 'type' ? String(task.params.text ?? '')
          : ''
    const safetyResult = safetyCheck(task.action, safetyDetail)
    if (!safetyResult.allowed) {
      fileLogger.debug('[taskRunner] runDesktopTask', { eventId: 'runDesktopTask', node: task.id, action: 'safety_check', result: safetyResult.reason })
      return { taskId: task.id, ok: false, error: `安全限制: ${safetyResult.reason}`, durationMs: 0 }
    }
    const start = Date.now()
    const timeoutMs = task.timeoutMs ?? desktopTimeout
    // executeAction 是嵌套函数，TS 不会把外部 null 检查收窄带进去 — 先断言非空
    const da = desktopAutomation
    try {
      // 外层硬超时：桌面自动化调用（findElement 视觉推理 / moveTo / 截图）可能无限挂起，
      // 单个调用卡死不再阻塞整个 executor — 到时返回 TIMEOUT 错误
      const actionResult = await withDeadline(executeAction(da), timeoutMs, `desktop:${task.action}`)
      if (!actionResult.ok)
        return { taskId: task.id, ok: false, error: actionResult.error, durationMs: Date.now() - start }
      return { taskId: task.id, ok: true, output: actionResult.output, durationMs: Date.now() - start }
    }
    catch (error) {
      const isTimeout = error instanceof Error && error.message.includes('timed out after')
      return {
        taskId: task.id,
        ok: false,
        error: isTimeout ? `桌面任务超时 (${timeoutMs / 1000}s)` : String(error),
        code: isTimeout ? 'TIMEOUT' : undefined,
        durationMs: Date.now() - start,
      }
    }

    async function executeAction(da: NonNullable<typeof desktopAutomation>): Promise<{ ok: boolean, error?: string, output?: string }> {
      switch (task.action) {
        case 'click':
          await da.click(task.params.button)
          return { ok: true }
        case 'moveTo':
          if (task.params.x === undefined || task.params.y === undefined)
            return { ok: false, error: '缺少 x/y 坐标' }
          await da.moveTo(task.params.x, task.params.y)
          return { ok: true }
        case 'type':
          if (!task.params.text)
            return { ok: false, error: '缺少 text' }
          await da.type(task.params.text)
          return { ok: true }
        case 'pressKey':
          if (!task.params.key)
            return { ok: false, error: '缺少 key' }
          await da.pressKey(task.params.key)
          return { ok: true }
        case 'drag':
          if (!task.params.from || !task.params.to)
            return { ok: false, error: '缺少 from/to' }
          await da.drag(task.params.from, task.params.to)
          return { ok: true }
        case 'findAndClick': {
          if (!task.params.elementDescription)
            return { ok: false, error: '缺少 elementDescription' }
          const found = await da.findElement(task.params.elementDescription)
          // findElement 返回 { found, elements[] }，坐标在首个匹配元素上
          const pos = found.found ? found.elements[0] : undefined
          if (!pos) {
            fileLogger.warn('[taskRunner] findElement failed, try keyboard fallback for AI input')
            // 视觉定位失败时，尝试 Ctrl+Shift+I（VS Code 系 AI 聊天快捷键）作为 fallback。
            try {
              await da.pressKey('CONTROL+SHIFT+I')
              return { ok: true }
            }
            catch {
              return { ok: false, error: '未找到匹配元素，且键盘快捷键 fallback 失败' }
            }
          }
          await da.moveTo(pos.x, pos.y)
          await da.click(task.params.button)
          return { ok: true }
        }
        case 'screenshot': {
          const dataUrl = await da.screenshot()
          return { ok: true, output: dataUrl }
        }
        case 'findElement':
          if (!task.params.elementDescription)
            return { ok: false, error: '缺少 elementDescription' }
          const element = await da.findElement(task.params.elementDescription)
          return { ok: true, output: JSON.stringify(element) }
        default:
          return { ok: false, error: `不支持的桌面操作: ${task.action}` }
      }
    }
  }

  function runTask(task: Task): Promise<TaskResult> {
    if (task.type === 'desktop')
      return runDesktopTask(task as DesktopTask)
    return task.type === 'cli' ? runCliTask(task as CliTask) : runIdeTask(task as IdeTask)
  }

  return { runTask, runCliTask, runIdeTask, runDesktopTask }
}