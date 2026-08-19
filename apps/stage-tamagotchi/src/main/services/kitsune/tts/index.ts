/**
 * GPT-SoVITS 本地服务
 *
 * 进程生命周期由 SidecarService 统一管理（spawn / restart / dispose），
 * TTS 音频流走 stdin/stdout JSON-RPC + 二进制帧通道。
 * 启动由用户在设置页手动触发，不再自启动。
 *
 * 参照 ComfyUI adapter 模式：resolveGptSovitsDir 路径探测（向后兼容旧配置）、configStore 持久化配置、
 * 程序化启动传入 cwd 与 command，避免 sidecar 默认配置中 'api_v2.py' 相对路径
 * 在错误 cwd 下无法被 Python 定位、以及裸 'python' 命令依赖 PATH 的问题。
 */

import type { SidecarService } from '../sidecar'
import type { SidecarState } from '../../../../shared/eventa'

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { env, platform } from 'node:process'

import { app } from 'electron'
import { useLogg } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'
import { optional, object, string, number, integer, minValue, maxValue, pipe, union, literal } from 'valibot'

import { getEngineSidecarId, getDefaultEngineId } from '@kitsune/tts-hybrid'

import { createConfig } from '../../../libs/electron/persistence'

const log = useLogg('tts-service').useGlobalConfig()

const DEFAULT_GPT_SOVITS_PORT = 9880

// 持久化配置 schema：dir 为 GPT-SoVITS 安装目录，port 为 HTTP 监听端口（1024-65535），device 为推理设备模式
const gptSovitsConfigSchema = object({
  dir: optional(string()),
  port: optional(pipe(number(), integer(), minValue(1024), maxValue(65535))),
  device: optional(union([
    literal('auto'),
    literal('cpu'),
    literal('cuda'),
    literal('cuda-half'),
  ])),
})

const gptSovitsConfigStore = createConfig('gpt-sovits', 'config.json', gptSovitsConfigSchema, {
  default: { dir: undefined, port: undefined, device: undefined },
  autoHeal: true,
})

// 标记配置是否已从磁盘加载，避免每次访问都重复读盘
let gptSovitsConfigLoaded = false

function ensureConfigLoaded(): void {
  // 首次访问时从磁盘加载配置；setup 内部使用 readFileSync，app ready 后调用安全
  if (!gptSovitsConfigLoaded) {
    gptSovitsConfigStore.setup()
    gptSovitsConfigLoaded = true
  }
}

/**
 * 按优先级解析 GPT-SoVITS 安装目录：
 * 1. 环境变量 `GPT_SOVITS_DIR`（便于 CI / 开发者覆盖）
 * 2. 持久化配置文件（用户在 UI 中显式指定）
 * 3. 项目内资源目录（Electron 打包后的位置）
 * 4. 候选路径自动探测（覆盖 Windows / Unix 常见默认安装位置）
 * 5. 都未找到时返回 null，由调用方决定是否跳过启动
 *
 * 每个候选路径均用 `existsSync` 验证目录存在，避免返回无效路径导致 spawn 失败。
 */
export function resolveGptSovitsDir(): string | null {
  ensureConfigLoaded()

  // 1. 环境变量优先
  const envDir = env.GPT_SOVITS_DIR
  if (envDir && existsSync(envDir)) {
    return envDir
  }

  // 2. 持久化配置
  const configDir = gptSovitsConfigStore.get()?.dir
  if (configDir && existsSync(configDir)) {
    return configDir
  }

  // 3. 项目内资源目录
  // NOTICE:
  // 开发模式下 app.getAppPath() 返回 apps/stage-tamagotchi
  // 打包后返回 app.asar 路径
  // resources/gpt-sovits 目录通过 electron-builder 的 extraResources 配置打包
  const appPath = app.getAppPath()
  log.log(`[resolveGptSovitsDir] app.getAppPath() = ${appPath}`)

  // 打包后：app/resources/gpt-sovits
  const bundledDir = join(appPath, 'resources', 'gpt-sovits')
  if (existsSync(bundledDir)) {
    log.log(`[resolveGptSovitsDir] found bundled: ${bundledDir}`)
    return bundledDir
  }

  // 开发模式：appPath 是 apps/stage-tamagotchi
  const devDir1 = join(appPath, 'resources', 'gpt-sovits')
  if (existsSync(devDir1)) {
    log.log(`[resolveGptSovitsDir] found dev1: ${devDir1}`)
    return devDir1
  }

  // 开发模式：从项目根目录查找
  const projectRoot = join(appPath, '..', '..')
  const devDir2 = join(projectRoot, 'resources', 'gpt-sovits')
  if (existsSync(devDir2)) {
    log.log(`[resolveGptSovitsDir] found dev2: ${devDir2}`)
    return devDir2
  }

  // 开发模式：从 apps/stage-tamagotchi/resources 查找
  const devDir3 = join(projectRoot, 'apps', 'stage-tamagotchi', 'resources', 'gpt-sovits')
  if (existsSync(devDir3)) {
    log.log(`[resolveGptSovitsDir] found dev3: ${devDir3}`)
    return devDir3
  }

  // 4. 候选路径探测，覆盖 GPT-SoVITS 常见安装位置
  // Windows 下用户可能解压到 LOCALAPPDATA 或用户目录
  const candidates: string[] = []
  if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA
    if (localAppData) {
      candidates.push(join(localAppData, 'GPT-SoVITS'))
    }
    candidates.push(join(homedir(), 'GPT-SoVITS'))
    candidates.push(join(homedir(), 'GPT-SoVITS-V2'))
    candidates.push(join(homedir(), 'GPTSoVITS'))
  }
  else {
    candidates.push(join(homedir(), 'GPT-SoVITS'))
    candidates.push(join(homedir(), 'GPT-SoVITS-V2'))
    candidates.push(join(homedir(), 'GPTSovits'))
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

/**
 * 解析 GPT-SoVITS 自带的 Python 解释器路径。
 *
 * GPT-SoVITS 安装包通常自带 runtime 目录（Windows 下为 `runtime/python.exe`，
 * Unix 下为 `runtime/bin/python`），使用自带 Python 可避免系统 PATH 中
 * Python 版本不一致导致依赖缺失。
 *
 * 探测顺序（带 runtime 优先，系统解释器兜底）：
 * 1. `dir/runtime/python.exe`（Windows）/ `dir/runtime/bin/python`（Unix）
 * 2. Windows 下的 `py` launcher（微软官方安装器默认只注册 `py`，不会把
 *    `python` 放进 PATH，裸 `'python'` 在很多机器上根本不存在）
 * 3. 系统 PATH 中的 `python` / `python3`
 *
 * 命中系统解释器时会校验版本：GPT-SoVITS v2Pro 要求 Python 3.9–3.10，
 * 高于此范围（如 3.11+）的依赖往往缺少预编译 wheel，spawn `api.py` 后
 * 会在 `import torch` 等处崩溃。版本不达标时打印明确警告，仍返回该路径
 * 交由调用方决定是否继续（便于用户在 UI 中显式指定兼容解释器）。
 *
 * @param dir - GPT-SoVITS 安装目录（由 {@link resolveGptSovitsDir} 解析得到）
 * @returns Python 解释器路径或命令（交给 child_process 解析）
 */
export function resolveGptSovitsPython(dir: string): string {
  // 1. 自带 runtime 优先
  if (platform === 'win32') {
    const pythonExe = join(dir, 'runtime', 'python.exe')
    if (existsSync(pythonExe)) {
      return pythonExe
    }
  }
  else {
    const pythonExe = join(dir, 'runtime', 'bin', 'python')
    if (existsSync(pythonExe)) {
      return pythonExe
    }
  }

  // 2. Windows 的 `py` launcher（官方安装器默认，python 命令可能不在 PATH）
  if (platform === 'win32') {
    return 'py'
  }

  // 3. Unix 下的 python3 / python
  return 'python3'
}

/**
 * 按优先级解析 GPT-SoVITS 监听端口：
 * 1. 持久化配置文件（用户在 UI 中显式指定）
 * 2. 环境变量 `GPT_SOVITS_PORT`（便于 CI / 开发者覆盖）
 * 3. 默认 9880
 *
 * 每一级都校验 1024-65535 范围，不在范围则继续向下回退到默认值。
 */
export function getGptSovitsPort(): number {
  ensureConfigLoaded()

  const configPort = gptSovitsConfigStore.get()?.port
  if (configPort !== undefined && Number.isInteger(configPort) && configPort >= 1024 && configPort <= 65535) {
    return configPort
  }

  const envPort = env.GPT_SOVITS_PORT
  if (envPort) {
    const parsed = Number.parseInt(envPort, 10)
    if (Number.isInteger(parsed) && parsed >= 1024 && parsed <= 65535) {
      return parsed
    }
  }

  return DEFAULT_GPT_SOVITS_PORT
}

/**
 * 通过 HTTP 探测 GPT-SoVITS 是否已在端口上监听。
 *
 * GPT-SoVITS api_v2.py 对根路径可能返回 404，只要 TCP 连接建立、
 * fetch 不抛错即视为运行中（不要求 2xx 状态码）。
 */
async function isGptSovitsRunning(): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${getGptSovitsPort()}/`, {
      signal: AbortSignal.timeout(3000),
    })
    return true
  }
  catch {
    return false
  }
}

export interface GptSovitsHealth {
  status: 'loading' | 'ready' | 'degraded' | 'unreachable'
  reasons?: string[]
  last_error?: string | null
  missing_optional?: string[]
}

/**
 * 轮询 GPT-SoVITS /health 端点直到 ready 或超时。
 *
 * 模型加载通常需要 30-90 秒，此函数每 2 秒轮询一次，
 * 最长等待 maxWaitMs（默认 180s）。过程中通过 onStatus 回调
 * 将状态变化推送给调用方（用于 IPC 事件）。
 *
 * @returns 最终健康状态
 */
export async function pollGptSovitsHealth(
  onStatus?: (health: GptSovitsHealth) => void,
  maxWaitMs = 180_000,
  pollIntervalMs = 2000,
): Promise<GptSovitsHealth> {
  const port = getGptSovitsPort()
  const deadline = Date.now() + maxWaitMs

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        const health: GptSovitsHealth = await res.json()
        onStatus?.(health)
        if (health.status === 'ready' || health.status === 'degraded') {
          return health
        }
        // status === 'loading'，继续轮询
      }
    }
    catch {
      // 连接失败，进程可能还在启动
    }
    await new Promise(r => setTimeout(r, pollIntervalMs))
  }

  const timeout: GptSovitsHealth = { status: 'unreachable', reasons: ['health poll timeout'] }
  onStatus?.(timeout)
  return timeout
}

/**
 * 异步探测给定 Python 的 torch 是否支持 CUDA。
 *
 * 用 `spawn` 而非 `spawnSync`：冷启动 `import torch` 可能耗时数秒到 30s，
 * 同步调用会阻塞 Electron 主进程事件循环。收集 stdout，命中 `1` 视为可用。
 */
function probeCudaAvailability(pythonExe: string, cwd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(pythonExe, ['-c', 'import torch; print("1" if torch.cuda.is_available() else "0")'], {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    let stdout = ''
    const timer = setTimeout(() => {
      child.kill()
      resolve(false)
    }, 30_000)
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8')
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
    child.on('close', () => {
      clearTimeout(timer)
      resolve(stdout.trim() === '1')
    })
  })
}

/**
 * 启动 GPT-SoVITS sidecar 进程。
 *
 * 程序化启动传入解析后的 `command`（runtime/python 或 `'python'`）与 `cwd`（安装目录），
 * 避免 sidecar 默认配置中 `'api_v2.py'` 相对路径在错误 cwd 下无法被 Python 定位、
 * 以及裸 `'python'` 命令依赖 PATH 的两大根因。
 * `api_v2.py` 作为相对路径传入，由 `cwd` 保证其能被 Python 正确定位。
 *
 * @returns `{ success, message }` — 目录未找到、spawn 异常均返回 `success: false`
 */
export async function startGptSovits(sidecarService: SidecarService): Promise<{ success: boolean, message: string }> {
  const dir = resolveGptSovitsDir()
  // 路径未配置或不存在时不抛错，避免阻塞调用方；返回明确的引导信息
  if (!dir) {
    log.warn('GPT-SoVITS 数据目录未找到')
    return { success: false, message: 'GPT-SoVITS 数据目录未找到，请在设置中配置数据目录路径' }
  }

  const pythonExe = resolveGptSovitsPython(dir)
  const port = getGptSovitsPort()
  const configuredDevice = gptSovitsConfigStore.get()?.device ?? 'auto'

  // 幂等 guard：sidecar 已在运行时直接返回成功，避免应用启动自动拉起与
  // 首次合成懒启动并发导致重复 spawn 同一进程。
  const existing = sidecarService.getStatus(getEngineSidecarId(getDefaultEngineId())!)?.state
  if (existing === 'running' || existing === 'starting') {
    log.log('GPT-SoVITS 已在运行/启动中，跳过重复启动')
    return { success: true, message: 'GPT-SoVITS 已在运行' }
  }

  // 运行期 CUDA 兜底：用户选了 cuda / cuda-half 时，实际可能没显卡或装的是
  // CPU 版 torch（尤其别人的机器无显卡）。spawn 前用所选 Python 自检
  // torch.cuda.is_available()，不可用则降级到 cpu，避免 api.py 在 import/
  // 初始化阶段崩溃导致 sidecar 秒退。
  let device = configuredDevice
  if (device === 'cuda' || device === 'cuda-half') {
    // NOTICE:
    // 探测必须用异步 spawn，不能是 spawnSync：冷启动 `import torch` 可能耗时
    // 数秒到 30s，spawnSync 会阻塞 Electron 主进程事件循环，导致整个 UI 冻结。
    const cudaAvailable = await probeCudaAvailability(pythonExe, dir)
    if (!cudaAvailable) {
      log.warn(`GPT-SoVITS 配置为 ${device}，但当前 Python(${pythonExe}) 的 torch 无 CUDA 支持，自动降级为 cpu`)
      device = 'cpu'
    }
  }

  // 记录解析后的 Python 路径与端口，便于诊断 PATH / runtime 探测问题
  log.log(`启动 GPT-SoVITS，Python: ${pythonExe}, 端口: ${port}, 设备: ${device}(配置: ${configuredDevice}), 目录: ${dir}`)

  // NOTICE:
  // GPT-SoVITS v2ProPlus 使用 api.py 作为入口，通过 -p 参数指定监听端口。
  // 参考 api.py 文档：`python api.py -p 9880`
  // `-sm normal` 启用流式模式：api.py 的 get_tts_wav() 在推理循环内逐 chunk
  // yield 音频帧 (L1071-1073)；`-mt raw` 跳过 OGG 编解码，直接输出 int16 PCM，
  // 省去前端 decodeAudioData 的开销与有损压缩。主进程逐 chunk 转发至渲染进程，
  // 前端直接构造 AudioBuffer 边合成边播放，降低首包延迟。
  const args = ['api.py', '-p', String(port), '-sm', 'normal', '-mt', 'raw']
  if (device === 'cpu') {
    args.push('-d', 'cpu')
  }
  else if (device === 'cuda-half') {
    args.push('-hp')
  }
  // 'auto' 和 'cuda' 不需要额外参数
  // 'auto' 模式下 api.py 默认使用 CUDA，如果不可用会自动回退到 CPU

  try {
    await sidecarService.start({
      id: getEngineSidecarId(getDefaultEngineId())!,
      command: pythonExe,
      args,
      cwd: dir,
      env: {
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1',
      },
    })

    // NOTICE:
    // 新进程从初始权重启动，模型状态已回到默认。若不重置 `lastLoadedVoiceId`，
    // 崩溃重启后 synthesizeGptSovits 会误以为声线未变而跳过 /set_model，
    // 用错误的声线合成。
    lastLoadedVoiceId = null

    // 轮询 /health 等待模型加载完成
    log.log('GPT-SoVITS 进程已启动，等待 /health ready...')
    const health = await pollGptSovitsHealth((h) => {
      log.log(`GPT-SoVITS health: ${h.status}`)
    })

    if (health.status === 'ready') {
      return { success: true, message: 'GPT-SoVITS 启动成功' }
    }
    if (health.status === 'degraded') {
      return { success: true, message: `GPT-SoVITS 启动完成（降级）: ${health.reasons?.join(', ') ?? 'unknown'}` }
    }
    return { success: false, message: `GPT-SoVITS 启动超时: ${health.reasons?.join(', ') ?? 'unreachable'}` }
  }
  catch (error) {
    const msg = `GPT-SoVITS 启动失败: ${errorMessageFrom(error) ?? 'unknown'}`
    log.error(msg)
    return { success: false, message: msg }
  }
}

/**
 * 停止 GPT-SoVITS sidecar 进程。
 *
 * SidecarService.stop 优先发 shutdown JSON-RPC 走优雅退出，超时后强制 kill。
 */
export async function stopGptSovits(sidecarService: SidecarService): Promise<{ success: boolean, message: string }> {
  try {
    await sidecarService.stop(getEngineSidecarId(getDefaultEngineId())!)
    return { success: true, message: 'GPT-SoVITS 已停止' }
  }
  catch (error) {
    const msg = `停止 GPT-SoVITS 时出错: ${errorMessageFrom(error) ?? 'unknown'}`
    log.error(msg)
    return { success: false, message: msg }
  }
}

export interface GptSovitsStatus {
  running: boolean
  dir: string | null
  port: number
  state: SidecarState
}

/**
 * 查询 GPT-SoVITS 当前运行状态与解析后的配置。
 *
 * `running` 直接取自 sidecar 进程状态（`state === 'running'`），
 * 不做 HTTP 探测，避免在进程刚 spawn、HTTP 尚未就绪时误报 stopped。
 */
export function getGptSovitsStatus(sidecarService: SidecarService): GptSovitsStatus {
  const status = sidecarService.getStatus(getEngineSidecarId(getDefaultEngineId())!)
  // sidecar handle 不存在时视为 stopped，避免 null 解引用
  const state: SidecarState = status?.state ?? 'stopped'
  return {
    running: state === 'running',
    dir: resolveGptSovitsDir(),
    port: getGptSovitsPort(),
    state,
  }
}

/**
 * 保存用户指定的 GPT-SoVITS 配置到持久化存储。
 *
 * 仅更新提供的字段（dir / port / device），未提供的字段保留原值。
 * `needsRestart=true` 表示 dir、port 或 device 实际发生变化且 sidecar 正在运行，
 * 需重启进程才能让新端口/路径/设备模式生效（新配置仅在下次 {@link startGptSovits} 时读取）。
 *
 * @param config - 部分配置对象，dir 为安装目录，port 为 HTTP 监听端口，device 为推理设备模式
 */
export async function setGptSovitsConfig(config: { dir?: string, port?: number, device?: 'auto' | 'cpu' | 'cuda' | 'cuda-half' }): Promise<{ needsRestart: boolean }> {
  ensureConfigLoaded()
  // 使用带显式字段的 fallback，确保 current.dir / current.port / current.device 可安全访问
  const current = gptSovitsConfigStore.get() ?? { dir: undefined, port: undefined, device: undefined }

  // 仅当提供的值与当前值不同时才视为"改变"，避免无变化的写入触发误重启
  const dirChanged = config.dir !== undefined && config.dir !== current.dir
  const portChanged = config.port !== undefined && config.port !== current.port
  const deviceChanged = config.device !== undefined && config.device !== current.device

  const next = { ...current }
  if (config.dir !== undefined) {
    next.dir = config.dir
  }
  if (config.port !== undefined) {
    next.port = config.port
  }
  if (config.device !== undefined) {
    next.device = config.device
  }
  gptSovitsConfigStore.update(next)

  // 配置实际变化且 sidecar 正在运行时才需要重启
  const running = await isGptSovitsRunning()
  return { needsRestart: (dirChanged || portChanged || deviceChanged) && running }
}

/**
 * 获取当前 GPT-SoVITS 配置（dir / port / device）。
 */
export function getGptSovitsConfig(): { dir: string | null, port: number, device: string | undefined } {
  ensureConfigLoaded()
  return {
    dir: resolveGptSovitsDir(),
    port: getGptSovitsPort(),
    device: gptSovitsConfigStore.get()?.device,
  }
}

/** 上一次加载的模型 ID，避免重复切换 */
let lastLoadedVoiceId: string | null = null

/**
 * 已解析的声线 manifest 元数据缓存条目。
 *
 * `expiresAt` 为绝对时间戳（毫秒），超过则视为过期并触发重新解析。
 */
interface CachedVoiceMeta {
  voiceDir: string
  referWavPath: string
  promptText: string
  promptLanguage: string
  gptModel: string | null
  sovitsModel: string | null
  expiresAt: number
}

// NOTICE:
// 每次合成都 `readdirSync` + `readFileSync` 遍历 voices 目录会同步阻塞主进程。
// 这里按 `(dir, voiceId)` 缓存解析结果并设 TTL（30s），既避免重复阻塞 I/O，
// 又保证用户新增/修改声线后最多 30s 内被重新读取，避免长期脏缓存。
const VOICE_META_CACHE_TTL_MS = 30_000
const voiceMetaCache = new Map<string, CachedVoiceMeta>()

/**
 * 解析声线 manifest 元数据，结果带 30s TTL 缓存。
 *
 * 优先匹配 `voices/<voiceId>/manifest.json` 目录，其次按 manifest 的
 * `id`/`display_name` 匹配子目录。返回参考音频、prompt 文本与模型权重路径，
 * 供 `synthesizeGptSovits` 使用，避免每次合成重复同步遍历磁盘。
 *
 * @param dir GPT-SoVITS 安装目录
 * @param voiceId 声线 ID 或 display_name
 * @returns 解析后的声线元数据（含缓存过期时间戳）
 */
export function resolveVoiceMeta(dir: string, voiceId: string): CachedVoiceMeta {
  const cacheKey = `${dir}\u0000${voiceId}`
  const cached = voiceMetaCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now())
    return cached

  const voicesRoot = join(dir, 'voices')
  const directDir = join(voicesRoot, voiceId)
  let voiceDir: string | null = null

  if (existsSync(directDir) && existsSync(join(directDir, 'manifest.json'))) {
    voiceDir = directDir
  }
  else if (existsSync(voicesRoot)) {
    for (const sub of readdirSync(voicesRoot)) {
      const mp = join(voicesRoot, sub, 'manifest.json')
      if (!existsSync(mp))
        continue
      const m = JSON.parse(readFileSync(mp, 'utf-8'))
      if (m.id === voiceId || m.display_name === voiceId) {
        voiceDir = join(voicesRoot, sub)
        break
      }
    }
  }

  if (!voiceDir)
    throw new Error(`voice "${voiceId}" 不存在`)

  const manifestPath = join(voiceDir, 'manifest.json')
  let referWavPath = ''
  let promptText = ''
  let promptLanguage = 'zh'
  let gptModel: string | null = null
  let sovitsModel: string | null = null

  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    referWavPath = join(voiceDir, manifest.default_reference ?? '')
    promptText = manifest.default_prompt_text ?? ''
    promptLanguage = manifest.language ?? 'zh'
    gptModel = manifest.gpt_model ?? null
    sovitsModel = manifest.sovits_model ?? null
  }
  else {
    const files = readdirSync(voiceDir).filter(f => f.endsWith('.wav'))
    if (files.length > 0)
      referWavPath = join(voiceDir, files[0])
    else
      throw new Error(`voice "${voiceId}" 下没有参考音频`)
  }

  const meta: CachedVoiceMeta = {
    voiceDir,
    referWavPath,
    promptText,
    promptLanguage,
    gptModel,
    sovitsModel,
    expiresAt: Date.now() + VOICE_META_CACHE_TTL_MS,
  }
  voiceMetaCache.set(cacheKey, meta)
  return meta
}

/**
 * 通过 HTTP 调用 GPT-SoVITS sidecar 进行语音合成，返回 WAV 音频 Buffer。
 *
 * 合成流程：
 * 1. 解析 voice manifest，获取参考音频和模型路径
 * 2. 如果 voice 变了，调用 /set_model 切换 v2Pro 权重
 * 3. POST / 合成语音
 */
export async function synthesizeGptSovits(
  _sidecarService: SidecarService,
  text: string,
  options: { voice?: string, speed?: number } = {},
): Promise<Buffer> {
  const port = getGptSovitsPort()
  const dir = resolveGptSovitsDir()
  if (!dir)
    throw new Error('GPT-SoVITS 目录未配置')

  const voiceId = options.voice ?? 'ailini'

  // 解析 voice manifest（走 TTL 缓存，避免重复同步阻塞主进程）
  const {
    referWavPath,
    promptText,
    promptLanguage,
    gptModel,
    sovitsModel,
  } = resolveVoiceMeta(dir, voiceId)

  // 语言智能路由（跨语言合成）：
  // 声线训练语言（manifest.language，如 ja）只影响声学权重，不决定文本前端。
  // 文本前端语言由"待合成文本的实际语言"决定：
  //   - 文本以中文（CJK 汉字）为主 → 用 zh 前端（中文 BERT + 中文 g2p），
  //     既拿到正确的中文 BERT（避免全零 BERT 导致"只哼哈一声"退化），又避开
  //     ja 前端依赖的 pyopenjtalk（当前 sidecar runtime 未安装，且 Windows 下需
  //     CMake 编译，安装困难）。GPT-SoVITS 支持 ja 声学权重 + zh 文本跨语言合成。
  //   - 文本确为日文 → 仍走 ja 前端（需要 pyopenjtalk，缺失时由 japanese.py
  //     preprocess_jap 抛出清晰错误而非整模块崩溃）。
  // prompt_language 跟随文本前端语言，避免处理声线自带的非中文 prompt 时
  // 触发 japanese 模块。
  const cjkCount = (text.match(/[一-鿿]/g) ?? []).length
  const nonCjkCount = text.length - cjkCount
  const textLanguage = cjkCount > nonCjkCount * 0.3 ? 'zh' : promptLanguage
  const effectivePromptLanguage = textLanguage === 'zh' ? 'zh' : promptLanguage

  log.log(`语言检测: CJK字符数=${cjkCount}, 文本语言=${textLanguage}, 声线语言=${promptLanguage}`)

  // 切换模型权重（仅在 voice 变化时）
  if (gptModel && sovitsModel && lastLoadedVoiceId !== voiceId) {
    const gptAbs = join(dir, gptModel)
    const sovitsAbs = join(dir, sovitsModel)
    log.log(`切换模型: ${voiceId} -> GPT=${gptModel}, SoVITS=${sovitsModel}`)
    const switchRes = await fetch(
      `http://127.0.0.1:${port}/set_model?gpt_model_path=${encodeURIComponent(gptAbs)}&sovits_model_path=${encodeURIComponent(sovitsAbs)}`,
      { signal: AbortSignal.timeout(120_000) },
    )
    if (!switchRes.ok) {
      const err = await switchRes.text().catch(() => '')
      log.error(`模型切换失败: ${err}`)
      throw new Error(`模型切换失败: ${err}`)
    }
    lastLoadedVoiceId = voiceId
    log.log(`模型切换完成`)
  }

  const body = {
    refer_wav_path: referWavPath,
    prompt_text: promptText,
    prompt_language: effectivePromptLanguage,
    text,
    text_language: textLanguage,
    speed: options.speed ?? 1.0,
    top_k: 5,
    top_p: 0.6,
    temperature: 0.6,
  }

  log.log(`合成请求: voice=${voiceId}, promptLang=${effectivePromptLanguage}, textLang=${textLanguage}, text="${text.slice(0, 30)}..."`)
  log.log(`参考音频: ${referWavPath}`)

  const startTime = Date.now()
  const res = await fetch(`http://127.0.0.1:${port}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    log.error(`合成失败 (${res.status}): ${errText}`)
    throw new Error(`GPT-SoVITS 合成失败 (${res.status}): ${errText}`)
  }

  const contentType = res.headers.get('content-type') ?? ''
  const arrayBuffer = await res.arrayBuffer()
  const duration = Date.now() - startTime
  log.log(`合成完成: ${arrayBuffer.byteLength} bytes, 耗时 ${duration}ms`)

  // api.py 在 `-mt raw` 下返回裸 int16 PCM（无 WAV 头），
  // 前端 decodeAudioData 无法直接解析，这里包装成 WAV 保持兼容。
  if (!contentType.includes('ogg')) {
    const sampleRate = 32000 // v2Pro 模型采样率
    return wrapPcmToWav(Buffer.from(arrayBuffer), sampleRate)
  }
  return Buffer.from(arrayBuffer)
}

/** 将 raw int16 PCM 包装为 WAV（44 字节头 + PCM 数据），供 decodeAudioData 兼容。 */
function wrapPcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const numChannels = 1
  const bitsPerSample = 16
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)
  const dataSize = pcm.length
  const wav = Buffer.alloc(44 + dataSize)

  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + dataSize, 4)
  wav.write('WAVE', 8)
  wav.write('fmt ', 12)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20) // PCM
  wav.writeUInt16LE(numChannels, 22)
  wav.writeUInt32LE(sampleRate, 24)
  wav.writeUInt32LE(byteRate, 28)
  wav.writeUInt16LE(blockAlign, 32)
  wav.writeUInt16LE(bitsPerSample, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(dataSize, 40)
  pcm.copy(wav, 44)

  return wav
}

/**
 * GPT-SoVITS 流式语音合成 — 基于 api.py `-sm normal` 流式模式，
 * 逐 OGG chunk yield，实现边合成边传输。
 *
 * 与 {@link synthesizeGptSovits} 的区别：不等待整段合成完成，
 * 每收到一个 OGG chunk 立即 yield，供 IPC 流式 handler 转发至渲染进程
 * 逐块 decodeAudioData 播放（首包延迟显著降低）。
 *
 * api.py 在流式模式下每生成一个推理块（Tchunk=1000，约 100-500ms 音频）
 * 就 pack_ogg 写入 BytesIO 并由 read_clean_buffer 读取、yield 为独立 OGG 帧。
 * 每个 OGG 帧是完整、可独立解码的 OGG 音频流。
 */
export async function* synthesizeGptSovitsStream(
  _sidecarService: SidecarService,
  text: string,
  options: { voice?: string, speed?: number } = {},
): AsyncGenerator<{ type: 'data', data: Buffer, sampleRate: number, format: 'ogg' | 'pcm-int16' }> {
  const port = getGptSovitsPort()
  const dir = resolveGptSovitsDir()
  if (!dir)
    throw new Error('GPT-SoVITS 目录未配置')

  const voiceId = options.voice ?? 'ailini'
  const {
    referWavPath,
    promptText,
    promptLanguage,
    gptModel,
    sovitsModel,
  } = resolveVoiceMeta(dir, voiceId)

  // 语言智能路由（与 synthesizeGptSovits 相同的跨语言合成逻辑）
  const cjkCount = (text.match(/[一-鿿]/g) ?? []).length
  const nonCjkCount = text.length - cjkCount
  const textLanguage = cjkCount > nonCjkCount * 0.3 ? 'zh' : promptLanguage
  const effectivePromptLanguage = textLanguage === 'zh' ? 'zh' : promptLanguage

  if (gptModel && sovitsModel && lastLoadedVoiceId !== voiceId) {
    const gptAbs = join(dir, gptModel)
    const sovitsAbs = join(dir, sovitsModel)
    log.log(`切换模型: ${voiceId} -> GPT=${gptModel}, SoVITS=${sovitsModel}`)
    const switchRes = await fetch(
      `http://127.0.0.1:${port}/set_model?gpt_model_path=${encodeURIComponent(gptAbs)}&sovits_model_path=${encodeURIComponent(sovitsAbs)}`,
      { signal: AbortSignal.timeout(120_000) },
    )
    if (!switchRes.ok) {
      const err = await switchRes.text().catch(() => '')
      log.error(`模型切换失败: ${err}`)
      throw new Error(`模型切换失败: ${err}`)
    }
    lastLoadedVoiceId = voiceId
    log.log(`模型切换完成`)
  }

  const body = {
    refer_wav_path: referWavPath,
    prompt_text: promptText,
    prompt_language: effectivePromptLanguage,
    text,
    text_language: textLanguage,
    speed: options.speed ?? 1.0,
    top_k: 5,
    top_p: 0.6,
    temperature: 0.6,
  }

  log.log(`流式合成请求: voice=${voiceId}, text="${text.slice(0, 30)}..."`)

  const res = await fetch(`http://127.0.0.1:${port}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    log.error(`流式合成失败 (${res.status}): ${errText}`)
    throw new Error(`GPT-SoVITS 流式合成失败 (${res.status}): ${errText}`)
  }

  // v2Pro 模型采样率为 32000Hz，OGG header 中亦含采样率，
  // 前端 decodeAudioData 会自动读取，此处提供便于前端初始化 AudioContext。
  const sampleRate = 32000

  // 推断音频格式：api.py 在 `-mt raw` 下返回 Content-Type: audio/raw（int16 PCM），
  // 否则为 OGG。带 WAV 头时（media_type=wav 非流式）也视为 pcm-int16（剥离头）。
  const contentType = res.headers.get('content-type') ?? ''
  const format: 'ogg' | 'pcm-int16' = contentType.includes('ogg') ? 'ogg' : 'pcm-int16'
  log.log(`流式合成格式: ${format} (content-type=${contentType})`)

  const reader = res.body!.getReader()
  let chunkCount = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value?.byteLength) {
      chunkCount += 1
      yield { type: 'data' as const, data: Buffer.from(value), sampleRate, format }
    }
  }
  log.log(`流式合成完成: ${chunkCount} chunks, text="${text.slice(0, 30)}..."`)
}

/**
 * 注册克隆声线（上传参考音频到 sidecar）。
 *
 * GPT-SoVITS api.py 不提供动态注册接口，克隆声线通过将音频文件
 * 放到 voices/ 目录并创建 manifest.json 来实现。
 */
export async function cloneVoice(
  _sidecarService: SidecarService,
  characterName: string,
  audioPath: string,
  audioText: string,
  language?: string,
): Promise<{ success: boolean }> {
  const dir = resolveGptSovitsDir()
  if (!dir)
    throw new Error('GPT-SoVITS 目录未配置')

  const { mkdirSync, copyFileSync, writeFileSync } = await import('node:fs')
  const voicesDir = join(dir, 'voices', characterName)
  mkdirSync(voicesDir, { recursive: true })

  const destAudio = join(voicesDir, 'reference.wav')
  copyFileSync(audioPath, destAudio)

  const manifest = {
    id: characterName,
    display_name: characterName,
    language: language ?? 'zh',
    default_reference: 'reference.wav',
    default_prompt_text: audioText,
    description: `${characterName} - cloned voice`,
  }
  writeFileSync(join(voicesDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8')

  log.log(`克隆声线 ${characterName} 已注册`)
  return { success: true }
}

/**
 * 删除已克隆的声线。
 */
export async function removeVoice(
  _sidecarService: SidecarService,
  characterName: string,
): Promise<{ success: boolean }> {
  const dir = resolveGptSovitsDir()
  if (!dir)
    throw new Error('GPT-SoVITS 目录未配置')

  const { rmSync } = await import('node:fs')
  const voicesDir = join(dir, 'voices', characterName)
  if (existsSync(voicesDir)) {
    rmSync(voicesDir, { recursive: true, force: true })
    log.log(`声线 ${characterName} 已删除`)
  }
  return { success: true }
}
