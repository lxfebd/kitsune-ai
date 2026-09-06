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

interface TaskRunnerDeps {
  taskPusher: { spawnCommand: (binary: string, args: string[], cwd: string, timeoutMs: number) => Promise<any>, getToolConfig: (tool: string) => any, sanitizeInput: (raw: string, maxLength?: number) => string }
  connectors: { getStatus: (id: string) => ConnectorInfo | null, sendTask: (id: string, task: { type: string, payload?: Record<string, unknown> }) => { ok: boolean, error?: string } }
  context: { on: (event: any, handler: (payload: any) => void) => () => void }
  allowedRoots: string[]
  desktopAutomation?: DesktopAutomationService
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
  const { taskPusher, connectors, context, allowedRoots, desktopAutomation } = deps
  const fileLogger = getFileLogger()

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
    const result = await taskPusher.spawnCommand(cfg.binary, args, task.cwd, timeoutMs)
    fileLogger.debug('[taskRunner] runCliTask', { eventId: 'runCliTask', node: task.id, action: 'spawn', result: result.ok ? 'success' : result.error })
    return {
      taskId: task.id,
      ok: result.ok,
      output: result.output,
      error: result.error,
      exitCode: result.exitCode,
      durationMs: Date.now() - start,
    }
  }

  async function runIdeTask(task: IdeTask): Promise<TaskResult> {
    const conn = connectors.getStatus(task.connectorId)
    if (!conn) {
      fileLogger.debug('[taskRunner] runIdeTask', { eventId: 'runIdeTask', node: task.id, action: 'connector_status', result: 'offline' })
      return { taskId: task.id, ok: false, error: `连接器 ${task.connectorId} 离线`, durationMs: 0 }
    }

    const start = Date.now()
    // NOTICE: connectors.sendTask 是同步的，不是 Promise
    const sent = connectors.sendTask(task.connectorId, { type: task.action, payload: task.payload })
    if (!sent.ok) {
      fileLogger.debug('[taskRunner] runIdeTask', { eventId: 'runIdeTask', node: task.id, action: 'sendTask', result: sent.error })
      return { taskId: task.id, ok: false, error: sent.error, durationMs: Date.now() - start }
    }

    // 等 task:result 事件回来，按 action 类型动态超时
    const timeoutMs = IDE_TIMEOUT_MS[task.action] ?? 30_000
    return new Promise<TaskResult>((resolve) => {
      const timer = setTimeout(() => {
        off()
        fileLogger.debug('[taskRunner] runIdeTask', { eventId: 'runIdeTask', node: task.id, action: 'timeout', result: `${timeoutMs}ms` })
        resolve({ taskId: task.id, ok: false, error: `IDE 响应超时（${timeoutMs / 1000}s）`, durationMs: Date.now() - start })
      }, timeoutMs)

      const off = context.on(electronConnectorTaskResult, (payload: { taskId: string, success: boolean, error?: string }) => {
        if (payload.taskId !== task.id)
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
    try {
      switch (task.action) {
        case 'click':
          await desktopAutomation.click(task.params.button)
          break
        case 'moveTo':
          if (task.params.x === undefined || task.params.y === undefined)
            return { taskId: task.id, ok: false, error: '缺少 x/y 坐标', durationMs: Date.now() - start }
          await desktopAutomation.moveTo(task.params.x, task.params.y)
          break
        case 'type':
          if (!task.params.text)
            return { taskId: task.id, ok: false, error: '缺少 text', durationMs: Date.now() - start }
          await desktopAutomation.type(task.params.text)
          break
        case 'pressKey':
          if (!task.params.key)
            return { taskId: task.id, ok: false, error: '缺少 key', durationMs: Date.now() - start }
          await desktopAutomation.pressKey(task.params.key)
          break
        case 'drag':
          if (!task.params.from || !task.params.to)
            return { taskId: task.id, ok: false, error: '缺少 from/to', durationMs: Date.now() - start }
          await desktopAutomation.drag(task.params.from, task.params.to)
          break
        case 'findAndClick': {
          if (!task.params.elementDescription)
            return { taskId: task.id, ok: false, error: '缺少 elementDescription', durationMs: Date.now() - start }
          const found = await desktopAutomation.findElement(task.params.elementDescription)
          // findElement 返回 { found, elements[] }，坐标在首个匹配元素上
          const pos = found.found ? found.elements[0] : undefined
          if (!pos) {
            fileLogger.warn('[taskRunner] findElement failed, try keyboard fallback for AI input')
            // 视觉定位失败时，尝试 Ctrl+Shift+I（VS Code 系 AI 聊天快捷键）作为 fallback。
            // 如果仍失败，返回错误不阻塞整体流程。
            try {
              await desktopAutomation.pressKey('CONTROL+SHIFT+I')
              return { taskId: task.id, ok: true, durationMs: Date.now() - start }
            }
            catch {
              return { taskId: task.id, ok: false, error: '未找到匹配元素，且键盘快捷键 fallback 失败', durationMs: Date.now() - start }
            }
          }
          await desktopAutomation.moveTo(pos.x, pos.y)
          await desktopAutomation.click(task.params.button)
          break
        }
        case 'screenshot': {
          const dataUrl = await desktopAutomation.screenshot()
          return { taskId: task.id, ok: true, output: dataUrl, durationMs: Date.now() - start }
        }
        case 'findElement':
          if (!task.params.elementDescription)
            return { taskId: task.id, ok: false, error: '缺少 elementDescription', durationMs: Date.now() - start }
          const element = await desktopAutomation.findElement(task.params.elementDescription)
          return { taskId: task.id, ok: true, output: JSON.stringify(element), durationMs: Date.now() - start }
        default:
          return { taskId: task.id, ok: false, error: `不支持的桌面操作: ${task.action}`, durationMs: Date.now() - start }
      }
      return { taskId: task.id, ok: true, durationMs: Date.now() - start }
    }
    catch (error) {
      return { taskId: task.id, ok: false, error: String(error), durationMs: Date.now() - start }
    }
  }

  function runTask(task: Task): Promise<TaskResult> {
    if (task.type === 'desktop')
      return runDesktopTask(task as DesktopTask)
    return task.type === 'cli' ? runCliTask(task as CliTask) : runIdeTask(task as IdeTask)
  }

  return { runTask, runCliTask, runIdeTask, runDesktopTask }
}