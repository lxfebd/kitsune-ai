import type { BrowserWindow } from 'electron'

import { createContext } from '@moeru/eventa'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  taskbarGetInfo,
  windowSnapGetStatus,
  windowSnapSetFraction,
  windowSnapStatusChanged,
  windowSnapTrySnap,
  windowSnapUnsnap,
} from '../../../../shared/eventa'
import { createWindowSnapService } from './index'

// defineInvokeHandler 在运行时触碰 electron IPC，替换为记录型 stub；
// 其余 @moeru/eventa 导出保持真实（shared/eventa 的契约对象依赖它们）。
const defineInvokeHandlerMock = vi.hoisted(() => vi.fn())

vi.mock('@moeru/eventa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@moeru/eventa')>()
  return {
    ...actual,
    defineInvokeHandler: defineInvokeHandlerMock,
  }
})

// ---- WindowSnapManager fake ----
const managerFake = vi.hoisted(() => ({
  instance: null as null | {
    start: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
    getStatus: ReturnType<typeof vi.fn>
    trySnap: ReturnType<typeof vi.fn>
    tryUnsnap: ReturnType<typeof vi.fn>
    setSnapFraction: ReturnType<typeof vi.fn>
  },
  make() {
    const instance = {
      start: vi.fn(),
      stop: vi.fn(),
      getStatus: vi.fn(() => ({ state: 'idle', target: null, snapFraction: 0.5 })),
      trySnap: vi.fn(),
      tryUnsnap: vi.fn(),
      setSnapFraction: vi.fn(),
    }
    managerFake.instance = instance
    return instance
  },
}))

vi.mock('../../../windows/shared/window-snap', () => ({
  WindowSnapManager: class {
    constructor() {
      return managerFake.make()
    }
  },
}))

// ---- taskbar helper mocks ----
const taskbarMocks = vi.hoisted(() => ({
  getTaskbarInfo: vi.fn(),
  isOverlappingTaskbar: vi.fn(),
}))

vi.mock('../../../windows/shared/taskbar', () => ({
  getTaskbarInfo: taskbarMocks.getTaskbarInfo,
  isOverlappingTaskbar: taskbarMocks.isOverlappingTaskbar,
}))

// ---- window fake ----
function createWindowFake() {
  const handlers = new Map<string, Function>()
  return {
    on: vi.fn((event: string, cb: Function) => {
      handlers.set(event, cb)
      return { remove: () => handlers.delete(event) }
    }),
    removeListener: vi.fn(),
    getBounds: vi.fn(() => ({ x: 0, y: 0, width: 220, height: 300 })),
    webContents: { id: 42 },
    fire(event: string) {
      handlers.get(event)?.()
    },
  }
}

type ServiceContext = Parameters<typeof createWindowSnapService>[0]['context']

describe('createWindowSnapService', () => {
  let context: ServiceContext
  let windowFake: ReturnType<typeof createWindowFake>

  // invoke handler 按 sendEvent.id 收集：call = [context, eventa, handler]
  function handlers(): Map<string, Function> {
    const map = new Map<string, Function>()
    for (const call of defineInvokeHandlerMock.mock.calls) {
      const eventa = call[1] as { sendEvent?: { id: string }, id?: string }
      map.set(eventa.sendEvent?.id ?? eventa.id!, call[2] as Function)
    }
    return map
  }

  beforeEach(() => {
    vi.clearAllMocks()
    context = createContext() as unknown as ServiceContext
    windowFake = createWindowFake()
    managerFake.instance = null
    taskbarMocks.getTaskbarInfo.mockReturnValue(null)
    taskbarMocks.isOverlappingTaskbar.mockReturnValue(false)
  })

  afterEach(() => {
    managerFake.instance = null
  })

  it('registers all five invoke handlers', () => {
    createWindowSnapService({ context, window: windowFake as unknown as BrowserWindow })
    expect(defineInvokeHandlerMock).toHaveBeenCalledTimes(5)
    for (const ev of [windowSnapGetStatus, windowSnapTrySnap, windowSnapUnsnap, windowSnapSetFraction, taskbarGetInfo]) {
      expect(handlers().has(ev.sendEvent.id)).toBe(true)
    }
  })

  it('starts the manager and pushes status changes to the event bus', () => {
    createWindowSnapService({ context, window: windowFake as unknown as BrowserWindow })

    const manager = managerFake.instance!
    expect(manager.start).toHaveBeenCalledTimes(1)

    const statusChanged: unknown[] = []
    const off = context.on(windowSnapStatusChanged, (event) => statusChanged.push(event))

    // start 注入的 onStatusChange 回调在吸附状态变更时被调用
    const onStatusChange = (manager.start.mock.calls[0]![0] as (status: unknown) => void)
    onStatusChange({ state: 'snapped', target: null, snapFraction: 0.7 })

    expect(statusChanged).toHaveLength(1)
    const received = statusChanged[0] as { body: { state: string } }
    expect(received.body).toEqual({ state: 'snapped', target: null, snapFraction: 0.7 })
    off()
  })

  it('windowSnapGetStatus returns the manager status', async () => {
    createWindowSnapService({ context, window: windowFake as unknown as BrowserWindow })
    const handler = handlers().get(windowSnapGetStatus.sendEvent.id)!
    expect(handler({}, undefined)).toEqual({ state: 'idle', target: null, snapFraction: 0.5 })
  })

  it('windowSnapTrySnap forwards screen coordinates to the manager', async () => {
    createWindowSnapService({ context, window: windowFake as unknown as BrowserWindow })
    const handler = handlers().get(windowSnapTrySnap.sendEvent.id)!
    await handler({ screenX: 320, screenY: 480 }, undefined)
    expect(managerFake.instance!.trySnap).toHaveBeenCalledWith(320, 480)
  })

  it('windowSnapUnsnap calls manager.tryUnsnap', async () => {
    createWindowSnapService({ context, window: windowFake as unknown as BrowserWindow })
    const handler = handlers().get(windowSnapUnsnap.sendEvent.id)!
    await handler({}, undefined)
    expect(managerFake.instance!.tryUnsnap).toHaveBeenCalledTimes(1)
  })

  it('windowSnapSetFraction forwards the fraction to the manager', async () => {
    createWindowSnapService({ context, window: windowFake as unknown as BrowserWindow })
    const handler = handlers().get(windowSnapSetFraction.sendEvent.id)!
    await handler({ fraction: 0.35 }, undefined)
    expect(managerFake.instance!.setSnapFraction).toHaveBeenCalledWith(0.35)
  })

  describe('taskbarGetInfo', () => {
    it('returns null when no taskbar info is available', async () => {
      createWindowSnapService({ context, window: windowFake as unknown as BrowserWindow })
      const handler = handlers().get(taskbarGetInfo.sendEvent.id)!
      expect(handler({}, undefined)).toBeNull()
    })

    it('builds a snapshot with overlap check when taskbar exists', async () => {
      taskbarMocks.getTaskbarInfo.mockReturnValue({
        position: 'bottom',
        rect: { x: 0, y: 900, width: 1920, height: 40 },
        thickness: 40,
      })
      taskbarMocks.isOverlappingTaskbar.mockReturnValue(true)
      createWindowSnapService({ context, window: windowFake as unknown as BrowserWindow })
      const handler = handlers().get(taskbarGetInfo.sendEvent.id)!

      expect(handler({}, undefined)).toEqual({
        position: 'bottom',
        rect: { x: 0, y: 900, width: 1920, height: 40 },
        thickness: 40,
        isOverlapping: true,
      })

      // isOverlappingTaskbar 用的是窗口实际 bounds
      const bounds = windowFake.getBounds()
      expect(taskbarMocks.isOverlappingTaskbar).toHaveBeenCalledWith(bounds, expect.objectContaining({ position: 'bottom' }))
    })
  })

  it('stops the manager when the window closes', () => {
    createWindowSnapService({ context, window: windowFake as unknown as BrowserWindow })
    expect(managerFake.instance!.stop).not.toHaveBeenCalled()
    windowFake.fire('closed')
    expect(managerFake.instance!.stop).toHaveBeenCalledTimes(1)
  })
})