<script setup lang="ts">
import type { ExecutorEventPayload, ExecutorStatus, Plan, Task, TaskResult } from '../../../../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { getElectronEventaContext, useElectronEventaInvoke } from '@kitsune/electron-vueuse'
import { Button, Callout, FieldInput } from '@kitsune/ui'
import { computed, onScopeDispose, ref } from 'vue'

import {
  electronExecutorEvent,
  electronExecutorGenerate,
  electronExecutorRun,
  electronExecutorStatus,
  electronExecutorStop,
} from '../../../../../shared/eventa'
import { useEnvironmentI18n } from './use-environment-i18n'

const { tn } = useEnvironmentI18n()
const invokeExecutorGenerate = useElectronEventaInvoke(electronExecutorGenerate)
const invokeExecutorRun = useElectronEventaInvoke(electronExecutorRun)
const invokeExecutorStop = useElectronEventaInvoke(electronExecutorStop)
const invokeExecutorStatus = useElectronEventaInvoke(electronExecutorStatus)

const PANEL = 'settings-panel'

const executorRequirement = ref('')
const executorBusy = ref(false)
const executorPlan = ref<Plan | null>(null)
const executorStatus = ref<ExecutorStatus>({ plan: null, currentTaskId: null, currentTaskAttempt: 0, isRunning: false })
const executorTaskResults = ref<Map<string, TaskResult>>(new Map())
const executorTaskPersonaMessages = ref<Map<string, string>>(new Map())
const errorMessage = ref('')

const executorStatusLabel = computed(() => {
  if (executorBusy.value && !executorStatus.value.isRunning)
    return tn('executor.status.generating')
  if (executorStatus.value.isRunning && executorPlan.value)
    return tn('executor.status.running', { current: executorStatus.value.currentTaskAttempt + 1, total: executorPlan.value.tasks.length })
  if (executorPlan.value?.status === 'aborted')
    return tn('executor.status.aborted')
  if (executorPlan.value?.status === 'completed')
    return tn('executor.status.completed')
  return tn('executor.status.idle')
})

const executorStatusBadge = computed(() => {
  if (executorPlan.value?.status === 'aborted')
    return 'bg-red-500/15 text-red-700 dark:text-red-300'
  if (executorPlan.value?.status === 'completed')
    return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
  if (executorBusy.value || executorStatus.value.isRunning)
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
  return 'bg-neutral-400/20 text-neutral-600 dark:text-neutral-300'
})

async function executorGenerate() {
  if (!executorRequirement.value.trim())
    return
  executorBusy.value = true
  executorPlan.value = null
  executorTaskResults.value.clear()
  executorTaskPersonaMessages.value.clear()
  try {
    const result = await invokeExecutorGenerate({ requirement: executorRequirement.value, cwd: '' })
    if (result?.ok && result.plan) {
      executorPlan.value = result.plan
    }
    else {
      errorMessage.value = errorMessageFrom(new Error(result?.error ?? '生成计划失败')) ?? '生成计划失败'
    }
  }
  catch (e) {
    errorMessage.value = errorMessageFrom(e) ?? 'Unknown error'
  }
  finally {
    executorBusy.value = false
  }
}

async function executorExecute() {
  if (!executorPlan.value)
    return
  executorPlan.value.status = 'pending'
  executorTaskResults.value.clear()
  executorTaskPersonaMessages.value.clear()
  await invokeExecutorRun({ plan: executorPlan.value })
}

async function executorStop() {
  await invokeExecutorStop()
}

function executorTaskStatus(task: Task): string {
  if (executorPlan.value?.status === 'aborted' && executorStatus.value.currentTaskId === task.id && !executorTaskResults.value.get(task.id)?.ok)
    return tn('executor.plan-status.aborted')
  if (executorTaskResults.value.get(task.id)?.ok)
    return tn('executor.plan-status.completed')
  if (executorStatus.value.currentTaskId === task.id)
    return tn('executor.status.running', { current: executorStatus.value.currentTaskAttempt + 1, total: 1 })
  return tn('executor.plan-status.pending')
}

function executorTaskDuration(task: Task): string {
  const r = executorTaskResults.value.get(task.id)
  if (!r)
    return '-'
  return `${(r.durationMs / 1000).toFixed(1)}s`
}

function executorFormatTaskError(task: Task): string {
  const r = executorTaskResults.value.get(task.id)
  if (!r?.error)
    return ''
  return tn('executor.task-error-fmt', { idx: executorPlan.value?.tasks.indexOf(task) ?? '-', error: r.error })
}

let eventaContext: ReturnType<typeof getElectronEventaContext> | undefined
try {
  eventaContext = getElectronEventaContext()
}
catch (e) {
  console.warn('[environment/executor] IPC bridge unavailable:', e)
}

const offExecutorEvent = eventaContext?.on(electronExecutorEvent, (event) => {
  if (!event?.body)
    return
  const payload = event.body as ExecutorEventPayload
  if (payload.type === 'plan_started') {
    executorStatus.value.isRunning = true
  }
  else if (payload.type === 'task_started') {
    executorStatus.value.currentTaskId = payload.taskId ?? null
    executorStatus.value.currentTaskAttempt = payload.attempt ?? 0
  }
  else if (payload.type === 'task_completed' && payload.result) {
    executorTaskResults.value.set(payload.result.taskId, payload.result)
  }
  else if (payload.type === 'task_failed' && payload.result) {
    executorTaskResults.value.set(payload.result.taskId, payload.result)
  }
  else if (payload.type === 'task_failed' && payload.personaMessage) {
    if (payload.taskId)
      executorTaskPersonaMessages.value.set(payload.taskId, payload.personaMessage)
  }
  else if (payload.type === 'plan_completed' || payload.type === 'plan_aborted' || payload.type === 'plan_stopped') {
    executorStatus.value.isRunning = false
    executorStatus.value.currentTaskId = null
  }
  else if (payload.type === 'pet_alert') {
    errorMessage.value = payload.message ?? ''
  }
  else if (payload.type === 'dag_level_started') {
    executorStatus.value.currentLevel = payload.levelIndex
  }
  else if (payload.type === 'plan_adjusted') {
    errorMessage.value = `计划已调整：失败任务 ${payload.failedTaskId} 被替代为 ${payload.newTaskCount} 个新任务`
  }
  else if (payload.type === 'sub_plan_started') {
    errorMessage.value = `开始执行子计划：${payload.subPlanId}`
  }
  else if (payload.type === 'sub_plan_completed') {
    errorMessage.value = `子计划完成：${payload.subPlanId} (${payload.status})`
  }
})
onScopeDispose(() => offExecutorEvent?.())

async function initStatus() {
  try {
    const status = await invokeExecutorStatus()
    if (status)
      executorStatus.value = status
  }
  catch {
    // 状态查询失败不影响页面
  }
}
initStatus()
</script>

<template>
  <section :class="PANEL">
    <Callout v-if="errorMessage" theme="orange" :label="tn('executor.error-title')">
      {{ errorMessage }}
    </Callout>
    <div class="flex items-start justify-between gap-2">
      <div flex="~ col gap-1">
        <h3 class="text-sm font-semibold">
          {{ tn('executor.title') }}
        </h3>
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ tn('executor.description') }}
        </p>
      </div>
      <span
        :class="[
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase',
          executorStatusBadge,
        ]"
      >
        {{ executorStatusLabel }}
      </span>
    </div>

    <!-- 输入区 -->
    <div class="flex items-end gap-2">
      <FieldInput
        v-model="executorRequirement"
        class="flex-1"
        :label="tn('executor.description')"
        :placeholder="tn('executor.input-placeholder')"
        type="text"
        :disabled="executorBusy || executorStatus.isRunning"
      />
      <Button
        variant="primary" size="sm"
        :loading="executorBusy"
        :disabled="!executorRequirement.trim() || executorStatus.isRunning"
        :label="tn('executor.actions.execute')"
        icon="i-solar:play-bold-duotone"
        @click="executorGenerate"
      />
      <Button
        variant="secondary" size="sm"
        :disabled="!executorRequirement.trim() || executorBusy || executorStatus.isRunning"
        :label="tn('executor.actions.generate-only')"
        icon="i-solar:list-check-bold-duotone"
        @click="executorGenerate"
      />
      <Button
        v-if="executorPlan && !executorStatus.isRunning"
        variant="primary" size="sm"
        :disabled="executorBusy"
        :label="tn('executor.actions.execute')"
        icon="i-solar:play-bold-duotone"
        @click="executorExecute"
      />
      <Button
        v-if="executorStatus.isRunning"
        variant="danger" size="sm"
        :label="tn('executor.actions.stop')"
        icon="i-solar:stop-bold-duotone"
        @click="executorStop"
      />
    </div>

    <!-- 计划列表 -->
    <div v-if="executorPlan" class="flex flex-col gap-2">
      <div class="grid grid-cols-[auto_auto_1fr_auto_auto] gap-2 text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400 px-2">
        <span>#</span>
        <span>{{ tn('executor.table.type') }}</span>
        <span>{{ tn('executor.table.title') }}</span>
        <span>{{ tn('executor.table.status') }}</span>
        <span>{{ tn('executor.table.duration') }}</span>
      </div>
      <article
        v-for="(task, idx) in executorPlan.tasks"
        :key="task.id"
        :class="['grid grid-cols-[auto_auto_1fr_auto_auto] gap-2 items-center rounded-xl border px-3 py-2 text-xs', executorStatus.currentTaskId === task.id ? 'border-primary-500/30 bg-primary-500/5' : 'border-black/[0.06] dark:border-white/[0.06] bg-white/40 dark:bg-white/[0.02]']"
      >
        <span class="font-mono text-neutral-500">{{ idx + 1 }}</span>
        <span class="rounded-full bg-neutral-200/60 px-1.5 py-0.5 text-[10px] font-medium uppercase text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
          {{ task.type === 'cli' ? 'CLI' : 'IDE' }}
        </span>
        <span class="truncate">{{ task.title }}</span>
        <span :class="[
          'text-[10px] font-medium',
          executorTaskResults.get(task.id)?.ok ? 'text-emerald-600 dark:text-emerald-400' : executorStatus.currentTaskId === task.id ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-500',
        ]">
          {{ executorTaskStatus(task) }}
        </span>
        <span class="font-mono text-neutral-500">{{ executorTaskDuration(task) }}</span>
        <div
          v-if="executorFormatTaskError(task)"
          :class="['col-span-full text-[10px] text-red-600 dark:text-red-400']"
        >
          {{ executorFormatTaskError(task) }}
        </div>
        <div
          v-if="executorTaskPersonaMessages.get(task.id)"
          :class="[
            'col-span-full flex items-start gap-1.5 rounded-md px-2 py-1.5',
            'bg-rose-50 dark:bg-rose-950/30',
            'text-[10px] text-rose-700 dark:text-rose-300',
          ]"
        >
          <span class="i-solar:heart-bold mt-0.5 shrink-0 text-xs" />
          <div class="min-w-0">
            <span class="font-medium">桌宠安慰：</span>
            <span>{{ executorTaskPersonaMessages.get(task.id) }}</span>
          </div>
        </div>
      </article>
    </div>

    <div v-else class="border-2 border-neutral-200 rounded-lg border-dashed p-6 text-center text-xs text-neutral-500 dark:border-neutral-800">
      {{ tn('executor.no-plan') }}
    </div>
  </section>
</template>
