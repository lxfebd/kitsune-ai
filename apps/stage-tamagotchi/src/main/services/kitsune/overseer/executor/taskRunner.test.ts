import type { DesktopTask, IdeTask } from './planGenerator'

import { beforeEach, describe, expect, it, vi } from 'vitest'

// NOTICE: taskRunner.ts 的 import 链包含 shared/eventa（纯函数测试不依赖），
// 这里 mock eventa 仅为了隔离契约对象；createTaskRunner 的 context.on 断言不触碰真实注入。
vi.mock('../../../../../shared/eventa', () => ({
  electronConnectorTaskResult: 'mock',
  electronExecutorEvent: 'mock',
}))

vi.mock('../../desktop-automation/safety', () => ({
  safetyCheck: vi.fn(() => ({ allowed: true })),
}))

const { createTaskRunner, isPathSafe } = await import('./taskRunner')

describe('isPathSafe', () => {
  const allowedRoots = ['/home/user/project', '/var/data']

  it('allows exact match path', () => {
    expect(isPathSafe('/home/user/project', allowedRoots)).toBe(true)
  })

  it('allows path in subdirectory', () => {
    expect(isPathSafe('/home/user/project/src/index.ts', allowedRoots)).toBe(true)
  })

  it('rejects path outside allowed roots', () => {
    expect(isPathSafe('/tmp/evil', allowedRoots)).toBe(false)
  })

  it('rejects path traversing out of allowed root', () => {
    expect(isPathSafe('/home/user/project/../outside', allowedRoots)).toBe(false)
  })

  it('allows all paths when allowedRoots is empty', () => {
    expect(isPathSafe('/tmp/anywhere', [])).toBe(true)
  })

  it('matches second root if first does not contain path', () => {
    expect(isPathSafe('/var/data/db.sqlite', allowedRoots)).toBe(true)
  })

  it('rejects path when no root contains it', () => {
    expect(isPathSafe('/etc/passwd', allowedRoots)).toBe(false)
  })
})

describe('runIdeTask', () => {
  const contextOnMock = vi.fn((_event: unknown, _handler: (event: any) => void) => vi.fn())
  const sendTaskMock = vi.fn()

  function makeRunner() {
    return createTaskRunner({
      taskPusher: {
        spawnCommand: vi.fn(),
        getToolConfig: vi.fn(),
        sanitizeInput: vi.fn(),
      },
      connectors: {
        getStatus: vi.fn(() => ({
          id: 'vscode',
          type: 'vscode' as const,
          name: 'vscode',
          peerId: 'peer-1',
          connectedAt: 0,
          lastContext: null,
          lastContextAt: null,
        })),
        sendTask: sendTaskMock,
      },
      context: { on: contextOnMock },
      allowedRoots: ['/home/user/project'],
    })
  }

  beforeEach(() => {
    contextOnMock.mockReset()
    sendTaskMock.mockReset()
    sendTaskMock.mockReturnValue({ ok: true })
  })

  function makeIdeTask(overrides: Partial<IdeTask> = {}): IdeTask {
    return {
      id: 'task-ide-1',
      type: 'ide',
      title: 'Open file',
      connectorId: 'vscode',
      action: 'open_file',
      payload: { path: '/home/user/project/src/main.ts' },
      critical: false,
      ...overrides,
    }
  }

  it('resolves from the task:result envelope body, not the raw event', async () => {
    const runner = makeRunner()

    // context.on 的 handler 收到的是 Eventa<P> 信封：{ id, type, body: P }。
    // 业务 payload（taskId/success）在 body 字段 — connectors 服务正是这样 emit 的。
    const promise = runner.runIdeTask(makeIdeTask())

    const handler = contextOnMock.mock.calls[0]![1] as (event: any) => void
    handler({
      id: 'eventa:event:electron:connector:task-result',
      type: 'event',
      body: { taskId: 'task-ide-1', success: true },
    })

    const result = await promise
    expect(result).toMatchObject({ taskId: 'task-ide-1', ok: true })
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('ignores task results for other task ids', async () => {
    const runner = makeRunner()

    const promise = runner.runIdeTask(makeIdeTask())
    const handler = contextOnMock.mock.calls[0]![1] as (event: any) => void
    handler({ id: 'x', type: 'event', body: { taskId: 'other-task', success: true } })

    // 不匹配的 taskId 不应立即 resolve；后续匹配事件才生效。
    handler({ id: 'x', type: 'event', body: { taskId: 'task-ide-1', success: true, error: undefined } })
    const result = await promise
    expect(result).toMatchObject({ taskId: 'task-ide-1', ok: true })
  })

  it('propagates failure fields from the envelope body', async () => {
    const runner = makeRunner()

    const promise = runner.runIdeTask(makeIdeTask())
    const handler = contextOnMock.mock.calls[0]![1] as (event: any) => void
    handler({ id: 'x', type: 'event', body: { taskId: 'task-ide-1', success: false, error: 'compile failed' } })

    const result = await promise
    expect(result).toMatchObject({ taskId: 'task-ide-1', ok: false, error: 'compile failed' })
  })

  it('matches receipt by the taskId returned from sendTask', async () => {
    // sendTask 现在会生成并返回 taskId（connectors 服务注入到 data.taskId），
    // taskRunner 必须以它匹配回执，而不是任务自身的 id
    sendTaskMock.mockReturnValue({ ok: true, taskId: 'generated-receipt-id' })
    const runner = makeRunner()

    const promise = runner.runIdeTask(makeIdeTask())
    const handler = contextOnMock.mock.calls[0]![1] as (event: any) => void
    // 用生成的回执 id 匹配 → resolve
    handler({ id: 'x', type: 'event', body: { taskId: 'generated-receipt-id', success: true } })
    const result = await promise
    expect(result).toMatchObject({ taskId: 'task-ide-1', ok: true })
  })

  it('returns error immediately when connector is offline', async () => {
    sendTaskMock.mockReturnValue({ ok: true })
    const runner = createTaskRunner({
      taskPusher: {
        spawnCommand: vi.fn(),
        getToolConfig: vi.fn(),
        sanitizeInput: vi.fn(),
      },
      connectors: {
        getStatus: vi.fn(() => null),
        sendTask: sendTaskMock,
      },
      context: { on: contextOnMock },
      allowedRoots: ['/home/user/project'],
    })

    const result = await runner.runIdeTask(makeIdeTask())
    expect(result.ok).toBe(false)
    expect(result.error).toContain('离线')
    expect(sendTaskMock).not.toHaveBeenCalled()
  })
})

describe('runDesktopTask (A2 — 外层超时)', () => {
  function makeDesktopTask(overrides: Partial<DesktopTask> = {}): DesktopTask {
    return {
      id: 'task-desktop-1',
      type: 'desktop',
      title: 'screenshot',
      action: 'screenshot',
      params: {},
      critical: false,
      ...overrides,
    } as DesktopTask
  }

  function makeRunner(desktopAutomation: Record<string, any>) {
    return createTaskRunner({
      taskPusher: { spawnCommand: vi.fn(), getToolConfig: vi.fn(), sanitizeInput: vi.fn() },
      connectors: { getStatus: vi.fn(() => null), sendTask: vi.fn() },
      context: { on: vi.fn() },
      allowedRoots: ['/home/user/project'],
      desktopAutomation: desktopAutomation as any,
    })
  }

  it('桌面自动化调用永不返回 → 外层超时，返回 TIMEOUT 错误（不再无限挂起）', async () => {
    const runner = makeRunner({
      screenshot: vi.fn(() => new Promise(() => {})), // 永不 resolve
    })
    const start = Date.now()
    const result = await runner.runDesktopTask(makeDesktopTask({ timeoutMs: 500 }))
    const elapsed = Date.now() - start
    expect(result.ok).toBe(false)
    expect(result.error).toContain('桌面任务超时')
    expect(result.code).toBe('TIMEOUT')
    expect(elapsed).toBeGreaterThanOrEqual(450) // 500ms deadline 触发
    expect(elapsed).toBeLessThan(5_000)
  }, 10_000)

  it('正常 screenshot 返回 data URL（回归保护）', async () => {
    const runner = makeRunner({
      screenshot: vi.fn().mockResolvedValue('data:image/png;base64,abc'),
    })
    const result = await runner.runDesktopTask(makeDesktopTask())
    expect(result.ok).toBe(true)
    expect(result.output).toBe('data:image/png;base64,abc')
  })

  it('缺 x/y 坐标的 moveTo 快速失败（不触发超时）', async () => {
    const runner = makeRunner({ moveTo: vi.fn() })
    const result = await runner.runDesktopTask(makeDesktopTask({ action: 'moveTo', params: {} }))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('缺少 x/y')
    expect(result.code).toBeUndefined()
  })

  it('安全拦截优先于超时（不允许的操作直接拒绝）', async () => {
    // safetyCheck 已 mock 为 allowed；此处验证 allowed=false 分支
    const { safetyCheck } = await import('../../desktop-automation/safety')
    vi.mocked(safetyCheck).mockReturnValueOnce({ allowed: false, reason: 'blocked' })
    const runner = makeRunner({})
    const result = await runner.runDesktopTask(makeDesktopTask({ action: 'pressKey', params: { key: 'ALT+F4' } }))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('安全限制')
  })
})