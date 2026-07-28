import type { OverseerEvent, OverseerEventType, OverseerSeverity } from '../../shared/eventa'

import { getElectronEventaContext } from '@kitsune/electron-vueuse'
import { onScopeDispose, ref, shallowRef } from 'vue'

import { electronOverseerEvent } from '../../shared/eventa'

export interface UseOverseerEventsOptions {
  /** 仅保留这些 severity 的事件；省略则全部保留 */
  severity?: OverseerSeverity[]
  /** 仅保留这些 type 的事件；省略则全部保留 */
  type?: OverseerEventType[]
  /** 缓存上限，避免无界增长 */
  maxEvents?: number
}

const defaultOptions = { maxEvents: 50 } satisfies Required<Pick<UseOverseerEventsOptions, 'maxEvents'>>

/**
 * 订阅 Overseer 事件流，按 severity 与 type 过滤后驱动桌宠反应。
 *
 * 返回 `events`（最近事件列表）与 `latest`（最近一条），组件卸载时自动解绑订阅。
 */
export function useOverseerEvents(options: UseOverseerEventsOptions = {}) {
  const { severity, type, maxEvents } = { ...defaultOptions, ...options }
  const events = shallowRef<OverseerEvent[]>([])
  const latest = ref<OverseerEvent | null>(null)

  function matches(event: OverseerEvent): boolean {
    if (severity && !severity.includes(event.severity))
      return false
    if (type && !type.includes(event.type))
      return false
    return true
  }

  const context = getElectronEventaContext()
  const off = context.on(electronOverseerEvent, (event) => {
    if (!event?.body)
      return
    const payload = event.body
    if (!matches(payload))
      return
    latest.value = payload
    const next = [payload, ...events.value]
    events.value = next.length > maxEvents ? next.slice(0, maxEvents) : next
  })

  onScopeDispose(() => {
    off?.()
  })

  return { events, latest }
}
