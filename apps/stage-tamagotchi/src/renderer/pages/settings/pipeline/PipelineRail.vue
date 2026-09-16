<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { PIPELINE_STAGES, stageState, type PipelineSnapshot, type PipelineStageId } from './stages'

const { t } = useI18n()

const props = defineProps<{
  snapshot: PipelineSnapshot
  /** 右侧当前 Tab：run=运行流水线 / security=安全与权限 / ops=连接与运维 */
  activeTab: 'run' | 'security' | 'ops'
  govRunning: boolean
}>()

const emit = defineEmits<{
  /** 点击阶段节点 → 滚动定位右工作区对应区块 */
  scrollTo: [stage: PipelineStageId]
  /** 点击二级条目 → 切换右侧 Tab */
  setTab: [tab: 'run' | 'security' | 'ops']
}>()

const STAGE_ICON: Record<string, string> = {
  idle: 'i-solar:record-outline',
  active: 'i-solar:hourglass-line-bold-duotone animate-pulse',
  done: 'i-solar:check-circle-bold',
  failed: 'i-solar:close-circle-bold',
}

const STAGE_COLOR: Record<string, string> = {
  idle: 'text-neutral-400 dark:text-neutral-500',
  active: 'text-amber-500',
  done: 'text-emerald-500',
  failed: 'text-red-500',
}

const SECURITY_TABS = [
  { id: 'environment', labelKey: 'settings.nav.environment', icon: 'i-solar:planet-bold-duotone' },
  { id: 'whitelist', labelKey: 'settings.nav.whitelist', icon: 'i-solar:shield-check-bold-duotone' },
] as const

const OPS_TABS = [
  { id: 'connectors', labelKey: 'settings.nav.connectors', icon: 'i-solar:plug-circle-bold-duotone' },
  { id: 'mcp-agent', labelKey: 'settings.nav.mcp-agent', icon: 'i-solar:plug-circle-bold-duotone' },
  { id: 'sidecar', labelKey: 'settings.nav.sidecar', icon: 'i-solar:server-bold-duotone' },
  { id: 'health', labelKey: 'settings.nav.health', icon: 'i-solar:health-bold-duotone' },
] as const

function stageStateOf(stage: PipelineStageId) {
  return stageState(stage, props.snapshot)
}
</script>

<template>
  <aside class="flex flex-col gap-4">
    <!-- 顶部全局状态 -->
    <button
      class="flex items-center gap-2 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white/40 dark:bg-white/[0.02] px-3 py-2 text-left transition-colors hover:border-primary-500/30"
      @click="emit('setTab', 'run')"
    >
      <span
        :class="['size-2 shrink-0 rounded-full', govRunning ? 'bg-emerald-400' : 'bg-neutral-400/40']"
      />
      <span class="text-xs font-medium text-neutral-700 dark:text-neutral-200">
        {{ t('settings.pages.pipeline.rail.status-label') }}
      </span>
      <span class="ml-auto text-[10px] text-neutral-400 dark:text-neutral-500">
        {{ govRunning ? t('settings.pages.pipeline.rail.status-running') : t('settings.pages.pipeline.rail.status-stopped') }}
      </span>
    </button>

    <!-- 运行流水线：八阶段垂直条 -->
    <nav
      class="flex flex-col rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white/40 dark:bg-white/[0.02] p-2"
      aria-label="运行流水线阶段"
    >
      <div class="px-2 pb-1.5 pt-1 text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {{ t('settings.pages.pipeline.rail.run-title') }}
      </div>
      <ol class="flex flex-col">
        <li v-for="(stage, i) in PIPELINE_STAGES" :key="stage.id" class="relative flex items-start">
          <!-- 连接线 -->
          <span
            v-if="i < PIPELINE_STAGES.length - 1"
            class="absolute left-[11px] top-[22px] h-[calc(100%-16px)] w-px bg-neutral-200 dark:bg-neutral-800"
          />
          <button
            class="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-neutral-400/10"
            @click="emit('scrollTo', stage.id)"
          >
            <span :class="['relative z-10 size-4.5 shrink-0 rounded-full text-[13px]', STAGE_COLOR[stageStateOf(stage.id)]]">
              <span :class="STAGE_ICON[stageStateOf(stage.id)]" />
            </span>
            <span
              :class="[
                'text-xs',
                stageStateOf(stage.id) === 'done' ? 'text-emerald-700 dark:text-emerald-300' : stageStateOf(stage.id) === 'failed' ? 'text-red-600 dark:text-red-300' : 'text-neutral-600 dark:text-neutral-300',
              ]"
            >
              {{ t(`settings.pages.pipeline.stages.${stage.id}.${stage.labelKey}`) }}
            </span>
          </button>
        </li>
      </ol>
    </nav>

    <!-- 安全与权限 -->
    <nav class="flex flex-col rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white/40 dark:bg-white/[0.02] p-2">
      <div class="px-2 pb-1.5 pt-1 text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {{ t('settings.nav.group.security') }}
      </div>
      <button
        v-for="tab in SECURITY_TABS"
        :key="tab.id"
        class="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-neutral-400/10"
        :class="activeTab === 'security' && tab.id === 'environment' ? 'bg-neutral-400/10 text-neutral-800 dark:text-neutral-100' : 'text-neutral-600 dark:text-neutral-300'"
        @click="emit('setTab', 'security')"
      >
        <span :class="[tab.icon, 'size-4 shrink-0 text-neutral-400']" />
        {{ t(tab.labelKey) }}
      </button>
    </nav>

    <!-- 连接与运维 -->
    <nav class="flex flex-col rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white/40 dark:bg-white/[0.02] p-2">
      <div class="px-2 pb-1.5 pt-1 text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {{ t('settings.nav.group.ops') }}
      </div>
      <button
        v-for="tab in OPS_TABS"
        :key="tab.id"
        class="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-neutral-400/10"
        :class="activeTab === 'ops' && tab.id === 'connectors' ? 'bg-neutral-400/10 text-neutral-800 dark:text-neutral-100' : 'text-neutral-600 dark:text-neutral-300'"
        @click="emit('setTab', 'ops')"
      >
        <span :class="[tab.icon, 'size-4 shrink-0 text-neutral-400']" />
        {{ t(tab.labelKey) }}
      </button>
    </nav>
  </aside>
</template>