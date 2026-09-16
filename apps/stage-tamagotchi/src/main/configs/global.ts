import { array, object, optional, picklist, string } from 'valibot'

import { createConfig } from '../libs/electron/persistence'

const shortcutAcceleratorSchema = object({
  modifiers: array(picklist(['cmd-or-ctrl', 'cmd', 'ctrl', 'alt', 'shift', 'super'])),
  key: string(),
})

export const globalAppConfigSchema = object({
  language: optional(string()),
  spotlightShortcutAccelerator: optional(shortcutAcceleratorSchema),
  updateChannel: optional(picklist(['latest', 'stable', 'alpha', 'beta', 'nightly', 'canary'])),
  /**
   * TTS 引擎选择，由设置页 sidecar/TTS 区域切换。
   * 默认 'gpt-sovits'，不可用时由前端选择降级到 'edge-tts' 或 'system'。
   */
  ttsEngine: optional(string()),
  /**
   * 全局日志级别，由环境适配中心日志面板切换，持久化以便重启后保持。
   * 默认 'INFO'；仅影响 @guiiai/logg 输出详细度，不影响功能行为。
   */
  logLevel: optional(picklist(['DEBUG', 'INFO', 'WARN', 'ERROR'])),
})

export function createGlobalAppConfig() {
  const config = createConfig('app', 'options.json', globalAppConfigSchema)
  config.setup()

  return config
}
