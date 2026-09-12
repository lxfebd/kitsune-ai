import type { BrowserWindow } from 'electron'
import type { ElectronGodotStageStatus } from '../../../../shared/eventa'

import { EventEmitter } from 'node:events'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'

import { createContext } from '@moeru/eventa'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  electronGodotStageStatusChanged,
  electronGodotStageViewSnapshotChanged,
  electronGodotStageViewStateError,
} from '../../../../shared/eventa'

type ServiceContext = Parameters<typeof import('./index').createGodotStageService>[0]['context']

// ---- module mocks ----

const appMock = vi.hoisted(() => ({
  getPath: vi.fn(),
  isPackaged: false,
}))

const spawnMock = vi.hoisted(() => vi.fn())

const lifecycleMock = vi.hoisted(() => ({
  onAppBeforeQuit: vi.fn(),
}))

const locationMock = vi.hoisted(() => ({
  getElectronMainDirname: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  defineWebSocketHandler: vi.fn(),
  serve: vi.fn(),
}))

// H3 被 `new` 实例化，必须用真实类；实例列表供测试取用。
const h3Instances = vi.hoisted(() => ({
  current: [] as Array<{ get: ReturnType<typeof vi.fn> }>,
}))

const getRandomPortMock = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  app: appMock,
}))

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}))

// token / requestId 由 randomUUID 生成；固定返回使 WebSocket URL 可预测。
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>()
  return {
    ...actual,
    randomUUID: vi.fn(() => 'fixed-uuid-0000'),
  }
})

vi.mock('@guiiai/logg', () => ({
  useLogg: vi.fn(() => {
    const log = vi.fn()
    return {
      useGlobalConfig: () => ({
        log,
        warn: log,
        debug: log,
        withError: () => ({ warn: log, debug: log }),
        withFields: () => ({ log, debug: log, warn: log }),
      }),
    }
  }),
}))

vi.mock('@moeru/eventa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@moeru/eventa')>()
  return {
    ...actual,
    defineInvokeHandler: vi.fn(() => vi.fn()),
  }
})

vi.mock('../../../libs/bootkit/lifecycle', () => lifecycleMock)
vi.mock('../../../libs/electron/location', () => locationMock)

vi.mock('h3', () => ({
  H3: class {
    get = vi.fn()
    constructor() {
      h3Instances.current.push(this)
    }
  },
  defineWebSocketHandler: h3Mocks.defineWebSocketHandler,
  serve: h3Mocks.serve,
}))

vi.mock('get-port-please', () => ({
  getRandomPort: getRandomPortMock,
}))

vi.mock('crossws/server', () => ({
  plugin: vi.fn(() => ({})),
}))

// ---- fakes ----

class FakeGodotProcess extends EventEmitter {
  pid = 4321
  stdout = new PassThrough()
  stderr = new PassThrough()
  kill = vi.fn(() => true)
}

interface FakePeer {
  id: string
  request: { url: string }
  send: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

function createFakePeer(port: number): FakePeer {
  return {
    id: 'peer-1',
    request: { url: `ws://127.0.0.1:${port}/ws?token=fixed-uuid-0000` },
    send: vi.fn(),
    close: vi.fn(),
  }
}

function makeMessage(text: string) {
  return { text: () => text }
}

function makeValidSnapshotPayload() {
  return {
    state: {
      schemaVersion: 1,
      revision: 1,
      updatedAt: 1700000000000,
      camera: { position: { x: 0, y: 1.6, z: 0 }, yawDeg: 0, pitchDeg: 0, fovDeg: 60 },
    },
    reason: 'request',
    requestId: 'req-1',
  }
}

function makeValidPatch() {
  return { camera: { yawDeg: 15 } }
}

interface WsCapture {
  hooks: {
    open?: (peer: FakePeer) => void
    message?: (peer: FakePeer, message: ReturnType<typeof makeMessage>) => void
    close?: (peer: FakePeer) => void
  }
}

// defineWebSocketHandler 返回 hooks；H3 实例的 get('/ws', hooks) 保存它们。
function startSocketCapture(): WsCapture {
  const capture: WsCapture = { hooks: {} }
  h3Mocks.defineWebSocketHandler.mockImplementation((hooks: unknown) => hooks)
  return capture
}

// driveStart 在 startSocketRuntime 的异步链上执行；等 H3 实例出现后再取 hooks。
async function driveStart(socketCapture: WsCapture) {
  await vi.waitFor(() => {
    expect(h3Instances.current.length).toBeGreaterThan(0)
  })
  const appServer = h3Instances.current.at(-1)!
  const getCall = appServer.get.mock.calls.find(([path]) => path === '/ws')
  socketCapture.hooks = getCall?.[1] as WsCapture['hooks']
}

function createSocketRuntimeFake() {
  const server = {
    serve: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  }
  h3Mocks.serve.mockReturnValue(server)
  getRandomPortMock.mockResolvedValue(19091)
  return server
}

// ---- helpers ----

let enginesDir: string

function setupEngineLayout() {
  enginesDir = mkdtempSync(join(tmpdir(), 'godot-stage-test-'))
  const projectDir = join(enginesDir, 'engines', 'stage-tamagotchi-godot')
  mkdirSync(projectDir, { recursive: true })
  writeFileSync(join(projectDir, 'project.godot'), '[application]\n', 'utf-8')
  locationMock.getElectronMainDirname.mockReturnValue(enginesDir)
}

function setupGodotExe() {
  const exeDir = mkdtempSync(join(tmpdir(), 'godot-exe-'))
  const godotExe = join(exeDir, 'Godot.exe')
  writeFileSync(godotExe, '', 'utf-8')
  process.env.GODOT4 = godotExe
}

beforeEach(() => {
  vi.clearAllMocks()
  h3Instances.current.length = 0
  appMock.getPath.mockReturnValue(join(tmpdir(), 'godot-stage-userdata'))
  spawnMock.mockImplementation(() => new FakeGodotProcess())
  setupEngineLayout()
  setupGodotExe()
})

afterEach(() => {
  delete process.env.GODOT4
  rmSync(enginesDir, { recursive: true, force: true })
})

// ================= manager lifecycle =================

describe('createGodotStageManager', () => {
  it('starts with stopped status and no view snapshot', async () => {
    const { createGodotStageManager } = await import('./index')
    const manager = createGodotStageManager()

    expect(manager.getStatus()).toMatchObject({ state: 'stopped', pid: null })
    expect(manager.getViewSnapshot()).toBeNull()
  })

  it('subscribe fires immediately with the current status', async () => {
    const { createGodotStageManager } = await import('./index')
    const manager = createGodotStageManager()

    const seen: ElectronGodotStageStatus[] = []
    const unsub = manager.subscribe(status => seen.push(status))
    expect(seen).toHaveLength(1)
    expect(seen[0]!.state).toBe('stopped')
    unsub()
  })

  it('stop() with nothing running resolves to stopped', async () => {
    const { createGodotStageManager } = await import('./index')
    const manager = createGodotStageManager()

    await expect(manager.stop()).resolves.toMatchObject({ state: 'stopped', pid: null })
  })

  it('applySceneInput throws when not running', async () => {
    const { createGodotStageManager } = await import('./index')
    const manager = createGodotStageManager()

    await expect(manager.applySceneInput({
      modelId: 'm1',
      format: 'vrm',
      name: 'Miku',
      fileName: 'model.vrm',
      data: new Uint8Array([1, 2, 3]),
    })).rejects.toThrow('Godot stage is not running.')
  })

  it('applyViewPatch and requestViewSnapshot throw when not running', async () => {
    const { createGodotStageManager } = await import('./index')
    const manager = createGodotStageManager()

    await expect(manager.applyViewPatch(makeValidPatch())).rejects.toThrow('Godot stage is not running.')
    await expect(manager.requestViewSnapshot()).rejects.toThrow('Godot stage is not running.')
  })

  it('GODOT4 missing → start rejects with a clear message', async () => {
    createSocketRuntimeFake()
    delete process.env.GODOT4
    const { createGodotStageManager } = await import('./index')
    const manager = createGodotStageManager()

    await expect(manager.start()).rejects.toThrow('GODOT4 is required')
  })

  it('starts the engine, transitions to running on stage.ready, then stops cleanly', async () => {
    const socketCapture = startSocketCapture()
    createSocketRuntimeFake()
    const { createGodotStageManager } = await import('./index')
    const manager = createGodotStageManager()

    const processHandle = new FakeGodotProcess()
    spawnMock.mockReturnValue(processHandle)

    const statuses: ElectronGodotStageStatus[] = []
    manager.subscribe(status => statuses.push(status))

    const startPromise = manager.start()
    await driveStart(socketCapture)

    const peer = createFakePeer(19091)
    socketCapture.hooks.open?.(peer)

    // 模拟 Godot 进程就绪
    socketCapture.hooks.message?.(peer, makeMessage(JSON.stringify({ type: 'stage.ready' })))

    const runningStatus = await startPromise
    expect(runningStatus.state).toBe('running')
    expect(runningStatus.pid).toBe(4321)

    // stage.ready 之前应经历 starting
    expect(statuses.some(s => s.state === 'starting')).toBe(true)
    expect(statuses.at(-1)!.state).toBe('running')

    // 停止：发送 host.shutdown（manager.stop 经 mutex 微任务派发，需等待）
    const stopPromise = manager.stop()
    await vi.waitFor(() => {
      expect(peer.send).toHaveBeenCalledWith(expect.stringContaining('host.shutdown'))
    })

    processHandle.emit('close', 0, null)
    await expect(stopPromise).resolves.toMatchObject({ state: 'stopped', pid: null })
  })

  it('forwards view snapshots and broadcasts invalid payload errors', async () => {
    const socketCapture = startSocketCapture()
    createSocketRuntimeFake()
    const { createGodotStageManager } = await import('./index')
    const manager = createGodotStageManager()

    const processHandle = new FakeGodotProcess()
    spawnMock.mockReturnValue(processHandle)

    const startPromise = manager.start()
    await driveStart(socketCapture)
    const peer = createFakePeer(19091)
    socketCapture.hooks.open?.(peer)
    socketCapture.hooks.message?.(peer, makeMessage(JSON.stringify({ type: 'stage.ready' })))
    await startPromise

    const snapshots: unknown[] = []
    const errors: unknown[] = []
    manager.subscribeViewSnapshot(s => snapshots.push(s))
    manager.subscribeViewError(e => errors.push(e))

    socketCapture.hooks.message?.(peer, makeMessage(JSON.stringify({ type: 'stage.view.snapshot', payload: makeValidSnapshotPayload() })))
    expect(manager.getViewSnapshot()).toMatchObject({ reason: 'request' })
    expect(snapshots).toHaveLength(1)

    // 无效 payload 触发 view error（invalid-payload 码）
    socketCapture.hooks.message?.(peer, makeMessage(JSON.stringify({ type: 'stage.view.snapshot', payload: { nope: 1 } })))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({ code: 'invalid-payload' })

    processHandle.emit('close', 0, null)
  })

  it('stage.fatal rejects the start and kills the process', async () => {
    const socketCapture = startSocketCapture()
    createSocketRuntimeFake()
    const { createGodotStageManager } = await import('./index')
    const manager = createGodotStageManager()

    const processHandle = new FakeGodotProcess()
    spawnMock.mockReturnValue(processHandle)

    const startPromise = manager.start()
    await driveStart(socketCapture)

    const peer = createFakePeer(19091)
    socketCapture.hooks.open?.(peer)
    socketCapture.hooks.message?.(peer, makeMessage(JSON.stringify({ type: 'stage.fatal', payload: { message: 'missing vulkan' } })))

    // 让进程退出以缩短 stopProcessAfterFailedStart 的等待
    processHandle.emit('close', 1, null)

    await expect(startPromise).rejects.toThrow('missing vulkan')
    expect(manager.getStatus().state).toBe('error')
    expect(processHandle.kill).toHaveBeenCalled()
  })

  it('unexpected process close transitions to error status', async () => {
    const socketCapture = startSocketCapture()
    createSocketRuntimeFake()
    const { createGodotStageManager } = await import('./index')
    const manager = createGodotStageManager()

    const processHandle = new FakeGodotProcess()
    spawnMock.mockReturnValue(processHandle)

    const startPromise = manager.start()
    await driveStart(socketCapture)
    const peer = createFakePeer(19091)
    socketCapture.hooks.open?.(peer)
    socketCapture.hooks.message?.(peer, makeMessage(JSON.stringify({ type: 'stage.ready' })))
    await startPromise
    expect(manager.getStatus().state).toBe('running')

    // 模拟崩溃（非预期退出）
    processHandle.emit('close', 1, null)
    expect(manager.getStatus().state).toBe('error')
    expect(manager.getStatus().lastError).toContain('exited with code 1')
  })
})

// ================= IPC service wiring =================

describe('createGodotStageService', () => {
  let context: ServiceContext
  let windowFake: ReturnType<typeof createWindowFake>
  let managerFake: {
    subscribe: ReturnType<typeof vi.fn>
    subscribeViewSnapshot: ReturnType<typeof vi.fn>
    subscribeViewError: ReturnType<typeof vi.fn>
    start: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
    getStatus: ReturnType<typeof vi.fn>
    applySceneInput: ReturnType<typeof vi.fn>
    getViewSnapshot: ReturnType<typeof vi.fn>
    applyViewPatch: ReturnType<typeof vi.fn>
    requestViewSnapshot: ReturnType<typeof vi.fn>
  }

  function createWindowFake() {
    const handlers = new Map<string, Function>()
    return {
      on: vi.fn((event: string, cb: Function) => {
        handlers.set(event, cb)
        return { remove: () => handlers.delete(event) }
      }),
      removeListener: vi.fn(),
      isDestroyed: vi.fn(() => false),
      fire(event: string) {
        handlers.get(event)?.()
      },
    }
  }

  function makeManagerFake() {
    managerFake = {
      subscribe: vi.fn(() => vi.fn()),
      subscribeViewSnapshot: vi.fn(() => vi.fn()),
      subscribeViewError: vi.fn(() => vi.fn()),
      start: vi.fn(),
      stop: vi.fn(),
      getStatus: vi.fn(() => ({ state: 'stopped', pid: null, updatedAt: 0 })),
      applySceneInput: vi.fn(),
      getViewSnapshot: vi.fn(() => null),
      applyViewPatch: vi.fn(),
      requestViewSnapshot: vi.fn(),
    }
    return managerFake
  }

  beforeEach(() => {
    vi.clearAllMocks()
    context = createContext() as unknown as ServiceContext
    windowFake = createWindowFake()
    makeManagerFake()
  })

  it('registers all seven invoke handlers', async () => {
    const { createGodotStageService } = await import('./index')
    const { defineInvokeHandler } = await import('@moeru/eventa')
    createGodotStageService({ context, manager: managerFake as never, window: windowFake as unknown as BrowserWindow })

    expect(defineInvokeHandler).toHaveBeenCalledTimes(7)
  })

  it('forwards manager status changes to the event bus', async () => {
    const { createGodotStageService } = await import('./index')
    createGodotStageService({ context, manager: managerFake as never, window: windowFake as unknown as BrowserWindow })

    const received: unknown[] = []
    const off = context.on(electronGodotStageStatusChanged, event => received.push(event))
    const cb = managerFake.subscribe.mock.calls[0]![0] as (status: ElectronGodotStageStatus) => void
    cb({ state: 'running', pid: 4321, updatedAt: 123 })

    expect(received).toHaveLength(1)
    expect((received[0] as { body: ElectronGodotStageStatus }).body.state).toBe('running')
    off()
  })

  it('does not emit status when the window is destroyed', async () => {
    const { createGodotStageService } = await import('./index')
    windowFake.isDestroyed.mockReturnValue(true)
    createGodotStageService({ context, manager: managerFake as never, window: windowFake as unknown as BrowserWindow })

    const received: unknown[] = []
    const off = context.on(electronGodotStageStatusChanged, event => received.push(event))
    const cb = managerFake.subscribe.mock.calls[0]![0] as (status: ElectronGodotStageStatus) => void
    cb({ state: 'running', pid: 4321, updatedAt: 123 })

    expect(received).toHaveLength(0)
    off()
  })

  it('forwards view snapshot and view error events', async () => {
    const { createGodotStageService } = await import('./index')
    createGodotStageService({ context, manager: managerFake as never, window: windowFake as unknown as BrowserWindow })

    const snapshots: unknown[] = []
    const errors: unknown[] = []
    const offSnap = context.on(electronGodotStageViewSnapshotChanged, event => snapshots.push(event))
    const offErr = context.on(electronGodotStageViewStateError, event => errors.push(event))

    const snapCb = managerFake.subscribeViewSnapshot.mock.calls[0]![0] as (s: unknown) => void
    snapCb(makeValidSnapshotPayload())
    const errCb = managerFake.subscribeViewError.mock.calls[0]![0] as (p: unknown) => void
    errCb({ code: 'persistence-failed', message: 'disk full' })

    expect(snapshots).toHaveLength(1)
    expect(errors).toHaveLength(1)
    offSnap()
    offErr()
  })

  it('cleans up subscriptions and handlers when the window closes', async () => {
    const { createGodotStageService } = await import('./index')
    const cleanup = createGodotStageService({ context, manager: managerFake as never, window: windowFake as unknown as BrowserWindow })

    const unsubStatus = managerFake.subscribe.mock.results[0]!.value
    const unsubSnap = managerFake.subscribeViewSnapshot.mock.results[0]!.value
    const unsubErr = managerFake.subscribeViewError.mock.results[0]!.value
    expect(unsubStatus).not.toHaveBeenCalled()

    windowFake.fire('closed')

    expect(unsubStatus).toHaveBeenCalledTimes(1)
    expect(unsubSnap).toHaveBeenCalledTimes(1)
    expect(unsubErr).toHaveBeenCalledTimes(1)
    expect(cleanup).toBeTypeOf('function')
  })
})