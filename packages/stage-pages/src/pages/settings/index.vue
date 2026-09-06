<script setup lang="ts">
import { IconItem, RippleGrid } from '@kitsune/stage-ui/components'
import { useRippleGridState } from '@kitsune/stage-ui/composables/use-ripple-grid-state'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const router = useRouter()
const { t } = useI18n()
const { lastClickedIndex, setLastClickedIndex } = useRippleGridState()

// 定义设置项分组配置
interface SettingsGroup {
  id: string
  labelKey: string
  items: string[] // 路由路径前缀
}

const settingsGroups: SettingsGroup[] = [
  {
    id: 'core',
    labelKey: 'settings.settings-groups.core',
    items: ['/settings/system', '/settings/models'],
  },
  {
    id: 'features',
    labelKey: 'settings.settings-groups.features',
    items: ['/settings/modules/speech', '/settings/modules/hearing', '/settings/scene', '/settings/modules'],
  },
  {
    id: 'data',
    labelKey: 'settings.settings-groups.data',
    items: ['/settings/data', '/settings/memory'],
  },
  {
    id: 'advanced',
    labelKey: 'settings.settings-groups.advanced',
    items: ['/settings/providers', '/settings/connection', '/settings/kitsune-card'],
  },
]

// 获取所有设置项
const allSettings = computed(() => {
  return router
    .getRoutes()
    .filter(route => route.meta?.settingsEntry)
    .sort((a, b) => (Number(a.meta?.order ?? 0) - Number(b.meta?.order ?? 0)))
    .map(route => ({
      id: route.path,
      title: route.meta?.titleKey ? t(route.meta.titleKey as string) : (route.meta?.title as string | undefined),
      description: route.meta?.descriptionKey ? t(route.meta.descriptionKey as string) : (route.meta?.description as string | undefined) || '',
      icon: route.meta?.icon as string | undefined,
      to: route.path,
    }))
})

// 按分组组织设置项
const groupedSettings = computed(() => {
  const grouped: Array<{
    id: string
    labelKey: string
    settings: typeof allSettings.value
  }> = []

  const usedPaths = new Set<string>()

  // 按定义的分组顺序组织
  for (const group of settingsGroups) {
    const groupItems = allSettings.value.filter((setting) => {
      // 检查是否匹配该分组
      const matches = group.items.some(prefix => setting.to.startsWith(prefix))
      if (matches && !usedPaths.has(setting.to)) {
        usedPaths.add(setting.to)
        return true
      }
      return false
    })

    if (groupItems.length > 0) {
      grouped.push({
        id: group.id,
        labelKey: group.labelKey,
        settings: groupItems,
      })
    }
  }

  // 添加未分组的设置项
  const ungrouped = allSettings.value.filter(s => !usedPaths.has(s.to))
  if (ungrouped.length > 0) {
    grouped.push({
      id: 'other',
      labelKey: 'settings.settings-groups.other',
      settings: ungrouped,
    })
  }

  return grouped
})
</script>

<template>
  <div flex="~ col gap-6" font-normal>
    <div v-for="group in groupedSettings" :key="group.id" class="settings-group">
      <!-- 分组标题 -->
      <h2 class="m-0 text-sm font-semibold tracking-wide uppercase pl-1 text-neutral-500 dark:text-neutral-400">
        {{ t(group.labelKey) }}
      </h2>

      <!-- 分组内的设置项网格 -->
      <RippleGrid
        :items="group.settings"
        :get-key="item => item.to"
        :columns="{ default: 1, sm: 2, lg: 3, xl: 4 }"
        :origin-index="lastClickedIndex"
        @item-click="({ globalIndex }) => setLastClickedIndex(globalIndex)"
      >
        <template #item="{ item }">
          <IconItem
            :title="item.title || ''"
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
  gap: 16px;
}
</style>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.title
  stageTransition:
    name: slide
</route>
