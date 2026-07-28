<script setup lang="ts">
import { CheckBar, IconItem } from '@kitsune/stage-ui/components'
import { useSettings } from '@kitsune/stage-ui/stores/settings'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const settings = useSettings()

const menu = computed(() => [
  {
    title: '录音测试',
    description: '测试音频相关组合式函数',
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/audio-record',
  },
  {
    title: t('settings.pages.system.sections.section.developer.sections.section.performance-visualizer.title'),
    description: t('settings.pages.system.sections.section.developer.sections.section.performance-visualizer.description'),
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/performance-visualizer',
  },
  {
    title: t('settings.pages.system.sections.section.developer.sections.section.markdown-stress.title'),
    description: t('settings.pages.system.sections.section.developer.sections.section.markdown-stress.description'),
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/markdown-stress',
  },
  {
    title: '背景主题色混合',
    description: '测试混合与主题',
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/background-gradient-blending',
  },
  {
    title: '背景移除 (需要WebGPU)',
    description: '背景移除工具',
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/background-removal',
  },
  {
    title: '聊天',
    description: '聊天功能',
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/chat',
  },
  {
    title: '手势圆圈 (仅桌面端)',
    description: '测试手势识别',
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/gesture-circle',
  },
  {
    title: '图片',
    description: '图片功能',
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/image',
  },
  {
    title: '拍立得',
    description: '模型截图工具',
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/polaroid',
  },
  {
    title: t('tamagotchi.settings.devtools.pages.context-flow.title'),
    description: '检查传入的上下文更新和传出的聊天流事件',
    icon: 'i-solar:chat-square-call-bold-duotone',
    to: '/devtools/context-flow',
  },
  {
    title: 'WebSocket检查器',
    description: '检查原始WebSocket流量',
    icon: 'i-solar:transfer-horizontal-bold-duotone',
    to: '/devtools/websocket-inspector',
  },
  {
    title: 'Web触觉反馈',
    description: '触发内置触觉预设和自定义脉冲模式',
    icon: 'i-solar:bolt-circle-bold-duotone',
    to: '/devtools/web-haptics',
  },
  {
    title: '插件宿主调试',
    description: '检查插件宿主注册表和能力状态（桌面运行时）',
    icon: 'i-solar:bug-bold-duotone',
    to: '/devtools/plugin-host',
  },
  {
    title: t('settings.pages.system.sections.section.developer.sections.section.use-magic-keys.title'),
    description: t('settings.pages.system.sections.section.developer.sections.section.use-magic-keys.description'),
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/use-magic-keys',
  },
  {
    title: '颜色提取',
    description: '测试颜色提取',
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/vibrant',
  },
  {
    title: '阿里云实时语音识别',
    description: '将麦克风音频流式传输到阿里云NLS并检查实时转录',
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/providers-transcription-realtime-aliyun-nls',
  },
  {
    title: '性能演练场',
    description: 'VRM表情 + TTS口型同步演练场',
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/performance-playground',
  },
  {
    title: 'MediaPipe工作坊',
    description: '单人动作捕捉演练场（MediaPipe后端）带调度旋钮',
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/model-driver-mediapipe',
  },
])
</script>

<template>
  <CheckBar
    v-model="settings.disableTransitions"
    v-motion
    mb-2
    icon-on="i-solar:people-nearby-bold-duotone"
    icon-off="i-solar:running-2-line-duotone"
    text="settings.animations.stage-transitions.title"
    :initial="{ opacity: 0, y: 10 }"
    :enter="{ opacity: 1, y: 0 }"
    :duration="250 + (19 * 10)"
    :delay="1 * 50"
    transition="all ease-in-out duration-250"
  />
  <CheckBar
    v-model="settings.usePageSpecificTransitions"
    v-motion
    :disabled="settings.disableTransitions"
    icon-on="i-solar:running-2-line-duotone"
    icon-off="i-solar:people-nearby-bold-duotone"
    text="settings.animations.use-page-specific-transitions.title"
    description="settings.animations.use-page-specific-transitions.description"
    :initial="{ opacity: 0, y: 10 }"
    :enter="{ opacity: 1, y: 0 }"
    :duration="250 + (20 * 10)"
    :delay="2 * 50"
    transition="all ease-in-out duration-250"
  />

  <div flex="~ col gap-4" pb-12>
    <IconItem
      v-for="(item, index) in menu"
      :key="item.to"
      v-motion
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250"
      :style="{
        transitionDelay: `${index * 50}ms`, // delay between each item, unocss doesn't support dynamic generation of classes now
      }"
      :title="item.title"
      :description="item.description"
      :icon="item.icon"
      :to="item.to"
    />
  </div>

  <div
    v-motion
    text="neutral-200/50 dark:neutral-600/20" pointer-events-none
    fixed top="[65dvh]" right--15 z--1
    :initial="{ scale: 0.9, opacity: 0, rotate: 30 }"
    :enter="{ scale: 1, opacity: 1, rotate: 0 }"
    :duration="250"
    flex items-center justify-center
  >
    <div text="60" i-solar:code-bold-duotone />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.system.developer.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
