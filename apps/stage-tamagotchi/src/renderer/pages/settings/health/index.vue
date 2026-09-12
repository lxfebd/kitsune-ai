<script setup lang="ts">
import { useEnvironmentI18n } from '../environment/components/use-environment-i18n'
import DoctorPanel from '../environment/components/DoctorPanel.vue'

const { tn } = useEnvironmentI18n()
</script>

<template>
  <div flex="~ col gap-4">
    <!-- 头部：标题 + 描述 -->
    <section class="settings-panel">
      <div flex="~ col gap-1">
        <h3 class="text-sm font-semibold">
          {{ tn('doctor.title') }}
        </h3>
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ tn('doctor.description') }}
        </p>
      </div>
    </section>

    <!-- 健康检查：一键检测 + 自动修复 -->
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