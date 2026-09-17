<script setup lang="ts">
import { IconItem, RippleGrid } from '@kitsune/stage-ui/components'
import { useRippleGridState } from '@kitsune/stage-ui/composables/use-ripple-grid-state'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { settingsGroups } from '../../settings-nav'

const { t } = useI18n()
const { lastClickedIndex, setLastClickedIndex } = useRippleGridState()

// 总览页 = 新版侧栏同源数据（settings-nav.ts 的 5 组）渲染为分组卡片网格。
// 每组的成员卡片直接进功能页；分组标题/描述与侧栏完全一致，改动只影响这一页。
const groups = computed(() =>
  settingsGroups.map(group => ({
    id: group.id,
    title: t(group.labelKey),
    description: t(group.descriptionKey),
    members: group.members.map(member => ({
      id: member.id,
      title: t(member.labelKey),
      description: t(`settings.groups.cards.${member.id}.description`),
      icon: member.icon,
      to: member.to,
    })),
  })),
)
</script>

<template>
  <div flex="~ col gap-6" font-normal>
    <div v-for="group in groups" :key="group.id" class="settings-group">
      <!-- 分组标题 + 描述 -->
      <div class="flex flex-col gap-0.5 pl-1">
        <h2 class="m-0 text-sm font-semibold tracking-wide uppercase text-neutral-500 dark:text-neutral-400">
          {{ group.title }}
        </h2>
        <p v-if="group.description" class="m-0 text-xs text-neutral-400 dark:text-neutral-500">
          {{ group.description }}
        </p>
      </div>

      <!-- 分组内的成员卡片网格 -->
      <RippleGrid
        :items="group.members"
        :get-key="item => item.id"
        :columns="{ default: 1, sm: 2, lg: 3, xl: 4 }"
        :origin-index="lastClickedIndex"
        @item-click="({ globalIndex }) => setLastClickedIndex(globalIndex)"
      >
        <template #item="{ item }">
          <IconItem
            :title="item.title"
            :description="item.description"
            :icon="item.icon"
            :to="item.to"
          />
        </template>
      </RippleGrid>
    </div>

    <!-- 装饰性背景图标 -->
    <div
      v-motion
      text="neutral-200/50 dark:neutral-600/20" pointer-events-none
      fixed top="[calc(100dvh-12rem)]" bottom-0 right--10 z--1
      :initial="{ scale: 0.9, opacity: 0, rotate: 180 }"
      :enter="{ scale: 1, opacity: 1, rotate: 0 }"
      :duration="500"
      size-60
      flex items-center justify-center
    >
      <div v-motion text="60" i-solar:settings-bold-duotone />
    </div>
  </div>
</template>

<style scoped>
.settings-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.title
  stageTransition:
    name: slide
</route>
