import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { SourcesOptions } from 'electron'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { desktopCapturer } from 'electron'

import {
  electronVisionFrameCaptured,
  electronVisionStart,
  electronVisionStatus,
  electronVisionStop,
  type VisionServiceStatus,
} from '../../../../shared/eventa'
import { onAppBeforeQuit } from '../../../libs/bootkit/lifecycle'

type MainContext = ReturnType<typeof createContext>['context']

const DEFAULT_INTERVAL_MS = 5000
// 与 use-vision-screen-capture.ts 的 captureFrame 默认值对齐，保证推理输入分辨率一致
const CAPTURE_MAX_WIDTH = 1280
const CAPTURE_MAX_HEIGHT = 720
const CAPTURE_QUALITY = 0.82

const CAPTURE_SOURCES_OPTIONS: SourcesOptions = {
  types: ['screen'],
  thumbnailSize: { width: CAPTURE_MAX_WIDTH, height: CAPTURE_MAX_HEIGHT },
}

export interface VisionService {
  start: (intervalMs?: number) => VisionServiceStatus
  stop: () => VisionServiceStatus
  status: () => VisionServiceStatus
  dispose: () => void
}

/**
 * 屏幕监控常驻服务。
 *
 * 主进程定时调用 desktopCapturer 抓取第一块屏幕，把 JPEG data URL 通过
 * `electronVisionFrameCaptured` 事件下发到渲染进程；渲染进程监听后调用
 * `visionOrchestratorStore.processCapture` 走视觉推理。
 *
 * 不自动启动 — 由 `electronVisionStart` IPC 触发，避免无 UI 时仍采集屏幕。
 */
export function createVisionService(params: { context: MainContext }): VisionService {
  const { context } = params
  const log = useLogg('main/vision').useGlobalConfig()

  let running = false
  let intervalMs = DEFAULT_INTERVAL_MS
  let timer: NodeJS.Timeout | undefined
  let lastCapture: number | null = null
  let lastError: string | undefined

  function snapshot(): VisionServiceStatus {
    return { running, intervalMs, lastCapture, lastError }
  }

  async function captureOnce() {
    const sources = await desktopCapturer.getSources(CAPTURE_SOURCES_OPTIONS)
    const source = sources[0]
    if (!source) {
      log.warn('no screen source available')
      lastError = 'no screen source available'
      return
    }

    // thumbnail 已被 desktopCapturer 缩放到 thumbnailSize 内，直接转 JPEG data URL
    const jpeg = source.thumbnail.toJPEG(CAPTURE_QUALITY)
    const imageDataUrl = `data:image/jpeg;base64,${jpeg.toString('base64')}`
    const capturedAt = Date.now()
    lastCapture = capturedAt
    lastError = undefined

    context.emit(electronVisionFrameCaptured, {
      imageDataUrl,
      sourceId: source.id,
      capturedAt,
    })
  }

  function tick() {
    captureOnce().catch((error) => {
      const message = errorMessageFrom(error) ?? 'unknown capture error'
      log.warn(`capture failed: ${message}`)
      lastError = message
    })
  }

  function start(requestedIntervalMs?: number) {
    if (running)
      return snapshot()
    if (typeof requestedIntervalMs === 'number' && requestedIntervalMs > 0)
      intervalMs = requestedIntervalMs
    running = true
    lastError = undefined
    // 立即跑一次再走 interval，避免启动后要等一个 interval 才有首帧
    tick()
    timer = setInterval(tick, intervalMs)
    log.withFields({ intervalMs }).log('vision capture loop started')
    return snapshot()
  }

  function stop() {
    if (!running)
      return snapshot()
    running = false
    if (timer) {
      clearInterval(timer)
      timer = undefined
    }
    log.log('vision capture loop stopped')
    return snapshot()
  }

  defineInvokeHandler(context, electronVisionStart, async (payload) => {
    return start(payload?.intervalMs)
  })

  defineInvokeHandler(context, electronVisionStop, async () => {
    return stop()
  })

  defineInvokeHandler(context, electronVisionStatus, async () => {
    return snapshot()
  })

  onAppBeforeQuit(() => {
    stop()
  })

  return {
    start,
    stop,
    status: snapshot,
    dispose: stop,
  }
}
