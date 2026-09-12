<script setup lang="ts">
import { useEnvironmentI18n } from '../environment/components/use-environment-i18n'
import ConnectorsPanel from '../environment/components/ConnectorsPanel.vue'
import AgentApiPanel from '../environment/components/AgentApiPanel.vue'

const { tn } = useEnvironmentI18n()
</script>

<template>
  <div flex="~ col gap-4">
    <!-- 头部：标题 + 描述 -->
    <section class="settings-panel">
      <div flex="~ col gap-1">
        <h3 class="text-sm font-semibold">
          {{ tn('connectors.title') }}
        </h3>
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ tn('connectors.description') }}
        </p>
      </div>
    </section>

    <!-- 双栏：连接器 + Agent API -->
    <div class="grid gap-4 lg:grid-cols-2">
      <ConnectorsPanel />
      <AgentApiPanel />
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.environment.connectors.title
  subtitleKey: settings.title
  settingsEntry: true
  order: 11
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>