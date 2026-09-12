<script setup lang="ts">
import { useEnvironmentI18n } from '../environment/components/use-environment-i18n'
import ExecutorPanel from '../environment/components/ExecutorPanel.vue'

const { tn } = useEnvironmentI18n()
</script>

<template>
  <div flex="~ col gap-4">
    <!-- 头部：标题 + 描述 -->
    <section class="settings-panel">
      <div flex="~ col gap-1">
        <h3 class="text-sm font-semibold">
          {{ tn('executor.title') }}
        </h3>
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ tn('executor.description') }}
        </p>
      </div>
    </section>

    <!-- 自主执行：需求 → 计划 → 执行（DAG 任务图） -->
    <ExecutorPanel />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.environment.executor.title
  subtitleKey: settings.title
  settingsEntry: true
  order: 7
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>