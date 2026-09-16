<script setup lang="ts">
import type { Task } from '../../../../shared/eventa'

import { Button, Callout, FieldInput } from '@kitsune/ui'
import { useI18n } from 'vue-i18n'

import PlanGraph from '../../../components/plan-graph/index.vue'
import OverseerPanel from '../environment/components/OverseerPanel.vue'
import type { RunPipeline } from './use-run-pipeline'

const { t } = useI18n()

defineProps<{
  run: RunPipeline
}>()

function stageLabel(id: string): string {
  return t(`settings.pages.pipeline.stages.${id}.label`)
}

function taskStatus(task: Task, run: RunPipeline): string {
  const r = run.taskResults.value.get(task.id)
  if (r?.ok)
    return t('settings.pages.pipeline.task-status.completed')
  if (run.status.value.currentTaskId === task.id)
    return t('settings.pages.pipeline.task-status.running')
  if (r && !r.ok)
    return t('settings.pages.pipeline.task-status.failed')
  return t('settings.pages.pipeline.task-status.pending')
}

function taskDuration(task: Task, run: RunPipeline): string {
  const r = run.taskResults.value.get(task.id)
  if (!r)
    return '-'
  return `${(r.durationMs / 1000).toFixed(1)}s`
}

function taskError(task: Task, run: RunPipeline): string {
  const r = run.taskResults.value.get(task.id)
  if (!r?.error)
    return ''
  return t('settings.pages.pipeline.task-error-fmt', { idx: run.plan.value?.tasks.indexOf(task) ?? '-', error: r.error })
}

function personaMessageFor(task: Task, run: RunPipeline): string {
  return run.personaMessages.value.get(task.id) ?? ''
}

function terminalChip(run: RunPipeline): { label: string, cls: string } {
  const status = run.plan.value?.status
  if (status === 'completed')
    return { label: t('settings.pages.pipeline.submit.completed'), cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' }
  if (status === 'aborted')
    return { label: t('settings.pages.pipeline.submit.aborted'), cls: 'bg-red-500/15 text-red-700 dark:text-red-300' }
  return { label: t('settings.pages.pipeline.submit.running'), cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' }
}
</script>

<template>
  <div flex="~ col gap-4">
    <Callout v-if="run.errorMessage.value" theme="orange" :label="t('settings.pages.pipeline.error-title')">
      {{ run.errorMessage.value }}
    </Callout>

    <!-- 流水线顶部状态条：聚合徽章 -->
    <section class="settings-panel">
      <div class="flex items-center gap-3 text-xs">
        <span
          :class="[
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium',
            run.statusBadge.value,
          ]"
        >
          <span v-if="run.isRunning.value" class="i-svg-spinners:ring size-3" />
          {{ t(run.statusLabelKey.value, run.statusLabelParams.value) }}
        </span>
        <span class="rounded-full bg-neutral-400/15 px-2 py-0.5 text-neutral-600 dark:text-neutral-300">
          {{ t('settings.pages.pipeline.status.total', { count: run.stats.value.total }) }}
        </span>
        <span class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">
          {{ t('settings.pages.pipeline.status.completed-count', { count: run.stats.value.completed }) }}
        </span>
        <span class="rounded-full bg-red-500/15 px-2 py-0.5 text-red-700 dark:text-red-300">
          {{ t('settings.pages.pipeline.status.failed-count', { count: run.stats.value.failed }) }}
        </span>
        <span v-if="run.plan.value" class="rounded-full bg-sky-500/15 px-2 py-0.5 text-sky-700 dark:text-sky-300">
          {{ t('settings.pages.pipeline.status.level', { level: run.stats.value.level }) }}
        </span>
      </div>
    </section>

    <!-- ① 目标 -->
    <section :id="'pipeline-block-goal'" class="settings-panel scroll-mt-4">
      <div flex="~ col gap-1">
        <h3 class="text-sm font-semibold">
          {{ stageLabel('goal') }}
        </h3>
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ t('settings.pages.pipeline.stages.goal.description') }}
        </p>
      </div>
      <div class="flex items-end gap-2">
        <FieldInput
          v-model="run.requirement.value"
          class="flex-1"
          :label="t('settings.pages.pipeline.goal.input-label')"
          :placeholder="t('settings.pages.pipeline.goal.input-placeholder')"
          type="text"
          :disabled="run.busy.value || run.isRunning.value"
        />
        <Button
          variant="primary" size="sm"
          :loading="run.busy.value"
          :disabled="!run.requirement.value.trim() || run.isRunning.value"
          :label="t('settings.pages.pipeline.goal.generate')"
          icon="i-solar:magic-stick-3-bold-duotone"
          @click="run.generate()"
        />
      </div>
    </section>

    <!-- ② 生成计划 -->
    <section :id="'pipeline-block-plan'" class="settings-panel scroll-mt-4 flex flex-col gap-2">
      <div flex="~ col gap-1">
        <h3 class="text-sm font-semibold">
          {{ stageLabel('plan') }}
        </h3>
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ t('settings.pages.pipeline.stages.plan.description') }}
        </p>
      </div>
      <div v-if="run.busy.value && !run.isRunning.value" class="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
        <span class="i-svg-spinners:ring size-4 text-amber-500" />
        {{ t('settings.pages.pipeline.status.generating') }}
      </div>
      <div v-if="run.plan.value">
        <PlanGraph
          :tasks="run.plan.value.tasks.map(t => ({ id: t.id, type: t.type, title: t.title, dependsOn: t.dependsOn }))"
          :active-task-id="run.status.value.currentTaskId"
          :completed-ids="run.completedTaskIds.value"
          :failed-ids="run.failedTaskIds.value"
        />
      </div>
      <div v-else-if="!run.busy.value" class="border-2 border-neutral-200 dark:border-neutral-800 rounded-lg border-dashed p-4 text-center text-xs text-neutral-500">
        {{ t('settings.pages.pipeline.plan.empty') }}
      </div>
    </section>

    <!-- ③ 计划审核批准 -->
    <section :id="'pipeline-block-review'" class="settings-panel scroll-mt-4 flex flex-col gap-3">
      <div flex="~ col gap-1">
        <h3 class="text-sm font-semibold">
          {{ stageLabel('review') }}
        </h3>
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ t('settings.pages.pipeline.stages.review.description') }}
        </p>
      </div>
      <div v-if="run.plan.value" class="flex items-center gap-2">
        <Button
          variant="primary" size="sm"
          :disabled="run.isRunning.value"
          :label="t('settings.pages.pipeline.review.approve-execute')"
          icon="i-solar:check-circle-bold-duotone"
          @click="run.execute()"
        />
        <Button
          variant="secondary" size="sm"
          :disabled="run.isRunning.value"
          :label="t('settings.pages.pipeline.review.generate-only')"
          icon="i-solar:list-check-bold-duotone"
        />
        <Button
          v-if="run.isRunning.value"
          variant="danger" size="sm"
          :label="t('settings.pages.pipeline.review.stop')"
          icon="i-solar:stop-bold-duotone"
          @click="run.stop()"
        />
      </div>
      <div v-else class="border-2 border-neutral-200 dark:border-neutral-800 rounded-lg border-dashed p-4 text-center text-xs text-neutral-500">
        {{ t('settings.pages.pipeline.review.empty') }}
      </div>
    </section>

    <!-- ④ 分配计划 -->
    <section :id="'pipeline-block-assign'" class="settings-panel scroll-mt-4 flex flex-col gap-2">
      <div flex="~ col gap-1">
        <h3 class="text-sm font-semibold">
          {{ stageLabel('assign') }}
        </h3>
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ t('settings.pages.pipeline.stages.assign.description') }}
        </p>
      </div>
      <div v-if="run.plan.value" class="flex flex-col gap-1.5 text-xs">
        <div class="flex items-center gap-2">
          <span class="rounded-full bg-neutral-400/15 px-2 py-0.5 text-neutral-600 dark:text-neutral-300">
            {{ t('settings.pages.pipeline.assign.task-count', { count: run.plan.value.tasks.length }) }}
          </span>
          <span class="rounded-full bg-primary-500/15 px-2 py-0.5 text-primary-700 dark:text-primary-300">
            {{ t('settings.pages.pipeline.assign.parallel', { count: run.plan.value.maxConcurrency ?? 3 }) }}
          </span>
        </div>
        <p class="text-[11px] text-neutral-400 dark:text-neutral-500">
          {{ t('settings.pages.pipeline.assign.hint') }}
        </p>
      </div>
      <div v-else class="border-2 border-neutral-200 dark:border-neutral-800 rounded-lg border-dashed p-4 text-center text-xs text-neutral-500">
        {{ t('settings.pages.pipeline.assign.empty') }}
      </div>
    </section>

    <!-- ⑤ 子 agent 工作 -->
    <section :id="'pipeline-block-work'" class="settings-panel scroll-mt-4 flex flex-col gap-2">
      <div flex="~ col gap-1">
        <h3 class="text-sm font-semibold">
          {{ stageLabel('work') }}
        </h3>
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ t('settings.pages.pipeline.stages.work.description') }}
        </p>
      </div>
      <div v-if="run.plan.value" class="flex flex-col gap-1.5">
        <div v-if="run.status.value.currentTaskId" class="flex items-center gap-2 rounded-xl border border-primary-500/30 bg-primary-500/5 px-3 py-2 text-xs">
          <span class="i-svg-spinners:ring size-3.5 text-amber-500" />
          <span class="text-neutral-700 dark:text-neutral-200">
            {{ t('settings.pages.pipeline.work.current', { task: run.status.value.currentTaskId }) }}
          </span>
        </div>
        <details class="text-xs">
          <summary class="cursor-pointer text-neutral-500 dark:text-neutral-400 select-none">
            {{ t('settings.pages.pipeline.work.table-title') }}
          </summary>
          <div class="mt-2 flex flex-col gap-2">
            <div class="grid grid-cols-[auto_auto_1fr_auto_auto] gap-2 text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400 px-2">
              <span>#</span>
              <span>{{ t('settings.pages.pipeline.work.type') }}</span>
              <span>{{ t('settings.pages.pipeline.work.title') }}</span>
              <span>{{ t('settings.pages.pipeline.work.status') }}</span>
              <span>{{ t('settings.pages.pipeline.work.duration') }}</span>
            </div>
            <article
              v-for="(task, idx) in run.plan.value.tasks"
              :key="task.id"
              :class="['grid grid-cols-[auto_auto_1fr_auto_auto] gap-2 items-center rounded-xl border px-3 py-2 text-xs', run.status.value.currentTaskId === task.id ? 'border-primary-500/30 bg-primary-500/5' : 'border-black/[0.06] dark:border-white/[0.06] bg-white/40 dark:bg-white/[0.02]']"
            >
              <span class="font-mono text-neutral-500">{{ idx + 1 }}</span>
              <span class="rounded-full bg-neutral-200/60 px-1.5 py-0.5 text-[10px] font-medium uppercase text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                {{ task.type === 'cli' ? 'CLI' : task.type === 'desktop' ? 'DESKTOP' : 'IDE' }}
              </span>
              <span class="truncate">{{ task.title }}</span>
              <span :class="[
                'text-[10px] font-medium',
                run.taskResults.value.get(task.id)?.ok ? 'text-emerald-600 dark:text-emerald-400' : run.status.value.currentTaskId === task.id ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-500',
              ]">
                {{ taskStatus(task, run) }}
              </span>
              <span class="font-mono text-neutral-500">{{ taskDuration(task, run) }}</span>
              <div v-if="taskError(task, run)" class="col-span-full text-[10px] text-red-600 dark:text-red-400">
                {{ taskError(task, run) }}
              </div>
              <div v-if="personaMessageFor(task, run)" class="col-span-full flex items-start gap-1.5 rounded-md bg-rose-50 px-2 py-1.5 text-[10px] text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
                <span class="i-solar:heart-bold mt-0.5 shrink-0 text-xs" />
                <div class="min-w-0">
                  <span class="font-medium">{{ t('settings.pages.pipeline.work.consolation') }}：</span>
                  <span>{{ personaMessageFor(task, run) }}</span>
                </div>
              </div>
            </article>
          </div>
        </details>
      </div>
      <div v-else class="border-2 border-neutral-200 dark:border-neutral-800 rounded-lg border-dashed p-4 text-center text-xs text-neutral-500">
        {{ t('settings.pages.pipeline.work.empty') }}
      </div>
    </section>

    <!-- ⑥ 桌宠监控 -->
    <section :id="'pipeline-block-monitor'" class="scroll-mt-4">
      <div class="mb-2 flex flex-col gap-1">
        <h3 class="text-sm font-semibold">
          {{ stageLabel('monitor') }}
        </h3>
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ t('settings.pages.pipeline.stages.monitor.description') }}
        </p>
      </div>
      <OverseerPanel />
    </section>

    <!-- ⑦ 审核产物 -->
    <section :id="'pipeline-block-product'" class="settings-panel scroll-mt-4 flex flex-col gap-2">
      <div flex="~ col gap-1">
        <h3 class="text-sm font-semibold">
          {{ stageLabel('product') }}
        </h3>
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ t('settings.pages.pipeline.stages.product.description') }}
        </p>
      </div>
      <div v-if="run.taskResults.value.size" class="flex flex-col gap-1.5 text-xs">
        <div class="flex items-center gap-3">
          <span class="rounded-full bg-neutral-400/15 px-2 py-0.5 text-neutral-600 dark:text-neutral-300">
            {{ t('settings.pages.pipeline.product.total', { count: run.stats.value.total }) }}
          </span>
          <span class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">
            {{ t('settings.pages.pipeline.product.completed', { count: run.stats.value.completed }) }}
          </span>
          <span class="rounded-full bg-red-500/15 px-2 py-0.5 text-red-700 dark:text-red-300">
            {{ t('settings.pages.pipeline.product.failed', { count: run.stats.value.failed }) }}
          </span>
        </div>
        <div class="flex flex-col gap-1">
          <div
            v-for="[taskId, result] of [...run.taskResults.value.entries()].slice(0, 20)"
            :key="taskId"
            class="flex items-center gap-2 rounded-lg border border-black/[0.06] dark:border-white/[0.06] bg-white/40 dark:bg-white/[0.02] px-2.5 py-1.5"
          >
            <span :class="['shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase', result.ok ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-red-500/15 text-red-700 dark:text-red-300']">
              {{ result.ok ? 'OK' : 'FAIL' }}
            </span>
            <span class="truncate font-mono text-[10px] text-neutral-400 dark:text-neutral-500">{{ taskId }}</span>
            <span class="ml-auto font-mono text-[10px] text-neutral-400 dark:text-neutral-500">
              {{ (result.durationMs / 1000).toFixed(1) }}s
            </span>
          </div>
        </div>
      </div>
      <div v-else class="border-2 border-neutral-200 dark:border-neutral-800 rounded-lg border-dashed p-4 text-center text-xs text-neutral-500">
        {{ t('settings.pages.pipeline.product.empty') }}
      </div>
    </section>

    <!-- ⑧ 提交归档 -->
    <section :id="'pipeline-block-submit'" class="settings-panel scroll-mt-4 flex flex-col gap-2">
      <div flex="~ col gap-1">
        <h3 class="text-sm font-semibold">
          {{ stageLabel('submit') }}
        </h3>
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ t('settings.pages.pipeline.stages.submit.description') }}
        </p>
      </div>
      <div v-if="run.plan.value" class="flex items-center gap-2 text-xs">
        <span :class="['rounded-full px-2 py-0.5 font-medium', terminalChip(run).cls]">
          {{ terminalChip(run).label }}
        </span>
        <span class="text-neutral-400 dark:text-neutral-500">
          {{ t('settings.pages.pipeline.submit.archive-hint') }}
        </span>
      </div>
      <div v-else class="border-2 border-neutral-200 dark:border-neutral-800 rounded-lg border-dashed p-4 text-center text-xs text-neutral-500">
        {{ t('settings.pages.pipeline.submit.empty') }}
      </div>
    </section>
  </div>
</template>