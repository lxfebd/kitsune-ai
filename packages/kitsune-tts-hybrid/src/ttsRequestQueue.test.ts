import { describe, expect, it } from 'vitest'

import { TTSRequestQueue } from './ttsRequestQueue.js'

describe('TTSRequestQueue', () => {
  it('enqueues and resolves requests', async () => {
    const queue = new TTSRequestQueue({ maxWaitTimeMs: 5000 })

    // 模拟 sidecar 处理
    const promise = queue.enqueue('hello')
    expect(queue.length).toBe(1)

    await queue.onSidecarReady(async (text) => {
      expect(text).toBe('hello')
      return new ArrayBuffer(10)
    })

    const result = await promise
    expect(result).toBeInstanceOf(ArrayBuffer)
    expect(queue.length).toBe(0)
  })

  it('throws when queue is full', async () => {
    const queue = new TTSRequestQueue({ maxQueueSize: 1, maxWaitTimeMs: 5000 })

    queue.enqueue('first')

    await expect(queue.enqueue('second')).rejects.toThrow('queue is full')
  })

  it('clears queue and rejects pending', async () => {
    const queue = new TTSRequestQueue({ maxWaitTimeMs: 5000 })

    const promise = queue.enqueue('hello')
    queue.clear()

    await expect(promise).rejects.toThrow('Queue cleared')
    expect(queue.length).toBe(0)
  })

  it('handles multiple requests in flush', async () => {
    const queue = new TTSRequestQueue({ maxWaitTimeMs: 5000 })

    const p1 = queue.enqueue('one')
    const p2 = queue.enqueue('two')
    expect(queue.length).toBe(2)

    let callIdx = 0
    await queue.onSidecarReady(async () => {
      callIdx++
      return new ArrayBuffer(callIdx * 10)
    })

    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toBeInstanceOf(ArrayBuffer)
    expect(r2).toBeInstanceOf(ArrayBuffer)
  })
})
