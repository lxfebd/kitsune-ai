<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { PIPELINE_STAGES, stageState, type PipelineSnapshot, type PipelineStageId } from './stages'

const { t } = useI18n()

const props = defineProps<{
  snapshot: PipelineSnapshot
}>()

const emit = defineEmits<{
  /** 点击阶段节点 → 滚动定位右工作区对应区块 */
  scrollTo: [stage: PipelineStageId]
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

function stageStateOf(stage: PipelineStageId) {
  return stageState(stage, props.snapshot)
}
</script>

<template>
  <aside class="flex flex-col gap-4">
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
  </aside>
</template>