<script setup lang="ts">
// Sidecar 管理页面 — ComfyUI 和 TTS 子系统
import ComfyuiSection from './comfyui-section.vue'
import TtsSection from './tts-section.vue'
</script>

<template>
  <div class="flex flex-col gap-6 p-4">
    <ComfyuiSection />
    <TtsSection />
  </div>

  <!-- Force UnoCSS icon scanning -->
  <div class="hidden" aria-hidden="true">
    <div class="i-solar:folder-bold-duotone" />
    <div class="i-solar:diskette-bold-duotone" />
    <div class="i-solar:link-bold-duotone" />
    <div class="i-solar:play-bold-duotone" />
    <div class="i-solar:stop-bold-duotone" />
    <div class="i-solar:server-bold-duotone" />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.sidecar.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.sidecar.description
  icon: i-solar:server-bold-duotone
  settingsEntry: true
  order: 9
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
