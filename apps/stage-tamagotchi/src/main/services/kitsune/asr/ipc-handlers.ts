/**
 * ASR IPC Handlers — 桥接 renderer 和 main 进程的 ASR 服务
 *
 * renderer 通过 invoke 调用，main 进程执行 sherpa-onnx 推理后返回结果。
 * 音频数据通过 Electron IPC 的 structured clone 传输 Float32Array。
 *
 * 在 main/index.ts 中调用 registerAsrIpcHandlers(context) 注册所有 handler。
 */

import type { InvocableEventContext } from '@moeru/eventa'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { listAsrEngines } from '@kitsune/stage-ui/inference/asr-engine-registry'

import {
  electronAsrTranscribe,
  electronAsrSwitchEngine,
  electronAsrGetStatus,
  electronAsrListEngines,
} from '../../../../shared/eventa'

import { registerBuiltinAsrEngines } from './engines'
import * as asrService from './index'

const log = useLogg('asr-ipc-handlers').useGlobalConfig()

/**
 * 注册所有内置 ASR 引擎 + IPC handler
 *
 * 在 main/index.ts 的 app.whenReady() 后调用：
 * ```typescript
 * import { registerAsrIpcHandlers } from './services/kitsune/asr/ipc-handlers'
 * registerAsrIpcHandlers(context)
 * ```
 */
export function registerAsrIpcHandlers(context: InvocableEventContext<any, any>): void {
  // 注册内置引擎（SenseVoice / Paraformer）
  registerBuiltinAsrEngines()

  // 内存管线：renderer 发送 Float32Array，main 直接识别
  defineInvokeHandler(context, electronAsrTranscribe, async (input) => {
    try {
      // input.audioSamples 已由 IPC structured clone 还原为 Float32Array，直接复用
      const result = await asrService.transcribe(input.audioSamples, input.sampleRate)
      return result
    }
    catch (error) {
      log.error(`ASR transcribe failed: ${errorMessageFrom(error)}`)
      throw error
    }
  })

  // 切换 ASR 引擎
  defineInvokeHandler(context, electronAsrSwitchEngine, async (input) => {
    try {
      await asrService.switchEngine(input.engineId)
      return { success: true }
    }
    catch (error) {
      log.error(`ASR switch engine failed: ${errorMessageFrom(error)}`)
      throw error
    }
  })

  // 获取 ASR 状态
  defineInvokeHandler(context, electronAsrGetStatus, async () => {
    return asrService.getStatus()
  })

  // 列出可用引擎
  defineInvokeHandler(context, electronAsrListEngines, async () => {
    return listAsrEngines().map(e => ({
      id: e.id,
      name: e.name,
      type: e.type,
    }))
  })

  log.log('ASR IPC handlers registered')
}
