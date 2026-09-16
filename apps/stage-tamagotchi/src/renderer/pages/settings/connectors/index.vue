<script setup lang="ts">
import ConnectorsPanel from '../environment/components/ConnectorsPanel.vue'
import AgentApiPanel from '../environment/components/AgentApiPanel.vue'
</script>

<template>
  <div flex="~ col gap-4">
    <!-- 双栏：连接器 + Agent API。两个面板各自带区块标题；
         页面级标题不再重复渲染（布局头部已显示，面板自带 H3）。 -->
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
