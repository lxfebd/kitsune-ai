<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import InteractiveArea from '../components/InteractiveArea.vue'
import WindowTitleBar from '../components/Window/TitleBar.vue'

const { t } = useI18n()
</script>

<template>
  <div class="h-full w-full flex flex-col bg-transparent">
    <WindowTitleBar
      :title="t('tamagotchi.stage.chat.title')"
      icon="i-solar:chat-line-bold"
    />
    <div class="flex-1 min-h-0 pt-[48px]">
      <InteractiveArea class="h-full w-full px-4 pb-2 transition-opacity duration-250" />
    </div>
  </div>
</template>

<style>
html, body, #app {
  background: transparent !important;
  overflow: hidden;
}
</style>

<route lang="yaml">
meta:
  layout: stage
</route>
