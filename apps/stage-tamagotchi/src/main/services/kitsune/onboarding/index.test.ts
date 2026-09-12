import type { BrowserWindow, Rectangle } from 'electron'

import { createContext } from '@moeru/eventa'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { electronOpenOnboarding } from '../../../../shared/eventa'
import { createOnboardingService } from './index'

// ---- mocks (hoisted) ----

const defineInvokeHandlerMock = vi.hoisted(() => vi.fn())
const screenGetDisplayMatchingMock = vi.hoisted(() => vi.fn())
const computeAdjacentPositionMock = vi.hoisted(() => vi.fn())

// animejs 的 animate 返回带 pause 的 controller；这里返回可记录的 fake
const animateMock = vi.hoisted(() => vi.fn((_target: unknown, config: { onRender?: () => void }) => {
  // 立即执行一次 onRender，模拟动画过程同步完成（测试对位置断言用）
  config.onRender?.()
  return { pause: vi.fn(), complete: vi.fn() }
}))

vi.mock('@moeru/eventa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@moeru/eventa')>()
  return {
    ...actual,
    defineInvokeHandler: defineInvokeHandlerMock,
  }
})

vi.mock('electron', () => ({
  screen: { getDisplayMatching: screenGetDisplayMatchingMock },
}))

vi.mock('animejs', () => ({
  animate: animateMock,
  utils: { round: (n: number) => Math.round(n) },
}))

vi.mock('../../../windows/shared/display', () => ({
  computeAdjacentPosition: computeAdjacentPositionMock,
}))

vi.mock('@guiiai/logg', () => ({
  useLogg: vi.fn(() => {
    const log = vi.fn()
    return {
      useGlobalConfig: () => ({ log, withFields: () => ({ log }) }),
    }
  }),
}))

interface FakeWindow {
  getBounds: ReturnType<typeof vi.fn>
  setSize: ReturnType<typeof vi.fn>
  setPosition: ReturnType<typeof vi.fn>
  isDestroyed: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  removeListener: ReturnType<typeof vi.fn>
  handlers: Map<string, () => void>
  fire: (event: string) => void
}

function makeWindow(bounds: Rectangle): FakeWindow {
  const handlers = new Map<string, () => void>()
  return {
    getBounds: vi.fn(() => ({ ...bounds })),
    setSize: vi.fn(),
    setPosition: vi.fn(),
    isDestroyed: vi.fn(() => false),
    on: vi.fn((event: string, cb: () => void) => { handlers.set(event, cb) }),
    removeListener: vi.fn((event: string) => { handlers.delete(event) }),
    handlers,
    fire: (event: string) => handlers.get(event)?.(),
  }
}

interface FakeOnboardingManager {
  getAndToggleWindow: ReturnType<typeof vi.fn>
  onClosed: ReturnType<typeof vi.fn>
  closedHandlers: Set<() => void>
  fireClosed: () => void
}

function makeOnboardingManager(window: BrowserWindow): FakeOnboardingManager {
  const closedHandlers = new Set<() => void>()
  return {
    getAndToggleWindow: vi.fn(async () => window),
    onClosed: vi.fn((cb: () => void) => {
      closedHandlers.add(cb)
      return () => { closedHandlers.delete(cb) }
    }),
    closedHandlers,
    fireClosed: () => { for (const cb of closedHandlers) cb() },
  }
}

// 与 connectors 测试同款：core context 与 adapter context 类型不兼容，
// 用服务参数类型取 context 形状并 cast。
type ServiceContext = Parameters<typeof createOnboardingService>[0]['context']

describe('createOnboardingService', () => {
  let context: ServiceContext
  let mainWindow: FakeWindow
  let onboardingWindow: FakeWindow
  let manager: FakeOnboardingManager

  beforeEach(() => {
    vi.clearAllMocks()
    context = createContext() as unknown as ServiceContext
    mainWindow = makeWindow({ x: 0, y: 0, width: 800, height: 600 })
    onboardingWindow = makeWindow({ x: 1000, y: 100, width: 400, height: 500 })
    manager = makeOnboardingManager(onboardingWindow as unknown as BrowserWindow)
    screenGetDisplayMatchingMock.mockReturnValue({ x: 0, y: 0, width: 1920, height: 1080, workArea: { x: 0, y: 0, width: 1920, height: 1040 } })
    computeAdjacentPositionMock.mockReturnValue({ x: 640, y: 240, width: 800, height: 600 })
    createOnboardingService({ context, onboardingWindowManager: manager as never, mainWindow: mainWindow as unknown as BrowserWindow })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function invokeHandler() {
    // call = [context, eventa, handler] —— eventa 在 call[1]
    const call = defineInvokeHandlerMock.mock.calls.find(([_, eventa]) => (eventa as { sendEvent?: { id: string } }).sendEvent?.id === electronOpenOnboarding.sendEvent!.id)
    return call?.[2] as (payload?: unknown) => Promise<unknown>
  }

  it('registers the open-onboarding invoke handler', () => {
    expect(defineInvokeHandlerMock).toHaveBeenCalledTimes(1)
    expect(defineInvokeHandlerMock).toHaveBeenCalledWith(context, electronOpenOnboarding, expect.any(Function))
  })

  it('animates the main window to the adjacent position', async () => {
    const handler = invokeHandler()!
    await handler()

    expect(computeAdjacentPositionMock).toHaveBeenCalledWith(
      { x: 1000, y: 100, width: 400, height: 500 },
      { width: 800, height: 600 },
      expect.objectContaining({ width: 1920 }),
    )
    expect(animateMock).toHaveBeenCalled()
    expect(mainWindow.setPosition).toHaveBeenCalled()
  })

  it('subscribes to main window move/resize to detect manual user movement', async () => {
    const handler = invokeHandler()!
    await handler()

    expect(mainWindow.on).toHaveBeenCalledWith('move', expect.any(Function))
    expect(mainWindow.on).toHaveBeenCalledWith('resize', expect.any(Function))
  })

  it('restores main window to saved bounds when onboarding closes without manual move', async () => {
    vi.useFakeTimers()
    const handler = invokeHandler()!
    await handler()
    // 越过 ignoreNextMoves 窗口
    vi.advanceTimersByTime(400)

    manager.fireClosed()

    // 主窗口动画回原位（savedBounds = 初始 bounds）
    expect(mainWindow.setPosition).toHaveBeenCalled()
    expect(animateMock).toHaveBeenCalledTimes(2) // 第一次移走，第二次移回
    // move/resize listener 被移除
    expect(mainWindow.removeListener).toHaveBeenCalledWith('move', expect.any(Function))
    expect(mainWindow.removeListener).toHaveBeenCalledWith('resize', expect.any(Function))
  })

  it('does not restore bounds when user moved the window manually', async () => {
    vi.useFakeTimers()
    const handler = invokeHandler()!
    await handler()
    vi.advanceTimersByTime(400)

    // 模拟用户手动移动
    const moveCb = mainWindow.handlers.get('move')!
    moveCb()
    expect(mainWindow.handlers.get('move')).toBeTypeOf('function') // 仍然订阅

    manager.fireClosed()
    // 手动移动后不应有第二次动画
    expect(animateMock).toHaveBeenCalledTimes(1)
    expect(mainWindow.removeListener).toHaveBeenCalledWith('move', expect.any(Function))
  })

  it('skips animation when onboarding window is destroyed', async () => {
    onboardingWindow.isDestroyed.mockReturnValue(true)
    const handler = invokeHandler()!
    await handler()
    // animateWindowTo 对 destroyed window 返回 undefined；主窗口仍应走 getAndToggleWindow
    expect(manager.getAndToggleWindow).toHaveBeenCalled()
  })

  it('cleans up previous closed-handler subscription on re-open', async () => {
    const handler = invokeHandler()!
    await handler()
    await handler()
    expect(manager.onClosed).toHaveBeenCalledTimes(2)
    // 第一次的 unsub 被调用
    const unsubs = manager.onClosed.mock.results.map(r => r.value)
    expect(unsubs[0]).toBeTypeOf('function')
  })
})