import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/kitsune/channel-server'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { noticeWindowEventa } from '../../../shared/eventa'
import { setupNoticeWindowManager } from './index'

// ---- hoisted mocks (vi.mock factories are hoisted above imports; any shared
// state they reference must live in vi.hoisted containers) ----
const defineInvokeHandlerMock = vi.hoisted(() => vi.fn((_context: unknown, _eventa: unknown, _handler: unknown) => () => {}))
const safeCloseMock = vi.hoisted(() => vi.fn(() => true))
const loadMock = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const setupBaseWindowElectronInvokesMock = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const ipcMainMock = vi.hoisted(() => ({ on: vi.fn(), off: vi.fn(), setMaxListeners: vi.fn() }))
const browserWindows = vi.hoisted(() => [] as FakeBrowserWindow[])

interface FakeBrowserWindow {
  webContents: { id: number, send: ReturnType<typeof vi.fn>, setWindowOpenHandler: ReturnType<typeof vi.fn> }
  handlers: Record<string, () => void>
  isDestroyed: () => boolean
  close: () => void
  show: () => void
  focus: () => void
  on: (type: string, cb: () => void) => void
}

vi.mock('@moeru/eventa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@moeru/eventa')>()
  return {
    ...actual,
    defineInvokeHandler: defineInvokeHandlerMock,
  }
})

// The referenced-window manager wires the real electron adapter; the adapter
// only touches ipcMain.on/off/setMaxListeners, so stubs suffice. Nothing emits
// events through the adapter in these tests.
vi.mock('@moeru/eventa/adapters/electron/main', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@moeru/eventa/adapters/electron/main')>()
  return {
    ...actual,
  }
})

vi.mock('@kitsune/electron-vueuse/main', () => ({
  safeClose: safeCloseMock,
  isRendererUnavailable: vi.fn(() => false),
}))

vi.mock('../../libs/electron/location', () => ({
  baseUrl: vi.fn(() => ({ url: 'http://localhost:5173' })),
  getElectronMainDirname: vi.fn(() => '/tmp/main'),
  load: loadMock,
  withHashRoute: vi.fn((base: string, route: string) => `${base}#${route}`),
}))

vi.mock('../../../../resources/icon.png?asset', () => ({ default: 'icon.png' }))

vi.mock('../shared/window', () => ({
  setupBaseWindowElectronInvokes: setupBaseWindowElectronInvokesMock,
}))

vi.mock('electron', () => ({
  ipcMain: ipcMainMock,
  BrowserWindow: class {
    webContents: FakeBrowserWindow['webContents']
    handlers: Record<string, () => void>

    constructor() {
      this.webContents = { id: 1, send: vi.fn(), setWindowOpenHandler: vi.fn() }
      this.handlers = {}
      browserWindows.push(this as unknown as FakeBrowserWindow)
    }

    on(type: string, cb: () => void) {
      this.handlers[type] = cb
    }

    removeListener(type: string, cb?: () => void) {
      if (!cb || this.handlers[type] === cb)
        delete this.handlers[type]
    }

    isDestroyed() {
      return false
    }

    close() {
      this.handlers.closed?.()
    }

    emit(type: string) {
      this.handlers[type]?.()
    }

    show() {}
    focus() {}
  },
  shell: { openExternal: vi.fn() },
}))

describe('setupNoticeWindowManager', () => {
  const i18n = { t: vi.fn((k: string) => k) } as unknown as I18n
  const serverChannel = {} as ServerChannel

  beforeEach(() => {
    vi.clearAllMocks()
    browserWindows.length = 0
    loadMock.mockResolvedValue(undefined)
    defineInvokeHandlerMock.mockImplementation(() => () => {})
  })

  it('resolves false (not confirmed) when the window is closed without an action', async () => {
    const manager = setupNoticeWindowManager({ i18n, serverChannel })
    const openPromise = manager.open({ id: 'notice-1', route: '/notice/fade-on-hover', type: 'fade-on-hover' })

    // manager.open resolves after loadRoute (load()); the notice-level promise
    // stays pending until an action/close arrives.
    await vi.waitFor(() => expect(loadMock).toHaveBeenCalled())
    await vi.waitFor(() => {
      expect(defineInvokeHandlerMock.mock.calls.some(call => (call[1] as unknown) === noticeWindowEventa.windowAction)).toBe(true)
    })

    // User closes the window via the OS close button: no windowAction is sent,
    // only the window 'closed' event fires.
    expect(browserWindows).toHaveLength(1)
    browserWindows[0]!.close()

    await expect(openPromise).resolves.toBe(false)
    expect(safeCloseMock).not.toHaveBeenCalled()
  })

  it('resolves true (confirmed) when the windowAction confirm arrives', async () => {
    const manager = setupNoticeWindowManager({ i18n, serverChannel })
    const openPromise = manager.open({ id: 'notice-1', route: '/notice/fade-on-hover', type: 'fade-on-hover' })

    await vi.waitFor(() => {
      expect(defineInvokeHandlerMock.mock.calls.some(call => (call[1] as unknown) === noticeWindowEventa.windowAction)).toBe(true)
    })

    const handlerCall = defineInvokeHandlerMock.mock.calls.find(call => (call[1] as unknown) === noticeWindowEventa.windowAction)!
    const handler = handlerCall[2] as unknown as (payload?: { id?: string, action?: 'confirm' | 'cancel' | 'close' }) => void
    handler({ id: 'notice-1', action: 'confirm' })

    await expect(openPromise).resolves.toBe(true)
    expect(safeCloseMock).toHaveBeenCalledTimes(1)
  })

  it('resolves false (not confirmed) when the windowAction cancel arrives', async () => {
    const manager = setupNoticeWindowManager({ i18n, serverChannel })
    const openPromise = manager.open({ id: 'notice-1', route: '/notice/fade-on-hover', type: 'fade-on-hover' })

    await vi.waitFor(() => {
      expect(defineInvokeHandlerMock.mock.calls.some(call => (call[1] as unknown) === noticeWindowEventa.windowAction)).toBe(true)
    })

    const handlerCall = defineInvokeHandlerMock.mock.calls.find(call => (call[1] as unknown) === noticeWindowEventa.windowAction)!
    const handler = handlerCall[2] as unknown as (payload?: { id?: string, action?: 'confirm' | 'cancel' | 'close' }) => void
    handler({ id: 'notice-1', action: 'cancel' })

    await expect(openPromise).resolves.toBe(false)
    expect(safeCloseMock).toHaveBeenCalledTimes(1)
  })
})