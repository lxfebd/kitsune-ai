<script setup lang="ts">
import type { OverseerEvent, OverseerStatus, OverseerStats } from '../../../../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { getElectronEventaContext, useElectronEventaInvoke } from '@kitsune/electron-vueuse'
import { useModsServerChannelStore } from '@kitsune/stage-ui/stores/mods/api/channel-server'
import { Button, Callout } from '@kitsune/ui'
import { onScopeDispose, ref } from 'vue'

import {
  electronOverseerEvent,
  electronOverseerGuidanceReset,
  electronOverseerGuidanceState,
  electronOverseerGuidanceToggle,
  electronOverseerStats,
  electronOverseerStatus,
  electronOverseerToggle,
  type GuidanceRuntimeState,
} from '../../../../../shared/eventa'
import { useEnvironmentI18n } from './use-environment-i18n'

const { tn } = useEnvironmentI18n()
const invokeOverseerToggle = useElectronEventaInvoke(electronOverseerToggle)
const invokeOverseerStatus = useElectronEventaInvoke(electronOverseerStatus)
const invokeOverseerStats = useElectronEventaInvoke(electronOverseerStats)
const invokeGuidanceState = useElectronEventaInvoke(electronOverseerGuidanceState)
const invokeGuidanceToggle = useElectronEventaInvoke(electronOverseerGuidanceToggle)
const invokeGuidanceReset = useElectronEventaInvoke(electronOverseerGuidanceReset)

interface EventLogEntry {
  event: OverseerEvent
  /** 是否通过推送白名单（false = 被过滤，仅记录） */
  pushed: boolean
}

const PANEL = 'settings-panel'

const status = ref<OverseerStatus>({ enabled: false, running: false, tools: [], updatedAt: 0 })
const stats = ref<OverseerStats | null>(null)
const eventLog = ref<EventLogEntry[]>([])
const busy = ref(false)
const errorMessage = ref('')
const guidance = ref<GuidanceRuntimeState>({ enabled: true, records: [], lastGuidanceAt: {} })
const guidanceBusy = ref(false)

const SEVERITY_BADGE: Record<string, string> = {
  info: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  warn: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  error: 'bg-red-500/15 text-red-700 dark:text-red-300',
}

async function toggle() {
  busy.value = true
  errorMessage.value = ''
  try {
    const next = !status.value.enabled
    const result = await invokeOverseerToggle({ enabled: next })
    if (result)
      status.value.enabled = result.enabled
    await refreshStatus()
  }
  catch (e) {
    errorMessage.value = errorMessageFrom(e) ?? 'Unknown error'
  }
  finally {
    busy.value = false
  }
}

async function refreshStatus() {
  try {
    const s = await invokeOverseerStatus()
    if (s)
      status.value = s
  }
  catch {
    // 状态查询失败不影响页面
  }
}

async function refreshStats() {
  try {
    const s = await invokeOverseerStats()
    if (s)
      stats.value = s
  }
  catch {
    // 统计查询失败不影响页面
  }
}

async function refreshGuidance() {
  try {
    const s = await invokeGuidanceState()
    if (s)
      guidance.value = s
  }
  catch {
    // 指导状态查询失败不影响页面（旧版本主进程无此 IPC）
  }
}

async function toggleGuidance() {
  guidanceBusy.value = true
  try {
    const next = !guidance.value.enabled
    const result = await invokeGuidanceToggle({ enabled: next })
    if (result)
      guidance.value.enabled = result.enabled
    await refreshGuidance()
  }
  catch {
    // toggle 失败静默（主进程不可达）
  }
  finally {
    guidanceBusy.value = false
  }
}

async function resetGuidance() {
  guidanceBusy.value = true
  try {
    await invokeGuidanceReset()
    await refreshGuidance()
  }
  catch {
    // reset 失败静默
  }
  finally {
    guidanceBusy.value = false
  }
}

function formatEventTime(ts: number) {
  return new Date(ts).toLocaleTimeString()
}

function eventTitle(e: OverseerEvent): string {
  if (e.type === 'guidance') {
    const d = e.data as Record<string, unknown> | undefined
    const suggestion = d?.suggestion ?? d?.title
    if (typeof suggestion === 'string' && suggestion)
      return suggestion
  }
  return e.source || e.type
}

function guidanceSteps(e: OverseerEvent): string[] {
  const d = e.data as Record<string, unknown> | undefined
  const steps = d?.steps
  if (Array.isArray(steps))
    return steps.filter((s): s is string => typeof s === 'string')
  return []
}

function eventSummary(e: OverseerEvent): string {
  const d = e.data as Record<string, unknown> | undefined
  if (d && typeof d === 'object') {
    const tool = d.toolName ?? d.tool ?? d.source
    const msg = d.errorMessage ?? d.message ?? d.commandPreview
    if (typeof msg === 'string')
      return msg.slice(0, 120)
    if (tool)
      return String(tool)
  }
  return e.type
}

let eventaContext: ReturnType<typeof getElectronEventaContext> | undefined
try {
  eventaContext = getElectronEventaContext()
}
catch {
  // IPC bridge 不可用
}

/** 去重并入事件流；IPC 与 WS 两条通道可能重复送达 */
function pushEvent(event: OverseerEvent, pushed: boolean) {
  if (eventLog.value.some(entry => entry.event.id === event.id))
    return
  eventLog.value.unshift({ event, pushed })
  if (eventLog.value.length > 50)
    eventLog.value.pop()
  // 事件到达时刷新状态（延迟 100ms 等主进程状态更新完成）
  setTimeout(() => { refreshStatus(); refreshStats(); refreshGuidance() }, 100)
}

const offEvent = eventaContext?.on(electronOverseerEvent, (event) => {
  if (event?.body)
    pushEvent(event.body, true)
})

// 浏览器 view（无 Electron IPC 桥）通过 channel-server WS 订阅监工事件
const serverChannelStore = useModsServerChannelStore()
const offWsNotify = serverChannelStore.onEvent('spark:notify', (event) => {
  const payload = event.data?.payload as { kitsune_overseer?: boolean, pushed?: boolean, event?: OverseerEvent } | undefined
  if (payload?.kitsune_overseer && payload.event)
    pushEvent(payload.event, payload.pushed ?? false)
})

// 浏览器 view 兜底通道：pet-mcp-bridge 的本地 SSE（127.0.0.1:6122，无需鉴权）。
// WS 6121 需要 authToken，浏览器拿不到 token 连不上，故这里直接用 HTTP SSE。
let eventSource: EventSource | null = null
if (!eventaContext && typeof window !== 'undefined') {
  try {
    eventSource = new EventSource('http://127.0.0.1:6122/overseer/events')
    eventSource.onmessage = (ev: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(ev.data) as { event?: OverseerEvent, pushed?: boolean }
        if (payload.event)
          pushEvent(payload.event, payload.pushed ?? false)
      }
      catch {
        // 忽略无法解析的帧
      }
    }
  }
  catch {
    // SSE 不可用时静默降级（unref 环境或端口未起）
  }
}
onScopeDispose(() => {
  offEvent?.()
  offWsNotify()
  eventSource?.close()
})

refreshStatus()
refreshStats()
refreshGuidance()
</script>

<template>
  <section :class="PANEL">
    <Callout v-if="errorMessage" theme="orange" :label="tn('overseer.error-title')">
      {{ errorMessage }}
    </Callout>
    <div class="flex items-start justify-between gap-2">
      <div flex="~ col gap-1">
        <h3 class="text-sm font-semibold">
          {{ tn('overseer.title') }}
        </h3>
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ tn('overseer.description') }}
        </p>
      </div>
      <span
        :class="[
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase',
          status.running ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-neutral-400/20 text-neutral-600 dark:text-neutral-300',
        ]"
      >
        {{ status.running ? tn('overseer.status.running') : tn('overseer.status.stopped') }}
      </span>
    </div>

    <div class="flex items-center justify-between">
      <span class="text-xs text-neutral-600 dark:text-neutral-300">
        {{ tn('overseer.enable-label') }}
      </span>
      <Button
        :variant="status.enabled ? 'danger' : 'primary'"
        size="sm"
        :loading="busy"
        :label="status.enabled ? tn('overseer.disable') : tn('overseer.enable')"
        :icon="status.enabled ? 'i-solar:close-circle-bold-duotone' : 'i-solar:play-bold-duotone'"
        @click="toggle"
      />
    </div>

    <!-- 监听工具列表 -->
    <div v-if="status.tools.length" class="flex flex-col gap-1.5">
      <div class="text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {{ tn('overseer.tools-title') }}
      </div>
      <article
        v-for="tool in status.tools"
        :key="tool.id"
        :class="['flex items-center justify-between rounded-xl border px-3 py-2 text-xs', 'border-black/[0.06] dark:border-white/[0.06] bg-white/40 dark:bg-white/[0.02]']"
      >
        <span class="font-medium">{{ tool.name }}</span>
        <span :class="[
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
          tool.running ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-neutral-400/20 text-neutral-500',
        ]">
          {{ tool.running ? tn('overseer.tool-running') : tn('overseer.tool-idle') }}
        </span>
      </article>
    </div>

    <!-- 统计：事件量 -->
    <div v-if="stats" class="flex items-center gap-3 text-xs">
      <span class="rounded-full bg-neutral-400/15 px-2 py-0.5 text-neutral-600 dark:text-neutral-300">
        事件总数 {{ stats.eventsTotal }}
      </span>
      <span class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">
        已推送 {{ stats.eventsPushed }}
      </span>
      <span v-if="stats.eventsFiltered > 0" class="rounded-full bg-neutral-400/15 px-2 py-0.5 text-neutral-500">
        已过滤 {{ stats.eventsFiltered }}
      </span>
    </div>

    <!-- 操作指导 -->
    <div class="flex flex-col gap-1.5">
      <div class="flex items-start justify-between gap-2">
        <div flex="~ col gap-0.5">
          <div class="text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            {{ tn('overseer.guidance.title') }}
          </div>
          <p class="text-xs text-neutral-500 dark:text-neutral-400">
            {{ tn('overseer.guidance.description') }}
          </p>
        </div>
        <Button
          :variant="guidance.enabled ? 'primary' : 'danger'"
          size="sm"
          :loading="guidanceBusy"
          :label="guidance.enabled ? tn('overseer.guidance.enable') : tn('overseer.guidance.disable')"
          :icon="guidance.enabled ? 'i-solar:check-circle-bold-duotone' : 'i-solar:close-circle-bold-duotone'"
          @click="toggleGuidance"
        />
      </div>
      <div class="flex items-center gap-2 text-xs">
        <span class="rounded-full bg-neutral-400/15 px-2 py-0.5 text-neutral-600 dark:text-neutral-300">
          {{
            guidance.records.length
              ? tn('overseer.guidance.records-count', { count: guidance.records.length })
              : tn('overseer.guidance.empty-records')
          }}
        </span>
        <Button
          variant="ghost"
          size="sm"
          :loading="guidanceBusy"
          :label="tn('overseer.guidance.reset')"
          :icon="'i-solar:trash-bin-minimalistic-bold-duotone'"
          @click="resetGuidance"
        />
      </div>
    </div>

      <!-- 实时事件流 -->
      <div v-if="eventLog.length" class="flex flex-col gap-1.5">
        <div class="text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          实时事件流
        </div>
        <div class="max-h-64 overflow-y-auto flex flex-col gap-1">
          <article
            v-for="entry in eventLog"
            :key="entry.event.id"
            class="flex items-start gap-2 rounded-lg border border-black/[0.06] dark:border-white/[0.06] bg-white/40 dark:bg-white/[0.02] px-2.5 py-1.5 text-xs"
          >
            <span
              :class="[
                'shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide',
                SEVERITY_BADGE[entry.event.severity] ?? 'bg-neutral-400/15 text-neutral-600 dark:text-neutral-300',
              ]"
            >
              {{ entry.event.severity }}
            </span>
            <span class="shrink-0 font-mono text-[10px] text-neutral-400 dark:text-neutral-500">
              {{ formatEventTime(entry.event.timestamp) }}
            </span>
            <div class="min-w-0 flex-1">
              <span class="font-medium">{{ eventTitle(entry.event) }}</span>
              <span class="ml-1 text-neutral-500 dark:text-neutral-400">{{ eventSummary(entry.event) }}</span>
              <ol
                v-if="entry.event.type === 'guidance' && guidanceSteps(entry.event).length"
                class="mt-1 flex flex-col gap-0.5"
              >
                <li
                  v-for="(step, i) in guidanceSteps(entry.event)"
                  :key="i"
                  class="flex items-start gap-1 text-[11px] leading-snug text-neutral-600 dark:text-neutral-300"
                >
                  <span class="mt-px shrink-0 font-mono text-[9px] text-amber-600 dark:text-amber-400">{{ i + 1 }}.</span>
                  <span>
                    {{ step }}
                  </span>
                </li>
              </ol>
            </div>
            <span
              v-if="!entry.pushed"
              class="shrink-0 rounded-full bg-neutral-400/15 px-1.5 py-0.5 text-[9px] font-medium text-neutral-500"
            >
              filtered
            </span>
          </article>
        </div>
      </div>
  </section>
</template>