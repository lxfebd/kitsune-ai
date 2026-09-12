<script setup lang="ts">
import { useEnvironmentI18n } from '../environment/components/use-environment-i18n'
import OverseerPanel from '../environment/components/OverseerPanel.vue'

const { tn } = useEnvironmentI18n()
</script>

<template>
  <div flex="~ col gap-4">
    <!-- 头部：标题 + 描述 -->
    <section class="settings-panel">
      <div flex="~ col gap-1">
        <h3 class="text-sm font-semibold">
          {{ tn('overseer.title') }}
        </h3>
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ tn('overseer.description') }}
        </p>
      </div>
    </section>

    <!-- 监工系统：开关 + 工具状态 + 统计 + 实时事件流 -->
    <OverseerPanel />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.environment.overseer.title
  subtitleKey: settings.title
  settingsEntry: true
  order: 6
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>