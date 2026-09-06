<script setup lang="ts">
import { useElectronEventaInvoke } from '@kitsune/electron-vueuse'
import { OnboardingScreen } from '@kitsune/stage-ui/components'
import { useOnboardingStore } from '@kitsune/stage-ui/stores/onboarding'
import { useTheme } from '@kitsune/ui'
import { computed } from 'vue'

import { electronOnboardingClose } from '../../shared/eventa'

const onboardingStore = useOnboardingStore()
const { isDark } = useTheme()
const closeWindow = useElectronEventaInvoke(electronOnboardingClose)

const bgClass = computed(() => isDark.value ? 'bg-[#0f0f0f]' : 'bg-white')
const extraSteps = computed(() => {
  return []
})

async function handleSkipped() {
  onboardingStore.markSetupSkipped()
  await closeWindow()
}

async function handleConfigured() {
  onboardingStore.markSetupCompleted()
  await closeWindow()
}
</script>

<template>
  <!-- Same flex/min-h-0 chain as OnboardingDialog so model step grid scrolls inside the viewport (not the whole page). -->
  <div
    class="onboarding-root h-full min-h-0 w-full flex flex-col overflow-hidden overscroll-none"
    :class="bgClass"
  >
    <div class="min-h-8 w-full flex-shrink-0 select-none drag-region" :class="bgClass" />
    <div class="onboarding-scroll min-h-0 w-full flex flex-1 flex-col overflow-hidden px-10">
      <div class="onboarding-content min-h-0 flex flex-1 flex-col overflow-hidden">
        <OnboardingScreen :extra-steps="extraSteps" @skipped="handleSkipped" @configured="handleConfigured" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.onboarding-root {
  scrollbar-width: none;
}

.onboarding-root::-webkit-scrollbar {
  display: none;
}

.onboarding-content {
  padding: 8px 0 20px 0;
}

.onboarding-scroll {
  padding-top: 8px;
  padding-bottom: 20px;
}
</style>

<route lang="yaml">
meta:
  layout: plain
</route>
