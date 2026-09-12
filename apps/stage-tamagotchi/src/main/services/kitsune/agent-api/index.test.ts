import type { AgentConfig, AgentTaskResult } from '../../../../shared/eventa'

import { createContext } from '@moeru/eventa'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  electronAgentApiList,
  electronAgentApiResult,
  electronAgentApiSendTask,
  electronAgentApiSetKey,
} from '../../../../shared/eventa'
import { createAgentApiService } from './index'

// ---- mocks (hoisted) ----

const defineInvokeHandlerMock = vi.hoisted(() => vi.fn())
const safeStorageMock = vi.hoisted(() => ({
  isEncryptionAvailable: vi.fn(() => true),
  encryptString: vi.fn((s: string) => Buffer.from(`enc:${s}`)),
  decryptString: vi.fn((b: Buffer) => b.toString().replace(/^enc:/, '')),
}))

// node:fs/promises 的写操作落到内存 map，避免真实磁盘
const fsWriteMock = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const fsReadMock = vi.hoisted(() => vi.fn(() => Promise.reject(new Error('ENOENT'))))
const fsMkdirMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)))

vi.mock('@moeru/eventa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@moeru/eventa')>()
  return {
    ...actual,
    defineInvokeHandler: defineInvokeHandlerMock,
  }
})

vi.mock('electron', () => ({
  safeStorage: safeStorageMock,
  desktopCapturer: { getSources: vi.fn(() => Promise.resolve([])) },
}))

// getElectronMainDirname 返回空则 secretsDir 指向项目根下 apps/...，用 mock 固定
vi.mock('../../../libs/electron/location', () => ({
  getElectronMainDirname: vi.fn(() => '/tmp/agent-api-test/main'),
}))

vi.mock('node:fs/promises', () => ({
  mkdir: fsMkdirMock,
  writeFile: fsWriteMock,
  readFile: fsReadMock,
}))

vi.mock('@guiiai/logg', () => ({
  useLogg: vi.fn(() => {
    const log = vi.fn()
    const warn = vi.fn()
    return {
      useGlobalConfig: () => ({ log, warn, withFields: () => ({ log, warn }) }),
    }
  }),
}))

// 与 connectors 测试同款：core context 与 adapter context 类型不兼容，
// 用服务参数类型取 context 形状并 cast。
type ServiceContext = Parameters<typeof createAgentApiService>[0]['context']

function captureResultEvents(context: ServiceContext): { pending: AgentTaskResult[], succeeded: AgentTaskResult[], failed: AgentTaskResult[] } {
  const buckets = {
    pending: [] as AgentTaskResult[],
    succeeded: [] as AgentTaskResult[],
    failed: [] as AgentTaskResult[],
  }
  context.on(electronAgentApiResult, (event: unknown) => {
    const result = (event as { body?: AgentTaskResult }).body
    if (!result)
      return
    if (result.state === 'pending')
      buckets.pending.push(result)
    else if (result.state === 'succeeded')
      buckets.succeeded.push(result)
    else
      buckets.failed.push(result)
  })
  return buckets
}

function makeFetchResponse(ok: boolean, body: unknown = {}, status = ok ? 200 : 500) {
  return { ok, status, json: async () => body }
}

describe('createAgentApiService', () => {
  let context: ServiceContext
  let service: ReturnType<typeof createAgentApiService>
  let fetchMock: ReturnType<typeof vi.fn>

  // invoke handler 按 sendEvent.id 收集
  function handlers(): Map<string, (payload?: any) => any> {
    const map = new Map<string, (payload?: any) => any>()
    for (const call of defineInvokeHandlerMock.mock.calls) {
      const eventa = call[1] as { sendEvent?: { id: string }, id?: string }
      map.set(eventa.sendEvent?.id ?? eventa.id!, call[2])
    }
    return map
  }

  beforeEach(() => {
    vi.clearAllMocks()
    context = createContext() as unknown as ServiceContext
    fetchMock = vi.fn(() => Promise.resolve(makeFetchResponse(true, { id: 'remote-1' })))
    vi.stubGlobal('fetch', fetchMock)
    // 默认密钥已持久化在磁盘上
    fsReadMock.mockResolvedValue(Buffer.from('enc:sk-test-secret') as never)
    service = createAgentApiService({ context })
  })

  afterEach(() => {
    service.dispose()
    vi.unstubAllGlobals()
  })

  it('registers list/set-key/send-task invoke handlers', () => {
    expect(defineInvokeHandlerMock).toHaveBeenCalledTimes(3)
    expect(handlers().size).toBe(3)
    expect(handlers().has(electronAgentApiList.sendEvent!.id)).toBe(true)
    expect(handlers().has(electronAgentApiSetKey.sendEvent!.id)).toBe(true)
    expect(handlers().has(electronAgentApiSendTask.sendEvent!.id)).toBe(true)
  })

  describe('setApiKey via IPC', () => {
    it('stores key through safeStorage and returns config', async () => {
      const handler = handlers().get(electronAgentApiSetKey.sendEvent!.id)!
      const config = await handler({ id: 'claude', provider: 'cloud_code', key: 'sk-secret-789' })

      expect(fsWriteMock).toHaveBeenCalled()
      expect(safeStorageMock.isEncryptionAvailable).toHaveBeenCalled()
      expect(safeStorageMock.encryptString).toHaveBeenCalledWith('sk-secret-789')
      expect(config).toMatchObject({ id: 'claude', provider: 'cloud_code', name: 'claude', hasKey: true, enabled: true })
      expect(config.plaintextFallback).toBe(false)
    })

    it('marks plaintextFallback when safeStorage unavailable', async () => {
      safeStorageMock.isEncryptionAvailable.mockReturnValueOnce(false)
      const handler = handlers().get(electronAgentApiSetKey.sendEvent!.id)!
      const config = await handler({ id: 'claude', provider: 'opencode', key: 'plain-key' })
      expect(config.plaintextFallback).toBe(true)
      expect(config.hasKey).toBe(true)
    })

    it('throws when required fields missing', async () => {
      const handler = handlers().get(electronAgentApiSetKey.sendEvent!.id)!
      await expect(handler({ id: '', provider: 'cloud_code', key: '' })).rejects.toThrow('id, provider, key are required')
    })
  })

  describe('sendTask', () => {
    it('returns agent not found without fetching', async () => {
      const handler = handlers().get(electronAgentApiSendTask.sendEvent!.id)!
      const result = await handler({ id: 'missing', task: { prompt: 'x' } })
      expect(result).toEqual({ ok: false, error: 'agent not found: missing' })
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('returns agent disabled error when agent is disabled', async () => {
      const handler = handlers().get(electronAgentApiSetKey.sendEvent!.id)!
      await handler({ id: 'claude', provider: 'cloud_code', key: 'sk-k', enabled: false })

      const sendHandler = handlers().get(electronAgentApiSendTask.sendEvent!.id)!
      const result = await sendHandler({ id: 'claude', task: { prompt: 'x' } })
      expect(result).toEqual({ ok: false, error: 'agent disabled' })
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('pushes task to remote provider and returns remoteTaskId', async () => {
      const handler = handlers().get(electronAgentApiSetKey.sendEvent!.id)!
      await handler({ id: 'op', provider: 'opencode', key: 'sk-op' })

      const sendHandler = handlers().get(electronAgentApiSendTask.sendEvent!.id)!
      const result = await sendHandler({ id: 'op', task: { prompt: 'do something' } })

      expect(result).toEqual({ ok: true, remoteTaskId: 'remote-1' })
      expect(fetchMock).toHaveBeenCalledWith('https://api.opencode.ai/v1/tasks', expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Authorization': 'Bearer sk-op' }),
      }))
    })

    it('uses custom baseUrl override when present', async () => {
      const handler = handlers().get(electronAgentApiSetKey.sendEvent!.id)!
      await handler({ id: 'op', provider: 'opencode', key: 'sk-op', baseUrl: 'https://my-proxy.example/v2' })

      const sendHandler = handlers().get(electronAgentApiSendTask.sendEvent!.id)!
      await sendHandler({ id: 'op', task: { prompt: 'x' } })
      expect(fetchMock).toHaveBeenCalledWith('https://my-proxy.example/v2/tasks', expect.anything())
    })

    it('surfaces HTTP errors as failure', async () => {
      const handler = handlers().get(electronAgentApiSetKey.sendEvent!.id)!
      await handler({ id: 'op', provider: 'opencode', key: 'sk-op' })
      fetchMock.mockResolvedValueOnce(makeFetchResponse(false, {}, 401))

      const sendHandler = handlers().get(electronAgentApiSendTask.sendEvent!.id)!
      const result = await sendHandler({ id: 'op', task: { prompt: 'x' } })
      expect(result).toEqual({ ok: false, error: 'HTTP 401' })
    })

    it('getApiKey returns null when encrypted key file is missing (missing-key path)', async () => {
      // loadKey 磁盘读失败 → 返回 null（sendTask 的 missing API key 分支判定依据）
      fsReadMock.mockRejectedValue(new Error('ENOENT'))
      expect(await service.getApiKey('op')).toBeNull()
    })
  })

  describe('trae_builder', () => {
    it('returns local task id without remote push and emits pending result', async () => {
      const buckets = captureResultEvents(context)
      const handler = handlers().get(electronAgentApiSetKey.sendEvent!.id)!
      await handler({ id: 'trae', provider: 'trae_builder', key: 'trae-key' })

      const sendHandler = handlers().get(electronAgentApiSendTask.sendEvent!.id)!
      const result = await sendHandler({ id: 'trae', task: { prompt: 'build a widget' } })

      expect(result.ok).toBe(true)
      expect(result.remoteTaskId).toBeTruthy()
      expect(fetchMock).not.toHaveBeenCalled()
      expect(buckets.pending).toHaveLength(1)
    })
  })

  describe('polling remote status', () => {
    it('emits succeeded result when remote becomes succeeded', async () => {
      vi.useFakeTimers()
      const buckets = captureResultEvents(context)
      const handler = handlers().get(electronAgentApiSetKey.sendEvent!.id)!
      await handler({ id: 'op', provider: 'opencode', key: 'sk-op' })

      // 第一次 POST 返回 remote-1；后续 GET 返回 succeeded
      fetchMock
        .mockResolvedValueOnce(makeFetchResponse(true, { id: 'remote-1' }))
        .mockResolvedValue(makeFetchResponse(true, { state: 'running' }))

      const sendHandler = handlers().get(electronAgentApiSendTask.sendEvent!.id)!
      await sendHandler({ id: 'op', task: { prompt: 'x' } })

      // 第一个 poll 响应 running，第二次（5s 后）返回 succeeded
      fetchMock.mockClear()
      fetchMock.mockResolvedValue(makeFetchResponse(true, { state: 'succeeded', output: 'done!' }))

      await vi.advanceTimersByTimeAsync(5_000)
      await vi.advanceTimersByTimeAsync(5_000)
      await vi.advanceTimersByTimeAsync(5_000)

      const succeeded = buckets.succeeded.filter(r => r.output === 'done!')
      expect(succeeded.length).toBeGreaterThan(0)
      expect(buckets.succeeded[0]?.state).toBe('succeeded')
      vi.useRealTimers()
    })
  })

  describe('onResult and injectTraeBuilderResult', () => {
    it('forwards injected trae builder results to subscribers', async () => {
      const received: AgentTaskResult[] = []
      const off = service.onResult(r => received.push(r))
      await service.injectTraeBuilderResult('task-9', 'trae', 'succeeded', 'output from trae')

      expect(received).toHaveLength(1)
      expect(received[0]).toMatchObject({ taskId: 'task-9', agentId: 'trae', state: 'succeeded', output: 'output from trae' })
      expect(received[0]!.timestamp).toBeTypeOf('number')
      off()
    })

    it('dispose clears subscribers and pending timers', async () => {
      const received: AgentTaskResult[] = []
      const off = service.onResult(r => received.push(r))
      service.dispose()
      await service.injectTraeBuilderResult('t1', 'trae', 'failed')
      expect(received).toHaveLength(0)
      off()
    })
  })

  describe('listAgents', () => {
    it('returns snapshot of registered agents', async () => {
      const handler = handlers().get(electronAgentApiSetKey.sendEvent!.id)!
      await handler({ id: 'a', provider: 'cloud_code', key: 'k1' })
      await handler({ id: 'b', provider: 'trae_builder', key: 'k2' })

      const listHandler = handlers().get(electronAgentApiList.sendEvent!.id)!
      const agents: AgentConfig[] = await listHandler()
      expect(agents).toHaveLength(2)
      expect(agents.map(a => a.id).sort()).toEqual(['a', 'b'])
    })
  })
})