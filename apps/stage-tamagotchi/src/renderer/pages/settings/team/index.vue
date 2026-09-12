<script setup lang="ts">
import type {
  CoordinatorAgentStatusView,
  ExecutorEventPayload,
  ExecutorStatus,
  Plan,
} from '../../../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { getElectronEventaContext, useElectronEventaInvoke } from '@kitsune/electron-vueuse'
import { Button, Callout, Textarea } from '@kitsune/ui'
import { computed, onMounted, onScopeDispose, ref } from 'vue'

import {
  electronCoordinatorSubmit,
  electronCoordinatorTeam,
  electronExecutorEvent,
  electronExecutorStatus,
  electronExecutorStop,
} from '../../../../shared/eventa'
import { useEnvironmentI18n } from '../environment/components/use-environment-i18n'

const { tn } = useEnvironmentI18n()

const invokeCoordinatorSubmit = useElectronEventaInvoke(electronCoordinatorSubmit)
const invokeCoordinatorTeam = useElectronEventaInvoke(electronCoordinatorTeam)
const invokeExecutorStatus = useElectronEventaInvoke(electronExecutorStatus)
const invokeExecutorStop = useElectronEventaInvoke(electronExecutorStop)

const PANEL = 'settings-panel'

// ——— 团队花名册 ———
const roster = ref<CoordinatorAgentStatusView[]>([])
const rosterLoading = ref(false)

// ——— 派活 ———
const requirement = ref('')
const submitting = ref(false)
const stopping = ref(false)
const errorMessage = ref('')
const lastPlan = ref<Plan | null>(null)
const executorBusy = ref(false)
const executorStatus = ref<ExecutorStatus>({ plan: null, currentTaskId: null, currentTaskAttempt: 0, isRunning: false })

// 花名册排序：先展示可派活的，其次在线，最后离线；忙的排最前
const sortedRoster = computed(() => {
  return [...roster.value].sort((a, b) => {
    if (a.busy !== b.busy)
      return a.busy ? -1 : 1
    if (a.online !== b.online)
      return a.online ? -1 : 1
    if (a.dispatchable !== b.dispatchable)
      return a.dispatchable ? -1 : 1
    return a.name.localeCompare(b.name)
  })
})

const planSummary = computed(() => {
  const plan = lastPlan.value
  if (!plan)
    return null
  // coordination_started 事件带 agentCount；lastPlan 没有该字段，从 roster 中统计忙的人数兜底
  const agentCount = roster.value.filter(a => a.busy).length
  return tn('team.plan-summary', { taskCount: plan.tasks.length, agentCount })
})

function agentStatusBadge(agent: CoordinatorAgentStatusView): string {
  if (agent.busy)
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
  if (agent.online)
    return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
  return 'bg-neutral-400/20 text-neutral-600 dark:text-neutral-400'
}

function agentStatusLabel(agent: CoordinatorAgentStatusView): string {
  if (agent.busy)
    return tn('team.status.busy')
  if (agent.online)
    return tn('team.status.online')
  if (!agent.dispatchable)
    return tn('team.status.perceive-only')
  return tn('team.status.offline')
}

function agentOutcomeLabel(agent: CoordinatorAgentStatusView): string {
  const o = agent.lastOutcome
  if (!o)
    return tn('team.status.never')
  const status = o.ok ? tn('team.outcome.ok') : tn('team.outcome.failed')
  const when = o.at ? new Date(o.at).toLocaleTimeString() : ''
  return `${status} · ${o.title}${when ? ` · ${when}` : ''}`
}

async function refreshRoster() {
  rosterLoading.value = true
  try {
    roster.value = (await invokeCoordinatorTeam()) ?? []
  }
  catch (e) {
    errorMessage.value = errorMessageFrom(e) ?? 'Unknown error'
  }
  finally {
    rosterLoading.value = false
  }
}

async function delegate() {
  if (!requirement.value.trim() || submitting.value)
    return
  submitting.value = true
  errorMessage.value = ''
  try {
    const result = await invokeCoordinatorSubmit({ requirement: requirement.value, cwd: '' })
    if (result?.ok && result.plan) {
      lastPlan.value = result.plan
      requirement.value = ''
    }
    else {
      errorMessage.value = result?.error ?? tn('team.error-title')
    }
  }
  catch (e) {
    errorMessage.value = errorMessageFrom(e) ?? 'Unknown error'
  }
  finally {
    submitting.value = false
  }
}

async function stopExecution() {
  stopping.value = true
  try {
    await invokeExecutorStop()
  }
  catch (e) {
    errorMessage.value = errorMessageFrom(e) ?? 'Unknown error'
  }
  finally {
    stopping.value = false
  }
}

// ——— 事件流：agent_outcome / coordination_started 触发花名册刷新 ———
let eventaContext: ReturnType<typeof getElectronEventaContext> | undefined
try {
  eventaContext = getElectronEventaContext()
}
catch (e) {
  console.warn('[settings/team] IPC bridge unavailable:', e)
}

let rosterTimer: ReturnType<typeof setInterval> | undefined

const offExecutorEvent = eventaContext?.on(electronExecutorEvent, (event) => {
  if (!event?.body)
    return
  const payload = event.body as ExecutorEventPayload
  if (payload.type === 'coordination_started') {
    executorBusy.value = true
    // 延迟 300ms 再拉一次花名册（activeAssignments 已在事件前 set 好）
    refreshRoster()
  }
  else if (payload.type === 'agent_outcome') {
    refreshRoster()
  }
  else if (payload.type === 'plan_completed' || payload.type === 'plan_aborted' || payload.type === 'plan_stopped') {
    executorBusy.value = false
    refreshRoster()
  }
  else if (payload.type === 'plan_started') {
    executorBusy.value = true
  }
})
onScopeDispose(() => {
  offExecutorEvent?.()
  if (rosterTimer)
    clearInterval(rosterTimer)
})

async function init() {
  // 初始状态：拉取 executor 运行状态 + 花名册
  try {
    const status = await invokeExecutorStatus()
    if (status) {
      executorStatus.value = status
      executorBusy.value = status.isRunning
    }
  }
  catch {
    // 状态查询失败不影响页面
  }
  await refreshRoster()
  // 兜底轮询：主进程事件流不可用时花名册仍能刷新
  rosterTimer = setInterval(() => {
    refreshRoster()
  }, 5000)
}
onMounted(init)
</script>

<template>
  <div flex="~ col gap-4">
    <!-- 头部：标题 + 描述 -->
    <section class="settings-panel">
      <div flex="~ col gap-1">
        <h3 class="text-sm font-semibold">
          {{ tn('team.title') }}
        </h3>
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ tn('team.description') }}
        </p>
      </div>
    </section>

    <section :class="PANEL">
      <Callout v-if="errorMessage" theme="orange" :label="tn('team.error-title')">
        {{ errorMessage }}
      </Callout>

      <!-- 派活输入区 -->
      <div class="flex items-end gap-2">
        <Textarea
          v-model="requirement"
          class="flex-1"
          :placeholder="tn('team.delegate-placeholder')"
          :disabled="submitting || executorBusy"
          @submit="delegate"
        />
        <Button
          variant="primary" size="sm"
          :loading="submitting"
          :disabled="!requirement.trim() || executorBusy"
          :label="submitting ? tn('team.delegating') : tn('team.delegate')"
          icon="i-solar:users-group-rounded-bold-duotone"
          @click="delegate"
        />
        <Button
          v-if="executorBusy"
          variant="danger" size="sm"
          :loading="stopping"
          :label="stopping ? tn('team.stopping') : tn('team.stop')"
          icon="i-solar:stop-bold-duotone"
          @click="stopExecution"
        />
      </div>
      <p v-if="executorBusy && !lastPlan" class="mt-1 text-xs text-amber-600 dark:text-amber-400">
        {{ tn('executor.status.running', { current: executorStatus.currentTaskAttempt + 1, total: executorStatus.plan?.tasks.length ?? 0 }) }}
      </p>
      <p v-if="planSummary" class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
        {{ planSummary }}
      </p>
      <p class="mt-1 text-[11px] text-neutral-400 dark:text-neutral-500">
        {{ tn('team.hint') }}
      </p>
    </section>

    <!-- 花名册 -->
    <section :class="PANEL">
      <div class="mb-2 flex items-center justify-between gap-2">
        <h3 class="text-sm font-semibold">
          {{ tn('team.roster-title') }}
        </h3>
        <button
          class="rounded-lg bg-neutral-400/10 px-2 py-1 text-xs text-neutral-500 transition-colors hover:bg-neutral-400/20 dark:text-neutral-400"
          :disabled="rosterLoading"
          @click="refreshRoster"
        >
          <span class="i-solar:refresh-linear inline-block align-[-2px]" />
          {{ tn('team.status.online') }}
        </button>
      </div>

      <div v-if="roster.length" class="flex flex-col gap-2">
        <article
          v-for="agent in sortedRoster"
          :key="agent.id"
          :class="[
            'rounded-xl border px-3 py-2.5',
            agent.busy
              ? 'border-primary-500/30 bg-primary-500/5'
              : 'border-black/[0.06] dark:border-white/[0.06] bg-white/40 dark:bg-white/[0.02]',
          ]"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="flex min-w-0 items-center gap-2">
              <span
                :class="['size-2 shrink-0 rounded-full', agent.online ? (agent.busy ? 'bg-amber-400' : 'bg-emerald-400') : 'bg-neutral-400/40']"
              />
              <span class="truncate text-xs font-semibold">{{ agent.name }}</span>
              <code class="rounded bg-neutral-200/60 px-1 py-0.5 font-mono text-[10px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300">
                {{ agent.id }}
              </code>
            </div>
            <span
              :class="[
                'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                agentStatusBadge(agent),
              ]"
            >
              <span v-if="agent.busy" class="i-solar:loading-circle-line inline-block animate-spin" />
              {{ agentStatusLabel(agent) }}
            </span>
          </div>

          <p v-if="agent.personality" class="mt-1.5 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            {{ agent.personality }}
          </p>

          <p class="mt-1 text-[11px] text-neutral-400 dark:text-neutral-500">
            {{ tn('team.fields.last') }}: {{ agentOutcomeLabel(agent) }}
          </p>
        </article>
      </div>
      <div v-else class="border-2 border-neutral-200 border-dashed rounded-lg p-6 text-center text-xs text-neutral-500 dark:border-neutral-800">
        {{ tn('team.empty') }}
      </div>
    </section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.environment.team.title
  subtitleKey: settings.title
  settingsEntry: true
  order: 8
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
