<script setup lang="ts">
/**
 * PlanGraph — 计划任务依赖图（DAG）图示化。
 *
 * 纯前端渲染，不引图表库：
 *  - 按 Kahn 拓扑把任务分层为横向列（L0 → Ln），每层内任务可并行执行；
 *  - 每个任务卡片标注其依赖（dependsOn）与"被谁依赖"，依赖项可点击定位；
 *  - 当前执行任务呼吸高亮，已完成打勾、失败标红。
 *
 * 兼容两种数据形状：executor 的 Plan.Task（含 dependsOn）与 director 的
 * PlanIR.PlannerTask（可能无 dependsOn —— 无依赖时退化为单列序列）。
 */
import { computed } from 'vue'

/** 任务的最小子集（executor Plan.Task 与 director PlanIR.PlannerTask 都满足） */
export interface GraphTask {
  id: string
  type: string
  title: string
  dependsOn?: string[]
  [k: string]: unknown
}

const props = defineProps<{
  tasks: GraphTask[]
  /** 当前正在执行的任务 id（呼吸高亮） */
  activeTaskId?: string | null
  /** 已完成任务 id 集合 */
  completedIds?: Set<string>
  /** 失败任务 id 集合 */
  failedIds?: Set<string>
}>()

const emit = defineEmits<{
  /** 点击依赖项，父组件可滚动定位到目标任务 */
  focusTask: [taskId: string]
}>()

interface DagLevel {
  index: number
  tasks: GraphTask[]
}

const STATUS_CLASS: Record<string, string> = {
  pending: 'border-neutral-300/70 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300',
  running: 'border-amber-400/70 dark:border-amber-400/60 bg-amber-500/10 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300',
  completed: 'border-emerald-400/70 dark:border-emerald-400/60 bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  failed: 'border-red-400/70 dark:border-red-400/60 bg-red-500/10 dark:bg-red-500/15 text-red-700 dark:text-red-300',
}

const TYPE_BADGE: Record<string, string> = {
  cli: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  ide: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  desktop: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
}

function taskStatus(task: GraphTask): 'pending' | 'running' | 'completed' | 'failed' {
  if (props.activeTaskId === task.id)
    return 'running'
  if (props.failedIds?.has(task.id))
    return 'failed'
  if (props.completedIds?.has(task.id))
    return 'completed'
  return 'pending'
}

const taskById = computed(() => {
  const map = new Map<string, GraphTask>()
  for (const task of props.tasks)
    map.set(task.id, task)
  return map
})

/** Kahn 拓扑分层（与主进程 executor/dag.ts buildDagLevels 同构，纯前端版）。 */
const levels = computed<DagLevel[]>(() => {
  const tasks = props.tasks
  if (tasks.length === 0)
    return []

  const taskIds = new Set(tasks.map(t => t.id))
  const inDegree = new Map<string, number>()
  const dependents = new Map<string, string[]>()

  for (const task of tasks) {
    inDegree.set(task.id, 0)
    dependents.set(task.id, [])
  }
  for (const task of tasks) {
    for (const depId of task.dependsOn ?? []) {
      if (!taskIds.has(depId))
        continue // 依赖缺失时忽略，不阻塞渲染
      dependents.get(depId)!.push(task.id)
      inDegree.set(task.id, (inDegree.get(task.id) ?? 0) + 1)
    }
  }

  const result: DagLevel[] = []
  const remaining = new Map(inDegree)
  let guard = 0
  while (remaining.size > 0 && guard < tasks.length + 10) {
    guard++
    const current = [...remaining.entries()].filter(([, d]) => d === 0).map(([id]) => id)
    if (current.length === 0) {
      // 环：剩余任务全部塞进最后一层，避免死循环
      result.push({ index: result.length, tasks: [...remaining.keys()].map(id => taskById.value.get(id)!) })
      break
    }
    result.push({ index: result.length, tasks: current.map(id => taskById.value.get(id)!) })
    for (const id of current) {
      for (const depId of dependents.get(id) ?? []) {
        remaining.set(depId, (remaining.get(depId) ?? 0) - 1)
      }
      remaining.delete(id)
    }
  }
  return result
})

/** taskId → 被哪些任务依赖（下游）。 */
const dependentsOf = computed(() => {
  const map = new Map<string, string[]>()
  for (const task of props.tasks) {
    for (const depId of task.dependsOn ?? [])
      map.set(depId, [...(map.get(depId) ?? []), task.id])
  }
  return map
})

function taskTitle(id: string): string {
  return taskById.value.get(id)?.title ?? id
}

function focusTask(id: string) {
  emit('focusTask', id)
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div v-if="levels.length === 0" class="border-2 border-neutral-200 dark:border-neutral-800 rounded-lg border-dashed p-4 text-center text-xs text-neutral-500">
      暂无任务
    </div>

    <div v-else class="flex gap-3 overflow-x-auto pb-2">
      <!-- 每层一列：横向时间线 = 执行顺序，同层可并行 -->
      <div
        v-for="level in levels"
        :key="level.index"
        class="flex shrink-0 flex-col gap-2 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white/40 dark:bg-white/[0.02] p-3 min-w-[220px]"
      >
        <div class="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          <span class="rounded-full bg-neutral-200/60 dark:bg-neutral-800 px-2 py-0.5 text-neutral-600 dark:text-neutral-300">
            L{{ level.index }}
          </span>
          <span>{{ level.tasks.length }} 个任务 · 可并行</span>
        </div>

        <article
          v-for="task in level.tasks"
          :id="`plan-graph-cell-${task.id}`"
          :key="task.id"
          :class="[
            'flex flex-col gap-1.5 rounded-lg border px-2.5 py-2 text-xs transition-colors',
            STATUS_CLASS[taskStatus(task)],
          ]"
        >
          <div class="flex items-start gap-2">
            <span
              :class="[
                'shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                TYPE_BADGE[task.type] ?? 'bg-neutral-200/60 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300',
              ]"
            >
              {{ task.type }}
            </span>
            <span class="min-w-0 flex-1 leading-snug">{{ task.title }}</span>
            <span v-if="taskStatus(task) === 'running'" class="i-svg-spinners:ring size-3.5 shrink-0 text-amber-500" />
            <span v-else-if="taskStatus(task) === 'completed'" class="i-solar:check-circle-bold size-3.5 shrink-0" />
            <span v-else-if="taskStatus(task) === 'failed'" class="i-solar:close-circle-bold size-3.5 shrink-0" />
          </div>

          <!-- 依赖：前置 + 下游 -->
          <div v-if="task.dependsOn?.length || dependentsOf.get(task.id)?.length" class="flex flex-wrap gap-1 text-[10px]">
            <span
              v-for="depId in task.dependsOn ?? []"
              :key="`dep-${depId}`"
              class="inline-flex cursor-pointer items-center gap-1 rounded-full bg-neutral-200/50 dark:bg-neutral-800/60 px-1.5 py-0.5 text-neutral-500 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400"
              :title="`依赖: ${taskTitle(depId)}`"
              @click="focusTask(depId)"
            >
              <span class="i-solar:alt-arrow-left-bold text-[9px]" />
              {{ taskTitle(depId) }}
            </span>
            <span
              v-for="downId in dependentsOf.get(task.id) ?? []"
              :key="`down-${downId}`"
              class="inline-flex cursor-pointer items-center gap-1 rounded-full bg-neutral-200/50 dark:bg-neutral-800/60 px-1.5 py-0.5 text-neutral-500 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400"
              :title="`被依赖: ${taskTitle(downId)}`"
              @click="focusTask(downId)"
            >
              <span class="i-solar:alt-arrow-right-bold text-[9px]" />
              {{ taskTitle(downId) }}
            </span>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-pulse {
  animation: plan-graph-pulse 1.6s ease-in-out infinite;
}

@keyframes plan-graph-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
</style>
