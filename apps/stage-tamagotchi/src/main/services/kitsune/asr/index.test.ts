import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: vi.fn(() => '/tmp/asr-test-app'),
    getPath: vi.fn(() => '/tmp/asr-test-userdata'),
  },
}))

vi.mock('sherpa-onnx', () => ({
  createOfflineRecognizer: vi.fn(),
}))

import { enqueueRecognizerTask } from './index'

describe('enqueueRecognizerTask', () => {
  it('runs tasks strictly one at a time, preserving call order', async () => {
    const order: string[] = []
    let active = 0
    let maxActive = 0

    const makeTask = (name: string) => async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      order.push(`${name}:start`)
      await new Promise(r => setTimeout(r, 20))
      order.push(`${name}:end`)
      active -= 1
      return name
    }

    const [a, b, c] = await Promise.all([
      enqueueRecognizerTask(makeTask('a')),
      enqueueRecognizerTask(makeTask('b')),
      enqueueRecognizerTask(makeTask('c')),
    ])

    expect([a, b, c]).toEqual(['a', 'b', 'c'])
    // 串行：同一时刻最多一个任务在跑
    expect(maxActive).toBe(1)
    // 严格按入队顺序完成
    expect(order).toEqual([
      'a:start', 'a:end',
      'b:start', 'b:end',
      'c:start', 'c:end',
    ])
  })

  it('continues the queue after a task rejects, without blocking later tasks', async () => {
    const order: string[] = []

    const failing = enqueueRecognizerTask(async () => {
      order.push('failing:start')
      throw new Error('boom')
    })
    const after = enqueueRecognizerTask(async () => {
      order.push('after:start')
      return 'ok'
    })

    await expect(failing).rejects.toThrow('boom')
    await expect(after).resolves.toBe('ok')
    expect(order).toEqual(['failing:start', 'after:start'])
  })
})
