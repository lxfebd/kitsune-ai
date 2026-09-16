<script setup lang="ts">
/**
 * 总监评审页 — 桌宠作为"监工"评审外部 AI 工具生成的计划。
 *
 * 左：计划列表（按时间倒序，状态徽章 + verdict 状态）
 * 右：选中计划的详情（需求 + DAG 任务图 + LLM 评审反馈 + verdict 结果）
 *
 * 数据面（主进程）：
 *  - electronDirectorList    → 计划摘要列表
 *  - electronDirectorDetail  → 单个计划详情（完整 IR + verdict + review markdown）
 *  - electronDirectorReview  → 调 LLM 评审最新未评审计划
 *  - electronDirectorApprove / Reject → 直接给 verdict
 */
import type { DirectorPlanDetail, DirectorPlanSummary } from '../../../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@kitsune/electron-vueuse'
import { Button, Callout } from '@kitsune/ui'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  electronDirectorApprove,
  electronDirectorDetail,
  electronDirectorList,
  electronDirectorReject,
  electronDirectorRevise,
  electronDirectorReview,
} from '../../../../shared/eventa'
import PlanGraph from '../../../components/plan-graph/index.vue'

const invokeList = useElectronEventaInvoke(electronDirectorList)
const invokeDetail = useElectronEventaInvoke(electronDirectorDetail)
const invokeReview = useElectronEventaInvoke(electronDirectorReview)
const invokeApprove = useElectronEventaInvoke(electronDirectorApprove)
const invokeReject = useElectronEventaInvoke(electronDirectorReject)
const invokeRevise = useElectronEventaInvoke(electronDirectorRevise)

const { t } = useI18n()

const plans = ref<DirectorPlanSummary[]>([])
const selectedPlanId = ref<string | null>(null)
const detail = ref<DirectorPlanDetail | null>(null)
const reviewing = ref(false)
const actionBusy = ref(false)
const errorMessage = ref('')
const infoMessage = ref('')

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-neutral-400/20 text-neutral-600 dark:text-neutral-300',
  running: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  completed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  aborted: 'bg-red-500/15 text-red-700 dark:text-red-300',
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: t('settings.pages.director.status.pending'),
    running: t('settings.pages.director.status.running'),
    completed: t('settings.pages.director.status.completed'),
    aborted: t('settings.pages.director.status.aborted'),
  }
  return map[status] ?? status
}

function verdictLabel(v: DirectorPlanSummary['verdict']): string {
  if (!v)
    return t('settings.pages.director.verdict.pending')
  return v.verdict === 'approved' ? t('settings.pages.director.verdict.approved') : t('settings.pages.director.verdict.rejected')
}

function verdictBadge(v: DirectorPlanSummary['verdict']): string {
  if (!v)
    return 'bg-neutral-400/15 text-neutral-500 dark:text-neutral-400'
  return v.verdict === 'approved'
    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
    : 'bg-red-500/15 text-red-700 dark:text-red-300'
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleString()
}

async function loadPlans() {
  try {
    const list = await invokeList()
    plans.value = list ?? []
    if (selectedPlanId.value) {
      const exists = plans.value.some(p => p.id === selectedPlanId.value)
      if (!exists)
        selectedPlanId.value = null
    }
    // 默认选中第一个
    if (!selectedPlanId.value && plans.value.length > 0)
      selectPlan(plans.value[0].id)
  }
  catch (e) {
    errorMessage.value = errorMessageFrom(e) ?? t('settings.pages.director.load-list-fail')
  }
}

async function selectPlan(id: string) {
  selectedPlanId.value = id
  errorMessage.value = ''
  detail.value = null
  try {
    const d = await invokeDetail({ planId: id })
    if (d)
      detail.value = d
  }
  catch (e) {
    errorMessage.value = errorMessageFrom(e) ?? t('settings.pages.director.load-detail-fail')
  }
}

async function reviewSelected() {
  if (!selectedPlanId.value)
    return
  reviewing.value = true
  errorMessage.value = ''
  try {
    const result = await invokeReview()
    if (result?.ok) {
      infoMessage.value = t('settings.pages.director.review-result', {
        planId: result.planId ?? '',
        verdict: result.verdict === 'approved' ? t('settings.pages.director.verdict-pass') : t('settings.pages.director.verdict-fail'),
      })
      await loadPlans()
      if (result.planId)
        await selectPlan(result.planId)
    }
    else {
      errorMessage.value = result?.error ?? t('settings.pages.director.review-fail')
    }
  }
  catch (e) {
    errorMessage.value = errorMessageFrom(e) ?? t('settings.pages.director.review-fail')
  }
  finally {
    reviewing.value = false
  }
}

async function approveSelected(reason: string) {
  if (!selectedPlanId.value)
    return
  actionBusy.value = true
  errorMessage.value = ''
  try {
    const result = await invokeApprove({ planId: selectedPlanId.value, reason })
    if (result?.ok) {
      infoMessage.value = t('settings.pages.director.approved-plan')
      await loadPlans()
      await selectPlan(selectedPlanId.value)
    }
    else {
      errorMessage.value = result?.error ?? t('settings.pages.director.approve-fail')
    }
  }
  catch (e) {
    errorMessage.value = errorMessageFrom(e) ?? t('settings.pages.director.approve-fail')
  }
  finally {
    actionBusy.value = false
  }
}

async function rejectSelected(reason: string) {
  if (!selectedPlanId.value)
    return
  actionBusy.value = true
  errorMessage.value = ''
  try {
    const result = await invokeReject({ planId: selectedPlanId.value, reason })
    if (result?.ok) {
      infoMessage.value = t('settings.pages.director.rejected-plan')
      await loadPlans()
      await selectPlan(selectedPlanId.value)
    }
    else {
      errorMessage.value = result?.error ?? t('settings.pages.director.reject-fail')
    }
  }
  catch (e) {
    errorMessage.value = errorMessageFrom(e) ?? t('settings.pages.director.reject-fail')
  }
  finally {
    actionBusy.value = false
  }
}

/** 驳回后修订 — 按评审意见让 LLM 重写任务清单并写回（清空 verdict 回到待评审）。 */
async function reviseSelected() {
  if (!selectedPlanId.value)
    return
  actionBusy.value = true
  errorMessage.value = ''
  try {
    const result = await invokeRevise({ planId: selectedPlanId.value })
    if (result?.ok) {
      infoMessage.value = t('settings.pages.director.revised-plan')
      await loadPlans()
      await selectPlan(selectedPlanId.value)
    }
    else {
      errorMessage.value = result?.error ?? t('settings.pages.director.revise-fail')
    }
  }
  catch (e) {
    errorMessage.value = errorMessageFrom(e) ?? t('settings.pages.director.revise-fail')
  }
  finally {
    actionBusy.value = false
  }
}

const selectedTasks = computed(() => {
  const tasks = detail.value?.plan?.tasks
  if (!Array.isArray(tasks))
    return []
  return tasks.map((t) => {
    const task = t as Record<string, unknown>
    return {
      id: String(task.id ?? ''),
      type: String(task.type ?? ''),
      title: String(task.title ?? ''),
      dependsOn: Array.isArray(task.dependsOn) ? (task.dependsOn as string[]) : undefined,
    }
  })
})

onMounted(loadPlans)
</script>

<template>
  <div flex="~ col gap-4">
    <Callout v-if="errorMessage" theme="orange" :label="t('settings.pages.director.error-title')">
      {{ errorMessage }}
    </Callout>
    <Callout v-if="infoMessage" theme="lime" :label="t('settings.pages.director.info-title')">
      {{ infoMessage }}
    </Callout>

    <!-- 双栏：计划列表 + 详情 -->
    <div class="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <!-- 左：计划列表 -->
      <section class="settings-panel flex flex-col gap-2 self-start">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-sm font-semibold">
            {{ t('settings.pages.director.list-title') }}
          </h3>
          <Button
            variant="primary" size="sm"
            :loading="reviewing"
            :disabled="!plans.length"
            :label="t('settings.pages.director.review-latest')"
            icon="i-solar:magic-stick-3-bold-duotone"
            @click="reviewSelected"
          />
        </div>

        <div v-if="!plans.length" class="border-2 border-neutral-200 dark:border-neutral-800 rounded-lg border-dashed p-4 text-center text-xs text-neutral-500">
          <span class="whitespace-pre-line">{{ t('settings.pages.director.empty-plans') }}</span>
        </div>

        <button
          v-for="plan in plans"
          :key="plan.id"
          class="flex cursor-pointer flex-col gap-1.5 rounded-xl border px-3 py-2 text-left text-xs transition-colors"
          :class="selectedPlanId === plan.id
            ? 'border-primary-500/40 bg-primary-500/5'
            : 'border-black/[0.06] dark:border-white/[0.06] bg-white/40 dark:bg-white/[0.02] hover:border-primary-500/25'"
          @click="selectPlan(plan.id)"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="truncate font-mono text-[10px] text-neutral-400 dark:text-neutral-500">{{ plan.id }}</span>
            <span :class="['shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide', verdictBadge(plan.verdict)]">
              {{ verdictLabel(plan.verdict) }}
            </span>
          </div>
          <span class="line-clamp-2 text-xs leading-snug text-neutral-700 dark:text-neutral-200">{{ plan.requirement }}</span>
          <div class="flex items-center gap-2 text-[10px] text-neutral-400 dark:text-neutral-500">
            <span :class="['rounded-full px-1.5 py-0.5 font-medium', STATUS_BADGE[plan.status]]">
              {{ statusLabel(plan.status) }}
            </span>
            <span v-if="plan.taskCount != null">{{ t('settings.pages.director.task-count', { count: plan.taskCount }) }}</span>
            <span class="ml-auto">{{ formatDate(plan.createdAt) }}</span>
          </div>
        </button>
      </section>

      <!-- 右：详情 -->
      <section v-if="detail?.plan" class="settings-panel flex flex-col gap-4">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div class="min-w-0 flex flex-col gap-1">
            <h3 class="text-sm font-semibold break-all">
              {{ detail.plan.requirement }}
            </h3>
            <p class="font-mono text-[10px] text-neutral-400 dark:text-neutral-500">
              {{ detail.plan.id }} · {{ t('settings.pages.director.task-count', { count: detail.plan.tasks.length }) }} · {{ formatDate(detail.plan.createdAt) }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <Button
              variant="primary" size="sm"
              :loading="reviewing"
              :label="t('settings.pages.director.review')"
              icon="i-solar:magic-stick-3-bold-duotone"
              @click="reviewSelected"
            />
            <Button
              variant="caution" size="sm"
              :loading="actionBusy"
              :label="t('settings.pages.director.approve')"
              icon="i-solar:check-circle-bold-duotone"
              @click="approveSelected(t('settings.pages.director.approve-reason'))"
            />
            <Button
              variant="danger" size="sm"
              :loading="actionBusy"
              :label="t('settings.pages.director.reject')"
              icon="i-solar:close-circle-bold-duotone"
              @click="rejectSelected(t('settings.pages.director.reject-reason'))"
            />
            <Button
              v-if="detail?.verdict?.verdict === 'rejected'"
              variant="caution" size="sm"
              :loading="actionBusy"
              :label="t('settings.pages.director.revise')"
              icon="i-solar:pen-new-round-bold-duotone"
              @click="reviseSelected"
            />
          </div>
        </div>

        <!-- verdict 结果 -->
        <div
          v-if="detail.verdict"
          class="flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs"
          :class="detail.verdict.verdict === 'approved'
            ? 'border-emerald-400/40 bg-emerald-500/5'
            : 'border-red-400/40 bg-red-500/5'"
        >
          <span
            :class="[
              'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              detail.verdict.verdict === 'approved'
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : 'bg-red-500/15 text-red-700 dark:text-red-300',
            ]"
          >
            {{ detail.verdict.verdict === 'approved' ? t('settings.pages.director.verdict-approved') : t('settings.pages.director.verdict-rejected') }}
          </span>
          <div class="min-w-0">
            <p class="leading-relaxed text-neutral-700 dark:text-neutral-200">{{ detail.verdict.reason }}</p>
            <p class="mt-1 text-[10px] text-neutral-400 dark:text-neutral-500">{{ formatDate(detail.verdict.reviewedAt) }}</p>
          </div>
        </div>
        <div v-else class="border-2 border-neutral-200 dark:border-neutral-800 rounded-lg border-dashed p-3 text-center text-xs text-neutral-500">
          {{ t('settings.pages.director.not-reviewed') }}
        </div>

        <!-- DAG 任务图 -->
        <div class="flex flex-col gap-2">
          <div class="text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            {{ t('settings.pages.director.graph-title') }}
          </div>
          <PlanGraph :tasks="selectedTasks" />
        </div>

        <!-- LLM 评审反馈 markdown -->
        <div v-if="detail.reviewMarkdown" class="flex flex-col gap-2">
          <div class="text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            {{ t('settings.pages.director.review-title') }}
          </div>
          <pre class="whitespace-pre-wrap break-words rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white/40 dark:bg-white/[0.02] p-3 text-xs leading-relaxed text-neutral-700 dark:text-neutral-200">{{ detail.reviewMarkdown }}</pre>
        </div>
      </section>

      <!-- 无选中详情时的空态 -->
      <section v-else class="settings-panel flex flex-col items-center justify-center gap-2 py-16 text-center">
        <div class="i-solar:document-text-bold text-3xl text-neutral-300 dark:text-neutral-600" />
        <p class="text-sm text-neutral-500 dark:text-neutral-400">
          {{ detail ? t('settings.pages.director.detail-loading') : t('settings.pages.director.empty-detail') }}
        </p>
      </section>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.director.title
  descriptionKey: settings.pages.director.description
  subtitleKey: settings.title
  settingsEntry: true
  order: 5
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>