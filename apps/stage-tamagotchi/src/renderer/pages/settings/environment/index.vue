<script setup lang="ts">
import { useEnvironmentI18n } from './components/use-environment-i18n'
import ConnectorsPanel from './components/ConnectorsPanel.vue'
import AgentApiPanel from './components/AgentApiPanel.vue'
import DoctorPanel from './components/DoctorPanel.vue'
import LogLevelPanel from './components/LogLevelPanel.vue'
import WhitelistPanel from './components/WhitelistPanel.vue'
import DesktopAutomationPanel from './components/DesktopAutomationPanel.vue'
import ExecutorPanel from './components/ExecutorPanel.vue'
import PermissionConfirmDialog from './components/PermissionConfirmDialog.vue'
import VisionCheckBridge from './components/VisionCheckBridge.vue'
import FindElementBridge from './components/FindElementBridge.vue'

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

    <!-- 双栏：连接器 + Agent API -->
    <div class="grid gap-4 lg:grid-cols-2">
      <ConnectorsPanel />
      <AgentApiPanel />
    </div>

    <!-- 健康检查：一键检测 + 自动修复 -->
    <DoctorPanel />

    <!-- 双栏：日志级别 + 白名单 -->
    <div class="grid gap-4 lg:grid-cols-2">
      <LogLevelPanel />
      <WhitelistPanel />
    </div>

    <!-- 桌面自动化 -->
    <DesktopAutomationPanel />

    <!-- 自主执行：需求 → 计划 → 执行 -->
    <ExecutorPanel />

    <!-- 全局：授权确认弹窗 -->
    <PermissionConfirmDialog />

    <!-- 后台：视觉校验桥接（无 UI） -->
    <VisionCheckBridge />

    <!-- 后台：视觉元素定位桥接（无 UI） -->
    <FindElementBridge />
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
