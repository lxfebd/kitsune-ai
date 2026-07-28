<script setup lang="ts">
import { computed, nextTick, onErrorCaptured, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, RouterView, useRoute } from 'vue-router'

import { useRestoreScroll } from '../composables/use-restore-scroll'

// 错误边界 — 捕获子组件渲染错误，阻止错误传播导致整个布局崩溃。
// 不捕获错误会导致 RouterView 无法渲染后续页面（Vue 3 经典问题）。
const childError = ref<string | null>(null)
onErrorCaptured((err, _instance, info) => {
  console.error('[settings-layout] caught child error:', err, info)
  childError.value = err instanceof Error ? err.message : String(err)
  // 返回 false 阻止错误继续向上传播
  return false
})

interface NavGroup {
  id: string
  labelKey: string
  icon: string
  to: string
  match: string[]
  exclude?: string[]
}

const route = useRoute()
const { t } = useI18n()
const scrollContainer = ref<HTMLElement>()
useRestoreScroll(scrollContainer)

// 路由变化时清除错误状态，让新页面有机会渲染
let prevPath = route.path
watchEffect(() => {
  if (route.path !== prevPath) {
    prevPath = route.path
    nextTick(() => { childError.value = null })
  }
})

// 侧栏图标统一使用 bold-duotone 风格,保持视觉重量一致
const navGroups: NavGroup[] = [
  {
    id: 'system',
    labelKey: 'settings.nav.system',
    icon: 'i-solar:settings-bold-duotone',
    to: '/settings/system',
    match: ['/settings/system'],
  },
  {
    id: 'models',
    labelKey: 'settings.nav.models',
    icon: 'i-solar:cpu-bolt-bold-duotone',
    to: '/settings/models',
    match: ['/settings/models', '/settings/providers/chat', '/settings/providers/vision'],
  },
  {
    id: 'speech',
    labelKey: 'settings.nav.speech',
    icon: 'i-solar:microphone-bold-duotone',
    to: '/settings/modules/speech',
    match: ['/settings/modules/speech', '/settings/providers/speech'],
  },
  {
    id: 'hearing',
    labelKey: 'settings.nav.hearing',
    icon: 'i-solar:microphone-3-bold-duotone',
    to: '/settings/modules/hearing',
    match: ['/settings/modules/hearing', '/settings/providers/transcription'],
  },
  {
    id: 'scene',
    labelKey: 'settings.nav.scene',
    icon: 'i-solar:gallery-bold-duotone',
    to: '/settings/scene',
    match: ['/settings/scene'],
  },
  {
    id: 'modules',
    labelKey: 'settings.nav.modules',
    icon: 'i-solar:widget-bold-duotone',
    to: '/settings/modules',
    match: ['/settings/modules', '/settings/memory', '/settings/connection', '/settings/kitsune-card'],
    exclude: ['/settings/modules/speech', '/settings/modules/hearing', '/settings/modules/consciousness', '/settings/modules/vision'],
  },
  {
    id: 'data',
    labelKey: 'settings.nav.data',
    icon: 'i-solar:database-bold-duotone',
    to: '/settings/data',
    match: ['/settings/data', '/settings/flux'],
  },
  {
    id: 'environment',
    labelKey: 'settings.nav.environment',
    icon: 'i-solar:planet-bold-duotone',
    to: '/settings/environment',
    match: ['/settings/environment'],
  },
  {
    id: 'sidecar',
    labelKey: 'settings.nav.sidecar',
    icon: 'i-solar:server-bold-duotone',
    to: '/settings/sidecar',
    match: ['/settings/sidecar'],
  },
]

const activeGroupId = computed(() => {
  const path = route.path
  return navGroups.find((group) => {
    if (group.exclude?.some(p => path === p || path.startsWith(`${p}/`)))
      return false
    return group.match.some(p => path === p || path.startsWith(`${p}/`))
  })?.id
})

const parentRoute = computed(() => {
  const parts = route.path.split('/').filter(Boolean)

  if (parts[0] === 'devtools')
    return '/settings/system/developer'

  if (parts.length <= 2)
    return undefined

  if (parts[1] === 'providers' && parts.length >= 4)
    return '/settings/providers'

  return `/${parts.slice(0, -1).join('/')}`
})

function sendWindow(channel: string) {
  if (typeof window !== 'undefined' && window.electron?.ipcRenderer)
    window.electron.ipcRenderer.send(`settings-window-${channel}`)
}
</script>

<template>
  <div
    class="grid h-100dvh w-100vw overflow-hidden text-neutral-800 dark:text-neutral-200 bg-white/80 dark:bg-neutral-950/80 backdrop-blur-2xl"
    :style="{ gridTemplateColumns: `var(--settings-sidebar-width, 192px) minmax(0, 1fr)` }"
  >
    <!-- Sidebar -->
    <aside class="flex flex-col border-r border-black/[0.06] dark:border-white/[0.06] bg-black/3 dark:bg-white/3 backdrop-blur-xl">
      <!-- Brand + Traffic lights -->
      <div class="flex items-center gap-3 px-4 pt-12 pb-3 border-b border-black/[0.06] dark:border-white/[0.06]" style="-webkit-app-region: drag">
        <!-- Traffic lights -->
        <div class="flex items-center gap-2" style="-webkit-app-region: no-drag">
          <button
            class="group flex h-3 w-3 items-center justify-center rounded-full bg-[#FF5F57] transition-all hover:bg-[#FF4040]"
            style="-webkit-app-region: no-drag"
            :title="t('tamagotchi.stage.settings.window-close')"
            @click.stop="sendWindow('close')"
          >
            <div class="i-solar:close-bold text-[8px] text-[#4A0002]/0 group-hover:text-[#4A0002]/80 transition-colors" />
          </button>
          <button
            class="group flex h-3 w-3 items-center justify-center rounded-full bg-[#FEBC2E] transition-all hover:bg-[#FFA600]"
            style="-webkit-app-region: no-drag"
            :title="t('tamagotchi.stage.settings.window-minimize')"
            @click.stop="sendWindow('minimize')"
          >
            <div class="i-solar:minus-line text-[8px] text-[#5A3B00]/0 group-hover:text-[#5A3B00]/80 transition-colors" />
          </button>
          <button
            class="group flex h-3 w-3 items-center justify-center rounded-full bg-[#28C840] transition-all hover:bg-[#1AAB29]"
            style="-webkit-app-region: no-drag"
            :title="t('tamagotchi.stage.settings.window-maximize')"
            @click.stop="sendWindow('maximize')"
          >
            <div class="i-solar:add-line text-[8px] text-[#0A4A00]/0 group-hover:text-[#0A4A00]/80 transition-colors" />
          </button>
        </div>
        <div style="-webkit-app-region: no-drag">
          <p class="text-sm font-semibold leading-tight text-neutral-900 dark:text-neutral-100">{{ t('tamagotchi.stage.brand.name') }}</p>
          <p class="text-[10px] text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Settings</p>
        </div>
      </div>

      <!-- Navigation -->
      <nav class="flex flex-col gap-0.5 p-3 flex-1 overflow-y-auto scrollbar-none">
        <RouterLink
          v-for="item in navGroups"
          :key="item.id"
          :to="item.to"
          :class="[
            'group relative flex items-center gap-2.5 min-h-[36px] px-3 rounded-lg',
            'text-[13px] no-underline transition-all duration-150',
            activeGroupId === item.id
              ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400 font-medium'
              : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-black/5 dark:hover:bg-white/5',
          ]"
        >
          <!-- Active indicator bar -->
          <div
            v-if="activeGroupId === item.id"
            :class="[
              'absolute left-0 top-1/2 -translate-y-1/2 w-[4px] h-5 rounded-full',
              'bg-primary-500 dark:bg-primary-400',
            ]"
          />
          <div :class="[
            item.icon,
            'w-4 h-4 shrink-0 transition-colors duration-150',
            activeGroupId === item.id
              ? 'text-primary-500 dark:text-primary-400'
              : 'text-neutral-400 dark:text-neutral-500 group-hover:text-neutral-600 dark:group-hover:text-neutral-300',
          ]" />
          <span class="truncate">{{ t(item.labelKey) }}</span>
        </RouterLink>
      </nav>
    </aside>

    <!-- Content -->
    <main ref="scrollContainer" class="flex flex-col min-w-0 min-h-0 overflow-auto">
      <!-- Header bar with drag region -->
      <div
        class="flex items-center justify-between px-6 pt-12 pb-4 border-b border-black/[0.06] dark:border-white/[0.06] shrink-0"
        style="-webkit-app-region: drag"
      >
        <div class="flex items-center gap-3 min-w-0" style="-webkit-app-region: no-drag">
          <RouterLink
            v-if="parentRoute"
            :to="parentRoute"
            :class="[
              'flex items-center justify-center w-7 h-7 rounded-lg shrink-0 p-0 border-0',
              'text-neutral-400 dark:text-neutral-500 no-underline',
              'hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-black/5 dark:hover:bg-white/5',
              'transition-all duration-150',
            ]"
            :title="t('tamagotchi.stage.settings.back')"
          >
            <div class="i-solar:alt-arrow-left-bold-duotone w-[18px] h-[18px]" />
          </RouterLink>
          <h1 class="text-lg font-medium tracking-tight text-neutral-900 dark:text-neutral-100 m-0">
            {{ route.meta?.titleKey ? t(route.meta.titleKey as string) : (route.meta?.title as string || 'Settings') }}
          </h1>
        </div>
      </div>

      <!-- Page content -->
      <div class="flex-1 min-h-0">
        <div
          class="mx-auto px-6 py-6"
          :style="{ maxWidth: 'var(--settings-content-max-width, 1024px)' }"
        >
          <!-- Page-level description:作为 H1 的副标题,提供页面上下文 -->
          <p
            v-if="route.meta?.descriptionKey"
            class="text-xs text-neutral-500 dark:text-neutral-400 mb-4 leading-relaxed"
          >
            {{ t(route.meta.descriptionKey as string) }}
          </p>
          <div v-if="childError" class="flex flex-col items-center justify-center h-full gap-3 text-center">
            <div class="i-solar:danger-triangle-bold text-3xl text-amber-500" />
            <p class="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              页面渲染出错
            </p>
            <p class="text-xs text-neutral-500 dark:text-neutral-400 max-w-md break-all">
              {{ childError }}
            </p>
            <p class="text-xs text-neutral-400 dark:text-neutral-500">
              请查看控制台获取详细错误信息，或切换到其他页面继续使用。
            </p>
          </div>
          <RouterView v-else :key="route.fullPath" />
        </div>
      </div>
    </main>
  </div>

  <!-- Force UnoCSS icon scanning -->
  <div class="hidden" aria-hidden="true">
    <div class="i-solar:settings-bold-duotone" />
    <div class="i-solar:cpu-bolt-bold-duotone" />
    <div class="i-solar:microphone-bold-duotone" />
    <div class="i-solar:microphone-3-bold-duotone" />
    <div class="i-solar:gallery-bold-duotone" />
    <div class="i-solar:database-bold-duotone" />
    <div class="i-solar:danger-triangle-bold" />
    <div class="i-solar:widget-bold-duotone" />
    <div class="i-solar:alt-arrow-left-bold-duotone" />
    <div class="i-solar:ghost-bold-duotone" />
    <div class="i-solar:planet-bold-duotone" />
    <div class="i-solar:server-bold-duotone" />
  </div>
</template>

<style>
/* Settings page entrance animation */
.page-enter-active {
  animation: settings-page-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes settings-page-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/*
 * Appearance token consumers.
 *
 * These rules layer on top of the UnoCSS `settings-panel` / `settings-card`
 * shortcuts (which only carry border/bg/backdrop). Border-radius, padding,
 * gap, and transition-duration are all driven by CSS variables injected in
 * App.vue from the appearance store, so users can adjust card roundness,
 * density, and motion from System > General and see it applied everywhere.
 *
 * Density uses a scale multiplier on a 1rem base so compact/comfortable
 * proportionally shrink or grow padding AND gap together, keeping rhythm.
 * Motion controls transition-duration so off/reduced/normal maps to 0/0.12s/0.2s.
 */
.settings-panel {
  border-radius: var(--settings-card-radius, 1rem);
  padding: calc(var(--settings-density-scale, 1) * 1rem) calc(var(--settings-density-scale, 1) * 1.25rem);
  gap: calc(var(--settings-density-scale, 1) * 0.75rem);
  transition-property: background-color, border-color, box-shadow, transform;
  transition-duration: var(--settings-motion-duration, 0.2s);
  transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
}

.settings-card {
  border-radius: calc(var(--settings-card-radius, 1rem) * 0.625);
  padding: calc(var(--settings-density-scale, 1) * 0.75rem);
  gap: calc(var(--settings-density-scale, 1) * 0.5rem);
  transition-property: background-color, border-color, box-shadow;
  transition-duration: var(--settings-motion-duration, 0.2s);
  transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
}

/* Sidebar nav active indicator animation */
.nav-active-indicator {
  transition: top 0.25s cubic-bezier(0.22, 1, 0.36, 1), height 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}
</style>
