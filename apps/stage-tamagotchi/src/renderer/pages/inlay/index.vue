<script setup lang="ts">
import type { BackgroundMaterialType, VibrancyType } from '@kitsune/electron-eventa'
import type { CoordinatorAgentStatusView, UsageSnapshot } from '../../../shared/eventa'

import { electron } from '@kitsune/electron-eventa'
import { getElectronEventaContext, useElectronEventaInvoke } from '@kitsune/electron-vueuse'
import { FieldCombobox } from '@kitsune/ui'
import { onScopeDispose, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  electronCoordinatorTeam,
  electronExecutorEvent,
  electronExecutorStatus,
  electronUsageChanged,
  electronUsageSnapshot,
  electronOverseerStatus,
} from '../../../shared/eventa'

const setVibrancy = useElectronEventaInvoke(electron.window.setVibrancy)
const setBackgroundMaterial = useElectronEventaInvoke(electron.window.setBackgroundMaterial)
const invokeUsageSnapshot = useElectronEventaInvoke(electronUsageSnapshot)
const invokeExecutorStatus = useElectronEventaInvoke(electronExecutorStatus)
const invokeOverseerStatus = useElectronEventaInvoke(electronOverseerStatus)
const invokeCoordinatorTeam = useElectronEventaInvoke(electronCoordinatorTeam)
const { t } = useI18n()

const vibrancy = ref<NonNullable<VibrancyType>>()
const backgroundMaterial = ref<NonNullable<BackgroundMaterialType>>()

// ── 小部件数据 ──
const usageSnapshot = ref<UsageSnapshot | null>(null)
const executorRunning = ref(false)
const executorCurrentTask = ref<string | null>(null)
const executorPlanTitle = ref('')
const overseerEnabled = ref(false)
const dshOnline = ref(false)
const dshPushed = ref(0)

let eventaContext: ReturnType<typeof getElectronEventaContext> | undefined
try {
  eventaContext = getElectronEventaContext()
}
catch {
  // IPC bridge 不可用时小部件静默降级
}

async function refreshWidgets() {
  usageSnapshot.value = (await invokeUsageSnapshot()) ?? null
  try {
    const exec = await invokeExecutorStatus()
    executorRunning.value = !!exec?.isRunning
    executorCurrentTask.value = exec?.currentTaskId ?? null
    executorPlanTitle.value = exec?.plan?.requirement ?? ''
  }
  catch {
    // 状态查询失败不影响小部件
  }
  try {
    const status = await invokeOverseerStatus()
    overseerEnabled.value = !!status?.enabled
  }
  catch {
    // 忽略
  }
  try {
    const team: CoordinatorAgentStatusView[] = (await invokeCoordinatorTeam()) ?? []
    const dsh = team.find(m => m.id === 'dsh')
    dshOnline.value = !!dsh?.online
    dshPushed.value = team.reduce((acc, m) => acc + (m.lastOutcome ? 1 : 0), 0)
  }
  catch {
    // 忽略
  }
}

const offUsageChanged = eventaContext?.on(electronUsageChanged, (event) => {
  if (event?.body)
    usageSnapshot.value = event.body
})
const offExecutorEvent = eventaContext?.on(electronExecutorEvent, () => {
  void refreshWidgets()
})
onScopeDispose(() => {
  offUsageChanged?.()
  offExecutorEvent?.()
})

void refreshWidgets()

function formatTokens(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)
    return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

watch(
  vibrancy,
  (newVibrancy) => {
    setVibrancy([newVibrancy ?? null])
  },
)

watch(
  backgroundMaterial,
  (newBackgroundMaterial) => {
    if (!newBackgroundMaterial)
      return

    setBackgroundMaterial([newBackgroundMaterial])
  },
)
</script>

<template>
  <div class="p-4">
    <div class="drag-region" />

    <div class="py-4">
      <h1>{{ t('tamagotchi.inlay.title', 'Spotlight') }}</h1>
      <p>{{ t('tamagotchi.inlay.description', 'This is the Spotlight page.') }}</p>
    </div>

    <!-- 小部件：token 消耗 / 执行工作流 / dsh 状态 -->
    <div class="mb-4 grid grid-cols-3 gap-2">
      <section class="rounded-xl border border-white/10 bg-white/5 p-2.5 backdrop-blur-md">
        <div class="text-[10px] font-medium uppercase tracking-wide text-neutral-400">
          {{ t('tamagotchi.inlay.widgets.token-title', 'Token 消耗') }}
        </div>
        <div class="mt-1 text-lg font-semibold leading-tight text-neutral-100">
          {{ formatTokens(usageSnapshot?.today?.totalTokens ?? 0) }}
        </div>
        <div class="mt-0.5 text-[10px] text-neutral-400">
          {{ t('tamagotchi.inlay.widgets.token-today', '今日') }} · {{ usageSnapshot?.today?.requests ?? 0 }}
          {{ t('tamagotchi.inlay.widgets.requests', '次请求') }}
        </div>
        <div class="text-[10px] text-neutral-500">
          {{ t('tamagotchi.inlay.widgets.token-total', '累计') }} {{ formatTokens(usageSnapshot?.total?.totalTokens ?? 0) }}
        </div>
      </section>

      <section class="rounded-xl border border-white/10 bg-white/5 p-2.5 backdrop-blur-md">
        <div class="text-[10px] font-medium uppercase tracking-wide text-neutral-400">
          {{ t('tamagotchi.inlay.widgets.workflow-title', '执行工作流') }}
        </div>
        <div class="mt-1 text-lg font-semibold leading-tight text-neutral-100">
          {{ executorRunning ? t('tamagotchi.inlay.widgets.running', '运行中') : t('tamagotchi.inlay.widgets.idle', '空闲') }}
        </div>
        <div class="mt-0.5 truncate text-[10px] text-neutral-400">
          {{ executorPlanTitle || t('tamagotchi.inlay.widgets.no-plan', '暂无计划') }}
        </div>
        <div class="truncate text-[10px] text-neutral-500">
          {{ executorRunning && executorCurrentTask ? t('tamagotchi.inlay.widgets.current-task', '当前任务') : '' }}
          {{ executorCurrentTask?.slice(0, 18) ?? '' }}
        </div>
      </section>

      <section class="rounded-xl border border-white/10 bg-white/5 p-2.5 backdrop-blur-md">
        <div class="text-[10px] font-medium uppercase tracking-wide text-neutral-400">
          {{ t('tamagotchi.inlay.widgets.dsh-title', 'dsh 派工') }}
        </div>
        <div class="mt-1 text-lg font-semibold leading-tight text-neutral-100">
          {{ dshOnline ? t('tamagotchi.inlay.widgets.online', '在线') : t('tamagotchi.inlay.widgets.offline', '离线') }}
        </div>
        <div class="mt-0.5 text-[10px] text-neutral-400">
          {{ t('tamagotchi.inlay.widgets.pushed', '已派发') }} {{ dshPushed }}
        </div>
      </section>
    </div>

    <div class="space-y-2">
      <FieldCombobox
        v-model="vibrancy"
        :label="t('tamagotchi.inlay.vibrancy-label', 'Vibrancy')"
        :description="t('tamagotchi.inlay.vibrancy-desc', 'Set the vibrancy effect of the window.')"
        :options="[
          { label: 'titlebar', value: 'titlebar' },
          { label: 'selection', value: 'selection' },
          { label: 'menu', value: 'menu' },
          { label: 'popover', value: 'popover' },
          { label: 'sidebar', value: 'sidebar' },
          { label: 'header', value: 'header' },
          { label: 'sheet', value: 'sheet' },
          { label: 'window', value: 'window' },
          { label: 'hud', value: 'hud' },
          { label: 'fullscreen-ui', value: 'fullscreen-ui' },
          { label: 'tooltip', value: 'tooltip' },
          { label: 'content', value: 'content' },
          { label: 'under-window', value: 'under-window' },
          { label: 'under-page', value: 'under-page' },
        ]"
      />

      <FieldCombobox
        v-model="backgroundMaterial"
        :label="t('tamagotchi.inlay.material-label', 'Background Material')"
        :description="t('tamagotchi.inlay.material-desc', 'Set the background material of the window.')"
        :options="[
          { label: 'auto', value: 'auto' },
          { label: 'none', value: 'none' },
          { label: 'mica', value: 'mica' },
          { label: 'acrylic', value: 'acrylic' },
          { label: 'tabbed', value: 'tabbed' },
        ]"
      />
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: plain
</route>
