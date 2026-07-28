import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type {
  AgentApiProvider,
  AgentApiSendTaskResult,
  AgentConfig,
  AgentTaskPayload,
  AgentTaskResult,
  AgentTaskState,
} from '../../../../shared/eventa'

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { desktopCapturer, safeStorage } from 'electron'

import {
  electronAgentApiList,
  electronAgentApiResult,
  electronAgentApiSendTask,
  electronAgentApiSetKey,
} from '../../../../shared/eventa'
import { getElectronMainDirname } from '../../../libs/electron/location'

type MainContext = ReturnType<typeof createContext>['context']

const log = useLogg('main/agent-api').useGlobalConfig()

// NOTICE: Cloud Code / OpenCode 的 REST 端点形状为推测实现。
// 真实产品若端点不同，仅需替换 providerEndpoints 即可。
// 推测依据：开放 API 的 Agent 通常提供 POST /tasks 推送、GET /tasks/{id} 查询。
const providerEndpoints: Record<AgentApiProvider, { defaultBaseUrl: string, taskPath: string, statusPath: (id: string) => string }> = {
  cloud_code: {
    defaultBaseUrl: 'https://api.cloudcode.dev/v1',
    taskPath: '/tasks',
    statusPath: id => `/tasks/${encodeURIComponent(id)}`,
  },
  opencode: {
    defaultBaseUrl: 'https://api.opencode.ai/v1',
    taskPath: '/tasks',
    statusPath: id => `/tasks/${encodeURIComponent(id)}`,
  },
  // Trae Builder 走本地回调注入，无远程 HTTP 端点
  trae_builder: {
    defaultBaseUrl: '',
    taskPath: '',
    statusPath: () => '',
  },
}

/** 单次任务轮询上限：12 次 × 5s = 最长 60s 后停止主动轮询。 */
const POLL_MAX_ATTEMPTS = 12
const POLL_INTERVAL_MS = 5_000

function secretsDir(): string {
  // 与 doctor / overseer 一致，以 apps/stage-tamagotchi 为根
  const projectRoot = join(getElectronMainDirname(), '..', '..', '..', '..')
  return join(projectRoot, 'apps', 'stage-tamagotchi', 'storage', 'secrets')
}

function secretPath(agentId: string): string {
  return join(secretsDir(), `${agentId}.enc`)
}

function maskKey(key: string): string {
  if (!key)
    return '<empty>'
  if (key.length <= 4)
    return '****'
  return `${key.slice(0, 4)}***`
}

async function ensureSecretsDir(): Promise<void> {
  await mkdir(secretsDir(), { recursive: true })
}

async function persistKey(agentId: string, key: string): Promise<{ plaintext: boolean }> {
  await ensureSecretsDir()
  if (!safeStorage.isEncryptionAvailable()) {
    // NOTICE: 平台未提供加密后端（如 Linux 无 keyring、macOS 钥匙串未解锁），
    // 落盘为明文。生产环境应确保 OS keyring 可用；此处仍保留 .enc 后缀以语义一致。
    log.warn(`safeStorage unavailable, writing plaintext key for ${agentId}`)
    await writeFile(secretPath(agentId), key, 'utf-8')
    return { plaintext: true }
  }
  const encrypted = safeStorage.encryptString(key)
  await writeFile(secretPath(agentId), encrypted)
  return { plaintext: false }
}

async function loadKey(agentId: string): Promise<string | null> {
  const buf = await readFile(secretPath(agentId)).catch(() => null)
  if (!buf)
    return null
  if (!safeStorage.isEncryptionAvailable())
    return buf.toString('utf-8')
  return safeStorage.decryptString(buf)
}

function resolveBaseUrl(provider: AgentApiProvider, override?: string): string {
  return (override && override.trim()) || providerEndpoints[provider].defaultBaseUrl
}

export interface AgentApiService {
  listAgents: () => AgentConfig[]
  sendTask: (agentId: string, task: AgentTaskPayload) => Promise<AgentApiSendTaskResult>
  setApiKey: (agentId: string, provider: AgentApiProvider, opts: { name?: string, baseUrl?: string, key: string, enabled?: boolean }) => Promise<AgentConfig>
  getApiKey: (agentId: string) => Promise<string | null>
  onResult: (callback: (result: AgentTaskResult) => void) => () => void
  /** Trae Builder 模式回调入口 — 外部（webhook 接收器或本地桥接）注入执行结果。 */
  injectTraeBuilderResult: (taskId: string, agentId: string, state: AgentTaskState, output?: string) => Promise<void>
  dispose: () => void
}

interface PendingTask {
  agentId: string
  remoteTaskId: string
  attempts: number
  timer: NodeJS.Timeout
}

export function createAgentApiService(params: { context: MainContext }): AgentApiService {
  const { context } = params

  const agents = new Map<string, AgentConfig>()
  // 解密后的密钥内存缓存 — 进程退出即丢失，落盘始终为加密形式
  const keyCache = new Map<string, string>()
  const resultHandlers = new Set<(result: AgentTaskResult) => void>()
  const pending = new Map<string, PendingTask>()

  function emitResult(result: AgentTaskResult) {
    for (const handler of resultHandlers)
      handler(result)
    context.emit(electronAgentApiResult, result)
  }

  function snapshotList(): AgentConfig[] {
    return [...agents.values()].map(a => ({ ...a }))
  }

  async function ensureKey(agentId: string): Promise<string | null> {
    const cached = keyCache.get(agentId)
    if (cached !== undefined)
      return cached
    const loaded = await loadKey(agentId)
    if (loaded !== null)
      keyCache.set(agentId, loaded)
    return loaded
  }

  // ---- Cloud Code / OpenCode 任务推送 ----
  // fetch 失败与 HTTP 错误统一走 .then/.catch 收敛为 discriminated union，
  // 避免在主流程里写 try-catch（项目约束）。

  async function postRemoteTask(agent: AgentConfig, key: string, task: AgentTaskPayload): Promise<AgentApiSendTaskResult> {
    const base = resolveBaseUrl(agent.provider, agent.baseUrl)
    const endpoint = `${base}${providerEndpoints[agent.provider].taskPath}`
    const outcome = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({ prompt: task.prompt, context: task.context ?? {} }),
      signal: AbortSignal.timeout(15_000),
    })
      .then(r => ({ ok: true as const, response: r }))
      .catch(e => ({ ok: false as const, error: errorMessageFrom(e) ?? 'network failed' }))

    if (!outcome.ok)
      return { ok: false, error: outcome.error }
    if (!outcome.response.ok)
      return { ok: false, error: `HTTP ${outcome.response.status}` }

    const jsonRaw = await outcome.response.json().catch(() => null)
    const json = jsonRaw as { id?: string } | null
    if (!json?.id)
      return { ok: false, error: 'missing task id in response' }

    return { ok: true, remoteTaskId: String(json.id) }
  }

  async function pollRemoteStatus(agent: AgentConfig, key: string, remoteTaskId: string, localTaskId: string): Promise<void> {
    const entry = pending.get(localTaskId)
    if (!entry)
      return

    const base = resolveBaseUrl(agent.provider, agent.baseUrl)
    const endpoint = `${base}${providerEndpoints[agent.provider].statusPath(remoteTaskId)}`
    const outcome = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    })
      .then(r => ({ ok: true as const, response: r }))
      .catch(() => ({ ok: false as const, response: undefined }))

    if (outcome.ok && outcome.response.ok) {
      const jsonRaw = await outcome.response.json().catch(() => null)
      const json = jsonRaw as { state?: string, output?: string } | null
      const remoteState = String(json?.state ?? '').toLowerCase()
      if (remoteState === 'succeeded' || remoteState === 'done' || remoteState === 'completed') {
        clearPending(localTaskId)
        emitResult({ taskId: localTaskId, agentId: agent.id, state: 'succeeded', output: json?.output, timestamp: Date.now() })
        return
      }
      if (remoteState === 'failed' || remoteState === 'error') {
        clearPending(localTaskId)
        emitResult({ taskId: localTaskId, agentId: agent.id, state: 'failed', output: json?.output, timestamp: Date.now() })
        return
      }
      // 仍 running 或未知状态 — 继续轮询
    }

    entry.attempts += 1
    if (entry.attempts >= POLL_MAX_ATTEMPTS) {
      clearPending(localTaskId)
      emitResult({ taskId: localTaskId, agentId: agent.id, state: 'failed', output: 'polling budget exhausted', timestamp: Date.now() })
      return
    }
    entry.timer = setTimeout(() => pollRemoteStatus(agent, key, remoteTaskId, localTaskId), POLL_INTERVAL_MS)
  }

  function clearPending(localTaskId: string) {
    const entry = pending.get(localTaskId)
    if (entry) {
      clearTimeout(entry.timer)
      pending.delete(localTaskId)
    }
  }

  // ---- Trae Builder 模式：屏幕监控联动 ----
  // NOTICE: Trae Builder 的任务回调 API 形状未公开，此处实现为本地注入入口。
  // 外部桥接（webhook 接收器 / IPC 转发）通过 injectTraeBuilderResult 推入结果，
  // 服务侧联动 desktopCapturer 做截屏校验，生成 visionHint 供渲染进程修正落地。
  async function captureVisionHint(): Promise<string | undefined> {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 480, height: 270 } }).catch(() => [])
    if (!sources.length)
      return undefined
    const primary = sources[0]
    // NOTICE: 此处仅产出截屏元数据；真正的视觉理解由渲染进程 vision store（Task 9）
    // 通过 electronAgentApiResult 接收 visionHint 后再做对比。主进程不做模型推理。
    const size = primary.thumbnail.getSize()
    return `screen:${primary.name};thumbSize=${size.width}x${size.height};capturedAt=${Date.now()}`
  }

  // ---- IPC handlers ----

  defineInvokeHandler(context, electronAgentApiList, async () => snapshotList())

  defineInvokeHandler(context, electronAgentApiSendTask, async (req) => {
    const agent = agents.get(req?.id ?? '')
    if (!agent)
      return { ok: false, error: `agent not found: ${req?.id ?? ''}` }
    if (!agent.enabled)
      return { ok: false, error: 'agent disabled' }

    const key = await ensureKey(agent.id)
    if (!key)
      return { ok: false, error: 'missing API key' }

    const localTaskId = randomUUID()

    // Trae Builder：无远程推送，本地标记 pending，等外部 inject
    if (agent.provider === 'trae_builder') {
      log.withFields({ agentId: agent.id, taskId: localTaskId }).log('trae builder task pending external callback')
      emitResult({ taskId: localTaskId, agentId: agent.id, state: 'pending', timestamp: Date.now() })
      return { ok: true, remoteTaskId: localTaskId }
    }

    const result = await postRemoteTask(agent, key, req.task)
    if (!result.ok || !result.remoteTaskId)
      return result

    const timer = setTimeout(() => pollRemoteStatus(agent, key, result.remoteTaskId!, localTaskId), POLL_INTERVAL_MS)
    pending.set(localTaskId, { agentId: agent.id, remoteTaskId: result.remoteTaskId, attempts: 0, timer })
    log.withFields({ agentId: agent.id, taskId: localTaskId, remoteTaskId: result.remoteTaskId, key: maskKey(key) }).log('task pushed')
    return { ok: true, remoteTaskId: result.remoteTaskId }
  })

  defineInvokeHandler(context, electronAgentApiSetKey, async (req) => {
    if (!req?.id || !req?.provider || !req?.key)
      throw new Error('id, provider, key are required')

    const existing = agents.get(req.id)
    const { plaintext } = await persistKey(req.id, req.key)
    const next: AgentConfig = {
      id: req.id,
      provider: req.provider,
      name: req.name?.trim() || existing?.name || req.id,
      baseUrl: req.baseUrl?.trim() || existing?.baseUrl,
      hasKey: true,
      enabled: req.enabled ?? existing?.enabled ?? true,
      plaintextFallback: plaintext,
    }
    agents.set(req.id, next)
    keyCache.set(req.id, req.key)
    log.withFields({ agentId: req.id, provider: req.provider, key: maskKey(req.key) }).log('api key stored')
    return { ...next }
  })

  const service: AgentApiService = {
    listAgents: snapshotList,

    async sendTask(agentId, task) {
      const agent = agents.get(agentId)
      if (!agent)
        return { ok: false, error: `agent not found: ${agentId}` }
      if (!agent.enabled)
        return { ok: false, error: 'agent disabled' }

      const key = await ensureKey(agentId)
      if (!key)
        return { ok: false, error: 'missing API key' }

      const localTaskId = randomUUID()
      if (agent.provider === 'trae_builder') {
        emitResult({ taskId: localTaskId, agentId, state: 'pending', timestamp: Date.now() })
        return { ok: true, remoteTaskId: localTaskId }
      }

      const result = await postRemoteTask(agent, key, task)
      if (!result.ok || !result.remoteTaskId)
        return result

      const timer = setTimeout(() => pollRemoteStatus(agent, key, result.remoteTaskId!, localTaskId), POLL_INTERVAL_MS)
      pending.set(localTaskId, { agentId, remoteTaskId: result.remoteTaskId, attempts: 0, timer })
      return { ok: true, remoteTaskId: result.remoteTaskId }
    },

    async setApiKey(agentId, provider, opts) {
      const existing = agents.get(agentId)
      const { plaintext } = await persistKey(agentId, opts.key)
      const next: AgentConfig = {
        id: agentId,
        provider,
        name: opts.name?.trim() || existing?.name || agentId,
        baseUrl: opts.baseUrl?.trim() || existing?.baseUrl,
        hasKey: true,
        enabled: opts.enabled ?? existing?.enabled ?? true,
        plaintextFallback: plaintext,
      }
      agents.set(agentId, next)
      keyCache.set(agentId, opts.key)
      log.withFields({ agentId, provider, key: maskKey(opts.key) }).log('api key stored')
      return { ...next }
    },

    async getApiKey(agentId) {
      return ensureKey(agentId)
    },

    onResult(callback) {
      resultHandlers.add(callback)
      return () => { resultHandlers.delete(callback) }
    },

    async injectTraeBuilderResult(taskId, agentId, state, output) {
      const visionHint = await captureVisionHint()
      emitResult({ taskId, agentId, state, output, visionHint, timestamp: Date.now() })
      log.withFields({ agentId, taskId, state, hasVisionHint: Boolean(visionHint) }).log('trae builder result injected')
    },

    dispose() {
      for (const [, entry] of pending)
        clearTimeout(entry.timer)
      pending.clear()
      resultHandlers.clear()
      agents.clear()
      keyCache.clear()
    },
  }

  log.log('agent-api service started')
  return service
}
