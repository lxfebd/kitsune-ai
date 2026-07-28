/**
 * 任务预期结果校验。
 *
 * assertion 程序化断言优先：直接在主进程跑命令或检查文件，结果确定。
 * expectedDescription 自然语言描述走视觉 LLM 对比，由调用方注入 visionCompare。
 * 两者同时存在时只跑 assertion — 断言不依赖模型推理，结果更可信。
 */

import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'

export type AssertionType = 'compile_success' | 'test_pass' | 'file_exists'

export interface TaskAssertion {
  type: AssertionType
  /** compile_success / test_pass 使用的 shell 命令；file_exists 时忽略 */
  command?: string
  /** 命令工作目录，默认继承主进程 */
  cwd?: string
  /** file_exists 检查的绝对路径 */
  filePath?: string
}

export interface CheckableTask {
  assertion?: TaskAssertion
  /** 自然语言描述，与截图一起喂给视觉 LLM 判断是否达标 */
  expectedDescription?: string
}

export interface CheckResult {
  passed: boolean
  reason: string
}

/** 视觉对比函数：接收截图 data URL 与描述，返回是否匹配。由 Overseer 服务注入。 */
export type VisionCompareFn = (imageDataUrl: string, description: string) => Promise<CheckResult>

const SHELL_TIMEOUT_MS = 120_000

/**
 * 校验任务是否达标。
 *
 * Before:
 * - { assertion: { type: 'file_exists', filePath: '/a.txt' } }
 * - { expectedDescription: '编译成功无报错' }
 *
 * After:
 * - { passed: true, reason: 'file exists: /a.txt' }
 * - { passed: false, reason: 'compile_success exit 1' }
 */
export async function checkResult(
  task: CheckableTask,
  screenshot: string,
  visionCompare?: VisionCompareFn,
): Promise<CheckResult> {
  if (task.assertion)
    return checkAssertion(task.assertion)

  if (task.expectedDescription && visionCompare)
    return visionCompare(screenshot, task.expectedDescription)

  // 没有可校验条件 — 默认通过，避免无意义循环修正
  return { passed: true, reason: 'no assertion or expected description, skip check' }
}

async function checkAssertion(a: TaskAssertion): Promise<CheckResult> {
  if (a.type === 'file_exists')
    return checkFile(a)

  if (a.type === 'compile_success' || a.type === 'test_pass')
    return checkShell(a)

  return { passed: false, reason: `unsupported assertion type: ${a.type}` }
}

function checkFile(a: TaskAssertion): Promise<CheckResult> {
  const filePath = a.filePath
  if (!filePath)
    return Promise.resolve({ passed: false, reason: 'file_exists assertion missing filePath' })

  return access(filePath)
    .then(() => ({ passed: true, reason: `file exists: ${filePath}` }))
    .catch(() => ({ passed: false, reason: `file missing: ${filePath}` }))
}

function checkShell(a: TaskAssertion): Promise<CheckResult> {
  const command = a.command
  if (!command)
    return Promise.resolve({ passed: false, reason: `${a.type} assertion missing command` })

  return runShell(command, a.cwd).then(code =>
    code === 0
      ? { passed: true, reason: `${a.type} exit 0` }
      : { passed: false, reason: `${a.type} exit ${code}` },
  )
}

/**
 * 运行 shell 命令并返回退出码。
 * 超时按 SIGTERM 处理，退出码记为 124（与 timeout 命令一致）。
 */
function runShell(command: string, cwd?: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: 'ignore',
      windowsHide: true,
    })

    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      resolve(124)
    }, SHELL_TIMEOUT_MS)

    child.on('close', (code) => {
      clearTimeout(timer)
      resolve(code ?? 1)
    })

    // spawn 立即失败（如命令不存在）— 视为非零退出
    child.on('error', () => {
      clearTimeout(timer)
      resolve(1)
    })
  })
}
