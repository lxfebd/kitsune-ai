<script setup lang="ts">
import ChatsSection from '@kitsune/stage-pages/pages/settings/data/components/chats-section.vue'
import DangerSection from '@kitsune/stage-pages/pages/settings/data/components/danger-section.vue'
import ModelsModulesSection from '@kitsune/stage-pages/pages/settings/data/components/models-modules-section.vue'
import StatusBanner from '@kitsune/stage-pages/pages/settings/data/components/status-banner.vue'

import { createDataSettingsStatusState } from '@kitsune/stage-pages/pages/settings/data/status'

import DesktopFolderSection from './components/desktop-folder-section.vue'
import DesktopResetSection from './components/desktop-reset-section.vue'

const { statusMessage, statusTone, handleStatus } = createDataSettingsStatusState()
</script>

<template>
  <div class="data-settings">
    <StatusBanner v-if="statusMessage" :message="statusMessage" :tone="statusTone" />
    <DesktopFolderSection @status="handleStatus" />
    <ChatsSection @status="handleStatus" />
    <ModelsModulesSection @status="handleStatus" />
    <DesktopResetSection @status="handleStatus" />
    <DangerSection @status="handleStatus" />
  </div>
</template>

<style scoped>
.data-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.data.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.data.description
  icon: i-solar:database-bold-duotone
  settingsEntry: true
  order: 7
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
