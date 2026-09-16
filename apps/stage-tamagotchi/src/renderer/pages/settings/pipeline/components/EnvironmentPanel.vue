<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import DesktopAutomationPanel from '../../environment/components/DesktopAutomationPanel.vue'
import LogLevelPanel from '../../environment/components/LogLevelPanel.vue'
const { t } = useI18n()
</script>

<template>
  <div flex="~ col gap-4">
    <!-- 头部：标题 + 描述 -->
    <section class="settings-panel">
      <div flex="~ col gap-1">
        <h3 class="text-sm font-semibold">
          {{ t('settings.nav.environment') }}
        </h3>
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ t('settings.groups.cards.environment.description') }}
        </p>
      </div>
    </section>

    <!-- 桌面自动化：手动测试工具 -->
    <DesktopAutomationPanel />

    <!-- 日志级别 -->
    <LogLevelPanel />
  </div>
</template>