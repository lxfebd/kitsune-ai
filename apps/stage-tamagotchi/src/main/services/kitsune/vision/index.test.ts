import { createContext } from '@moeru/eventa'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { VisionFrameCapturedPayload } from '../../../../shared/eventa'
import {
  electronVisionFrameCaptured,
  electronVisionStart,
  electronVisionStatus,
  electronVisionStop,
} from '../../../../shared/eventa'
import { createVisionService } from './index'

// ---- mocks (hoisted) ----

const defineInvokeHandlerMock = vi.hoisted(() => vi.fn())
const capturerGetSourcesMock = vi.hoisted(() => vi.fn())
const beforeQuitMock = vi.hoisted(() => vi.fn())

vi.mock('@moeru/eventa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@moeru/eventa')>()
  return {
    ...actual,
    defineInvokeHandler: defineInvokeHandlerMock,
  }
})

vi.mock('electron', () => ({
  desktopCapturer: { getSources: capturerGetSourcesMock },
}))

vi.mock('../../../libs/bootkit/lifecycle', () => ({
  onAppBeforeQuit: beforeQuitMock,
}))

vi.mock('@guiiai/logg', () => ({
  useLogg: vi.fn(() => {
    const log = vi.fn()
    const warn = vi.fn()
    return {
      useGlobalConfig: () => ({ log, warn, withFields: () => ({ log, warn }) }),
    }
  }),
}))

function makeFakeSource(name = 'screen:0') {
  return [{ id: name, name, thumbnail: { toJPEG: () => Buffer.from('fake-jpeg'), getSize: () => ({ width: 1, height: 1 }) } }]
}

// 与 connectors 测试同款：core context 与 adapter context 类型不兼容，
// 用服务参数类型取 context 形状并 cast。
type ServiceContext = Parameters<typeof createVisionService>[0]['context']

describe('createVisionService', () => {
  let context: ServiceContext
  let service: ReturnType<typeof createVisionService>

  // invoke handler 按 sendEvent.id 收集
  function handlers(): Map<string, (payload?: any) => any> {
    const map = new Map<string, (payload?: any) => any>()
    for (const call of defineInvokeHandlerMock.mock.calls) {
      const eventa = call[1] as { sendEvent?: { id: string }, id?: string }
      map.set(eventa.sendEvent?.id ?? eventa.id!, call[2])
    }
    return map
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    context = createContext() as unknown as ServiceContext
    capturerGetSourcesMock.mockResolvedValue(makeFakeSource())
    service = createVisionService({ context })
  })

  afterEach(() => {
    service.stop()
    vi.useRealTimers()
  })

  it('registers start/stop/status invoke handlers', () => {
    expect(defineInvokeHandlerMock).toHaveBeenCalledTimes(3)
    expect(handlers().has(electronVisionStart.sendEvent!.id)).toBe(true)
    expect(handlers().has(electronVisionStop.sendEvent!.id)).toBe(true)
    expect(handlers().has(electronVisionStatus.sendEvent!.id)).toBe(true)
  })

  it('wires onAppBeforeQuit to stop', () => {
    expect(beforeQuitMock).toHaveBeenCalledTimes(1)
  })

  it('starts with default interval and captures immediately', async () => {
    const captured: unknown[] = []
    const off = context.on(electronVisionFrameCaptured, (payload) => captured.push(payload))

    const status = service.start()
    expect(status.running).toBe(true)
    expect(status.intervalMs).toBe(5000)
    await vi.advanceTimersByTimeAsync(0)

    // 首帧在 start 后立即 captureOnce
    expect(capturerGetSourcesMock).toHaveBeenCalledTimes(1)
    expect(captured).toHaveLength(1)
    // eventa 的 on handler 收到 {id, type, body} 信封，payload 在 body
    const frame = (captured[0] as unknown as { body: VisionFrameCapturedPayload }).body
    expect(frame.imageDataUrl).toMatch(/^data:image\/jpeg;base64,/)
    expect(frame.sourceId).toBe('screen:0')
    off()
  })

  it('captures on interval ticks', async () => {
    service.start(1000)
    await vi.advanceTimersByTimeAsync(0)
    const afterFirst = capturerGetSourcesMock.mock.calls.length

    await vi.advanceTimersByTimeAsync(1000)
    expect(capturerGetSourcesMock.mock.calls.length).toBe(afterFirst + 1)

    await vi.advanceTimersByTimeAsync(3000)
    expect(capturerGetSourcesMock.mock.calls.length).toBe(afterFirst + 4)
  })

  it('ignores start when already running', () => {
    service.start(500)
    const second = service.start(100)
    expect(second.running).toBe(true)
    expect(second.intervalMs).toBe(500) // 第一次的 interval 保留
  })

  it('stop clears interval and reports not running', () => {
    service.start(1000)
    const status = service.stop()
    expect(status.running).toBe(false)
    expect(service.status().running).toBe(false)

    // 停后不再捕获
    const before = capturerGetSourcesMock.mock.calls.length
    vi.advanceTimersByTime(5000)
    expect(capturerGetSourcesMock.mock.calls.length).toBe(before)
  })

  it('tracks lastCapture timestamp and clears lastError after a successful capture', async () => {
    service.start(1000)
    await vi.advanceTimersByTimeAsync(0)
    const status = service.status()
    expect(status.lastCapture).not.toBeNull()
    expect(status.lastError).toBeUndefined()
  })

  it('reports lastError when capture fails', async () => {
    capturerGetSourcesMock.mockRejectedValue(new Error('boom'))
    service.start(1000)
    await vi.advanceTimersByTimeAsync(0)
    const status = service.status()
    expect(status.lastError).toBe('boom')
    expect(status.running).toBe(true) // 错误不停止循环
  })

  it('reports no-screen-source as lastError', async () => {
    capturerGetSourcesMock.mockResolvedValue([])
    service.start(1000)
    await vi.advanceTimersByTimeAsync(0)
    expect(service.status().lastError).toBe('no screen source available')
  })

  it('stop handler returns snapshot through invoke', async () => {
    const handler = handlers().get(electronVisionStop.sendEvent!.id)!
    const result = await handler()
    expect(result.running).toBe(false)
  })

  it('status handler returns snapshot through invoke', async () => {
    service.start(1000)
    const handler = handlers().get(electronVisionStatus.sendEvent!.id)!
    const result = await handler()
    expect(result.running).toBe(true)
    expect(result.intervalMs).toBe(1000)
  })
})
