import type { BrowserWindow } from 'electron'

import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/kitsune/channel-server'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createRequestWindowEventa } from '../../../shared/eventa'
import { createReferencedWindowManager } from './referenced-window'

// ---- hoisted mocks ----
const defineInvokeHandlerMock = vi.hoisted(() => vi.fn((_context: unknown, _eventa: unknown, _handler: unknown) => () => {}))
const ipcMainMock = vi.hoisted(() => ({ on: vi.fn(), off: vi.fn(), setMaxListeners: vi.fn() }))
const setupBaseWindowElectronInvokesMock = vi.hoisted(() => vi.fn(() => Promise.resolve()))

vi.mock('@moeru/eventa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@moeru/eventa')>()
  return {
    ...actual,
    defineInvokeHandler: defineInvokeHandlerMock,
  }
})

vi.mock('@moeru/eventa/adapters/electron/main', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@moeru/eventa/adapters/electron/main')>()
  return {
    ...actual,
  }
})

vi.mock('@kitsune/electron-vueuse/main', () => ({
  safeClose: vi.fn(() => true),
  isRendererUnavailable: vi.fn(() => false),
}))

vi.mock('electron', () => ({
  ipcMain: ipcMainMock,
}))

vi.mock('./window', () => ({
  setupBaseWindowElectronInvokes: setupBaseWindowElectronInvokesMock,
}))

interface FakeWin {
  webContents: { id: number, send: ReturnType<typeof vi.fn> }
  handlers: Record<string, () => void>
  isDestroyed: () => boolean
  close: () => void
  emit: (type: string) => void
  on: (type: string, cb: () => void) => void
  show: () => void
  focus: () => void
}

function makeFakeWindow(): FakeWin {
  const handlers: Record<string, () => void> = {}
  return {
    webContents: { id: 1, send: vi.fn() },
    handlers,
    isDestroyed: () => false,
    close: () => {
      handlers.closed?.()
    },
    emit: (type: string) => {
      handlers[type]?.()
    },
    on: (type: string, cb: () => void) => {
      handlers[type] = cb
    },
    show: vi.fn(),
    focus: vi.fn(),
  }
}

const testEventa = createRequestWindowEventa('test')

describe('createReferencedWindowManager', () => {
  const i18n = { t: vi.fn() } as unknown as I18n
  const serverChannel = {} as ServerChannel

  function makeManager() {
    const created: FakeWin[] = []
    const manager = createReferencedWindowManager({
      eventa: testEventa,
      i18n,
      serverChannel,
      createWindow: () => {
        const win = makeFakeWindow()
        created.push(win)
        return win as unknown as BrowserWindow
      },
      loadRoute: vi.fn(() => Promise.resolve()),
    })
    return { manager, created }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fires sessionDisposed when the window is closed', async () => {
    const { manager, created } = makeManager()
    const handle = await manager.open({ id: 'w1', route: '/x' })
    const disposed = vi.fn()
    const off = handle.sessionDisposed(disposed)

    expect(created).toHaveLength(1)
    created[0]!.close()

    expect(disposed).toHaveBeenCalledTimes(1)
    // The returned off() removes the listener for a later close.
    off()
    created[0]!.close()
    expect(disposed).toHaveBeenCalledTimes(1)
  })

  it('reuses an open window for the same id', async () => {
    const { manager, created } = makeManager()
    await manager.open({ id: 'same-id', route: '/x' })
    const second = await manager.open({ id: 'same-id', route: '/x' })

    expect(created).toHaveLength(1)
    expect(second.id).toBe('same-id')
  })

  it('evicts the window entry after close so reopen creates a fresh window', async () => {
    const { manager, created } = makeManager()
    await manager.open({ id: 'evict', route: '/x' })
    created[0]!.close()
    await manager.open({ id: 'evict', route: '/x' })

    expect(created).toHaveLength(2)
  })

  it('pageMounted returns the pending payload for the matching id', async () => {
    const { manager } = makeManager()
    await manager.open({ id: 'pm-1', route: '/x', type: 'fade-on-hover', payload: { a: 1 } })

    const mountedCall = defineInvokeHandlerMock.mock.calls.find(call => (call[1] as unknown) === testEventa.pageMounted)!
    const mounted = mountedCall[2] as unknown as (req?: { id?: string }) => { id: string, type?: string, payload?: unknown } | undefined

    expect(mounted({ id: 'pm-1' })).toEqual({ id: 'pm-1', type: 'fade-on-hover', payload: { a: 1 } })
    // Different id gets nothing back.
    expect(mounted({ id: 'other' })).toBeUndefined()
  })

  it('pageUnmounted deletes the window matching the id', async () => {
    const { manager, created } = makeManager()
    await manager.open({ id: 'unmount-me', route: '/x' })

    const unmountedCall = defineInvokeHandlerMock.mock.calls.find(call => (call[1] as unknown) === testEventa.pageUnmounted)!
    const unmounted = unmountedCall[2] as unknown as (req?: { id?: string }) => void
    unmounted({ id: 'unmount-me' })

    // Reopen must create a fresh window since the entry was evicted.
    await manager.open({ id: 'unmount-me', route: '/x' })
    expect(created).toHaveLength(2)
  })
})