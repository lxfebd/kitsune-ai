<script setup lang="ts">
import type { InferenceModelStatus } from '../../../composables/use-inference-status'

import { useInferenceStatus } from '../../../composables/use-inference-status'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const {
  models,
  isAnyLoading,
} = useInferenceStatus()

const LOADING_STATES = new Set(['downloading', 'loading', 'compiling', 'warming-up'])

function isLoading(m: InferenceModelStatus): boolean {
  return LOADING_STATES.has(m.state)
}

function modelLabel(m: InferenceModelStatus): string {
  switch (m.modelId) {
    case 'whisper-small':
      return 'Whisper (ASR)'
    case 'kokoro-82m':
      return 'Kokoro (TTS)'
    case 'modnet':
      return 'Background Removal'
    default:
      return m.modelId
  }
}

function stateLabel(m: InferenceModelStatus): string {
  switch (m.state) {
    case 'downloading':
      return t('base.toaster.inferenceProgress.state.downloading')
    case 'loading':
      return t('base.toaster.inferenceProgress.state.loading')
    case 'compiling':
      return t('base.toaster.inferenceProgress.state.compiling')
    case 'warming-up':
      return t('base.toaster.inferenceProgress.state.warmingUp')
    case 'ready':
      return t('base.toaster.inferenceProgress.state.ready')
    case 'error':
      return t('base.toaster.inferenceProgress.state.error')
    default:
      return m.state
  }
}

function percentOf(m: InferenceModelStatus): number {
  const p = m.progress?.percent ?? -1
  if (p < 0 || Number.isNaN(p))
    return -1
  return Math.min(100, Math.max(0, Math.round(p)))
}

function bytes(loaded?: number, total?: number): string | null {
  if (loaded == null || total == null)
    return null
  const fmt = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${fmt(loaded)} / ${fmt(total)}`
}

const visibleModels = computed(() =>
  models.value.filter(m => isLoading(m) || m.state === 'error'),
)
</script>

<template>
  <div
    v-if="isAnyLoading || visibleModels.length > 0"
    :class="[
      'fixed bottom-4 right-4 z-[1000] w-[320px] max-w-[calc(100vw-2rem)]',
      'flex flex-col gap-2',
      'pointer-events-none',
    ]"
  >
    <div
      v-for="m in visibleModels"
      :key="m.modelId"
      :class="[
        'pointer-events-auto',
        'rounded-2xl px-4 py-3 shadow-md backdrop-blur-md',
        'bg-neutral-100/85 dark:bg-neutral-800/85',
        'border border-neutral-200/70 dark:border-neutral-700/70',
        'flex flex-col gap-2',
      ]"
    >
      <div flex items-center justify-between gap-2>
        <div flex items-center gap-2 text-sm font-medium>
          <div
            v-if="isLoading(m)"
            i-svg-spinners:bars-scale
          />
          <div
            v-else-if="m.state === 'ready'"
            i-solar:check-circle-bold-duotone text="green-600 dark:green-400"
          />
          <div
            v-else
            i-solar:danger-triangle-bold-duotone text="red-600 dark:red-400"
          />
          <span>{{ modelLabel(m) }}</span>
        </div>
        <div text-xs text="neutral-500 dark:neutral-400">
          {{ stateLabel(m) }}
        </div>
      </div>

      <div v-if="isLoading(m)" flex flex-col gap-1>
        <div
          :class="[
            'h-1.5 w-full overflow-hidden rounded-full',
            'bg-neutral-300/70 dark:bg-neutral-600/70',
          ]"
        >
          <div
            class="h-full rounded-full bg-blue-500 transition-[width] duration-300 ease-out"
            :style="{ width: percentOf(m) < 0 ? '100%' : `${percentOf(m)}%` }"
          >
            <div
              v-if="percentOf(m) < 0"
              class="h-full w-full animate-pulse bg-blue-400/60"
            />
          </div>
        </div>
        <div
          v-if="percentOf(m) >= 0 || bytes(m.progress?.loaded, m.progress?.total)"
          flex items-center justify-between text-xs text="neutral-500 dark:neutral-400"
        >
          <span>{{ percentOf(m) >= 0 ? `${percentOf(m)}%` : '' }}</span>
          <span v-if="bytes(m.progress?.loaded, m.progress?.total)">
            {{ bytes(m.progress?.loaded, m.progress?.total) }}
          </span>
        </div>
      </div>

      <div
        v-if="m.state === 'error' && m.error?.message"
        text-xs text="red-600 dark:red-400"
      >
        {{ m.error.message }}
      </div>
    </div>
  </div>
</template>
