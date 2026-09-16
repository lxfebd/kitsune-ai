<script setup lang="ts">
import DoctorPanel from '../environment/components/DoctorPanel.vue'
</script>

<template>
  <div flex="~ col gap-4">
    <!-- DoctorPanel 自带「健康检查」区块标题，页面级标题不再重复渲染。 -->
    <DoctorPanel />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.environment.doctor.title
  subtitleKey: settings.title
  settingsEntry: true
  order: 9
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>