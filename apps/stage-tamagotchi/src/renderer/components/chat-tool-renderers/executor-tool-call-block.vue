<script setup lang="ts">
import type { ExecutorEventPayload } from '../../../shared/eventa'

import { createContext, type EventContext } from '@moeru/eventa'
import { createToolResultError, normalizeToolResultText } from '@kitsune/stage-ui/components'
import { Collapsible, ContainerError } from '@kitsune/ui'
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { electronExecutorEvent } from '../../../shared/eventa'

const props = defineProps<{
  toolName: string
  args: string
  state?: 'executing' | 'done' | 'error'
  result?: unknown
}>()

// eventa context（electron renderer adapter）— 与 ExecutorPanel/useExecutorEmotion 同一订阅方式
let eventaContext: EventContext | undefined

// ——— 解析工具参数 ———
interface PlanArgs {
  requirement?: string
  cwd?: string
  plan?: Record<string, any>
}

interface ExecutorRunResult {
  ok?: boolean
  accepted?: boolean
  done?: boolean
  status?: {
    plan?: {
      id?: string
      requirement?: string
      tasks?: Array<{ id?: string, title?: string, provider?: string }>
    }
  }
}

const parsedArgs = computed<PlanArgs>(() => {
  if (typeof props.args === 'string') {
    try {
      return JSON.parse(props.args) as PlanArgs
    }
    catch {
      return {}
    }
  }
  return (props.args ?? {}) as PlanArgs
})

const requirementText = computed(() => parsedArgs.value.requirement ?? parsedArgs.value.plan?.requirement ?? '')
const resultText = computed(() => normalizeToolResultText(props.result))
const resultError = computed(() => props.state === 'error' ? createToolResultError(props.result) : undefined)

// ——— executor_run 异步提交结果：`{ ok:true, accepted:true, done:false }` = dsh 后台执行中 ———
const parsedResult = computed<ExecutorRunResult>(() => {
  if (typeof props.result === 'string') {
    try {
      return JSON.parse(props.result) as ExecutorRunResult
    }
    catch {
      return {}
    }
  }
  return (props.result ?? {}) as ExecutorRunResult
})

/** run 已接受但未完成（done !== true，含字段缺失）→ 卡片保持「执行中」，不会提前亮绿勾 */
const runAcceptedPending = computed(() => {
  const r = parsedResult.value
  return r.ok === true && r.accepted === true && r.done !== true
})

/** 计划任务清单：run 结果优先（含 status.plan.tasks），退化为 args 里 plan.tasks（plan 调用） */
const planTasks = computed<Array<{ id?: string, title?: string }>>(() => {
  const statusTasks = parsedResult.value.status?.plan?.tasks
  if (statusTasks?.length)
    return statusTasks
  const argPlan = parsedArgs.value.plan as { tasks?: Array<{ id?: string, title?: string }> } | undefined
  return argPlan?.tasks ?? []
})

// ——— 订阅主进程执行事件，实时展示进度 ———
const events = ref<Array<{ at: number, label: string, ok?: boolean, text?: string }>>([])
const lastEventAt = ref(0)
const executing = ref(props.state === 'executing')

function formatTs(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-Hans', { hour12: false })
}

function onExecutorEvent(event: { body?: ExecutorEventPayload }) {
  if (Date.now() - lastEventAt.value < 150)
    return
  lastEventAt.value = Date.now()
  const payload = event?.body
  if (!payload)
    return
  const entry: { at: number, label: string, ok?: boolean, text?: string } = { at: Date.now(), label: payload.type }
  switch (payload.type) {
    case 'plan_started':
      entry.label = `计划开始（${payload.planId ?? ''}）`
      break
    case 'dag_level_started':
      entry.label = `进入第 ${(payload.levelIndex ?? 0) + 1} 层，共 ${payload.taskCount ?? 0} 个任务`
      break
    case 'task_started':
      entry.label = `开始任务：${payload.task?.title ?? payload.taskId ?? ''}`
      break
    case 'task_completed':
      entry.label = `任务完成：${payload.taskId ?? ''}`
      entry.ok = true
      break
    case 'task_failed':
      entry.label = `任务失败：${payload.taskId ?? ''}`
      entry.ok = false
      entry.text = payload.error ?? payload.personaMessage
      break
    case 'plan_completed':
      entry.label = '计划执行完成 ✅'
      entry.ok = true
      break
    case 'plan_aborted':
      entry.label = '计划被中止'
      entry.ok = false
      break
    case 'plan_stopped':
      entry.label = '计划已停止'
      entry.ok = false
      break
    case 'coordination_started':
      entry.label = `团队编排开始：${payload.agentCount ?? 0} 个 agent，${payload.taskCount ?? 0} 个任务`
      break
    case 'agent_outcome':
      entry.label = `agent ${payload.agentId ?? ''} 完成：${payload.title ?? ''}`
      entry.ok = payload.ok ?? true
      break
    case 'permission_request':
      entry.label = `权限确认：${payload.permKey ?? ''}${payload.highRisk ? '（高风险）' : ''}`
      break
    case 'pet_alert':
      entry.label = `桌宠提醒：${payload.message ?? ''}`
      break
    default:
      break
  }
  events.value = [...events.value.slice(-19), entry]
}

let offEvent: (() => void) | undefined

onMounted(() => {
  executing.value = props.state === 'executing'
  try {
    eventaContext ??= createContext(window.electron?.ipcRenderer as any)
    offEvent = eventaContext?.on(electronExecutorEvent, onExecutorEvent)
  }
  catch (err) {
    console.error('[executor-tool-call] Failed to subscribe executor events:', err)
  }
})

onUnmounted(() => {
  offEvent?.()
})
</script>

<template>
  <Collapsible
    :class="[
      'bg-black/[0.03] dark:bg-white/[0.03] backdrop-blur-xl rounded-xl px-2.5 pb-2 pt-2',
      'flex flex-col gap-2 items-start',
    ]"
  >
    <template #trigger="{ visible, setVisible }">
      <button class="w-full text-start" @click="setVisible(!visible)">
        <div
          v-if="executing || props.state === 'executing' || runAcceptedPending"
          i-eos-icons:loading class="mr-1 inline-block translate-y-0.5 op-50"
        />
        <div
          v-else-if="props.state === 'error'"
          i-ph:warning-circle-duotone class="mr-1 inline-block translate-y-0.5 text-red-500"
        />
        <div
          v-else-if="props.state === 'done' && !runAcceptedPending"
          i-ph:check-circle-duotone class="mr-1 inline-block translate-y-0.5 text-emerald-500"
        />
        <div v-else i-solar:sledgehammer-bold-duotone class="mr-1 inline-block translate-y-1 op-50" />
        <code>{{ toolName }}</code>
        <span
          v-if="requirementText"
          class="ml-2 text-xs text-neutral-500 dark:text-neutral-400 truncate max-w-[30ch]"
        >
          {{ requirementText }}
        </span>
        <span
          v-if="runAcceptedPending"
          class="ml-2 inline-flex items-center gap-1 text-[11px] text-amber-500"
        >
          dsh 执行中…
        </span>
        <span v-if="props.state === 'error' && resultText" class="ml-2 text-xs text-red-500 op-80">
          (failed)
        </span>
      </button>
    </template>
    <div
      :class="[
        'rounded-lg p-2 w-full',
        'bg-black/[0.02] dark:bg-white/[0.02] text-[12px] text-neutral-800 dark:text-neutral-200',
      ]"
    >
      <template v-if="resultError">
        <ContainerError
          :error="resultError"
          :include-stack="false"
          :show-feedback-button="false"
          height-preset="auto"
        />
      </template>

      <!-- 计划任务清单（历史会话可看到 dsh 在跑什么） -->
      <div v-if="planTasks.length > 0" class="mb-2 flex flex-col gap-1">
        <div class="text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
          {{ toolName === 'executor_run' ? '执行计划' : '计划任务' }}（{{ planTasks.length }}）
        </div>
        <div
          v-for="(task, ti) in planTasks"
          :key="ti"
          class="flex items-center gap-2 text-xs"
        >
          <span
            :class="[
              'i-solar:doc-text-bold-duotone shrink-0',
              runAcceptedPending ? 'text-amber-500' : 'text-neutral-400',
            ]"
          />
          <span class="truncate">{{ task.title ?? task.id ?? `任务 ${ti + 1}` }}</span>
        </div>
      </div>

      <!-- 执行进度流 -->
      <div v-if="events.length > 0" class="mb-2 flex flex-col gap-1">
        <div
          v-for="(ev, i) in events"
          :key="i"
          class="flex items-center gap-2 text-xs"
        >
          <span
            :class="[
              'i-solar:check-circle-bold-duotone',
              ev.ok === false ? 'text-red-500' : ev.ok ? 'text-emerald-500' : 'text-neutral-400 animate-pulse',
            ]"
          />
          <span class="text-neutral-500 dark:text-neutral-400 tabular-nums">{{ formatTs(ev.at) }}</span>
          <span class="truncate">{{ ev.label }}</span>
        </div>
      </div>

      <!-- 执行结果 -->
      <div v-if="resultText" class="whitespace-pre-wrap break-words font-mono mt-1">
        {{ resultText }}
      </div>
    </div>
  </Collapsible>
</template>
