/**
 * TaskStore 测试
 *
 * 测试任务队列、改进计划、执行历史等核心功能
 */

const { describe, it, expect, beforeEach, afterEach, vi } = require('vitest')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

// Mock fs modules
vi.mock('node:fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn(),
    appendFile: vi.fn(),
    writeFile: vi.fn(),
  },
  mkdirSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  default: {
    appendFile: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(''),
  },
  appendFile: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(''),
}))

describe('TaskStore', () => {
  let TaskStore
  let store

  beforeEach(async () => {
    // Re-import to get fresh mocks
    const module = await import('./taskStore.js')
    TaskStore = module.TaskStore

    // Create store with mock logger
    store = new TaskStore({
      logger: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
      },
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Task Queue', () => {
    it('should enqueue a task', async () => {
      const task = await store.enqueueTask({
        action: 'test-action',
        source: 'test',
      })

      expect(task).toBeDefined()
      expect(task.id).toMatch(/^task-/)
      expect(task.status).toBe('pending')
      expect(task.action).toBe('test-action')
    })

    it('should dequeue a pending task', async () => {
      await store.enqueueTask({ action: 'task-1' })
      await store.enqueueTask({ action: 'task-2' })

      const task = await store.dequeueTask()

      expect(task).toBeDefined()
      expect(task.status).toBe('running')
      expect(task.action).toBe('task-1')
    })

    it('should return null when no pending tasks', async () => {
      const task = await store.dequeueTask()
      expect(task).toBeNull()
    })

    it('should update task status', async () => {
      const task = await store.enqueueTask({ action: 'test' })
      const updated = await store.updateTaskStatus(task.id, 'completed', { ok: true })

      expect(updated).toBeDefined()
      expect(updated.status).toBe('completed')
      expect(updated.result).toEqual({ ok: true })
    })

    it('should return task queue stats', async () => {
      await store.enqueueTask({ action: 'task-1' })
      await store.enqueueTask({ action: 'task-2' })
      const task3 = await store.enqueueTask({ action: 'task-3' })
      await store.updateTaskStatus(task3.id, 'completed')

      const stats = store.getTaskQueueStats()

      expect(stats.total).toBe(3)
      expect(stats.pending).toBe(2)
      expect(stats.completed).toBe(1)
    })
  })

  describe('Improvement Plan', () => {
    it('should return empty improvement plan initially', () => {
      const plan = store.getImprovementPlan()

      expect(plan).toBeDefined()
      expect(plan.tasks).toEqual([])
      expect(plan.lastScan).toBeNull()
    })

    it('should add improvement task', async () => {
      const task = await store.addImprovementTask({
        type: 'code_smell',
        file: 'test.js',
        description: 'Test improvement',
      })

      expect(task).toBeDefined()
      expect(task.id).toMatch(/^imp-/)
      expect(task.status).toBe('pending')
      expect(task.type).toBe('code_smell')
    })

    it('should get next improvement task by priority', async () => {
      await store.addImprovementTask({ priority: 'low', type: 'code_smell' })
      await store.addImprovementTask({ priority: 'urgent', type: 'long_file' })
      await store.addImprovementTask({ priority: 'normal', type: 'todo_marker' })

      const next = store.getNextImprovementTask()

      expect(next).toBeDefined()
      expect(next.priority).toBe('urgent')
    })

    it('should return improvement stats', async () => {
      await store.addImprovementTask({ type: 'code_smell' })
      await store.addImprovementTask({ type: 'long_file' })
      const task = await store.addImprovementTask({ type: 'todo_marker' })
      await store.updateImprovementTask(task.id, { status: 'completed' })

      const stats = store.getImprovementStats()

      expect(stats.total).toBe(3)
      expect(stats.pending).toBe(2)
      expect(stats.completed).toBe(1)
    })
  })
})
