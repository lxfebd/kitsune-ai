import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { SidecarService } from '../sidecar'
import type { OverseerService } from '../overseer'
import type { ExtensionHostService } from '../plugins/types'

import { execFile } from 'node:child_process'
import { X509Certificate } from 'node:crypto'
import { access, appendFile, constants, mkdir, readFile, readdir, statfs, unlink } from 'node:fs/promises'
import { cpus, freemem, platform, totalmem } from 'node:os'
import { createConnection } from 'node:net'
import { join } from 'node:path'
import { env } from 'node:process'
import { promisify } from 'node:util'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { app } from 'electron'
import { getDefaultEngineId, getEngineSidecarId, listEngines } from '@kitsune/tts-hybrid'
import * as yaml from 'yaml'

import {
  electronDoctorFix,
  electronDoctorRun,
  electronDoctorStatus,
  type DoctorResult,
  type FixResult,
} from '../../../../shared/eventa'
import { getElectronMainDirname } from '../../../libs/electron/location'
import { getGptSovitsPort, getGptSovitsStatus, resolveGptSovitsDir } from '../tts/index'
import { loadOverseerConfig } from '../overseer'

type MainContext = ReturnType<typeof createContext>['context']

const NETWORK_TIMEOUT_MS = 3000
const GPU_INFO_TIMEOUT_MS = 3000
const MIN_MEMORY_BYTES = 8 * 1024 * 1024 * 1024
const MIN_DISK_BYTES = 5 * 1024 * 1024 * 1024
const CHANNEL_PORT = env.SERVER_CHANNEL_PORT ? Number.parseInt(env.SERVER_CHANNEL_PORT) : 6121

// ---- path helpers ----

function projectRoot() {
  // electronMainDirname 指向 apps/stage-tamagotchi/src/main，向上四级到项目根
  return join(getElectronMainDirname(), '..', '..', '..', '..')
}

function appConfigDir() {
  return join(projectRoot(), 'apps', 'stage-tamagotchi', 'config')
}

function getConfigDir() {
  const profile = process.env.KITSUNE_PROFILE || 'default'
  return join(projectRoot(), 'config', profile)
}

function logsDir() {
  return join(projectRoot(), 'apps', 'stage-tamagotchi', 'logs')
}

function doctorLogPath() {
  return join(logsDir(), 'doctor.log')
}

function extensionsDir() {
  return join(app.getPath('userData'), 'extensions', 'v1')
}

function memoryDir() {
  return app.getPath('userData')
}

function certPaths() {
  const userData = app.getPath('userData')
  return {
    cert: join(userData, 'websocket-cert.pem'),
    ca: join(userData, 'websocket-ca-cert.pem'),
    caKey: join(userData, 'websocket-ca-key.pem'),
  }
}

// ---- yaml read helper ----

type YamlResult<T> = { ok: true, value: T } | { ok: false, reason: 'missing' | 'syntax', error?: string }

async function readYaml<T>(path: string): Promise<YamlResult<T>> {
  const raw = await readFile(path, 'utf-8').catch(() => null as string | null)
  if (!raw)
    return { ok: false, reason: 'missing' }
  try {
    return { ok: true, value: yaml.parse(raw) as T }
  }
  catch (e) {
    return { ok: false, reason: 'syntax', error: errorMessageFrom(e) ?? 'parse error' }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

// ---- 1. 配置完整性 ----

interface ProvidersConfig {
  active_provider?: string
  providers?: Record<string, { type?: string, base_url?: string, api_key?: string }>
}

interface McpConfig {
  version?: number
  servers?: Array<{ name?: string, command?: string, enabled?: boolean, transport?: string }>
}

async function checkConfig(): Promise<DoctorResult[]> {
  const targets: Array<{ path: string, required: string[], label: string }> = [
    { path: join(appConfigDir(), 'overseer.yaml'), required: ['version', 'tools'], label: 'overseer.yaml' },
    { path: join(getConfigDir(), 'providers.yaml'), required: ['active_provider', 'providers'], label: 'providers.yaml' },
    { path: join(getConfigDir(), 'tools.yaml'), required: ['version', 'policy'], label: 'tools.yaml' },
    { path: join(getConfigDir(), 'mcp.yaml'), required: ['version', 'servers'], label: 'mcp.yaml' },
  ]
  const baseResults = await Promise.all(targets.map(t => checkYamlFile(t.path, t.required, t.label)))

  // 深度验证：providers.yaml 的 active_provider 一致性 + API key 存在性
  const providerDeep = await checkProvidersDeep()
  return [...baseResults, ...providerDeep]
}

/**
 * 深度验证 providers.yaml：
 * 1. active_provider 是否存在于 providers 映射中
 * 2. 活跃 provider 是否配置了 api_key（空字符串或占位符视为未配置）
 */
async function checkProvidersDeep(): Promise<DoctorResult[]> {
  const results: DoctorResult[] = []
  const configPath = join(getConfigDir(), 'providers.yaml')
  const config = await readYaml<ProvidersConfig>(configPath)
  if (!config.ok || !config.value.providers || typeof config.value.providers !== 'object')
    return results

  const { active_provider, providers } = config.value

  // 检查 active_provider 一致性
  if (active_provider) {
    if (!(active_provider in providers)) {
      results.push({
        category: 'config',
        level: 'FAIL',
        detail: `active_provider "${active_provider}" not found in providers map`,
        suggestion: `set active_provider to one of: ${Object.keys(providers).join(', ') || '(empty)'}`,
      })
    }
    else {
      // 检查活跃 provider 的 API key
      const provider = providers[active_provider]
      const apiKey = provider?.api_key
      const PLACEHOLDER_KEYS = ['sk-xxx', 'your-key-here', 'placeholder', '']
      if (!apiKey || PLACEHOLDER_KEYS.some(p => apiKey.toLowerCase().includes(p))) {
        results.push({
          category: 'config',
          level: 'WARN',
          detail: `active provider "${active_provider}" has no valid API key configured`,
          suggestion: 'configure a valid API key in providers settings',
        })
      }
    }
  }

  // 检查每个 provider 的 base_url 格式
  for (const [name, provider] of Object.entries(providers)) {
    if (provider?.base_url && !provider.base_url.startsWith('http')) {
      results.push({
        category: 'config',
        level: 'WARN',
        detail: `provider "${name}" base_url does not start with http(s)://`,
        suggestion: 'fix the base_url format (should start with http:// or https://)',
      })
    }
  }

  return results
}

async function checkYamlFile(path: string, required: string[], label: string): Promise<DoctorResult> {
  const result = await readYaml<Record<string, unknown>>(path)
  if (!result.ok) {
    if (result.reason === 'missing')
      return { category: 'config', level: 'WARN', detail: `${label} not found`, suggestion: 'create with required fields or rely on defaults' }
    return { category: 'config', level: 'FAIL', detail: `${label} syntax error: ${result.error}`, suggestion: 'fix YAML indentation and syntax' }
  }

  const value = result.value
  if (!value || typeof value !== 'object')
    return { category: 'config', level: 'FAIL', detail: `${label} empty or invalid root`, suggestion: 'populate required fields' }

  const missing = required.filter(k => !(k in value))
  if (missing.length)
    return { category: 'config', level: 'FAIL', detail: `${label} missing: ${missing.join(', ')}`, suggestion: `add fields: ${missing.join(', ')}` }

  return { category: 'config', level: 'PASS', detail: `${label} ok` }
}

// ---- 2. 依赖组件连通性 ----

async function checkConnectivity(sidecar: SidecarService): Promise<DoctorResult[]> {
  const llm = await checkLlmEndpoints()
  const tts = await checkTtsEndpoints(sidecar)
  const mcp = await checkMcpConnectivity()
  return [llm, tts, mcp]
}

async function checkLlmEndpoints(): Promise<DoctorResult> {
  const result = await readYaml<ProvidersConfig>(join(getConfigDir(), 'providers.yaml'))
  if (!result.ok)
    return { category: 'connectivity', level: 'WARN', detail: `providers.yaml ${result.reason}, skip LLM check` }

  const providers = result.value.providers
  if (!providers || typeof providers !== 'object')
    return { category: 'connectivity', level: 'WARN', detail: 'no providers configured' }

  const entries = Object.entries(providers).filter(([, v]) => v && typeof v === 'object' && typeof v.base_url === 'string')
  if (!entries.length)
    return { category: 'connectivity', level: 'PASS', detail: 'no remote LLM endpoints to check' }

  const probes = await Promise.all(entries.map(([name, v]) => probeHttp(name, v.base_url!)))
  const failed = probes.filter(p => !p.ok)
  if (!failed.length)
    return { category: 'connectivity', level: 'PASS', detail: `all ${probes.length} LLM endpoints reachable` }

  return {
    category: 'connectivity',
    level: 'WARN',
    detail: `LLM unreachable: ${failed.map(f => `${f.name}(${f.reason})`).join(', ')}`,
    suggestion: 'check network, API endpoint URL, or API key',
  }
}

async function checkTtsEndpoints(sidecar: SidecarService): Promise<DoctorResult> {
  // GPT-SoVITS 为本地 TTS sidecar，安装路径由 resolveGptSovitsDir 按优先级解析
  // （环境变量 → 持久化配置 → 候选路径探测）；路径缺失时引导用户在设置页配置
  const dir = resolveGptSovitsDir()
  if (!dir) {
    return {
      category: 'connectivity',
      level: 'INFO',
      detail: 'GPT-SoVITS not installed',
    }
  }

  // 路径存在时通过 sidecar 状态判断是否已启动；running 取自 sidecar 进程状态，
  // 不做 HTTP 探测，避免进程刚 spawn、HTTP 尚未就绪时误报
  const status = getGptSovitsStatus(sidecar)
  if (status.running) {
    return {
      category: 'connectivity',
      level: 'PASS',
      detail: `GPT-SoVITS running (port ${status.port})`,
    }
  }

  // GPT-SoVITS installed but not started — INFO (pure status, not a failure)
  return {
    category: 'connectivity',
    level: 'INFO',
    detail: 'GPT-SoVITS installed but not started',
  }
}

async function checkMcpConnectivity(): Promise<DoctorResult> {
  const result = await readYaml<McpConfig>(join(getConfigDir(), 'mcp.yaml'))
  if (!result.ok)
    return { category: 'connectivity', level: 'PASS', detail: 'no mcp.yaml, skip MCP check' }

  const servers = result.value.servers
  if (!Array.isArray(servers) || !servers.length)
    return { category: 'connectivity', level: 'PASS', detail: 'no MCP servers configured' }

  const enabled = servers.filter(s => s && s.enabled !== false)
  // mcp.yaml 全部为 stdio transport，端口连通性不适用；运行时由 mcp-servers 服务管理
  return {
    category: 'connectivity',
    level: 'PASS',
    detail: `${enabled.length} MCP server(s) configured (stdio, runtime-managed)`,
  }
}

/**
 * GPT-SoVITS 深度配置检查：
 * 1. 入口脚本 api.py 是否存在
 * 2. 数据目录是否存在且包含模型文件
 */
async function checkGptSovitsConfig(): Promise<DoctorResult> {
  const issues: string[] = []

  // 检查入口脚本 api.py — GPT-SoVITS 使用 api.py 而非 genie_tts_sidecar.py
  const dataDir = resolveGptSovitsDir()
  if (dataDir) {
    const apiScriptPath = join(dataDir, 'api.py')
    try {
      await access(apiScriptPath, constants.F_OK)
    }
    catch {
      issues.push('api.py script missing')
    }
  }

  // 检查数据目录
  if (!dataDir) {
    issues.push('GPT-SoVITS data directory not found')
  }
  else {
    // 检查数据目录是否包含模型文件
    try {
      const entries = await readdir(dataDir)
      const hasModels = entries.some(e => e.endsWith('.ckpt') || e.endsWith('.pth'))
      if (!hasModels)
        issues.push('GPT-SoVITS data directory has no model files (.ckpt/.pth)')
    }
    catch {
      issues.push('GPT-SoVITS data directory not readable')
    }
  }

  if (issues.length > 0) {
    return {
      category: 'connectivity',
      level: 'WARN',
      detail: `GPT-SoVITS config: ${issues.join('; ')}`,
      suggestion: 'configure GPT-SoVITS data directory and ensure sidecar script is present',
    }
  }

  return {
    category: 'connectivity',
    level: 'PASS',
    detail: 'GPT-SoVITS config: script + data dir + models OK',
  }
}

async function probeHttp(name: string, url: string): Promise<{ ok: boolean, name: string, reason?: string }> {
  // 优先 HEAD：成功响应（任何 <500）说明服务在监听并响应，即视为可达
  // （4xx/401/403/405 等对 POST-only 端点属正常，不代表不可达）。
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS) })
    if (res.status < 500)
      return { ok: true, name }
    return { ok: false, name, reason: `HTTP ${res.status}` }
  }
  catch {
    // HEAD 被网络层拒绝（部分服务不响应 HEAD）时，回落一次 GET 探测，
    // 避免"仅接受 GET"的端点被误判为不可达。
    try {
      const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS) })
      if (res.status < 500)
        return { ok: true, name }
      return { ok: false, name, reason: `HTTP ${res.status}` }
    }
    catch (e) {
      return { ok: false, name, reason: errorMessageFrom(e) ?? 'request failed' }
    }
  }
}

// ---- 3. sidecar 进程状态 ----

async function checkSidecar(sidecar: SidecarService): Promise<DoctorResult[]> {
  const statuses = sidecar.listStatuses()
  if (!statuses.length)
    return [{ category: 'sidecar', level: 'PASS', detail: 'no sidecar registered' }]

  const results = await Promise.all(statuses.map(s => checkOneSidecarDeep(sidecar, s.id)))
  return results
}

// Sidecars that warrant an HTTP API reachability probe in addition to process health.
function getSidecarDeepCheckIds(): Set<string> {
  const ids = new Set(['comfyui'])
  for (const engine of listEngines()) {
    const sidecarId = getEngineSidecarId(engine.id)
    if (sidecarId)
      ids.add(sidecarId)
  }
  return ids
}

/**
 * Deep sidecar check: process health + HTTP API reachability for comfyui/gpt-sovits.
 *
 * Process health alone is insufficient for comfyui/gpt-sovits because the HTTP API
 * may still be starting up (model loading, GPU init) after the process is alive.
 */
async function checkOneSidecarDeep(sidecar: SidecarService, id: string): Promise<DoctorResult> {
  const health = await sidecar.healthCheck(id)
  if (!health.healthy) {
    return {
      category: 'sidecar',
      level: 'FAIL',
      detail: `sidecar ${id} unhealthy: ${health.reason ?? 'unknown'}`,
      suggestion: 'restart sidecar via doctor fix or electronSidecarStart',
      fixPayload: { sidecarId: id },
    }
  }

  if (!getSidecarDeepCheckIds().has(id))
    return { category: 'sidecar', level: 'PASS', detail: `sidecar ${id} healthy` }

  // Deep check: probe HTTP API after process is confirmed healthy
  const httpOk = await probeSidecarHttp(id)
  if (httpOk)
    return { category: 'sidecar', level: 'PASS', detail: `sidecar ${id} healthy (HTTP ok)` }

  // 对 gpt-sovits：进程 alive 但 HTTP 未就绪，尝试获取 /health 详细状态
  if (id === (getEngineSidecarId(getDefaultEngineId()) ?? 'gpt-sovits')) {
    try {
      const port = getGptSovitsPort()
      const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(3000) })
      if (res.ok) {
        const health = await res.json() as { status: string, reasons?: string[], missing_optional?: string[] }
        if (health.status === 'loading') {
          return {
            category: 'sidecar',
            level: 'PASS',
            detail: `GPT-SoVITS 模型加载中，请稍候...`,
          }
        }
        if (health.status === 'degraded') {
          const reasons = health.reasons?.join('; ') ?? 'unknown'
          return {
            category: 'sidecar',
            level: 'WARN',
            detail: `GPT-SoVITS 降级运行: ${reasons}`,
            suggestion: health.missing_optional?.length
              ? `缺少可选模型: ${health.missing_optional.join(', ')}。运行 fetch_models.py 下载`
              : '检查 GPT-SoVITS 日志',
          }
        }
      }
    }
    catch {
      // /health 也不可达，继续 fallback
    }
  }

  return {
    category: 'sidecar',
    level: 'WARN',
    detail: `sidecar ${id} process healthy but HTTP unreachable`,
    suggestion: `${id} may still be starting; wait and retry`,
    fixPayload: { sidecarId: id },
  }
}

/**
 * Probes the HTTP API of a sidecar. For comfyui, checks GET /system_stats (2xx required).
 * For gpt-sovits, checks that the port accepts a TCP/HTTP connection (any response = ok).
 */
async function probeSidecarHttp(id: string): Promise<boolean> {
  try {
    if (id === 'comfyui') {
      const { getComfyUIStatus } = await import('../comfyui')
      const status = await getComfyUIStatus()
      if (!status.url)
        return false
      const res = await fetch(`${status.url}/system_stats`, { signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS) })
      return res.ok
    }
    if (id === (getEngineSidecarId(getDefaultEngineId()) ?? 'gpt-sovits')) {
      const port = getGptSovitsPort()
      // 检查 /health 端点，根据 status 字段判断
      const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS) })
      if (!res.ok)
        return false
      const health = await res.json() as { status: string, reasons?: string[] }
      // ready 或 degraded 均视为 HTTP 可达
      return health.status === 'ready' || health.status === 'degraded'
    }
    return true
  }
  catch {
    return false
  }
}

// ---- 4. 文件权限 ----

async function checkPermissions(): Promise<DoctorResult[]> {
  const dirs = [
    { path: appConfigDir(), label: 'config' },
    { path: extensionsDir(), label: 'extensions' },
    { path: memoryDir(), label: 'memory' },
    { path: logsDir(), label: 'logs' },
  ]

  // 如果 GPT-SoVITS 数据目录已配置，也检查其可写性
  const gptSovitsDataDir = resolveGptSovitsDir()
  if (gptSovitsDataDir)
    dirs.push({ path: gptSovitsDataDir, label: `${getDefaultEngineId()}-data` })

  return Promise.all(dirs.map(d => checkDirWritable(d.path, d.label)))
}

async function checkDirWritable(path: string, label: string): Promise<DoctorResult> {
  const exists = await access(path, constants.F_OK).then(() => true).catch(() => false)
  if (!exists) {
    // logs 目录由 doctor 自动创建，缺失时降级为 WARN 而非 FAIL
    const level = label === 'logs' ? 'WARN' : 'FAIL'
    return {
      category: 'permissions',
      level,
      detail: `${label} dir missing: ${path}`,
      suggestion: `run doctor fix to create, or mkdir -p ${path}`,
      fixPayload: { dirPath: path },
    }
  }

  const writable = await access(path, constants.W_OK).then(() => true).catch(() => false)
  if (!writable)
    return { category: 'permissions', level: 'FAIL', detail: `${label} dir not writable: ${path}`, suggestion: `chmod/icacls to grant write access` }

  return { category: 'permissions', level: 'PASS', detail: `${label} dir writable` }
}

// ---- 5. 端口占用 ----

async function checkPorts(): Promise<DoctorResult[]> {
  const channel = await checkPortListening(CHANNEL_PORT, 'channel-server')
  return [channel]
}

async function checkPortListening(port: number, label: string): Promise<DoctorResult> {
  const listening = await probePort(port)
  if (listening)
    return { category: 'ports', level: 'PASS', detail: `${label} port ${port} listening` }

  return {
    category: 'ports',
    level: 'WARN',
    detail: `${label} port ${port} not listening`,
    suggestion: `channel-server may not be started; check app lifecycle`,
  }
}

function probePort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' })
    const cleanup = () => { socket.removeAllListeners(); socket.destroy() }
    socket.once('connect', () => { cleanup(); resolve(true) })
    socket.once('error', () => { cleanup(); resolve(false) })
  })
}

// ---- 6. TLS 证书 ----

async function checkTls(): Promise<DoctorResult[]> {
  const { cert, ca } = certPaths()

  const caResult = await checkCertFile(ca, 'CA cert')
  if (caResult.level !== 'PASS')
    return [caResult]

  const certResult = await checkCertValidity(cert)
  return [caResult, certResult]
}

async function checkCertFile(path: string, label: string): Promise<DoctorResult> {
  const raw = await readFile(path, 'utf-8').catch(() => null as string | null)
  if (!raw)
    return { category: 'tls', level: 'WARN', detail: `${label} not found: ${path}`, suggestion: 'channel-server will generate on next start with TLS enabled' }
  return { category: 'tls', level: 'PASS', detail: `${label} exists` }
}

async function checkCertValidity(certPath: string): Promise<DoctorResult> {
  const certPem = await readFile(certPath, 'utf-8').catch(() => null as string | null)
  if (!certPem)
    return { category: 'tls', level: 'WARN', detail: 'server cert not found', suggestion: 'channel-server will generate on next start' }

  try {
    const cert = new X509Certificate(certPem)
    const now = Date.now()
    const notAfter = Date.parse(cert.validTo)
    if (Number.isNaN(notAfter))
      return { category: 'tls', level: 'FAIL', detail: 'cert validTo unparseable', suggestion: 'regenerate certificate' }

    if (now >= notAfter)
      return { category: 'tls', level: 'FAIL', detail: `cert expired at ${cert.validTo}`, suggestion: 'run doctor fix to delete stale cert, channel-server will regenerate' }

    const daysLeft = Math.floor((notAfter - now) / (24 * 60 * 60 * 1000))
    if (daysLeft <= 14)
      return { category: 'tls', level: 'WARN', detail: `cert expires in ${daysLeft} days (${cert.validTo})`, suggestion: 'regenerate certificate soon' }

    // CA 文件存在性已在上方检查，这里仅确认证书可被解析
    return { category: 'tls', level: 'PASS', detail: `cert valid until ${cert.validTo} (${daysLeft} days left), CA installed` }
  }
  catch (e) {
    return { category: 'tls', level: 'FAIL', detail: `cert parse error: ${errorMessageFrom(e) ?? 'invalid PEM'}`, suggestion: 'regenerate certificate' }
  }
}

// ---- 10. 网络 DNS 可达性 ----

async function checkNetwork(): Promise<DoctorResult[]> {
  const targets = [
    { name: 'DNS resolve', url: 'https://dns.google/resolve?name=example.com' },
    { name: 'GitHub API', url: 'https://api.github.com/' },
  ]
  const results = await Promise.all(targets.map(async (t) => {
    try {
      const res = await fetch(t.url, { method: 'HEAD', signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS) })
      if (res.ok || res.status === 404)
        return { category: 'network' as const, level: 'PASS' as const, detail: `${t.name} reachable` }
      return { category: 'network' as const, level: 'WARN' as const, detail: `${t.name} returned HTTP ${res.status}`, suggestion: 'check network proxy or firewall' }
    }
    catch (e) {
      return { category: 'network' as const, level: 'WARN' as const, detail: `${t.name} unreachable: ${errorMessageFrom(e) ?? 'timeout'}`, suggestion: 'check network connection, proxy, or firewall' }
    }
  }))
  // 如果所有都通过，只返回一条汇总
  const allPass = results.every(r => r.level === 'PASS')
  if (allPass)
    return [{ category: 'network', level: 'PASS', detail: `${results.length} network endpoints reachable` }]
  return results
}

// ---- 11. GPU 加速状态 ----

async function checkGpuAcceleration(): Promise<DoctorResult[]> {
  const results: DoctorResult[] = []
  try {
    const info = (await withTimeout(app.getGPUInfo('basic'), GPU_INFO_TIMEOUT_MS)) as {
      gpuDevice?: Array<{ driverVendor?: string, driverVersion?: string }>
    } | undefined
    const device = info?.gpuDevice?.[0]
    if (device) {
      const vendor = device.driverVendor ?? 'unknown'
      const version = device.driverVersion ?? 'unknown'
      results.push({
        category: 'gpu',
        level: 'INFO',
        detail: `GPU driver: ${vendor} ${version}`,
      })
      // 检查是否为软件渲染（llvmpipe/SwiftShader）
      const devStr = JSON.stringify(device).toLowerCase()
      if (devStr.includes('llvmpipe') || devStr.includes('swiftshader') || devStr.includes('software')) {
        results.push({
          category: 'gpu',
          level: 'WARN',
          detail: 'GPU acceleration not available (software rendering detected)',
          suggestion: 'install GPU drivers or enable hardware acceleration in settings',
        })
      }
    }
    else {
      results.push({
        category: 'gpu',
        level: 'WARN',
        detail: 'no GPU device detected',
        suggestion: 'check GPU drivers or enable hardware acceleration',
      })
    }
  }
  catch (e) {
    results.push({
      category: 'gpu',
      level: 'INFO',
      detail: `GPU info unavailable: ${errorMessageFrom(e) ?? 'query failed'}`,
    })
  }
  return results
}

// ---- 12. TTS 引擎降级链状态 ----

/**
 * 检查 TTS 引擎降级链：遍历注册表中所有引擎，逐级检测可用性。
 * 确保至少有一个引擎可用。
 */
async function checkTtsFallbackChain(sidecar: SidecarService): Promise<DoctorResult[]> {
  const engineStatuses: Array<{ name: string, available: boolean }> = []

  for (const engine of listEngines()) {
    switch (engine.type) {
      case 'local-sidecar': {
        const dir = resolveGptSovitsDir()
        const status = getGptSovitsStatus(sidecar)
        const available = !!(dir && status.running)
        log.log(`[TTS] ${engine.name}: dir=${dir}, running=${status.running}, available=${available}`)
        engineStatuses.push({ name: engine.name, available })
        break
      }
      case 'cloud-http': {
        try {
          const res = await fetch('https://speech.platform.bing.com/', { method: 'HEAD', signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS) })
          engineStatuses.push({ name: engine.name, available: res.ok || res.status < 500 })
        }
        catch {
          engineStatuses.push({ name: engine.name, available: false })
        }
        break
      }
      case 'system-builtin': {
        engineStatuses.push({ name: engine.name, available: true })
        break
      }
    }
  }

  const availableCount = engineStatuses.filter(e => e.available).length
  const chain = engineStatuses.map(e => `${e.name}${e.available ? ' ✓' : ' ✗'}`).join(' → ')

  if (availableCount === 0) {
    return [{
      category: 'tts',
      level: 'FAIL',
      detail: `TTS fallback chain: ${chain} — all engines unavailable`,
      suggestion: 'install GPT-SoVITS or check network for Edge TTS',
    }]
  }

  return [{
    category: 'tts',
    level: 'PASS',
    detail: `TTS fallback chain: ${chain} (${availableCount}/${engineStatuses.length} available)`,
  }]
}

// ---- 13. 配置文件版本兼容性 ----

async function checkConfigVersions(): Promise<DoctorResult[]> {
  const configFiles = [
    { path: join(appConfigDir(), 'overseer.yaml'), name: 'overseer' },
    { path: join(getConfigDir(), 'tools.yaml'), name: 'tools' },
    { path: join(getConfigDir(), 'mcp.yaml'), name: 'mcp' },
  ]

  const results: DoctorResult[] = []
  for (const { path, name } of configFiles) {
    const result = await readYaml<Record<string, unknown>>(path)
    if (!result.ok)
      continue
    const version = result.value?.version
    if (version === undefined || version === null) {
      results.push({
        category: 'config',
        level: 'INFO',
        detail: `${name}.yaml: no version field`,
      })
    }
    else if (typeof version === 'number' && version < 1) {
      results.push({
        category: 'config',
        level: 'WARN',
        detail: `${name}.yaml: version ${version} may be outdated`,
        suggestion: `check if ${name}.yaml needs migration`,
      })
    }
    else {
      results.push({
        category: 'config',
        level: 'PASS',
        detail: `${name}.yaml: version ${version}`,
      })
    }
  }
  return results
}

// ---- 7. 系统资源 ----

async function checkResources(): Promise<DoctorResult[]> {
  const [gpu, mem, disk, runtime, cpu] = await Promise.all([
    checkGpu(),
    checkMemory(),
    checkDisk(),
    checkRuntime(),
    checkCpu(),
  ])
  return [gpu, mem, disk, runtime, cpu]
}

async function checkGpu(): Promise<DoctorResult> {
  try {
    // app.getGPUInfo 返回 Promise<unknown>，需断言为带 gpuDevice 的结构
    const info = (await withTimeout(app.getGPUInfo('basic'), GPU_INFO_TIMEOUT_MS)) as { gpuDevice?: Array<{ deviceString?: string }> } | undefined
    const devices = info?.gpuDevice
    if (devices && devices.length)
      return { category: 'resources', level: 'INFO', detail: `GPU: ${devices[0].deviceString ?? 'unknown device'}` }
    return { category: 'resources', level: 'WARN', detail: 'no GPU device detected', suggestion: 'software rendering will be slow' }
  }
  catch (e) {
    return { category: 'resources', level: 'WARN', detail: `GPU info unavailable: ${errorMessageFrom(e) ?? 'query failed'}`, suggestion: 'check GPU drivers' }
  }
}

async function checkMemory(): Promise<DoctorResult> {
  const total = totalmem()
  const free = freemem()
  if (total < MIN_MEMORY_BYTES)
    return { category: 'resources', level: 'FAIL', detail: `memory ${formatBytes(total)} < 8GB minimum`, suggestion: 'increase system memory' }

  if (free < MIN_MEMORY_BYTES / 4)
    return { category: 'resources', level: 'WARN', detail: `free memory ${formatBytes(free)} low`, suggestion: 'close other applications' }

  return { category: 'resources', level: 'INFO', detail: `memory ${formatBytes(free)}/${formatBytes(total)} free` }
}

async function checkDisk(): Promise<DoctorResult> {
  try {
    const stats = await statfs(app.getPath('userData'))
    const available = stats.bavail * stats.bsize
    if (available < MIN_DISK_BYTES)
      return { category: 'resources', level: 'FAIL', detail: `disk ${formatBytes(available)} < 5GB minimum`, suggestion: 'free up disk space' }

    return { category: 'resources', level: 'INFO', detail: `disk ${formatBytes(available)} available` }
  }
  catch (e) {
    return { category: 'resources', level: 'WARN', detail: `disk check failed: ${errorMessageFrom(e) ?? 'statfs error'}` }
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3)
    return `${(bytes / 1024 ** 3).toFixed(1)}GB`
  if (bytes >= 1024 ** 2)
    return `${(bytes / 1024 ** 2).toFixed(0)}MB`
  return `${bytes}B`
}

/** 检查运行时环境版本信息 */
function checkRuntime(): Promise<DoctorResult> {
  const electronVer = process.versions.electron ?? 'unknown'
  const nodeVer = process.versions.node ?? 'unknown'
  const chromeVer = process.versions.chrome ?? 'unknown'
  return Promise.resolve({
    category: 'resources',
    level: 'INFO',
    detail: `runtime: Electron ${electronVer}, Node ${nodeVer}, Chrome ${chromeVer}`,
  })
}

/** 检查 CPU 核心数 */
function checkCpu(): Promise<DoctorResult> {
  const cpuCount = cpus().length
  const level = cpuCount < 4 ? 'WARN' : 'INFO'
  return Promise.resolve({
    category: 'resources',
    level,
    detail: `CPU: ${cpuCount} cores`,
    suggestion: cpuCount < 4 ? 'less than 4 cores may cause slow model inference' : undefined,
  })
}

// ---- 8. Overseer 运行时状态 ----

/**
 * Checks Overseer runtime status (enabled/running/tools).
 * Returns INFO when overseer is unavailable or disabled (not a failure),
 * WARN when enabled but not running or when tools are down,
 * PASS when running with all enabled tools active.
 */
async function checkOverseer(overseerService: OverseerService | null): Promise<DoctorResult[]> {
  if (!overseerService)
    return [{ category: 'overseer', level: 'INFO', detail: 'Overseer not available, skip' }]

  const status = overseerService.getStatus()
  if (!status.enabled)
    return [{ category: 'overseer', level: 'INFO', detail: 'Overseer disabled' }]

  if (!status.running) {
    return [{
      category: 'overseer',
      level: 'WARN',
      detail: 'Overseer enabled but not running',
      suggestion: 'check overseer config or restart app',
    }]
  }

  const toolsDown = status.tools.filter(t => t.enabled && !t.running)
  if (toolsDown.length) {
    return [{
      category: 'overseer',
      level: 'WARN',
      detail: `Overseer running, tools not running: ${toolsDown.map(t => t.id).join(', ')}`,
      suggestion: 'check tool configs or restart app',
      fixPayload: { toolIds: toolsDown.map(t => t.id) },
    }]
  }

  const activeCount = status.tools.filter(t => t.enabled).length
  return [{ category: 'overseer', level: 'PASS', detail: `Overseer running with ${activeCount} tools active` }]
}

// ---- 9. Plugins 加载状态 ----

/**
 * Checks plugin host loading state.
 * Returns INFO when plugin host is unavailable, still loading, or no plugins installed.
 * Returns PASS when plugins are loaded successfully.
 */
async function checkPlugins(pluginHost: ExtensionHostService | null): Promise<DoctorResult[]> {
  if (!pluginHost)
    return [{ category: 'plugins', level: 'INFO', detail: 'Plugin host not available, skip' }]

  const list = await pluginHost.list()
  if (list.loading)
    return [{ category: 'plugins', level: 'INFO', detail: 'Plugins still loading' }]

  if (!list.plugins.length)
    return [{ category: 'plugins', level: 'INFO', detail: 'No plugins installed' }]

  const loadedCount = list.plugins.filter(p => p.loaded).length
  return [{ category: 'plugins', level: 'PASS', detail: `${list.plugins.length} plugins discovered, ${loadedCount} loaded` }]
}

// ---- 14. 桌面自动化系统能力 ----

/**
 * Checks desktop automation system dependencies on Windows:
 * - PowerShell availability and version
 * - Win32 API accessibility (user32.dll)
 * - .NET System.Windows.Forms assembly
 * - WScript.Shell COM object
 * - Screen resolution
 * Returns WARN/FAIL when dependencies are missing, PASS when all OK.
 */
async function checkDesktopAutomation(): Promise<DoctorResult[]> {
  if (platform() !== 'win32')
    return [{ category: 'desktop', level: 'INFO', detail: 'desktop automation only supported on Windows' }]

  const results: DoctorResult[] = []
  const execAsync = promisify(execFile)

  // 1. PowerShell 可用性
  try {
    const { stdout } = await execAsync('powershell', ['-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()'], { timeout: 5000 })
    results.push({ category: 'desktop', level: 'PASS', detail: `PowerShell ${stdout.trim()}` })
  }
  catch (e) {
    results.push({
      category: 'desktop',
      level: 'FAIL',
      detail: `PowerShell not available: ${errorMessageFrom(e) ?? 'unknown'}`,
      suggestion: 'install PowerShell or enable Windows PowerShell',
    })
    return results // PowerShell 不可用则后续检查无意义
  }

  // 2. Win32 API — 通过 user32.dll 的 GetSystemMetrics 检测
  // 注意：不能用 @"..." here-string，execFile 会将多行参数压平导致 PowerShell 解析失败
  // 改用 -TypeDefinition + 单引号包裹 C# 代码
  try {
    await execAsync('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class DocTest{[DllImport(\"user32.dll\")]public static extern int GetSystemMetrics(int n);}'; [DocTest]::GetSystemMetrics(0)",
    ], { timeout: 5000 })
    results.push({ category: 'desktop', level: 'PASS', detail: 'Win32 API (user32.dll) accessible' })
  }
  catch (e) {
    results.push({
      category: 'desktop',
      level: 'WARN',
      detail: `Win32 API check failed: ${errorMessageFrom(e) ?? 'unknown'}`,
      suggestion: 'mouse_event simulation may not work',
    })
  }

  // 3. System.Windows.Forms 程序集
  try {
    await execAsync('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position.ToString()',
    ], { timeout: 5000 })
    results.push({ category: 'desktop', level: 'PASS', detail: '.NET System.Windows.Forms accessible' })
  }
  catch (e) {
    results.push({
      category: 'desktop',
      level: 'WARN',
      detail: `System.Windows.Forms not available: ${errorMessageFrom(e) ?? 'unknown'}`,
      suggestion: 'cursor position read/write may not work',
    })
  }

  // 4. WScript.Shell COM 对象
  try {
    await execAsync('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      '(New-Object -ComObject WScript.Shell).SendKeys("")',
    ], { timeout: 5000 })
    results.push({ category: 'desktop', level: 'PASS', detail: 'WScript.Shell COM available' })
  }
  catch (e) {
    results.push({
      category: 'desktop',
      level: 'WARN',
      detail: `WScript.Shell COM unavailable: ${errorMessageFrom(e) ?? 'unknown'}`,
      suggestion: 'keyboard simulation may not work',
    })
  }

  // 5. 屏幕分辨率
  try {
    const { stdout } = await execAsync('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::PrimaryScreen.Bounds',
    ], { timeout: 5000 })
    const match = stdout.match(/Width\s*[:=]\s*(\d+).*Height\s*[:=]\s*(\d+)/s)
    if (match)
      results.push({ category: 'desktop', level: 'PASS', detail: `screen: ${match[1]}x${match[2]}` })
    else
      results.push({ category: 'desktop', level: 'INFO', detail: `screen info: ${stdout.trim().substring(0, 100)}` })
  }
  catch (e) {
    results.push({
      category: 'desktop',
      level: 'INFO',
      detail: `screen query failed: ${errorMessageFrom(e) ?? 'unknown'}`,
    })
  }

  return results
}

// ---- 15. 安全沙箱验证 ----

/**
 * Validates that the desktop automation safety sandbox is functional.
 * Checks: whitelist intact, sensitive key interception, rate limiter config.
 */
async function checkSafetySandbox(): Promise<DoctorResult[]> {
  if (platform() !== 'win32')
    return [{ category: 'sandbox', level: 'INFO', detail: 'sandbox check only on Windows' }]

  const results: DoctorResult[] = []

  // 动态导入安全模块验证
  try {
    const { DEFAULT_ALLOWED_ACTIONS, SENSITIVE_KEYS, SafetyError } = await import('../desktop-automation/safety')

    // 验证白名单包含所有核心操作
    const expectedOps = ['click', 'moveTo', 'drag', 'type', 'pressKey', 'screenshot', 'getCursorPosition', 'findElement', 'setOverlayInteractive']
    const missing = expectedOps.filter(op => !DEFAULT_ALLOWED_ACTIONS.has(op))
    if (missing.length === 0) {
      results.push({ category: 'sandbox', level: 'PASS', detail: `whitelist: ${DEFAULT_ALLOWED_ACTIONS.size} actions registered` })
    }
    else {
      results.push({
        category: 'sandbox',
        level: 'WARN',
        detail: `whitelist missing actions: ${missing.join(', ')}`,
        suggestion: 'add missing actions to DEFAULT_ALLOWED_ACTIONS in safety.ts',
      })
    }

    // 验证敏感键拦截
    const expectedSensitive = ['F4', 'ALT+F4', 'CTRL+ALT+DEL', 'LWIN', 'RWIN']
    const missingSensitive = expectedSensitive.filter(k => !SENSITIVE_KEYS.has(k))
    if (missingSensitive.length === 0) {
      results.push({ category: 'sandbox', level: 'PASS', detail: `sensitive keys: ${SENSITIVE_KEYS.size} keys intercepted` })
    }
    else {
      results.push({
        category: 'sandbox',
        level: 'WARN',
        detail: `sensitive keys missing: ${missingSensitive.join(', ')}`,
        suggestion: 'add missing keys to SENSITIVE_KEYS in safety.ts',
      })
    }

    // B4: allowedRoots 为空时 isPathSafe 完全放行（沙箱失效）。
    // 配置缺失属向后兼容，但需对运维可见 —— 报告 WARN 提示限制 cwd 根目录。
    const overseerConfig = await loadOverseerConfig()
    const roots = overseerConfig.allowedRoots ?? []
    if (roots.length === 0) {
      results.push({
        category: 'sandbox',
        level: 'WARN',
        detail: 'CLI task sandbox unrestricted (allowedRoots empty): any cwd allowed',
        suggestion: 'set allowedRoots in overseer.yaml to restrict CLI task working directories',
      })
    }
    else {
      results.push({ category: 'sandbox', level: 'PASS', detail: `CLI cwd sandbox: ${roots.length} allowed root(s) configured` })
    }
  }
  catch (e) {
    results.push({
      category: 'sandbox',
      level: 'WARN',
      detail: `sandbox module load failed: ${errorMessageFrom(e) ?? 'unknown'}`,
      suggestion: 'ensure desktop-automation/safety.ts is accessible',
    })
  }

  return results
}

// ---- 16. ComfyUI 安装与运行状态 ----

/**
 * Checks ComfyUI installation, directory, models, and runtime health.
 * Returns INFO when not installed, WARN when installed but broken, PASS when running OK.
 */
async function checkComfyui(sidecar: SidecarService): Promise<DoctorResult[]> {
  const results: DoctorResult[] = []

  // 检查 ComfyUI 目录（多种候选路径）
  const isWin = platform() === 'win32'
  const candidates = isWin
    ? [
      join(env.LOCALAPPDATA ?? '', 'Programs', 'comfyui'),
      join(env.APPDATA ?? '', '@kitsune', 'stage-tamagotchi', 'comfyui'),
    ]
    : ['/opt/comfyui', join(env.HOME ?? '', '.comfyui')]

  let comfyDir: string | null = null
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.F_OK)
      comfyDir = candidate
      break
    }
    catch { /* not found, try next */ }
  }

  if (!comfyDir) {
    results.push({
      category: 'comfyui',
      level: 'INFO',
      detail: 'ComfyUI not installed',
    })
    return results
  }

  // 检查核心文件
  const hasCoreFiles = await Promise.all([
    access(join(comfyDir, 'main.py'), constants.F_OK).then(() => true, () => false),
    access(join(comfyDir, 'nodes'), constants.F_OK).then(() => true, () => false),
  ])
  const coreFilesOk = hasCoreFiles.filter(Boolean).length
  if (coreFilesOk < 2) {
    results.push({
      category: 'comfyui',
      level: 'WARN',
      detail: `ComfyUI dir ${comfyDir}: missing core files (${coreFilesOk}/2)`,
      suggestion: 'reinstall ComfyUI or verify installation path',
    })
  }
  else {
    results.push({
      category: 'comfyui',
      level: 'PASS',
      detail: `ComfyUI installed at ${comfyDir}`,
    })
  }

  // 检查自定义节点
  const nodesDir = join(comfyDir, 'custom_nodes')
  try {
    const nodes = await readdir(nodesDir)
    results.push({
      category: 'comfyui',
      level: 'INFO',
      detail: `custom_nodes: ${nodes.length} installed`,
    })
  }
  catch {
    results.push({
      category: 'comfyui',
      level: 'INFO',
      detail: 'custom_nodes: directory not found',
    })
  }

  // 检查模型目录
  const modelDirs = ['checkpoints', 'loras', 'vae', 'controlnet', 'clip']
  let modelCount = 0
  for (const dir of modelDirs) {
    try {
      const files = await readdir(join(comfyDir, 'models', dir))
      modelCount += files.length
    }
    catch { /* not found */ }
  }
  if (modelCount === 0) {
    results.push({
      category: 'comfyui',
      level: 'WARN',
      detail: 'ComfyUI models directory has no model files',
      suggestion: 'download models to ComfyUI/models/checkpoints/',
    })
  }
  else {
    results.push({
      category: 'comfyui',
      level: 'PASS',
      detail: `models: ${modelCount} files across ${modelDirs.length} directories`,
    })
  }

  // 检查 sidecar 运行时状态
  const statuses = sidecar.listStatuses()
  const comfyStatus = statuses.find(s => s.id === 'comfyui')
  if (comfyStatus) {
    if (comfyStatus.state === 'running') {
      // 尝试 HTTP 健康检查
      try {
        const res = await fetch('http://127.0.0.1:8188/system_stats', { signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS) })
        if (res.ok) {
          const stats = await res.json() as { system?: { os?: string, python_version?: string }, devices?: Array<{ name?: string, vram_total?: number }> }
          const device = stats.devices?.[0]
          const gpuInfo = device ? `gpu=${device.name ?? 'unknown'} vram=${device.vram_total ? `${(device.vram_total / 1024 / 1024 / 1024).toFixed(1)}GB` : 'unknown'}` : ''
          results.push({
            category: 'comfyui',
            level: 'PASS',
            detail: `ComfyUI runtime: ${gpuInfo}`,
          })
        }
        else {
          results.push({
            category: 'comfyui',
            level: 'WARN',
            detail: `ComfyUI HTTP check returned ${res.status}`,
            suggestion: 'restart ComfyUI sidecar',
          })
        }
      }
      catch {
        results.push({
          category: 'comfyui',
          level: 'WARN',
          detail: 'ComfyUI HTTP check failed (process running but API unreachable)',
          suggestion: 'restart ComfyUI sidecar',
        })
      }
    }
    else {
      results.push({
        category: 'comfyui',
        level: 'INFO',
        detail: `ComfyUI sidecar state: ${comfyStatus.state}`,
      })
    }
  }
  else {
    results.push({
      category: 'comfyui',
      level: 'INFO',
      detail: 'ComfyUI sidecar not registered',
    })
  }

  return results
}

// ---- 诊断主流程 ----

async function runAllChecks(
  sidecar: SidecarService,
  overseerService: OverseerService | null,
  pluginHost: ExtensionHostService | null,
): Promise<DoctorResult[]> {
  const groups = await Promise.all([
    checkConfig(),
    checkConfigVersions(),
    checkConnectivity(sidecar),
    checkTtsFallbackChain(sidecar),
    checkSidecar(sidecar),
    checkPermissions(),
    checkPorts(),
    checkTls(),
    checkResources(),
    checkGpuAcceleration(),
    checkNetwork(),
    checkOverseer(overseerService),
    checkPlugins(pluginHost),
    checkDesktopAutomation(),
    checkSafetySandbox(),
    checkComfyui(sidecar),
  ])
  return groups.flat()
}

async function writeDoctorLog(results: DoctorResult[]): Promise<void> {
  await mkdir(logsDir(), { recursive: true }).catch(() => {})
  const ts = new Date().toISOString()
  const lines = results.map(r => `[${ts}] [${r.category}] [${r.level}] ${r.detail}${r.suggestion ? ` → ${r.suggestion}` : ''}`)
  await appendFile(doctorLogPath(), `${lines.join('\n')}\n`, 'utf-8').catch(() => {})
}

// ---- 自动修复 ----

async function fixIssues(sidecar: SidecarService, results: DoctorResult[], overseerService: OverseerService | null): Promise<FixResult[]> {
  // 修复 FAIL 级别 + 特定 WARN 级别（permissions、tls、overseer）
  const fixable = results.filter(r =>
    r.level === 'FAIL'
    || (r.level === 'WARN' && r.category === 'permissions')
    || (r.level === 'WARN' && r.category === 'tls')
    || (r.level === 'WARN' && r.category === 'overseer'),
  )
  return Promise.all(fixable.map(r => fixOne(sidecar, r, overseerService)))
}

async function fixOne(sidecar: SidecarService, result: DoctorResult, overseerService: OverseerService | null): Promise<FixResult> {
  if (result.category === 'sidecar') {
    // sidecar unhealthy → restart; id comes from structured fixPayload, not regex
    const id = result.fixPayload?.sidecarId
    if (!id)
      return { category: result.category, level: 'MANUAL', detail: 'no sidecar id in fixPayload, cannot restart' }

    const restartResult = await sidecar.restart(id).then(
      () => ({ ok: true as const }),
      (e: unknown) => ({ ok: false as const, error: errorMessageFrom(e) ?? 'restart failed' }),
    )
    if (!restartResult.ok)
      return { category: result.category, level: 'MANUAL', detail: `sidecar ${id} restart failed: ${restartResult.error}` }
    return { category: result.category, level: 'FIXED', detail: `sidecar ${id} restarted` }
  }

  if (result.category === 'permissions') {
    // 目录缺失 → 创建; path comes from structured fixPayload, not regex
    const dir = result.fixPayload?.dirPath
    if (dir) {
      const err = await mkdir(dir, { recursive: true }).then(() => null).catch(e => errorMessageFrom(e) ?? 'mkdir failed')
      if (err)
        return { category: result.category, level: 'MANUAL', detail: `mkdir ${dir} failed: ${err}` }
      return { category: result.category, level: 'FIXED', detail: `created ${dir}` }
    }
    return { category: result.category, level: 'MANUAL', detail: 'permission fix requires manual intervention' }
  }

  if (result.category === 'tls') {
    // 证书问题 → 删除服务端证书 + CA 证书；channel-server 下次启动会完整重新生成
    const { cert, ca, caKey } = certPaths()
    await Promise.all([
      unlink(cert).catch(() => {}),
      unlink(ca).catch(() => {}),
      unlink(caKey).catch(() => {}),
    ])
    return { category: result.category, level: 'FIXED', detail: 'deleted stale certs; channel-server will regenerate CA + server cert on next start' }
  }

  if (result.category === 'overseer') {
    // enabled but not running → 通过 toggle(true) 自动启动
    if (result.detail.includes('enabled but not running') && overseerService) {
      try {
        await overseerService.toggle(true)
        return { category: result.category, level: 'FIXED', detail: 'overseer started via toggle(true)' }
      }
      catch (e) {
        return { category: result.category, level: 'MANUAL', detail: `overseer toggle failed: ${errorMessageFrom(e) ?? 'unknown'}` }
      }
    }
    // tools not running → 需要人工排查
    return { category: result.category, level: 'MANUAL', detail: `overseer issue requires manual fix: ${result.suggestion ?? result.detail}` }
  }

  // config / connectivity / ports / resources / plugins → 人工介入
  return {
    category: result.category,
    level: 'MANUAL',
    detail: `${result.category} issue requires manual fix: ${result.suggestion ?? result.detail}`,
  }
}

// ---- 服务装配 ----

export interface DoctorService {
  run: () => Promise<DoctorResult[]>
  fix: () => Promise<FixResult[]>
  getStatus: () => DoctorResult[] | null
}

export function createDoctorService(params: {
  context: MainContext
  sidecarService: SidecarService
  overseerService?: OverseerService | null
  pluginHost?: ExtensionHostService | null
}): DoctorService {
  const { context, sidecarService, overseerService, pluginHost } = params
  const log = useLogg('main/doctor').useGlobalConfig()

  let lastResults: DoctorResult[] | null = null

  async function run(): Promise<DoctorResult[]> {
    const results = await runAllChecks(sidecarService, overseerService ?? null, pluginHost ?? null)
    lastResults = results
    await writeDoctorLog(results)
    const failCount = results.filter(r => r.level === 'FAIL').length
    const warnCount = results.filter(r => r.level === 'WARN').length
    log.log(`doctor run complete: ${results.length} checks, ${failCount} FAIL, ${warnCount} WARN`)
    return results
  }

  async function fix(): Promise<FixResult[]> {
    const results = lastResults ?? await runAllChecks(sidecarService, overseerService ?? null, pluginHost ?? null)
    const fixResults = await fixIssues(sidecarService, results, overseerService ?? null)
    // 修复后重新跑一次诊断，更新 lastResults
    lastResults = await runAllChecks(sidecarService, overseerService ?? null, pluginHost ?? null)
    await writeDoctorLog(lastResults)
    const fixedCount = fixResults.filter(r => r.level === 'FIXED').length
    const manualCount = fixResults.filter(r => r.level === 'MANUAL').length
    log.log(`doctor fix complete: ${fixedCount} fixed, ${manualCount} manual`)
    return fixResults
  }

  defineInvokeHandler(context, electronDoctorRun, async () => run())
  defineInvokeHandler(context, electronDoctorFix, async () => fix())
  defineInvokeHandler(context, electronDoctorStatus, async () => lastResults)

  return { run, fix, getStatus: () => lastResults }
}
