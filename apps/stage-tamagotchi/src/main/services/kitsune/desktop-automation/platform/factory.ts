/**
 * 平台自动化工厂函数。
 *
 * 根据当前操作系统自动选择对应的平台实现。
 */

import type { PlatformAutomation, PlatformOptions } from './index'

import { MacAutomation } from './macos'
import { WindowsAutomation } from './windows'

export type PlatformType = 'win32' | 'darwin' | 'linux'

/**
 * 创建平台自动化实例。
 *
 * @param platform - 目标平台，默认为当前操作系统
 * @param options - 平台选项
 * @returns 对应平台的自动化实例
 */
export async function createPlatformAutomation(
  platform: PlatformType = process.platform as PlatformType,
  options: PlatformOptions = {},
): Promise<PlatformAutomation> {
  switch (platform) {
    case 'win32':
      return new WindowsAutomation(options)
    case 'darwin':
      return new MacAutomation(options)
    case 'linux': {
      // Linux 实现需要动态导入，因为可能缺少 xdotool/wmctrl
      try {
        const { LinuxAutomation } = await import('./linux')
        return new LinuxAutomation(options)
      }
      catch {
        throw new Error('Linux 平台自动化需要安装 xdotool 和 wmctrl')
      }
    }
    default:
      throw new Error(`不支持的平台: ${platform}`)
  }
}

/**
 * 检查当前平台是否支持自动化。
 */
export function isPlatformSupported(): boolean {
  return ['win32', 'darwin', 'linux'].includes(process.platform)
}

/**
 * 获取当前平台类型。
 */
export function getCurrentPlatform(): PlatformType {
  return process.platform as PlatformType
}
