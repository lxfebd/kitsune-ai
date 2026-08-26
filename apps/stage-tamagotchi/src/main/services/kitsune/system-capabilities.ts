import { execFile } from 'node:child_process'
import { cpus, totalmem, platform } from 'node:os'
import { promisify } from 'node:util'

import { useLogg } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'
import type { SystemCapabilities } from '../../../shared/eventa'

const execAsync = promisify(execFile)
const log = useLogg('system-capabilities').useGlobalConfig()

let cached: SystemCapabilities | null = null

// NOTICE: AdapterRAM 是 uint32，超过 4GB 会溢出归零，VRAM 仅作参考。
const GPU_QUERY_TIMEOUT_MS = 8000

/** Win32 物理核数：Get-CimInstance Win32_Processor.NumberOfCores；失败回退逻辑核。 */
async function detectPhysicalCores(): Promise<number> {
  if (platform() !== 'win32') {
    return cpus().length
  }
  try {
    const { stdout } = await execAsync('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      '(Get-CimInstance -ClassName Win32_Processor).NumberOfCores',
    ], { timeout: GPU_QUERY_TIMEOUT_MS })
    const n = Number.parseInt(stdout.trim(), 10)
    return Number.isFinite(n) && n > 0 ? n : cpus().length
  }
  catch (e) {
    log.warn(`物理核探测失败，回退逻辑核: ${errorMessageFrom(e) ?? 'unknown'}`)
    return cpus().length
  }
}

/** GPU 探测：优先 nvidia-smi（拿精确 VRAM），回退 WMI Win32_VideoController。 */
async function detectGpu(): Promise<SystemCapabilities['gpu']> {
  // 1) nvidia-smi
  try {
    const { stdout } = await execAsync('nvidia-smi', [
      '--query-gpu=name,memory.total', '--format=csv,noheader,nounits',
    ], { timeout: GPU_QUERY_TIMEOUT_MS })
    const parts = stdout.trim().split(/[,\n]/).map(s => s.trim())
    if (parts.length >= 2 && parts[0]) {
      const vram = Number.parseInt(parts[1] ?? '0', 10)
      return {
        vendor: 'NVIDIA',
        model: parts[0],
        vramMB: Number.isFinite(vram) ? vram : 0,
      }
    }
  }
  catch {
    // 无 nvidia-smi，走 WMI 回退
  }
  // 2) WMI Win32_VideoController
  if (platform() === 'win32') {
    try {
      const { stdout } = await execAsync('powershell', [
        '-NoProfile', '-NonInteractive', '-Command',
        '(Get-CimInstance -ClassName Win32_VideoController | Select-Object -First 1).Name',
      ], { timeout: GPU_QUERY_TIMEOUT_MS })
      const name = stdout.trim()
      if (name) {
        return { vendor: 'unknown', model: name, vramMB: 0 }
      }
    }
    catch (e) {
      log.warn(`WMI GPU 探测失败: ${errorMessageFrom(e) ?? 'unknown'}`)
    }
  }
  return null
}

/** 一次性探测本机能力，进程内缓存（机器配置运行期不变）。 */
export async function getSystemCapabilities(): Promise<SystemCapabilities> {
  if (cached) {
    return cached
  }
  const [physicalCores, gpu] = await Promise.all([
    detectPhysicalCores(),
    detectGpu(),
  ])
  const logicalCores = cpus().length
  const totalMemoryGB = Math.round(totalmem() / 1024 ** 3)
  const result: SystemCapabilities = {
    cpuModel: cpus()[0]?.model ?? 'unknown',
    physicalCores,
    logicalCores,
    totalMemoryGB,
    gpu,
    isLowSpec: physicalCores < 4 || totalMemoryGB < 8,
  }
  cached = result
  log.log(`系统能力: ${result.cpuModel}, 物理${physicalCores}核/逻辑${logicalCores}, ${totalMemoryGB}GB, GPU=${gpu?.model ?? 'none'}, lowSpec=${result.isLowSpec}`)
  return result
}
