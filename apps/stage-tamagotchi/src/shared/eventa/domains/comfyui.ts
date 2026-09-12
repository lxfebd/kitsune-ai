// Domain: comfyui — eventa IPC 契约按域拆分
import { defineInvokeEventa, defineEventa } from '@moeru/eventa'

export interface ComfyUIStatus {
  running: boolean
  url: string
  version?: string
  gpu?: string
  vram?: string
  state: 'stopped' | 'starting' | 'running' | 'stopping' | 'error' | 'degraded'
}

export const electronComfyuiStart = defineInvokeEventa<ComfyUIStatus>('eventa:invoke:electron:comfyui:start')
export const electronComfyuiStop = defineInvokeEventa<ComfyUIStatus>('eventa:invoke:electron:comfyui:stop')
export const electronComfyuiStatus = defineInvokeEventa<ComfyUIStatus>('eventa:invoke:electron:comfyui:status')
export const electronComfyuiSetConfig = defineInvokeEventa<{ needsRestart: boolean }, { dir?: string, port?: number }>('eventa:invoke:electron:comfyui:set-config')
export const electronComfyuiStatusChanged = defineEventa<ComfyUIStatus>('eventa:event:electron:comfyui:status-changed')

// TTS 引擎选择 — 支持 GPT-SoVITS / Edge TTS / 系统 TTS 切换与自动降级。
// GPT-SoVITS 不可用时降级到 Edge TTS；Edge TTS 离线时降级到系统 TTS。
