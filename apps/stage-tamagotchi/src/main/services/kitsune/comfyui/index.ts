/**
 * ComfyUI 本地服务
 *
 * 进程生命周期由 SidecarService 统一管理（spawn / restart / dispose），
 * ComfyUI 自身的 API 通信仍走 HTTP（/system_stats、/prompt 等），
 * 不使用 SidecarService 的 stdin/stdout JSON-RPC 通道。
 * 启动由用户在设置页手动触发（electronComfyuiStart IPC），不再自启动。
 */

import type { SidecarService } from '../sidecar'
import type { ComfyUIStatus } from '../../../../shared/eventa'

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { env, platform } from 'node:process'

import { useLogg } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'
import { optional, object, string, number, integer, minValue, maxValue, pipe } from 'valibot'

import { createConfig } from '../../../libs/electron/persistence'

export type { ComfyUIStatus }

const log = useLogg('comfyui-service').useGlobalConfig()

const DEFAULT_COMFYUI_PORT = 8188
const STARTUP_TIMEOUT_MS = 60000
const CHECK_INTERVAL_MS = 2000

/** SidecarService 中注册 ComfyUI 时使用的固定 id。 */
const COMFYUI_SIDECAR_ID = 'comfyui'

// 持久化配置 schema：dir 为 ComfyUI 安装目录，port 为 HTTP 监听端口（1024-65535）
const comfyuiConfigSchema = object({
  dir: optional(string()),
  port: optional(pipe(number(), integer(), minValue(1024), maxValue(65535))),
})

const comfyuiConfigStore = createConfig('comfyui', 'config.json', comfyuiConfigSchema, {
  default: { dir: undefined, port: undefined },
  autoHeal: true,
})

/**
 * 按优先级解析 ComfyUI 监听端口：
 * 1. 持久化配置文件（用户在 UI 中显式指定）
 * 2. 环境变量 COMFYUI_PORT（便于 CI / 开发者覆盖）
 * 3. 默认 8188
 *
 * 首次访问时从磁盘加载配置，与 resolveComfyuiDir 共享 comfyuiConfigLoaded 标记。
 */
function getComfyuiPort(): number {
  if (!comfyuiConfigLoaded) {
    comfyuiConfigStore.setup()
    comfyuiConfigLoaded = true
  }

  const configPort = comfyuiConfigStore.get()?.port
  if (configPort !== undefined && Number.isInteger(configPort) && configPort >= 1024 && configPort <= 65535)
    return configPort

  const envPort = env.COMFYUI_PORT
  if (envPort) {
    const parsed = Number.parseInt(envPort, 10)
    if (Number.isInteger(parsed) && parsed >= 1024 && parsed <= 65535)
      return parsed
  }

  return DEFAULT_COMFYUI_PORT
}

function getComfyuiUrl(): string {
  return `http://127.0.0.1:${getComfyuiPort()}`
}

let isStarting = false
// 标记配置是否已从磁盘加载，避免每次启动都重复读盘
let comfyuiConfigLoaded = false

/**
 * 按优先级解析 ComfyUI 安装目录：
 * 1. 环境变量 COMFYUI_DIR（便于 CI / 开发者覆盖）
 * 2. 持久化配置文件（用户在 UI 中显式指定）
 * 3. 用户目录探测（覆盖常见默认安装位置）
 * 4. 都未找到时返回 null，由调用方决定是否跳过启动
 */
export function resolveComfyuiDir(): string | null {
  // 首次访问时从磁盘加载配置；setup 内部使用 readFileSync，app ready 后调用安全
  if (!comfyuiConfigLoaded) {
    comfyuiConfigStore.setup()
    comfyuiConfigLoaded = true
  }

  // 1. 环境变量优先
  const envDir = env.COMFYUI_DIR
  if (envDir && existsSync(envDir)) {
    return envDir
  }

  // 2. 持久化配置
  const configDir = comfyuiConfigStore.get()?.dir
  if (configDir && existsSync(configDir)) {
    return configDir
  }

  // 3. 用户目录探测，覆盖常见安装位置
  const candidates: string[] = []
  if (platform() === 'win32') {
    const localAppData = env.LOCALAPPDATA
    if (localAppData) {
      candidates.push(join(localAppData, 'ComfyUI'))
    }
    // Windows 便携版通常解压到用户目录
    candidates.push(join(homedir(), 'ComfyUI_windows_portable'))
  }
  else {
    candidates.push(join(homedir(), 'ComfyUI'))
    // Unix 下也可能放置 Windows 便携版目录（如 WSL 共享盘）
    candidates.push(join(homedir(), 'ComfyUI_windows_portable'))
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

async function isComfyUIRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${getComfyuiUrl()}/system_stats`, {
      signal: AbortSignal.timeout(3000),
    })
    return response.ok
  }
  catch {
    return false
  }
}

export async function startComfyUI(sidecarService: SidecarService): Promise<{ success: boolean, message: string }> {
  if (isStarting) {
    return { success: false, message: 'ComfyUI 正在启动中...' }
  }

  if (await isComfyUIRunning()) {
    log.log('ComfyUI 服务器已在运行')
    return { success: true, message: 'ComfyUI 服务器已在运行' }
  }

  const comfyuiDir = resolveComfyuiDir()
  // 路径未配置或不存在时不抛错，避免阻塞主进程启动
  if (!comfyuiDir) {
    log.warn('ComfyUI path not found, skipping start')
    return { success: false, message: 'ComfyUI 路径未找到，已跳过启动' }
  }

  const mainPy = join(comfyuiDir, 'ComfyUI', 'main.py')
  const pythonExe = join(comfyuiDir, 'python_embeded', 'python.exe')

  if (!existsSync(mainPy) || !existsSync(pythonExe)) {
    const msg = `ComfyUI 目录结构不完整: ${comfyuiDir}`
    log.error(msg)
    return { success: false, message: msg }
  }

  isStarting = true
  log.log(`启动 ComfyUI 服务器，目录: ${comfyuiDir}`)

  try {
    // SidecarService 用 stdio pipe spawn，捕获 stdout/stderr 日志；
    // ComfyUI 原生走 HTTP 通信，不使用 stdin/stdout JSON-RPC 通道，
    // 因此不传 onNotification/onBinary handlers。
    await sidecarService.start({
      id: COMFYUI_SIDECAR_ID,
      command: pythonExe,
      args: [
        '-s',
        'ComfyUI\\main.py',
        '--windows-standalone-build',
        '--listen',
        '127.0.0.1',
        '--port',
        String(getComfyuiPort()),
      ],
      cwd: comfyuiDir,
      onDegraded: (id, reason) => {
        log.error(`ComfyUI sidecar 降级: id=${id} reason=${reason}`)
      },
    })

    // SidecarService 标记进程为 running 仅代表 spawn 成功；
    // ComfyUI 还需加载模型与初始化 HTTP 服务，轮询 /system_stats 确认真正就绪。
    const startTime = Date.now()
    while (Date.now() - startTime < STARTUP_TIMEOUT_MS) {
      await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL_MS))
      if (await isComfyUIRunning()) {
        log.log('ComfyUI 服务器启动成功')
        isStarting = false
        return { success: true, message: 'ComfyUI 服务器启动成功' }
      }
    }

    isStarting = false
    return { success: false, message: 'ComfyUI 启动超时' }
  }
  catch (error) {
    isStarting = false
    const msg = `启动 ComfyUI 时出错: ${errorMessageFrom(error) ?? 'unknown'}`
    log.error(msg)
    return { success: false, message: msg }
  }
}

/**
 * 递归 kill ComfyUI 进程树。
 * Windows 使用 taskkill /T /F 终止整个进程树（含 Python 子进程）；
 * Unix 直接 SIGTERM 主进程，Python 子进程由 ComfyUI 自身处理。
 *
 * SidecarService.stop 优先发 shutdown JSON-RPC 走优雅退出，但 ComfyUI
 * 不识别 JSON-RPC，shutdown 通知会被丢弃；超时后 SidecarService 仅 kill
 * 主 python 进程，其派生的子进程可能残留为孤儿。这里用 taskkill /T 兜底。
 */
function killComfyuiTree(pid: number): void {
  if (platform() === 'win32') {
    // /T 递归终止子进程树，/F 强制终止，避免 Python 子进程残留为孤儿
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
  }
  else {
    try {
      process.kill(pid, 'SIGTERM')
    }
    catch (error) {
      log.warn(`kill ComfyUI 进程失败: ${errorMessageFrom(error) ?? 'unknown'}`)
    }
  }
}

export async function stopComfyUI(sidecarService: SidecarService): Promise<{ success: boolean, message: string }> {
  // 先取 pid 用于 taskkill /T 兜底；stop 后 status 会被清空，所以必须在 stop 前读取
  const status = sidecarService.getStatus(COMFYUI_SIDECAR_ID)
  // sidecar handle 已不存在（可能已被 dispose 清理，如 app 退出时 onAppBeforeQuit 并行触发），
  // 此时进程已由 SidecarService.dispose 统一清理，无需重复 stop
  if (!status) {
    return { success: true, message: 'ComfyUI 服务器未运行' }
  }
  const pid = status.pid ?? null

  try {
    await sidecarService.stop(COMFYUI_SIDECAR_ID)
    // ComfyUI 不识别 JSON-RPC shutdown，SidecarService.stop 的优雅关闭对其无效；
    // 用 taskkill /T 确保整个 Python 进程树被清理
    if (pid) {
      killComfyuiTree(pid)
    }
    log.log('ComfyUI 服务器已停止')
    return { success: true, message: 'ComfyUI 服务器已停止' }
  }
  catch (error) {
    // 即使 sidecar stop 报错也尝试 taskkill 兜底，避免进程残留
    if (pid) {
      killComfyuiTree(pid)
    }
    const msg = `停止 ComfyUI 时出错: ${errorMessageFrom(error) ?? 'unknown'}`
    log.error(msg)
    return { success: false, message: msg }
  }
}

export async function getComfyUIStatus(): Promise<ComfyUIStatus> {
  // url 反映当前配置端口；即使 HTTP 查询失败也返回配置 URL 便于前端展示
  const url = getComfyuiUrl()
  const running = await isComfyUIRunning()

  // HTTP 查询失败时根据 isStarting 标记推断状态：
  // starting 表示已 spawn 但 HTTP 尚未就绪；否则视为已停止
  if (!running) {
    const state = isStarting ? 'starting' : 'stopped'
    return { running: false, url, state }
  }

  try {
    const response = await fetch(`${url}/system_stats`, {
      signal: AbortSignal.timeout(5000),
    })
    const data = await response.json()

    return {
      running: true,
      url,
      version: data.system?.comfyui_version,
      gpu: data.devices?.[0]?.name,
      vram: data.devices?.[0] ? `${Math.round(data.devices[0].vram_total / 1024 ** 3)} GB` : undefined,
      state: 'running',
    }
  }
  catch {
    // HTTP 已确认 running=true 但 /system_stats 详情读取失败，标记为 degraded
    return { running: true, url, state: 'degraded' }
  }
}

/**
 * 保存用户指定的 ComfyUI 配置到持久化存储。
 *
 * 仅更新提供的字段（dir / port），未提供的字段保留原值。
 * needsRestart=true 表示 ComfyUI 当前正在运行，配置变更需重启进程才能生效
 * （新端口/路径仅在下次 startComfyUI 时读取）。
 *
 * @param config - 部分配置对象，dir 为安装目录，port 为 HTTP 监听端口
 */
export async function setComfyuiConfig(config: { dir?: string, port?: number }): Promise<{ needsRestart: boolean }> {
  if (!comfyuiConfigLoaded) {
    comfyuiConfigStore.setup()
    comfyuiConfigLoaded = true
  }
  const current = comfyuiConfigStore.get() ?? {}
  const next = { ...current }
  if (config.dir !== undefined)
    next.dir = config.dir
  if (config.port !== undefined)
    next.port = config.port
  comfyuiConfigStore.update(next)
  // 配置变更后，若 ComfyUI 正在运行，需重启才能让新端口/路径生效
  const running = await isComfyUIRunning()
  return { needsRestart: running }
}
