<script setup lang="ts">
import type { CoordinatorAgentStatusView, UsageSnapshot } from '../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@kitsune/electron-vueuse'
import { useWindowFocus } from '@vueuse/core'
import { shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  electronCoordinatorTeam,
  electronExecutorStatus,
  electronOverseerStatus,
  electronSpotlightHide,
  electronSpotlightShowResultNotification,
  electronUsageSnapshot,
} from '../../shared/eventa'
import { useChatSyncStore } from '../stores/chat-sync'

const messageInput = shallowRef('')
const isComposing = shallowRef(false)
const sending = shallowRef(false)
const inputRef = useTemplateRef<HTMLInputElement>('inputRef')

const chatSyncStore = useChatSyncStore()
const hideSpotlightWindow = useElectronEventaInvoke(electronSpotlightHide)
const showResultNotification = useElectronEventaInvoke(electronSpotlightShowResultNotification)
const invokeUsageSnapshot = useElectronEventaInvoke(electronUsageSnapshot)
const invokeExecutorStatus = useElectronEventaInvoke(electronExecutorStatus)
const invokeOverseerStatus = useElectronEventaInvoke(electronOverseerStatus)
const invokeCoordinatorTeam = useElectronEventaInvoke(electronCoordinatorTeam)
const { t } = useI18n()

// ── 小部件数据：token 消耗 / 执行工作流 / dsh 派工（与 inlay 窗口同源）──
const usageSnapshot = shallowRef<UsageSnapshot | null>(null)
const executorRunning = shallowRef(false)
const executorCurrentTask = shallowRef<string | null>(null)
const executorPlanTitle = shallowRef('')
const overseerEnabled = shallowRef(false)
const dshOnline = shallowRef(false)
const dshPushed = shallowRef(0)

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

function formatTokens(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)
    return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

watch(useWindowFocus(), (focused) => {
  if (!focused) {
    messageInput.value = ''
    return
  }
  requestAnimationFrame(() => inputRef.value?.focus())
  void refreshWidgets()
})

async function handleSend() {
  if (isComposing.value || sending.value)
    return

  const text = messageInput.value.trim()
  if (!text)
    return

  messageInput.value = ''
  sending.value = true

  try {
    await hideSpotlightWindow()
    const result = await chatSyncStore.requestSpotlightIngest({ text })
    await showResultNotification({
      body: result.visibleText.trim(),
    })
  }
  catch (error) {
    await showResultNotification({
      body: t('tamagotchi.spotlight.errors.prefix', {
        message: errorMessageFrom(error) ?? t('tamagotchi.spotlight.errors.unknown'),
      }),
    })
  }
  finally {
    sending.value = false
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    void hideSpotlightWindow()
    return
  }

  if (event.key !== 'Enter' || isComposing.value)
    return

  event.preventDefault()
  void handleSend()
}

void refreshWidgets()
</script>

<template>
  <main
    :class="[
      'h-full w-full',
      'flex flex-col gap-2 overflow-y-auto',
      'bg-transparent px-5 py-4',
    ]"
  >
    <!-- 小部件：token 消耗 / 执行工作流 / dsh 状态 -->
    <div class="grid shrink-0 grid-cols-3 gap-2">
      <section class="rounded-xl border border-black/5 bg-white/80 p-2.5 shadow-sm dark:border-white/10 dark:bg-neutral-900/80">
        <div class="text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {{ t('tamagotchi.inlay.widgets.token-title', 'Token 消耗') }}
        </div>
        <div class="mt-1 text-lg font-semibold leading-tight text-neutral-900 dark:text-neutral-100">
          {{ formatTokens(usageSnapshot?.today?.totalTokens ?? 0) }}
        </div>
        <div class="mt-0.5 truncate text-[10px] text-neutral-500 dark:text-neutral-400">
          {{ t('tamagotchi.inlay.widgets.token-today', '今日') }} · {{ usageSnapshot?.today?.requests ?? 0 }}
          {{ t('tamagotchi.inlay.widgets.requests', '次请求') }}
        </div>
        <div class="truncate text-[10px] text-neutral-500 dark:text-neutral-500">
          {{ t('tamagotchi.inlay.widgets.token-total', '累计') }} {{ formatTokens(usageSnapshot?.total?.totalTokens ?? 0) }}
        </div>
      </section>

      <section class="rounded-xl border border-black/5 bg-white/80 p-2.5 shadow-sm dark:border-white/10 dark:bg-neutral-900/80">
        <div class="text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {{ t('tamagotchi.inlay.widgets.workflow-title', '执行工作流') }}
        </div>
        <div class="mt-1 text-lg font-semibold leading-tight text-neutral-900 dark:text-neutral-100">
          {{ executorRunning ? t('tamagotchi.inlay.widgets.running', '运行中') : t('tamagotchi.inlay.widgets.idle', '空闲') }}
        </div>
        <div class="mt-0.5 truncate text-[10px] text-neutral-500 dark:text-neutral-400">
          {{ executorPlanTitle || t('tamagotchi.inlay.widgets.no-plan', '暂无计划') }}
        </div>
        <div class="truncate text-[10px] text-neutral-500 dark:text-neutral-500">
          {{ executorRunning && executorCurrentTask ? t('tamagotchi.inlay.widgets.current-task', '当前任务') : '' }}
          {{ executorCurrentTask?.slice(0, 18) ?? '' }}
        </div>
      </section>

      <section class="rounded-xl border border-black/5 bg-white/80 p-2.5 shadow-sm dark:border-white/10 dark:bg-neutral-900/80">
        <div class="text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {{ t('tamagotchi.inlay.widgets.dsh-title', 'dsh 派工') }}
        </div>
        <div class="mt-1 text-lg font-semibold leading-tight text-neutral-900 dark:text-neutral-100">
          {{ dshOnline ? t('tamagotchi.inlay.widgets.online', '在线') : t('tamagotchi.inlay.widgets.offline', '离线') }}
        </div>
        <div class="mt-0.5 text-[10px] text-neutral-500 dark:text-neutral-400">
          {{ t('tamagotchi.inlay.widgets.pushed', '已派发') }} {{ dshPushed }}
        </div>
      </section>
    </div>

    <div
      :class="[
        'spotlight-card relative shrink-0 overflow-hidden',
        'min-h-14 w-full',
        'flex items-center px-6',
        'rounded-full',
        'bg-white/88 dark:bg-neutral-900/88',
        'backdrop-blur-3xl backdrop-saturate-150',
        'shadow-lg shadow-black/20',
        'ring-1 ring-black/5 dark:ring-white/10',
      ]"
    >
      <input
        ref="inputRef"
        v-model="messageInput"
        :disabled="sending"
        autofocus
        type="text"
        :placeholder="t('tamagotchi.stage.spotlight.placeholder')"
        :class="[
          'relative z-1',
          'w-full bg-transparent',
          'text-lg outline-none',
          'text-neutral-900 dark:text-neutral-50',
          'placeholder:text-neutral-400 dark:placeholder:text-neutral-500',
        ]"
        @compositionstart="isComposing = true"
        @compositionend="isComposing = false"
        @keydown="handleKeydown"
      >
    </div>
  </main>
</template>

<style scoped>
.spotlight-card::before {
  pointer-events: none;
  --at-apply: 'bg-gradient-to-r from-primary-500/25 via-primary-500/12 to-transparent dark:from-primary-400/25 dark:via-primary-400/12 dark:to-transparent';
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 85%;
  height: 100%;
  mask-image: linear-gradient(120deg, white 100%);
}

.spotlight-card::after {
  pointer-events: none;
  --at-apply: 'bg-dotted-[primary-300/35] dark:bg-dotted-[primary-200/16]';
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  background-size: 10px 10px;
  content: '';
  mask-image: linear-gradient(165deg, white 30%, transparent 55%);
}
</style>

<route lang="yaml">
meta:
  layout: stage
</route>
