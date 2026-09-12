import type { AutoUpdaterState } from '@kitsune/electron-eventa/electron-updater'

import { createContext, defineInvoke } from '@moeru/eventa'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  autoUpdater as autoUpdaterEventa,
  electronAutoUpdaterStateChanged,
  electronGetUpdaterPreferences,
  electronSetUpdaterPreferences,
} from '../../../shared/eventa'
import { createAutoUpdaterService } from './auto-updater'

function createMockUpdaterState(status: AutoUpdaterState['status']): AutoUpdaterState {
  return {
    status,
    diagnostics: {
      platform: 'win32',
      arch: 'x64',
      channel: 'latest-x64',
      logFilePath: 'C:\\Users\\test\\AppData\\Roaming\\kitsune-updater\\updater-log.txt',
      executablePath: 'C:\\Program Files\\kitsune-ai\\kitsune-ai.exe',
      installDirectory: 'C:\\Program Files\\kitsune-ai',
      requiresAdminForInstallPath: true,
      isOverrideActive: false,
    },
  }
}

function createMockService() {
  let state = createMockUpdaterState('idle')
  let lane: 'stable' | 'beta' | undefined = 'stable'
  const hooks = new Set<(next: AutoUpdaterState) => void>()
  return {
    get state() {
      return state
    },
    _setState(next: AutoUpdaterState) {
      state = next
    },
    checkForUpdates: vi.fn(async () => {
      state = createMockUpdaterState('checking')
    }),
    downloadUpdate: vi.fn(async () => {
      state = createMockUpdaterState('downloaded')
    }),
    quitAndInstall: vi.fn(async () => {}),
    getPreferredUpdateLane: vi.fn(() => lane),
    setPreferredUpdateLane: vi.fn(async (next: 'stable' | 'beta' | undefined) => {
      lane = next
      state = createMockUpdaterState('idle')
      return next
    }),
    subscribe: vi.fn((callback: (next: AutoUpdaterState) => void) => {
      hooks.add(callback)
      try {
        callback(state)
      }
      catch {
        /* noop */
      }
      return () => hooks.delete(callback)
    }),
    _hooks: hooks,
  }
}

function createMockWindow() {
  let closedHandler: (() => void) | undefined
  return {
    isDestroyed: vi.fn(() => false),
    on: vi.fn((event: string, handler: () => void) => {
      if (event === 'closed')
        closedHandler = handler
    }),
    close() {
      closedHandler?.()
    },
  }
}

vi.mock('@guiiai/logg', () => ({
  useLogg: () => ({
    useGlobalConfig: () => ({
      withError: () => ({ error: vi.fn() }),
    }),
  }),
}))

vi.mock('@moeru/std', () => ({
  tryCatch: (fn: () => void) => fn(),
}))

const appMock = vi.hoisted(() => ({
  getVersion: vi.fn(() => '0.9.0-beta.4'),
  getPath: vi.fn((name: string) => (name === 'logs' ? '/tmp/airi/logs' : `/tmp/${name}`)),
  quit: vi.fn(),
  isPackaged: false,
}))

vi.mock('electron', () => ({
  app: appMock,
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: false },
}))

vi.mock('std-env', () => ({
  isWindows: false,
}))

vi.mock('electron-updater', () => ({
  default: {
    get autoUpdater() {
      return {
        on: vi.fn(),
        autoDownload: false,
        allowPrerelease: false,
        channel: undefined,
        setFeedURL: vi.fn(),
        checkForUpdates: vi.fn().mockResolvedValue(undefined),
        downloadUpdate: vi.fn().mockResolvedValue(undefined),
        quitAndInstall: vi.fn(),
      }
    },
  },
}))

vi.mock('~build/git', () => ({
  committerDate: '2026-04-01T00:00:00.000Z',
}))

vi.mock('@kitsune/stage-shared', () => ({
  errorMessageFromValue: (value: unknown) => (value instanceof Error ? value.message : String(value)),
}))

describe('createAutoUpdaterService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function createAutoUpdaterServiceFixture() {
    const context = createContext()
    const window = createMockWindow()
    const service = createMockService()
    createAutoUpdaterService({ context: context as never, window: window as never, service: service as never })
    return { context, window, service }
  }

  it('forwards service state to the window context as state-changed events', async () => {
    const { context, service } = createAutoUpdaterServiceFixture()
    const received: AutoUpdaterState[] = []

    // `service.subscribe` replays the current state immediately, so the
    // first state-changed event should already be on the wire.
    expect(received).toHaveLength(0)

    context.on(electronAutoUpdaterStateChanged, (envelope) => {
      received.push(envelope.body as AutoUpdaterState)
    })

    service._hooks.forEach(hook => hook(createMockUpdaterState('checking')))
    service._hooks.forEach(hook => hook(createMockUpdaterState('available')))

    expect(received.map(s => s.status)).toEqual(['checking', 'available'])
  })

  it('getState returns the current service state', async () => {
    const context = createContext()
    const window = createMockWindow()
    const service = createMockService()
    service._setState(createMockUpdaterState('available'))

    createAutoUpdaterService({ context: context as never, window: window as never, service: service as never })

    const getState = defineInvoke(context, autoUpdaterEventa.getState)
    await expect(getState()).resolves.toMatchObject({ status: 'available' })
  })

  it('checkForUpdates calls the service and returns the resulting state', async () => {
    const context = createContext()
    const window = createMockWindow()
    const service = createMockService()

    createAutoUpdaterService({ context: context as never, window: window as never, service: service as never })

    const check = defineInvoke(context, autoUpdaterEventa.checkForUpdates)
    await expect(check()).resolves.toMatchObject({ status: 'checking' })
    expect(service.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('downloadUpdate calls the service and returns the resulting state', async () => {
    const context = createContext()
    const window = createMockWindow()
    const service = createMockService()

    createAutoUpdaterService({ context: context as never, window: window as never, service: service as never })

    const download = defineInvoke(context, autoUpdaterEventa.downloadUpdate)
    await expect(download()).resolves.toMatchObject({ status: 'downloaded' })
    expect(service.downloadUpdate).toHaveBeenCalledTimes(1)
  })

  it('quitAndInstall forwards to the service', async () => {
    const context = createContext()
    const window = createMockWindow()
    const service = createMockService()

    createAutoUpdaterService({ context: context as never, window: window as never, service: service as never })

    const quit = defineInvoke(context, autoUpdaterEventa.quitAndInstall)
    await expect(quit()).resolves.toBeUndefined()
    expect(service.quitAndInstall).toHaveBeenCalledTimes(1)
  })

  it('getPreferences returns the current update lane', async () => {
    const context = createContext()
    const window = createMockWindow()
    const service = createMockService()
    service.getPreferredUpdateLane.mockReturnValue('beta')

    createAutoUpdaterService({ context: context as never, window: window as never, service: service as never })

    const getPreferences = defineInvoke(context, electronGetUpdaterPreferences)
    await expect(getPreferences()).resolves.toEqual({ channel: 'beta' })
  })

  it('setPreferences applies the channel and returns the updated lane', async () => {
    const context = createContext()
    const window = createMockWindow()
    const service = createMockService()

    createAutoUpdaterService({ context: context as never, window: window as never, service: service as never })

    const setPreferences = defineInvoke(context, electronSetUpdaterPreferences)
    await expect(setPreferences({ channel: 'beta' })).resolves.toEqual({ channel: 'beta' })
    expect(service.setPreferredUpdateLane).toHaveBeenCalledWith('beta')
  })

  it('stops forwarding state after the window closes', async () => {
    const context = createContext()
    const window = createMockWindow()
    const service = createMockService()
    const received: AutoUpdaterState[] = []

    createAutoUpdaterService({ context: context as never, window: window as never, service: service as never })

    context.on(electronAutoUpdaterStateChanged, (envelope) => {
      received.push(envelope.body as AutoUpdaterState)
    })

    window.close()
    service._hooks.forEach(hook => hook(createMockUpdaterState('checking')))

    expect(received).toHaveLength(0)
  })
})
