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

import {
  electronDirectorApprove,
  electronDirectorDetail,
  electronDirectorList,
  electronDirectorReject,
  electronDirectorReview,
} from '../../../../shared/eventa'
import PlanGraph from '../../../components/plan-graph/index.vue'

const invokeList = useElectronEventaInvoke(electronDirectorList)
const invokeDetail = useElectronEventaInvoke(electronDirectorDetail)
const invokeReview = useElectronEventaInvoke(electronDirectorReview)
const invokeApprove = useElectronEventaInvoke(electronDirectorApprove)
const invokeReject = useElectronEventaInvoke(electronDirectorReject)

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
    pending: '待执行',
    running: '执行中',
    completed: '已完成',
    aborted: '已中止',
  }
  return map[status] ?? status
}

function verdictLabel(v: DirectorPlanSummary['verdict']): string {
  if (!v)
    return '待评审'
  return v.verdict === 'approved' ? '已批准' : '已驳回'
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
    errorMessage.value = errorMessageFrom(e) ?? '加载计划列表失败'
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
    errorMessage.value = errorMessageFrom(e) ?? '加载计划详情失败'
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
      infoMessage.value = `已评审 ${result.planId ?? ''}: ${result.verdict === 'approved' ? '✅ 通过' : '❌ 打回'}`
      await loadPlans()
      if (result.planId)
        await selectPlan(result.planId)
    }
    else {
      errorMessage.value = result?.error ?? '评审失败'
    }
  }
  catch (e) {
    errorMessage.value = errorMessageFrom(e) ?? '评审调用失败'
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
      infoMessage.value = '已批准该计划'
      await loadPlans()
      await selectPlan(selectedPlanId.value)
    }
    else {
      errorMessage.value = result?.error ?? '批准失败'
    }
  }
  catch (e) {
    errorMessage.value = errorMessageFrom(e) ?? '批准调用失败'
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
      infoMessage.value = '已驳回该计划'
      await loadPlans()
      await selectPlan(selectedPlanId.value)
    }
    else {
      errorMessage.value = result?.error ?? '驳回失败'
    }
  }
  catch (e) {
    errorMessage.value = errorMessageFrom(e) ?? '驳回调用失败'
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
    <Callout v-if="errorMessage" theme="orange" label="错误">
      {{ errorMessage }}
    </Callout>
    <Callout v-if="infoMessage" theme="lime" label="提示">
      {{ infoMessage }}
    </Callout>

    <!-- 双栏：计划列表 + 详情 -->
    <div class="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <!-- 左：计划列表 -->
      <section class="settings-panel flex flex-col gap-2 self-start">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-sm font-semibold">
            待评审计划
          </h3>
          <Button
            variant="primary" size="sm"
            :loading="reviewing"
            :disabled="!plans.length"
            label="评审最新"
            icon="i-solar:magic-stick-3-bold-duotone"
            @click="reviewSelected"
          />
        </div>

        <div v-if="!plans.length" class="border-2 border-neutral-200 dark:border-neutral-800 rounded-lg border-dashed p-4 text-center text-xs text-neutral-500">
          暂无计划<br><br>
          把外部 AI 生成的计划 JSON 放进<br>
          <code class="text-[10px] text-primary-600 dark:text-primary-400">.kitsune/plans/plans/</code><br>
          桌宠会自动评审
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
            <span>{{ plan.taskCount }} 任务</span>
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
              {{ detail.plan.id }} · {{ detail.plan.tasks.length }} 任务 · {{ formatDate(detail.plan.createdAt) }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <Button
              variant="primary" size="sm"
              :loading="reviewing"
              label="评审"
              icon="i-solar:magic-stick-3-bold-duotone"
              @click="reviewSelected"
            />
            <Button
              variant="caution" size="sm"
              :loading="actionBusy"
              label="批准"
              icon="i-solar:check-circle-bold-duotone"
              @click="approveSelected('人工/工具核准')"
            />
            <Button
              variant="danger" size="sm"
              :loading="actionBusy"
              label="驳回"
              icon="i-solar:close-circle-bold-duotone"
              @click="rejectSelected('计划未达要求，需修订后重提')"
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
            {{ detail.verdict.verdict === 'approved' ? '✅ 已批准' : '❌ 已驳回' }}
          </span>
          <div class="min-w-0">
            <p class="leading-relaxed text-neutral-700 dark:text-neutral-200">{{ detail.verdict.reason }}</p>
            <p class="mt-1 text-[10px] text-neutral-400 dark:text-neutral-500">{{ formatDate(detail.verdict.reviewedAt) }}</p>
          </div>
        </div>
        <div v-else class="border-2 border-neutral-200 dark:border-neutral-800 rounded-lg border-dashed p-3 text-center text-xs text-neutral-500">
          尚未评审 — 点击"评审"让桌宠总监给出意见
        </div>

        <!-- DAG 任务图 -->
        <div class="flex flex-col gap-2">
          <div class="text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            任务依赖图
          </div>
          <PlanGraph :tasks="selectedTasks" />
        </div>

        <!-- LLM 评审反馈 markdown -->
        <div v-if="detail.reviewMarkdown" class="flex flex-col gap-2">
          <div class="text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            总监评审意见
          </div>
          <pre class="whitespace-pre-wrap break-words rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white/40 dark:bg-white/[0.02] p-3 text-xs leading-relaxed text-neutral-700 dark:text-neutral-200">{{ detail.reviewMarkdown }}</pre>
        </div>
      </section>

      <!-- 无选中详情时的空态 -->
      <section v-else class="settings-panel flex flex-col items-center justify-center gap-2 py-16 text-center">
        <div class="i-solar:document-text-bold text-3xl text-neutral-300 dark:text-neutral-600" />
        <p class="text-sm text-neutral-500 dark:text-neutral-400">
          {{ detail ? '计划详情加载中...' : '从左侧选择一个计划查看详情' }}
        </p>
      </section>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  title: 总监评审
  description: 桌宠作为监工，评审外部 AI 工具生成的计划并给出通过/驳回结论
  subtitleKey: settings.title
  settingsEntry: true
  order: 5
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>