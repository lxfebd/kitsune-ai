<script setup lang="ts">
import { useEnvironmentI18n } from '../environment/components/use-environment-i18n'
import WhitelistPanel from '../environment/components/WhitelistPanel.vue'

const { tn } = useEnvironmentI18n()
</script>

<template>
  <div flex="~ col gap-4">
    <!-- 头部：标题 + 描述 -->
    <section class="settings-panel">
      <div flex="~ col gap-1">
        <h3 class="text-sm font-semibold">
          {{ tn('whitelist.title') }}
        </h3>
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ tn('whitelist.description') }}
        </p>
      </div>
    </section>

    <!-- 权限白名单 -->
    <WhitelistPanel />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.environment.whitelist.title
  subtitleKey: settings.title
  settingsEntry: true
  order: 10
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>