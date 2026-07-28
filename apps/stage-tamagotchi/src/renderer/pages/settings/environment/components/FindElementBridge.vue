<script setup lang="ts">
import type { FindElementRequestPayload, FindElementResultPayload } from '../../../../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { getElectronEventaContext, useElectronEventaInvoke } from '@kitsune/electron-vueuse'
import { useVisionInference } from '@kitsune/stage-ui/composables'
import { onScopeDispose } from 'vue'

import {
  electronFindElementRequest,
  electronFindElementResult,
} from '../../../../../shared/eventa'

interface DetectedElement {
  label: string
  type: string
  x: number
  y: number
  width: number
  height: number
  confidence: number
}

/**
 * 无 UI 的 Find Element Bridge。
 *
 * 监听主进程下发的 `electronFindElementRequest`（截图 + 元素描述），
 * 通过渲染进程多模态 LLM 做视觉元素定位，解析 JSON 结果后回传。
 */
const invokeFindElementResult = useElectronEventaInvoke(electronFindElementResult)
const { runVisionInference } = useVisionInference()

let eventaContext: ReturnType<typeof getElectronEventaContext> | undefined
try {
  eventaContext = getElectronEventaContext()
}
catch (e) {
  console.warn('[find-element] IPC bridge unavailable', errorMessageFrom(e) ?? 'unknown')
}

/**
 * findElement 的视觉推理 prompt。
 * 要求 LLM 返回结构化的 JSON 元素列表。
 */
const FIND_ELEMENT_PROMPT_TEMPLATE = (description: string) => [
  'You are a precise UI element detector.',
  `Analyze the screenshot and find all UI elements matching this description: "${description}"`,
  '',
  'Return a JSON array of detected elements. Each element must have:',
  '- label: element text or identifier',
  '- type: element type (button, input, menu, link, icon, text, tab, checkbox, dropdown, etc.)',
  '- x: center X coordinate in pixels',
  '- y: center Y coordinate in pixels',
  '- width: element width in pixels',
  '- height: element height in pixels',
  '- confidence: detection confidence (0.0 to 1.0)',
  '',
  'Return ONLY the JSON array, no explanation.',
  'If no matching elements found, return an empty array: []',
  'Example: [{"label":"Submit","type":"button","x":450,"y":300,"width":100,"height":40,"confidence":0.95}]',
].join('\n')

function parseDetectedElements(text: string): DetectedElement[] {
  const trimmed = text.trim()

  // 尝试多种方式提取 JSON 数组
  let jsonString = ''

  // 方式1: 直接匹配 JSON 数组（非贪婪，但处理嵌套）
  const jsonArrayMatch = trimmed.match(/\[[\s\S]*\]/)
  if (jsonArrayMatch) {
    jsonString = jsonArrayMatch[0]
  }

  // 方式2: 如果有代码块标记，提取代码块内容
  if (!jsonString) {
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
    if (codeBlockMatch) {
      const content = codeBlockMatch[1].trim()
      if (content.startsWith('[')) {
        jsonString = content
      }
    }
  }

  // 方式3: 查找第一个 [ 到最后一个 ] 之间的内容
  if (!jsonString) {
    const firstBracket = trimmed.indexOf('[')
    const lastBracket = trimmed.lastIndexOf(']')
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      jsonString = trimmed.slice(firstBracket, lastBracket + 1)
    }
  }

  if (!jsonString) {
    console.warn('[find-element] No JSON array found in response:', trimmed.slice(0, 200))
    return []
  }

  try {
    const parsed = JSON.parse(jsonString)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((el: any) =>
        typeof el === 'object'
        && el !== null
        && typeof el.x === 'number'
        && typeof el.y === 'number',
      )
      .map((el: any) => ({
        label: String(el.label ?? ''),
        type: String(el.type ?? 'unknown'),
        x: Math.round(el.x),
        y: Math.round(el.y),
        width: Math.round(el.width ?? 50),
        height: Math.round(el.height ?? 50),
        confidence: Math.min(1, Math.max(0, Number(el.confidence) || 0.5)),
      }))
  }
  catch (e) {
    console.warn('[find-element] Failed to parse JSON:', e)
    return []
  }
}

const offFindElement = eventaContext?.on(electronFindElementRequest, async (event) => {
  if (!event?.body) return

  const payload = event.body as FindElementRequestPayload
  const base: FindElementResultPayload = { requestId: payload.requestId, found: false, elements: [] }

  if (!payload.imageDataUrl) {
    await invokeFindElementResult({ ...base, reason: 'missing screenshot' })
    return
  }

  const prompt = FIND_ELEMENT_PROMPT_TEMPLATE(payload.description)

  try {
    const text = await runVisionInference({
      imageDataUrl: payload.imageDataUrl,
      workloadId: 'screen:ui-automation',
      promptOverride: prompt,
    })

    const elements = parseDetectedElements(text)
    await invokeFindElementResult({
      ...base,
      found: elements.length > 0,
      elements,
      reason: elements.length > 0
        ? `found ${elements.length} element(s)`
        : 'no matching elements found',
    })
  }
  catch (e) {
    await invokeFindElementResult({
      ...base,
      reason: `vision inference failed: ${errorMessageFrom(e) ?? 'unknown error'}`,
    }).catch(err =>
      console.error('[find-element] failed to send error result:', errorMessageFrom(err) ?? 'unknown'),
    )
  }
})

onScopeDispose(() => offFindElement?.())
</script>

<template>
  <span class="hidden" />
</template>
