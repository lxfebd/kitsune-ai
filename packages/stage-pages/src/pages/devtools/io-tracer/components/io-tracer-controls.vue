<script setup lang="ts">
import type { IOSubsystem } from '@kitsune/stage-shared'

import { Button } from '@kitsune/ui'
import { useI18n } from 'vue-i18n'

import { SUBSYSTEM_CONFIG_MAP, SUBSYSTEM_CONFIGS } from '../io-tracer-types'

const { t } = useI18n()

defineProps<{
  isRecording: boolean
  turnCount: number
  spanCount: number
  hiddenSubsystems: Set<IOSubsystem>
}>()

const emit = defineEmits<{
  toggleRecording: []
  clear: []
  autoFit: []
  toggleSubsystem: [subsystem: IOSubsystem]
  exportOtlp: []
}>()

const subsystemFilters = SUBSYSTEM_CONFIGS.map(config => ({
  subsystem: config.subsystem,
  label: config.label,
}))
</script>

<template>
  <div :class="['flex items-center gap-2', 'px-3 py-2', 'border-b border-neutral-200 dark:border-neutral-700']">
    <Button
      :class="[
        'flex items-center gap-1.5',
      ]"
      :variant="isRecording ? 'danger' : 'primary'"
      @click="emit('toggleRecording')"
    >
      <div
        :class="[
          'w-2.5 h-2.5 rounded-full',
          isRecording ? 'bg-red-500 animate-pulse' : 'bg-neutral-400',
        ]"
      />
      {{ isRecording ? t('tamagotchi.settings.devtools.pages.io-tracer.stop') : t('tamagotchi.settings.devtools.pages.io-tracer.record') }}
    </Button>

    <Button
      :disabled="turnCount === 0"
      @click="emit('clear')"
    >
      <div class="i-solar:trash-bin-trash-bold-duotone h-4 w-4" />
      {{ t('tamagotchi.settings.devtools.pages.io-tracer.clear') }}
    </Button>

    <Button
      :disabled="turnCount === 0"
      @click="emit('autoFit')"
    >
      <div class="i-solar:maximize-square-bold-duotone h-4 w-4" />
      {{ t('tamagotchi.settings.devtools.pages.io-tracer.fit') }}
    </Button>

    <!-- Subsystem Toggles -->
    <div :class="['w-px h-4 bg-neutral-200 dark:bg-neutral-700 mx-1']" />
    <span :class="['text-2.5 text-neutral-400']">{{ t('tamagotchi.settings.devtools.pages.io-tracer.subsystems') }}</span>
    <button
      v-for="item in subsystemFilters"
      :key="item.subsystem"
      :class="[
        'text-2.5 px-1.5 py-0.5 rounded',
        'border',
        hiddenSubsystems.has(item.subsystem)
          ? 'border-neutral-200 dark:border-neutral-700 text-neutral-400 bg-transparent'
          : 'border-transparent text-white',
      ]"
      :style="hiddenSubsystems.has(item.subsystem) ? {} : { backgroundColor: SUBSYSTEM_CONFIG_MAP.get(item.subsystem)?.color }"
      @click="emit('toggleSubsystem', item.subsystem)"
    >
      {{ item.label }}
    </button>

    <div :class="['w-px h-4 bg-neutral-200 dark:bg-neutral-700 mx-1']" />

    <Button
      :disabled="spanCount === 0"
      @click="emit('exportOtlp')"
    >
      <div class="i-solar:export-bold-duotone h-4 w-4" />
      {{ t('tamagotchi.settings.devtools.pages.io-tracer.export-otlp') }}
    </Button>

    <div :class="['flex-1']" />

    <span :class="['text-xs text-neutral-400']">
      {{ turnCount }} {{ turnCount !== 1 ? t('tamagotchi.settings.devtools.pages.io-tracer.turns') : t('tamagotchi.settings.devtools.pages.io-tracer.turn') }}
      · {{ spanCount }} {{ spanCount !== 1 ? t('tamagotchi.settings.devtools.pages.io-tracer.spans') : t('tamagotchi.settings.devtools.pages.io-tracer.span') }}
    </span>
  </div>
</template>
