import type { Task } from './planGenerator'

export interface DagLevel {
  /** 本层可并行执行的任务 */
  tasks: Task[]
  /** 本层索引（0 开始） */
  index: number
}

/**
 * Kahn 拓扑排序，返回按执行顺序排列的层级数组。
 * 每层内的任务可并行执行。
 *
 * 算法：
 * 1. 计算每个任务的入度（依赖的任务数）
 * 2. 入度为 0 的任务放入当前层
 * 3. 移除当前层任务对下游的影响（入度 -1）
 * 4. 重复直到所有任务被分配
 *
 * 若检测到环或依赖不存在，返回 error。
 */
export function buildDagLevels(tasks: Task[]): { levels: DagLevel[], error?: string } {
  if (tasks.length === 0)
    return { levels: [] }

  const taskIds = new Set(tasks.map(t => t.id))
  const inDegree = new Map<string, number>()
  const dependents = new Map<string, string[]>() // taskId → 依赖此任务的任务 id 列表
  const taskMap = new Map<string, Task>()

  for (const task of tasks) {
    if (taskMap.has(task.id)) {
      return { levels: [], error: `重复任务 ID: "${task.id}" (${task.title})` }
    }
    taskMap.set(task.id, task)
    inDegree.set(task.id, 0)
    dependents.set(task.id, [])
  }

  // 构建依赖图
  for (const task of tasks) {
    if (!task.dependsOn || task.dependsOn.length === 0)
      continue
    for (const depId of task.dependsOn) {
      if (!taskIds.has(depId)) {
        return { levels: [], error: `任务 "${task.id}" 依赖不存在的任务 "${depId}"` }
      }
      dependents.get(depId)!.push(task.id)
      inDegree.set(task.id, (inDegree.get(task.id) ?? 0) + 1)
    }
  }

  const levels: DagLevel[] = []
  let index = 0

  while (true) {
    // 找出当前入度为 0 的任务
    const current: Task[] = []
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        current.push(taskMap.get(id)!)
      }
    }
    if (current.length === 0)
      break

    levels.push({ tasks: current, index })
    index++

    // 减少被依赖任务的入度，移除已分配的任务
    const nextInDegree = new Map(inDegree)
    for (const task of current) {
      for (const depId of dependents.get(task.id) ?? []) {
        nextInDegree.set(depId, (nextInDegree.get(depId) ?? 0) - 1)
      }
      nextInDegree.delete(task.id)
    }
    inDegree.clear()
    for (const [id, d] of nextInDegree) {
      inDegree.set(id, d)
    }
  }

  // 检查环：仍有入度 > 0 的任务
  if (inDegree.size > 0) {
    const stuck = [...inDegree.entries()].filter(([_, d]) => d > 0).map(([id]) => id)
    return { levels: [], error: `检测到任务依赖环: ${stuck.join(', ')}` }
  }

  return { levels }
}