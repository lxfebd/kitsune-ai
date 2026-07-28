import { checkResult, type VisionCompareFn } from '../resultChecker'
import { calcDelay } from '../delayStrategy'
import { captureScreenshot } from '../capture'
import type { Task, TaskResult } from './planGenerator'

import { getFileLogger } from '../../logger'

interface AcceptanceDeps {
  visionCompare: VisionCompareFn
}

export function createAcceptance(deps: AcceptanceDeps) {
  const { visionCompare } = deps
  const fileLogger = getFileLogger()

  async function checkCli(task: Task, result: TaskResult): Promise<{ ok: boolean, error?: string }> {
    if (result.exitCode !== 0) {
      fileLogger.debug('[acceptance] checkCli', { eventId: 'checkCli', node: task.id, action: 'exit_code', result: `exit=${result.exitCode}` })
      return { ok: false, error: `退出码非 0: ${result.exitCode}` }
    }
    const errorKeywords = ['error', 'failed', 'exception', 'traceback', 'undefined is not']
    const lower = (result.output ?? '').toLowerCase()
    for (const kw of errorKeywords) {
      if (lower.includes(kw)) {
        fileLogger.debug('[acceptance] checkCli', { eventId: 'checkCli', node: task.id, action: 'keyword', result: kw })
        return { ok: false, error: `输出包含错误关键词: ${kw}` }
      }
    }
    return { ok: true }
  }

  async function checkIde(task: Task, _result: TaskResult): Promise<{ ok: boolean, error?: string }> {
    // checkAcceptance 把所有非 cli 任务都路由到这里，但只有 IdeTask 携带 assertion/expectedDescription。
    // DesktopTask 没有可校验字段，直接通过。
    if (task.type !== 'ide')
      return { ok: true }

    if (!task.assertion && !task.expectedDescription)
      return { ok: true }

    // NOTICE: calcDelay 返回毫秒，不需要 * 1000
    const delayMs = calcDelay({ type: 'unknown', estimatedDuration: undefined })
    await sleep(delayMs)
    const screenshot = await captureScreenshot()
    if (!screenshot) {
      fileLogger.debug('[acceptance] checkIde', { eventId: 'checkIde', node: task.id, action: 'screenshot', result: 'failed' })
      return { ok: false, error: '截屏失败，无法校验' }
    }

    // IdeTask 的 assertion/expectedDescription 与 CheckableTask 结构兼容，可直接传入
    const r = await checkResult(task, screenshot, visionCompare)
    fileLogger.debug('[acceptance] checkIde', { eventId: 'checkIde', node: task.id, action: 'vision_compare', result: r.passed ? 'passed' : r.reason })
    return { ok: r.passed, error: r.passed ? undefined : r.reason }
  }

  async function checkAcceptance(task: Task, result: TaskResult): Promise<{ ok: boolean, error?: string }> {
    return task.type === 'cli' ? checkCli(task, result) : checkIde(task, result)
  }

  return { checkAcceptance }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}