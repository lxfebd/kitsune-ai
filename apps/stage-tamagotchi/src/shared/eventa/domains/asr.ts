// Domain: asr — eventa IPC 契约按域拆分
import { defineInvokeEventa } from '@moeru/eventa'

export interface AsrTranscribeResult {
  text: string
  lang?: string
  emotion?: string
  event?: string
}

/** ASR 引擎信息 */
export interface AsrEngineInfo {
  id: string
  name: string
  type: string
}

/** ASR 转录 — 接收 Float32Array 音频，返回文本 + 情感 */
export const electronAsrTranscribe = defineInvokeEventa<
  AsrTranscribeResult,
  { audioSamples: Float32Array, sampleRate: number }
>('eventa:invoke:electron:asr:transcribe')

/** ASR 切换引擎 */
export const electronAsrSwitchEngine = defineInvokeEventa<
  { success: boolean },
  { engineId: string }
>('eventa:invoke:electron:asr:switch-engine')

/** ASR 获取状态 */
export const electronAsrGetStatus = defineInvokeEventa<
  { engineId: string | null, ready: boolean, modelsDir: string }
>('eventa:invoke:electron:asr:get-status')

/** ASR 列出可用引擎 */
export const electronAsrListEngines = defineInvokeEventa<
  AsrEngineInfo[]
>('eventa:invoke:electron:asr:list-engines')

// Dialog — 通用文件夹选择对话框，供 sidecar 设置页等场景调用 Electron dialog.showOpenDialog
