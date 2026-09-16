<script setup lang="ts">
import { useRoute } from 'vue-router'
import { watch } from 'vue'

import { useRunPipeline } from './use-run-pipeline'
import PipelineRail from './PipelineRail.vue'
import PipelineBoard from './PipelineBoard.vue'
import type { PipelineStageId } from './stages'

const route = useRoute()
const run = useRunPipeline()

const STAGE_IDS: PipelineStageId[] = ['goal', 'plan', 'review', 'assign', 'work', 'monitor', 'product', 'submit']

// 旧深链兼容：/settings/overseer|executor|director|team 曾经是独立子页，
// 收敛后统一进流水线页。保留定位到对应区块（监控/工作/评审/分配），避免深链失效。
// 重定向后的 URL 带 ?stage=<id>（见 main.ts beforeEach），此处统一消费。
watch(() => route.fullPath, (fullPath) => {
  const stageQuery = route.query.stage
  const anchor: PipelineStageId | undefined = typeof stageQuery === 'string' && (STAGE_IDS as string[]).includes(stageQuery)
    ? stageQuery as PipelineStageId
    : (fullPath.endsWith('/overseer')
      ? 'monitor'
      : fullPath.endsWith('/executor')
        ? 'work'
        : fullPath.endsWith('/director')
          ? 'review'
          : fullPath.endsWith('/team')
            ? 'assign'
            : undefined)
  if (anchor) {
    requestAnimationFrame(() => {
      scrollToStage(anchor)
    })
  }
}, { immediate: true })

function scrollToStage(stage: PipelineStageId) {
  const el = document.getElementById(`pipeline-block-${stage}`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
    <!-- 左：流程条（运行流水线八阶段导航） -->
    <PipelineRail
      :snapshot="run.snapshot.value"
      @scroll-to="scrollToStage"
    />

    <!-- 右：运行流水线主面板 -->
    <div class="flex min-w-0 flex-col gap-4">
      <PipelineBoard :run="run" />
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.pipeline.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.pipeline.description
  icon: i-solar:diagram-up-bold-duotone
  settingsEntry: true
  order: 8
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
