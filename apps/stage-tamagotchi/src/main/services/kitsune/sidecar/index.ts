import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { ChildProcess } from 'node:child_process'
import type { SidecarStartPayload, SidecarStatus } from '../../../../shared/eventa'

import process from 'node:process'
import { spawn } from 'node:child_process'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { Mutex } from 'async-mutex'

import {
  electronSidecarHealth,
  electronSidecarStart,
  electronSidecarStatus,
  electronSidecarStatusChanged,
  electronSidecarStop,
} from '../../../../shared/eventa'
import { onAppBeforeQuit } from '../../../libs/bootkit/lifecycle'
import type { BinaryFrame, FrameReader, FrameWriter, JsonMessage } from './protocol'
import { createFrameReader, createFrameWriter } from './protocol'

type MainContext = ReturnType<typeof createContext>['context']

/** 重启预算：5 分钟内最多重启 3 次，超过则降级。 */
const RESTART_WINDOW_MS = 5 * 60 * 1000
const RESTART_MAX_COUNT = 3
/** 优雅关闭超时：发 shutdown 通知后等 2s，超时则强制 kill。 */
const SHUTDOWN_TIMEOUT_MS = 2_000
/** JSON-RPC 请求默认超时。 */
const REQUEST_TIMEOUT_MS = 30_000

/**
 * 已知 sidecar id 的默认启动配置。
 *
 * 前端 IPC 启动时可不传 command，由后端按 id 查表填充。
 * 通用 sidecar IPC 仅用于无特殊路径需求的 sidecar；
 * comfyui / tts adapter 等需探测安装目录的 sidecar 由对应模块程序化启动时传入 cwd。
 */
const SIDECAR_DEFAULT_CONFIGS: Record<string, { command: string, args?: string[], cwd?: string }> = {}

/** 完整的 sidecar 配置（程序化启动用，含回调）。 */
export interface SidecarConfig extends SidecarStartPayload {
  /**
   * 重启预算耗尽时触发，TTS adapter 用此回调降级到云端。
   * 仅在程序化启动时设置；IPC 启动不携带回调，仅将状态置为 'degraded'。
   */
  onDegraded?: (id: string, reason: string) => void
}

export interface SidecarMessageHandlers {
  /** 收到 sidecar 主动推送的 notification（无 id 的 JSON-RPC 消息）。 */
  onNotification?: (method: string, params: unknown) => void
  /** 收到二进制音频帧（TTS 流式数据）。 */
  onBinary?: (frame: BinaryFrame) => void
}

export interface SidecarService {
  start: (config: SidecarConfig, handlers?: SidecarMessageHandlers) => Promise<SidecarStatus>
  stop: (id: string) => Promise<SidecarStatus>
  restart: (id: string) => Promise<SidecarStatus>
  healthCheck: (id: string) => Promise<{ healthy: boolean, reason?: string }>
  getStatus: (id: string) => SidecarStatus | null
  listStatuses: () => SidecarStatus[]
  /** 发送 JSON-RPC 请求并等待响应（按 id 关联）。 */
  sendRequest: (id: string, method: string, params?: unknown) => Promise<JsonMessage>
  /** 发送 JSON-RPC 请求，并收集后续二进制帧直到 end-of-stream。 */
  sendRequestAndCollectBinary: (id: string, method: string, params?: unknown) => Promise<{ response: JsonMessage, data: Uint8Array }>
  /** 发送 JSON-RPC notification（无响应，fire-and-forget）。 */
  sendNotification: (id: string, method: string, params?: unknown) => Promise<void>
  /**
   * 获取 sidecar 串行锁。TTS 等需要独占 stdout 流的操作应先获取锁，
   * 确保前一个请求的音频帧全部消费完才发下一个，避免帧交错。
   */
  acquireLock: (id: string) => Promise<() => void>
  dispose: () => Promise<void>
}

interface PendingRequest {
  resolve: (message: JsonMessage) => void
  reject: (error: unknown) => void
  timeout: NodeJS.Timeout
}

interface BinaryFrameWaiter {
  resolve: (frame: BinaryFrame) => void
  reject: (error: unknown) => void
}

interface SidecarHandle {
  config: SidecarConfig
  handlers: SidecarMessageHandlers
  process: ChildProcess | undefined
  writer: FrameWriter | undefined
  reader: FrameReader | undefined
  status: SidecarStatus
  pendingRequests: Map<string, PendingRequest>
  restartTimestamps: number[]
  expectedExit: boolean
  /** TTS 串行排队用锁，acquireLock 返回 release 函数。 */
  lock: Mutex
  /** 启动互斥，防止并发 start 同一 id。 */
  startMutex: Mutex
  /** 自增请求 id，每个 sidecar 独立计数。 */
  nextRequestId: number
  /** 已收到但尚未被消费的二进制音频帧队列。 */
  binaryFrames: BinaryFrame[]
  /** 等待二进制音频帧的 waiter 队列。 */
  binaryWaiters: BinaryFrameWaiter[]
}

export function createSidecarService(params: { context: MainContext }): SidecarService {
  const { context } = params
  const log = useLogg('main/sidecar').useGlobalConfig()
  const sidecars = new Map<string, SidecarHandle>()

  function snapshotStatus(handle: SidecarHandle): SidecarStatus {
    return { ...handle.status }
  }

  function setStatus(handle: SidecarHandle, next: Partial<SidecarStatus> & Pick<SidecarStatus, 'state'>) {
    handle.status = { ...handle.status, ...next, updatedAt: Date.now() }
    context.emit(electronSidecarStatusChanged, snapshotStatus(handle))
  }

  function pipeStderr(handle: SidecarHandle) {
    const proc = handle.process
    if (!proc?.stderr)
      return
    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8').trim()
      if (text)
        log.withFields({ id: handle.config.id }).log(`[stderr] ${text}`)
    })
  }

  function attachExitListener(handle: SidecarHandle) {
    const proc = handle.process
    if (!proc)
      return

    proc.on('error', (error) => {
      const message = errorMessageFrom(error) ?? 'spawn failed'
      log.withFields({ id: handle.config.id }).withError(error).error('sidecar process error')
      setStatus(handle, { state: 'error', pid: proc.pid ?? null, lastError: message })
      rejectAllPending(handle, `process error: ${message}`)
    })

    proc.on('exit', (code, signal) => {
      const wasExpected = handle.expectedExit
      handle.expectedExit = false
      handle.process = undefined
      handle.writer = undefined
      handle.reader = undefined
      rejectAllPending(handle, 'process exited')

      if (wasExpected) {
        setStatus(handle, { state: 'stopped', pid: null, lastError: undefined })
        log.withFields({ id: handle.config.id, code, signal }).log('sidecar stopped')
        return
      }

      const reason = signal
        ? `crashed with signal ${signal}`
        : `crashed with code ${code ?? 0}`
      log.withFields({ id: handle.config.id, code, signal }).warn(`sidecar ${reason}`)

      // 重启预算检查：5 分钟内超过 3 次则降级
      const now = Date.now()
      handle.restartTimestamps = handle.restartTimestamps.filter(ts => now - ts < RESTART_WINDOW_MS)
      if (handle.restartTimestamps.length >= RESTART_MAX_COUNT) {
        const degradeReason = `restart budget exceeded: ${handle.restartTimestamps.length} restarts in ${RESTART_WINDOW_MS / 1000}s`
        setStatus(handle, { state: 'degraded', pid: null, lastError: degradeReason })
        log.withFields({ id: handle.config.id }).error(degradeReason)
        handle.config.onDegraded?.(handle.config.id, degradeReason)
        return
      }

      // 自动重启
      handle.restartTimestamps.push(now)
      handle.status.restartCount += 1
      log.withFields({ id: handle.config.id, attempt: handle.restartTimestamps.length }).log('restarting sidecar')
      void spawnProcess(handle).catch((error) => {
        const message = errorMessageFrom(error) ?? 'restart failed'
        setStatus(handle, { state: 'error', pid: null, lastError: message })
        handle.config.onDegraded?.(handle.config.id, message)
      })
    })
  }

  function rejectAllPending(handle: SidecarHandle, reason: string) {
    for (const [id, pending] of handle.pendingRequests) {
      clearTimeout(pending.timeout)
      pending.reject(new Error(`sidecar ${reason}`))
      handle.pendingRequests.delete(id)
    }
    for (const waiter of handle.binaryWaiters) {
      waiter.reject(new Error(`sidecar ${reason}`))
    }
    handle.binaryWaiters.length = 0
    handle.binaryFrames.length = 0
  }

  function attachStdoutParser(handle: SidecarHandle) {
    const proc = handle.process
    if (!proc?.stdout)
      return

    handle.reader = createFrameReader({
      onJson: (message) => {
        // 有 id 的是 response，匹配 pendingRequests
        if (message.id !== undefined) {
          const key = String(message.id)
          const pending = handle.pendingRequests.get(key)
          if (pending) {
            clearTimeout(pending.timeout)
            handle.pendingRequests.delete(key)
            pending.resolve(message)
            return
          }
        }
        // 无 id 的是 notification，交给业务层处理
        if (message.method)
          handle.handlers.onNotification?.(message.method, message.params)
      },
      onBinary: (frame) => {
        handle.handlers.onBinary?.(frame)
        // 优先交给 waiter，没有 waiter 时入队等待消费。
        const waiter = handle.binaryWaiters.shift()
        if (waiter) {
          waiter.resolve(frame)
        }
        else {
          handle.binaryFrames.push(frame)
        }
      },
      onError: (error) => {
        log.withFields({ id: handle.config.id }).withError(error).warn('frame parse error')
      },
    })

    proc.stdout.on('data', (chunk: Buffer) => {
      handle.reader?.feed(chunk)
    })
  }

  async function spawnProcess(handle: SidecarHandle): Promise<SidecarStatus> {
    setStatus(handle, { state: 'starting', pid: null, lastError: undefined })

    // command 在 SidecarStartPayload 中可选（已知 id 可由 SIDECAR_DEFAULT_CONFIGS 填充），
    // 但到达 spawn 边界时必须已解析为具体命令，否则 spawn 会得到 undefined 导致不可诊断的失败。
    if (!handle.config.command) {
      throw new Error(`sidecar command is required for id: ${handle.config.id}`)
    }
    const env = { ...process.env, ...handle.config.env }
    const proc = spawn(handle.config.command, handle.config.args ?? [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      cwd: handle.config.cwd,
      env,
    })

    handle.process = proc
    handle.writer = createFrameWriter(proc.stdin)
    attachStdoutParser(handle)
    attachExitListener(handle)
    pipeStderr(handle)

    if (proc.pid) {
      setStatus(handle, { state: 'running', pid: proc.pid })
      log.withFields({ id: handle.config.id, pid: proc.pid }).log('sidecar started')
    }
    else {
      setStatus(handle, { state: 'starting', pid: null })
    }

    return snapshotStatus(handle)
  }

  async function waitForExit(handle: SidecarHandle, timeoutMs: number): Promise<boolean> {
    const proc = handle.process
    if (!proc)
      return true
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs)
      proc.once('exit', () => {
        clearTimeout(timer)
        resolve(true)
      })
    })
  }

  async function stopInternal(handle: SidecarHandle): Promise<SidecarStatus> {
    const proc = handle.process
    if (!proc) {
      setStatus(handle, { state: 'stopped', pid: null })
      return snapshotStatus(handle)
    }

    setStatus(handle, { state: 'stopping', pid: proc.pid ?? null })
    handle.expectedExit = true

    // 优先发 shutdown notification 走优雅退出
    if (handle.writer) {
      await handle.writer.writeJson({ jsonrpc: '2.0', method: 'shutdown' }).catch(() => {})
    }

    const exited = await waitForExit(handle, SHUTDOWN_TIMEOUT_MS)
    if (!exited && handle.process === proc) {
      proc.kill()
      await waitForExit(handle, SHUTDOWN_TIMEOUT_MS)
    }

    handle.process = undefined
    handle.writer = undefined
    handle.reader = undefined
    setStatus(handle, { state: 'stopped', pid: null })
    return snapshotStatus(handle)
  }

  // ---------- IPC handlers ----------

  defineInvokeHandler(context, electronSidecarStart, async (payload) => {
    if (!payload?.id)
      throw new Error('sidecar start requires id')
    const existing = sidecars.get(payload.id)
    if (existing && (existing.status.state === 'running' || existing.status.state === 'starting'))
      return snapshotStatus(existing)

    // 已知 id 且未提供 command 时，从默认配置表解析；
    // 未知 id 且 command 为空则报错，避免后端 spawn 空命令导致不可诊断的失败。
    let config: SidecarConfig
    const defaults = SIDECAR_DEFAULT_CONFIGS[payload.id]
    if ((!payload.command || payload.command === '') && defaults) {
      config = {
        ...payload,
        command: defaults.command,
        args: defaults.args,
        cwd: defaults.cwd ?? payload.cwd,
      }
    }
    else if (!payload.command || payload.command === '') {
      throw new Error(`sidecar start requires command for unknown id: ${payload.id}`)
    }
    else {
      config = { ...payload }
    }
    return startInternal(config, {})
  })

  defineInvokeHandler(context, electronSidecarStop, async (req) => {
    const handle = sidecars.get(req?.id ?? '')
    if (!handle)
      throw new Error(`sidecar not found: ${req?.id ?? ''}`)
    return stopInternal(handle)
  })

  defineInvokeHandler(context, electronSidecarStatus, async () => {
    return [...sidecars.values()].map(h => snapshotStatus(h))
  })

  defineInvokeHandler(context, electronSidecarHealth, async (req) => {
    const handle = sidecars.get(req?.id ?? '')
    if (!handle)
      return { id: req?.id ?? '', healthy: false, state: 'stopped' as const, pid: null, reason: 'not found' }
    const result = await healthCheckInternal(handle)
    return { id: handle.config.id, healthy: result.healthy, state: handle.status.state, pid: handle.status.pid, reason: result.reason }
  })

  async function startInternal(config: SidecarConfig, handlers: SidecarMessageHandlers): Promise<SidecarStatus> {
    let handle = sidecars.get(config.id)
    if (!handle) {
      handle = {
        config,
        handlers,
        process: undefined,
        writer: undefined,
        reader: undefined,
        status: { id: config.id, state: 'stopped', pid: null, restartCount: 0, updatedAt: Date.now() },
        pendingRequests: new Map(),
        restartTimestamps: [],
        expectedExit: false,
        lock: new Mutex(),
        startMutex: new Mutex(),
        nextRequestId: 1,
        binaryFrames: [],
        binaryWaiters: [],
      }
      sidecars.set(config.id, handle)
    }
    else {
      // 复用已有 handle，更新 config 与 handlers（restart 场景需要保留旧 config）
      handle.config = config
      handle.handlers = handlers
      handle.binaryFrames.length = 0
      handle.binaryWaiters.length = 0
    }

    return handle.startMutex.runExclusive(async () => {
      if (handle!.process && (handle!.status.state === 'running' || handle!.status.state === 'starting'))
        return snapshotStatus(handle!)
      return spawnProcess(handle!)
    })
  }

  async function healthCheckInternal(handle: SidecarHandle): Promise<{ healthy: boolean, reason?: string }> {
    if (!handle.process || !handle.process.pid)
      return { healthy: false, reason: 'process not running' }
    if (handle.process.exitCode !== null || handle.process.signalCode)
      return { healthy: false, reason: `process exited (code=${handle.process.exitCode}, signal=${handle.process.signalCode})` }
    if (handle.process.stdin?.destroyed || handle.process.stdout?.destroyed)
      return { healthy: false, reason: 'stdio stream destroyed' }
    return { healthy: true }
  }

  async function nextBinaryFrame(handle: SidecarHandle, timeoutMs: number): Promise<BinaryFrame> {
    // 先消费队列中已有的帧。
    const queued = handle.binaryFrames.shift()
    if (queued)
      return queued

    return new Promise<BinaryFrame>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = handle.binaryWaiters.indexOf(waiter)
        if (index >= 0)
          handle.binaryWaiters.splice(index, 1)
        reject(new Error(`binary frame timeout after ${timeoutMs}ms`))
      }, timeoutMs)

      const waiter: BinaryFrameWaiter = {
        resolve: (frame) => {
          clearTimeout(timeout)
          resolve(frame)
        },
        reject: (error) => {
          clearTimeout(timeout)
          reject(error)
        },
      }
      handle.binaryWaiters.push(waiter)
    })
  }

  const service: SidecarService = {
    async start(config, handlers = {}) {
      return startInternal(config, handlers)
    },

    async stop(id) {
      const handle = sidecars.get(id)
      if (!handle)
        throw new Error(`sidecar not found: ${id}`)
      return stopInternal(handle)
    },

    async restart(id) {
      const handle = sidecars.get(id)
      if (!handle)
        throw new Error(`sidecar not found: ${id}`)
      await stopInternal(handle)
      // restart 保留原 config 与 handlers
      return spawnProcess(handle)
    },

    async healthCheck(id) {
      const handle = sidecars.get(id)
      if (!handle)
        return { healthy: false, reason: 'sidecar not found' }
      return healthCheckInternal(handle)
    },

    getStatus(id) {
      const handle = sidecars.get(id)
      return handle ? snapshotStatus(handle) : null
    },

    listStatuses() {
      return [...sidecars.values()].map(h => snapshotStatus(h))
    },

    async sendRequest(id, method, params) {
      const handle = sidecars.get(id)
      if (!handle)
        throw new Error(`sidecar not found: ${id}`)
      if (!handle.writer || !handle.process)
        throw new Error(`sidecar not running: ${id}`)

      const requestId = String(handle.nextRequestId++)
      const message: JsonMessage = { jsonrpc: '2.0', id: requestId, method, params }

      return new Promise<JsonMessage>((resolve, reject) => {
        const timeout = setTimeout(() => {
          handle.pendingRequests.delete(requestId)
          reject(new Error(`request timeout: ${method} (id=${requestId})`))
        }, REQUEST_TIMEOUT_MS)

        handle.pendingRequests.set(requestId, { resolve, reject, timeout })
        handle.writer!.writeJson(message).catch((error) => {
          clearTimeout(timeout)
          handle.pendingRequests.delete(requestId)
          reject(error)
        })
      })
    },

    async sendRequestAndCollectBinary(id, method, params) {
      const handle = sidecars.get(id)
      if (!handle)
        throw new Error(`sidecar not found: ${id}`)
      if (!handle.writer || !handle.process)
        throw new Error(`sidecar not running: ${id}`)

      // 串行化 TTS 请求，防止多个请求的音频帧在 stdout 上交错。
      const release = await handle.lock.acquire()
      try {
        // 清空可能残留的帧，避免把上一次请求的末尾帧误判给本次请求。
        handle.binaryFrames.length = 0
        handle.binaryWaiters.length = 0

        const requestId = String(handle.nextRequestId++)
        const message: JsonMessage = { jsonrpc: '2.0', id: requestId, method, params }

        const jsonPromise = new Promise<JsonMessage>((resolve, reject) => {
          const timeout = setTimeout(() => {
            handle.pendingRequests.delete(requestId)
            reject(new Error(`request timeout: ${method} (id=${requestId})`))
          }, REQUEST_TIMEOUT_MS)

          handle.pendingRequests.set(requestId, { resolve, reject, timeout })
          handle.writer!.writeJson(message).catch((error) => {
            clearTimeout(timeout)
            handle.pendingRequests.delete(requestId)
            reject(error)
          })
        })

        const response = await jsonPromise

        // JSON 响应已报错时，sidecar 不会发送音频帧，直接返回避免超时。
        if (response.error)
          return { response, data: new Uint8Array(0) }

        // 收集二进制音频帧直到收到 end-of-stream。
        const frames: Uint8Array[] = []
        while (true) {
          const frame = await nextBinaryFrame(handle, REQUEST_TIMEOUT_MS)
          if (frame.endOfStream)
            break
          frames.push(frame.data)
        }

        const totalLength = frames.reduce((sum, frame) => sum + frame.length, 0)
        const data = new Uint8Array(totalLength)
        let offset = 0
        for (const frame of frames) {
          data.set(frame, offset)
          offset += frame.length
        }

        return { response, data }
      }
      finally {
        release()
      }
    },

    async sendNotification(id, method, params) {
      const handle = sidecars.get(id)
      if (!handle?.writer)
        throw new Error(`sidecar not running: ${id}`)
      await handle.writer.writeJson({ jsonrpc: '2.0', method, params })
    },

    async acquireLock(id) {
      const handle = sidecars.get(id)
      if (!handle)
        throw new Error(`sidecar not found: ${id}`)
      return handle.lock.acquire()
    },

    async dispose() {
      const handles = [...sidecars.values()]
      sidecars.clear()
      await Promise.all(handles.map(h => stopInternal(h).catch(() => {})))
    },
  }

  onAppBeforeQuit(async () => {
    await service.dispose()
  })

  return service
}
