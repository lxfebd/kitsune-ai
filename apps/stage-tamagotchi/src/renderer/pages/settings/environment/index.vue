<script setup lang="ts">
import { useEnvironmentI18n } from './components/use-environment-i18n'
import DesktopAutomationPanel from './components/DesktopAutomationPanel.vue'
import LogLevelPanel from './components/LogLevelPanel.vue'

const { tn } = useEnvironmentI18n()
const PANEL = 'settings-panel'
</script>

<template>
  <div flex="~ col gap-4">
    <!-- 头部：标题 + 描述 -->
    <section :class="PANEL">
      <div flex="~ col gap-1">
        <h3 class="text-sm font-semibold">
          {{ tn('title') }}
        </h3>
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ tn('description') }}
        </p>
      </div>
    </section>

    <!-- 桌面自动化：手动测试工具 -->
    <DesktopAutomationPanel />

    <!-- 日志级别 -->
    <LogLevelPanel />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.environment.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.environment.description
  icon: i-solar:planet-bold-duotone
  settingsEntry: true
  order: 8
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
