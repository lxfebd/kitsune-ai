<script setup lang="ts">
import type { VisionCheckRequestPayload, VisionCheckResult } from '../../../../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { getElectronEventaContext, useElectronEventaInvoke } from '@kitsune/electron-vueuse'
import { buildVerifyPrompt, useVisionInference } from '@kitsune/stage-ui/composables'
import { useVisionStore } from '@kitsune/stage-ui/stores/modules/vision'
import { onScopeDispose } from 'vue'

import {
  electronOverseerVisionCheck,
  electronOverseerVisionCheckResult,
} from '../../../../../shared/eventa'
import { parseVerification } from './vision-verdict'

// 渲染进程无独立 fileLogger，统一收敛诊断日志（带前缀 + 结构化字段）
function logVisionCheck(level: 'warn' | 'error', message: string, fields?: Record<string, unknown>): void {
  const line = `[vision-check] ${message}${fields ? ` ${JSON.stringify(fields)}` : ''}`
  if (level === 'warn')
    console.warn(line)
  else
    console.error(line)
}

/**
 * 无 UI 的 Vision Check Bridge。
 *
 * 监听主进程下发的 `electronOverseerVisionCheck`（截图 + 预期描述），
 * 通过已初始化的渲染进程多模态 LLM 做真实视觉对比，解析 PASS/FAIL 后回传。
 * 替代原先的 auto-pass STUB，使 overseer 联动校验循环能真正判断预期是否达成。
 */
const invokeVisionCheckResult = useElectronEventaInvoke(electronOverseerVisionCheckResult)
const { runVisionInference } = useVisionInference()
const visionStore = useVisionStore()

let eventaContext: ReturnType<typeof getElectronEventaContext> | undefined
try {
  eventaContext = getElectronEventaContext()
}
catch (e) {
  logVisionCheck('warn', 'IPC bridge unavailable', { error: errorMessageFrom(e) ?? 'unknown' })
}

const offVisionCheck = eventaContext?.on(electronOverseerVisionCheck, async (event) => {
  if (!event?.body)
    return
  const payload = event.body as VisionCheckRequestPayload
  const base: Omit<VisionCheckResult, 'passed' | 'reason'> = { requestId: payload.requestId }

  if (!payload.imageDataUrl) {
    await invokeVisionCheckResult({ ...base, passed: false, reason: 'missing screenshot for vision check' })
    return
  }

  // 视觉模型未配置时直接跳过校验（判定通过），避免无谓超时阻塞联动修正循环。
  // 这让"没有视觉能力"的场景不会因等待超时而被误判为校验失败。
  if (!visionStore.configured) {
    await invokeVisionCheckResult({ ...base, passed: true, reason: 'vision model not configured, skip visual check' })
    return
  }

  // verify prompt 抽自 use-vision-workloads 的 VISION_VERIFY_PROMPT，避免与 workload 双重维护
  const prompt = buildVerifyPrompt(payload.expectedDescription ?? '')

  try {
    const text = await runVisionInference({
      imageDataUrl: payload.imageDataUrl,
      workloadId: 'screen:verify',
      promptOverride: prompt,
    })
    const verdict = parseVerification(text)
    // 未识别时仍按"未通过"回传（保守），但多打日志以便定位 LLM 措辞漂移
    if (verdict.unrecognized)
      logVisionCheck('warn', 'unrecognized verdict, treating as fail', { snippet: text.slice(0, 200) })
    await invokeVisionCheckResult({ ...base, passed: verdict.passed, reason: verdict.reason })
  }
  catch (e) {
    await invokeVisionCheckResult({
      ...base,
      passed: false,
      reason: `vision inference failed: ${errorMessageFrom(e) ?? 'unknown error'}`,
    }).catch((err: any) => logVisionCheck('error', 'failed to send fallback result', { error: errorMessageFrom(err) ?? 'unknown' }))
  }
})

onScopeDispose(() => offVisionCheck?.())
</script>

<template>
  <span class="hidden" />
</template>
