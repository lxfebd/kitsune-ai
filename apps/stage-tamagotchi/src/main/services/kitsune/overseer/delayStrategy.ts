/**
 * 任务推送后的延迟截屏策略。
 *
 * 任务携带 estimatedDuration（秒）时按 *1.2 计算等待毫秒，
 * 未携带时按任务类型查默认表。窗口期略大于估算时长，给慢启动 / 模型推理留余量。
 */

export type TaskType = 'compile' | 'test' | 'refactor' | 'edit' | 'unknown'

/** 毫秒，估算时长缺失时按任务类型回退到此表 */
const DEFAULT_DELAY_MS: Record<TaskType, number> = {
  compile: 30_000,
  test: 60_000,
  refactor: 90_000,
  edit: 15_000,
  unknown: 30_000,
}

/** 估算时长的放大系数，覆盖冷启动与模型预热抖动 */
const DURATION_BUFFER_RATIO = 1.2

export interface DelayTask {
  type?: TaskType
  /** 估算时长（秒），由任务推送方根据历史耗时给出 */
  estimatedDuration?: number
}

/**
 * 计算任务推送后到截屏校验之间的等待毫秒。
 *
 * Before:
 * - { type: 'compile' }                  → 30000
 * - { type: 'test', estimatedDuration: 50 } → 60000
 *
 * After:
 * - { type: 'compile' }                  → 30000
 * - { type: 'test', estimatedDuration: 50 } → 60000
 */
export function calcDelay(task: DelayTask): number {
  if (typeof task.estimatedDuration === 'number' && task.estimatedDuration > 0)
    return Math.round(task.estimatedDuration * DURATION_BUFFER_RATIO * 1000)
  const type: TaskType = task.type ?? 'unknown'
  return DEFAULT_DELAY_MS[type] ?? DEFAULT_DELAY_MS.unknown
}

export function resolveTaskType(raw: string | undefined): TaskType {
  if (raw === 'compile' || raw === 'test' || raw === 'refactor' || raw === 'edit')
    return raw
  return 'unknown'
}
