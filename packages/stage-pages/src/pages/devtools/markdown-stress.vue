<script setup lang="ts">
import { ButtonBar, Section } from '@kitsune/stage-ui/components'
import { useMarkdownStressStore } from '@kitsune/stage-ui/stores/markdown-stress'
import { Callout } from '@kitsune/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const stressStore = useMarkdownStressStore()
const { t } = useI18n()
const { capturing, events, isMock, lastRun, payloadPreview, scheduleDelayMs, runState } = storeToRefs(stressStore)

const previewText = computed(() => payloadPreview.value ?? '')
const lastRunSummary = computed(() => {
  if (!lastRun.value)
    return undefined

  return {
    events: lastRun.value.events.length,
    durationMs: (lastRun.value.stoppedAt - lastRun.value.startedAt).toFixed(0),
  }
})
const runSummary = computed(() => {
  const stateLabel = runState.value === 'running' ? t('tamagotchi.settings.devtools.pages.markdown-stress.state-running') : runState.value === 'scheduled' ? t('tamagotchi.settings.devtools.pages.markdown-stress.state-scheduled') : t('tamagotchi.settings.devtools.pages.markdown-stress.state-idle')
  const captureLabel = capturing.value ? t('tamagotchi.settings.devtools.pages.markdown-stress.yes') : t('tamagotchi.settings.devtools.pages.markdown-stress.no')
  return `${t('tamagotchi.settings.devtools.pages.markdown-stress.run')} ${stateLabel}, ${t('tamagotchi.settings.devtools.pages.markdown-stress.capturing')} ${captureLabel}, ${t('tamagotchi.settings.devtools.pages.markdown-stress.events')}: ${events.value.length}`
})

function toggleCapture() {
  if (capturing.value)
    stressStore.stopCapture()
  else
    stressStore.startCapture()
}

function toggleMode() {
  stressStore.toggleMockMode()
}
</script>

<template>
  <div class="grid gap-4 p-4 lg:grid-cols-[1.5fr_1fr]">
    <Section
      :title="t('settings.pages.system.sections.section.developer.sections.section.markdown-stress.title')"
      :description="t('settings.pages.system.sections.section.developer.sections.section.markdown-stress.description')"
      icon="i-solar:code-circle-bold-duotone"
      inner-class="gap-4"
    >
      <div class="flex flex-wrap gap-2">
        <ButtonBar
          class="w-full sm:w-auto"
          icon="i-solar:magic-stick-bold-duotone"
          :text="t('tamagotchi.settings.devtools.pages.markdown-stress.preview')"
          @click="stressStore.generatePreview()"
        >
          {{ t('tamagotchi.settings.devtools.pages.markdown-stress.generate-payload-preview') }}
        </ButtonBar>
        <ButtonBar
          class="w-full sm:w-auto"
          icon="i-solar:play-circle-bold-duotone"
          :text="runState === 'running' ? t('tamagotchi.settings.devtools.pages.markdown-stress.abort-run') : runState === 'scheduled' ? t('tamagotchi.settings.devtools.pages.markdown-stress.unschedule') : t('tamagotchi.settings.devtools.pages.markdown-stress.replay')"
          :disabled="!isMock && !stressStore.canRunOnline"
          @click="stressStore.scheduleRun()"
        >
          {{ runState === 'running' ? t('tamagotchi.settings.devtools.pages.markdown-stress.abort-now') : runState === 'scheduled' ? t('tamagotchi.settings.devtools.pages.markdown-stress.cancel-replay') : t('tamagotchi.settings.devtools.pages.markdown-stress.replay-to-provider') }}
        </ButtonBar>
        <ButtonBar
          class="w-full sm:w-auto"
          :icon="capturing ? 'i-solar:stop-circle-bold-duotone' : 'i-solar:recive-bold-duotone'"
          :text="t('tamagotchi.settings.devtools.pages.markdown-stress.capture')"
          @click="toggleCapture"
        >
          {{ capturing ? t('tamagotchi.settings.devtools.pages.markdown-stress.stop-capture') : t('tamagotchi.settings.devtools.pages.markdown-stress.start-capture') }}
        </ButtonBar>
        <ButtonBar
          class="w-full sm:w-auto"
          icon="i-solar:export-bold-duotone"
          :text="t('tamagotchi.settings.devtools.pages.markdown-stress.export')"
          :disabled="!lastRun?.events.length"
          @click="stressStore.exportCsv()"
        >
          {{ t('tamagotchi.settings.devtools.pages.markdown-stress.export-last-run') }}
        </ButtonBar>
        <ButtonBar
          class="w-full sm:w-auto"
          :icon="isMock ? 'i-solar:simplerockets-bold-duotone' : 'i-solar:cloud-bold-duotone'"
          :text="isMock ? t('tamagotchi.settings.devtools.pages.markdown-stress.mode-mock') : t('tamagotchi.settings.devtools.pages.markdown-stress.mode-live')"
          @click="toggleMode"
        >
          {{ isMock ? t('tamagotchi.settings.devtools.pages.markdown-stress.switch-to-live') : t('tamagotchi.settings.devtools.pages.markdown-stress.switch-to-mock') }}
        </ButtonBar>
      </div>

      <div class="grid gap-3 md:grid-cols-[auto_1fr] md:items-center">
        <label class="text-xs text-neutral-400">{{ t('tamagotchi.settings.devtools.pages.markdown-stress.schedule-delay') }}</label>
        <input
          v-model.number="scheduleDelayMs"
          type="number"
          min="0"
          class="max-w-[180px] w-full border border-neutral-700 rounded bg-neutral-900 px-2 py-1 text-sm text-neutral-100"
        >
      </div>

      <Callout :label="t('tamagotchi.settings.devtools.pages.markdown-stress.run-state')" theme="violet">
        <div class="text-xs text-neutral-200">
          {{ runSummary }}
        </div>
        <div class="text-xs text-neutral-500">
          {{ t('tamagotchi.settings.devtools.pages.markdown-stress.run-state-description') }}
        </div>
      </Callout>

      <Callout v-if="lastRunSummary" :label="t('tamagotchi.settings.devtools.pages.markdown-stress.last-run')" theme="orange">
        <div class="text-xs text-neutral-200">
          {{ lastRunSummary.events }} {{ t('tamagotchi.settings.devtools.pages.markdown-stress.events') }}, {{ t('tamagotchi.settings.devtools.pages.markdown-stress.duration') }} {{ lastRunSummary.durationMs }} ms
        </div>
        <div class="text-xs text-neutral-500">
          {{ t('tamagotchi.settings.devtools.pages.markdown-stress.export-last-run-description') }}
        </div>
      </Callout>
    </Section>

    <div class="border border-neutral-800/70 rounded-xl bg-neutral-900/60 p-4 shadow-sm lg:col-span-1 space-y-3">
      <div class="text-sm text-neutral-200">
        {{ t('tamagotchi.settings.devtools.pages.markdown-stress.live-traces') }}
      </div>
      <div class="text-xs text-neutral-400">
        {{ t('tamagotchi.settings.devtools.pages.markdown-stress.capturing') }}: {{ capturing ? t('tamagotchi.settings.devtools.pages.markdown-stress.yes') : t('tamagotchi.settings.devtools.pages.markdown-stress.no') }}, {{ t('tamagotchi.settings.devtools.pages.markdown-stress.events') }}: {{ events.length }}
      </div>
      <ul class="max-h-64 overflow-auto text-xs text-neutral-300 space-y-1">
        <li v-for="(event, idx) in events.slice(-20).reverse()" :key="idx">
          <span class="text-neutral-100 font-mono">{{ event.name }}</span>
          — {{ (event.duration ?? 0).toFixed(2) }} ms
          <span v-if="event.meta" class="text-neutral-500"> {{ JSON.stringify(event.meta) }}</span>
        </li>
      </ul>
    </div>

    <Section
      :title="t('tamagotchi.settings.devtools.pages.markdown-stress.payload-preview')"
      icon="i-solar:code-file-bold-duotone"
      inner-class="gap-3"
      class="lg:col-span-2"
    >
      <div class="text-xs text-neutral-300">
        {{ t('tamagotchi.settings.devtools.pages.markdown-stress.latest-payload') }}
      </div>

      <div v-if="previewText" class="border border-neutral-700 rounded-lg border-dashed bg-neutral-900/60 p-3 space-y-2">
        <pre class="max-h-60 overflow-auto whitespace-pre-wrap text-xs text-neutral-200">{{ previewText }}</pre>
      </div>
      <div v-else class="text-xs text-neutral-500">
        {{ t('tamagotchi.settings.devtools.pages.markdown-stress.generate-payload-hint') }}
      </div>
    </Section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.devtools.pages.markdown-stress.title
  subtitleKey: tamagotchi.settings.devtools.title
</route>
