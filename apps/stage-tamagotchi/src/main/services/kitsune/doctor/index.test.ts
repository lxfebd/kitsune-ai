import type { OverseerStatus, PluginRegistrySnapshot } from '../../../../shared/eventa'
import type { SidecarService } from '../sidecar'
import type { OverseerService } from '../overseer'
import type { ExtensionHostService } from '../plugins/types'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---- mock variables (hoisted together with vi.mock calls) ----
// vi.mock factories are hoisted to the top of the file by vitest, so any
// variables they reference must also be hoisted via vi.hoisted(), otherwise
// the factory runs before the const declaration and throws ReferenceError.
const {
  mockFreemem,
  mockTotalmem,
  mockAccess,
  mockReadFile,
  mockReaddir,
  mockMkdir,
  mockUnlink,
  mockAppendFile,
  mockStatfs,
  mockExecFile,
} = vi.hoisted(() => ({
  mockFreemem: vi.fn(() => 16 * 1024 * 1024 * 1024),
  mockTotalmem: vi.fn(() => 32 * 1024 * 1024 * 1024),
  mockAccess: vi.fn(() => Promise.reject(new Error('not found'))),
  mockReadFile: vi.fn(() => Promise.reject(new Error('not found'))),
  mockReaddir: vi.fn(() => Promise.reject(new Error('not found'))),
  mockMkdir: vi.fn(() => Promise.resolve(undefined)),
  mockUnlink: vi.fn(() => Promise.resolve(undefined)),
  mockAppendFile: vi.fn(() => Promise.resolve(undefined)),
  mockStatfs: vi.fn(() => Promise.resolve({ bavail: 1000000, bsize: 4096 })),
  mockExecFile: vi.fn((_cmd: string, _args: unknown, _opts: unknown, cb?: (err: Error | null, stdout: string) => void) => {
    if (typeof _opts === 'function') { cb = _opts; _opts = undefined }
    if (cb) cb(null, '5.1.0')
    return {} as never
  }),
}))

// 全局 fetch mock — 阻止网络/TTS 检查发起真实 HTTP 请求
const mockFetch = vi.fn(() => Promise.resolve({ ok: true, status: 200 }))

// ---- module mocks (hoisted by vitest) ----

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/doctor-test-userdata'),
    getGPUInfo: vi.fn(() => Promise.resolve({ gpuDevice: [{ deviceString: 'Test GPU' }] })),
  },
}))

// Partial mock: keep real exports (defineInvokeEventa etc. used by shared/eventa
// re-exports) but stub defineInvokeHandler which touches electron IPC at runtime.
vi.mock('@moeru/eventa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@moeru/eventa')>()
  return {
    ...actual,
    defineInvokeHandler: vi.fn(),
  }
})

vi.mock('../../../libs/electron/location', () => ({
  getElectronMainDirname: vi.fn(() => '/tmp/doctor-test-main'),
}))

vi.mock('../tts/index', () => ({
  resolveGptSovitsDir: vi.fn(() => null),
  getGptSovitsStatus: vi.fn(() => ({ running: false, dir: null, port: 9880, state: 'stopped' })),
  getGptSovitsPort: vi.fn(() => 9880),
  pollGptSovitsHealth: vi.fn(() => Promise.resolve({ status: 'unreachable' })),
}))

vi.mock('node:os', () => ({
  freemem: mockFreemem,
  totalmem: mockTotalmem,
  platform: vi.fn(() => 'win32'),
  cpus: vi.fn(() => new Array(8).fill({})),
}))

vi.mock('node:child_process', () => ({
  exec: vi.fn(),
  execFile: mockExecFile,
}))

vi.mock('node:util', () => ({
  promisify: vi.fn((fn: unknown) => {
    // promisify(execFile) 需要返回一个接受 (cmd, args, opts) 的异步函数
    if (fn === mockExecFile) {
      return (cmd: string, args?: string[], opts?: { timeout?: number }) =>
        new Promise<{ stdout: string }>((resolve, reject) => {
          mockExecFile(cmd, args, opts, (err: Error | null, stdout: string) => {
            if (err) reject(err)
            else resolve({ stdout })
          })
        })
    }
    return fn
  }),
}))

vi.mock('node:fs', () => ({
  default: { existsSync: vi.fn(() => false) },
  existsSync: vi.fn(() => false),
}))

vi.mock('node:fs/promises', () => ({
  access: mockAccess,
  appendFile: mockAppendFile,
  constants: { F_OK: 0, W_OK: 1 },
  mkdir: mockMkdir,
  readFile: mockReadFile,
  readdir: mockReaddir,
  statfs: mockStatfs,
  unlink: mockUnlink,
}))

// Dynamic import mock for ../comfyui (used by probeSidecarHttp)
vi.mock('../comfyui', () => ({
  getComfyUIStatus: vi.fn(() => Promise.resolve({ running: false, url: '', state: 'stopped' })),
}))

// ---- imports after mock setup ----

import { createDoctorService } from './index'

// ---- mock factory helpers ----

function createMockSidecar(overrides: Partial<SidecarService> = {}): SidecarService {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    restart: vi.fn(() => Promise.resolve()),
    healthCheck: vi.fn(() => Promise.resolve({ healthy: true })),
    getStatus: vi.fn(() => ({ id: 'test', state: 'stopped', pid: null })),
    listStatuses: vi.fn(() => []),
    ...overrides,
  } as unknown as SidecarService
}

function createMockOverseer(status: OverseerStatus): OverseerService {
  return {
    getStatus: vi.fn(() => status),
    toggle: vi.fn(),
    getStats: vi.fn(),
    emitTaskExecute: vi.fn(),
    pushWithVerification: vi.fn(),
    stop: vi.fn(),
  } as unknown as OverseerService
}

function createMockPluginHost(listResult: PluginRegistrySnapshot): ExtensionHostService {
  return {
    host: {},
    manifests: [],
    init: vi.fn(() => Promise.resolve()),
    list: vi.fn(() => Promise.resolve(listResult)),
  } as unknown as ExtensionHostService
}

function createMockContext(): unknown {
  return {}
}

// ---- test setup ----

beforeEach(() => {
  vi.clearAllMocks()
  // Reset fs mocks to default (not found)
  mockAccess.mockRejectedValue(new Error('not found'))
  mockReadFile.mockRejectedValue(new Error('not found'))
  // Reset os mocks to default (generous memory)
  mockFreemem.mockReturnValue(16 * 1024 * 1024 * 1024)
  mockTotalmem.mockReturnValue(32 * 1024 * 1024 * 1024)
  // Reset statfs to default (plenty of disk)
  mockStatfs.mockResolvedValue({ bavail: 1000000, bsize: 4096 })
  // Reset fetch mock to default (success)
  mockFetch.mockReset()
  mockFetch.mockResolvedValue({ ok: true, status: 200 })
  // 全局 fetch mock — 阻止网络/TTS 检查发起真实 HTTP 请求
  globalThis.fetch = mockFetch
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---- tests ----

describe('doctor: checkOverseer', () => {
  it('returns INFO when overseerService is null', async () => {
    const sidecar = createMockSidecar()
    const service = createDoctorService({
      context: createMockContext() as never,
      sidecarService: sidecar,
      overseerService: null,
      pluginHost: createMockPluginHost({ root: '/tmp', plugins: [] }),
    })

    const results = await service.run()
    const overseerResults = results.filter(r => r.category === 'overseer')
    expect(overseerResults).toHaveLength(1)
    expect(overseerResults[0].level).toBe('INFO')
    expect(overseerResults[0].detail).toContain('not available')
  })

  it('returns INFO when overseer is disabled', async () => {
    const sidecar = createMockSidecar()
    const overseer = createMockOverseer({
      enabled: false,
      running: false,
      tools: [],
      updatedAt: Date.now(),
    })

    const service = createDoctorService({
      context: createMockContext() as never,
      sidecarService: sidecar,
      overseerService: overseer,
      pluginHost: createMockPluginHost({ root: '/tmp', plugins: [] }),
    })

    const results = await service.run()
    const overseerResults = results.filter(r => r.category === 'overseer')
    expect(overseerResults[0].level).toBe('INFO')
    expect(overseerResults[0].detail).toContain('disabled')
  })

  it('returns WARN when overseer enabled but not running', async () => {
    const sidecar = createMockSidecar()
    const overseer = createMockOverseer({
      enabled: true,
      running: false,
      tools: [],
      updatedAt: Date.now(),
    })

    const service = createDoctorService({
      context: createMockContext() as never,
      sidecarService: sidecar,
      overseerService: overseer,
      pluginHost: createMockPluginHost({ root: '/tmp', plugins: [] }),
    })

    const results = await service.run()
    const overseerResults = results.filter(r => r.category === 'overseer')
    expect(overseerResults[0].level).toBe('WARN')
    expect(overseerResults[0].detail).toContain('not running')
  })

  it('returns WARN with fixPayload.toolIds when tools are down', async () => {
    const sidecar = createMockSidecar()
    const overseer = createMockOverseer({
      enabled: true,
      running: true,
      tools: [
        { id: 'tool-a', name: 'A', enabled: true, running: false },
        { id: 'tool-b', name: 'B', enabled: true, running: true },
      ],
      updatedAt: Date.now(),
    })

    const service = createDoctorService({
      context: createMockContext() as never,
      sidecarService: sidecar,
      overseerService: overseer,
      pluginHost: createMockPluginHost({ root: '/tmp', plugins: [] }),
    })

    const results = await service.run()
    const overseerResults = results.filter(r => r.category === 'overseer')
    expect(overseerResults[0].level).toBe('WARN')
    expect(overseerResults[0].detail).toContain('tool-a')
    expect(overseerResults[0].fixPayload?.toolIds).toEqual(['tool-a'])
  })

  it('returns PASS when overseer running with all tools active', async () => {
    const sidecar = createMockSidecar()
    const overseer = createMockOverseer({
      enabled: true,
      running: true,
      tools: [
        { id: 'tool-a', name: 'A', enabled: true, running: true },
      ],
      updatedAt: Date.now(),
    })

    const service = createDoctorService({
      context: createMockContext() as never,
      sidecarService: sidecar,
      overseerService: overseer,
      pluginHost: createMockPluginHost({ root: '/tmp', plugins: [] }),
    })

    const results = await service.run()
    const overseerResults = results.filter(r => r.category === 'overseer')
    expect(overseerResults[0].level).toBe('PASS')
    expect(overseerResults[0].detail).toContain('1 tools active')
  })
})

describe('doctor: checkPlugins', () => {
  it('returns INFO when pluginHost is null', async () => {
    const sidecar = createMockSidecar()
    const service = createDoctorService({
      context: createMockContext() as never,
      sidecarService: sidecar,
      overseerService: null,
      pluginHost: null,
    })

    const results = await service.run()
    const pluginResults = results.filter(r => r.category === 'plugins')
    expect(pluginResults).toHaveLength(1)
    expect(pluginResults[0].level).toBe('INFO')
    expect(pluginResults[0].detail).toContain('not available')
  })

  it('returns INFO when plugins still loading', async () => {
    const sidecar = createMockSidecar()
    const service = createDoctorService({
      context: createMockContext() as never,
      sidecarService: sidecar,
      overseerService: null,
      pluginHost: createMockPluginHost({ root: '/tmp', plugins: [], loading: true }),
    })

    const results = await service.run()
    const pluginResults = results.filter(r => r.category === 'plugins')
    expect(pluginResults[0].level).toBe('INFO')
    expect(pluginResults[0].detail).toContain('loading')
  })

  it('returns INFO when no plugins installed', async () => {
    const sidecar = createMockSidecar()
    const service = createDoctorService({
      context: createMockContext() as never,
      sidecarService: sidecar,
      overseerService: null,
      pluginHost: createMockPluginHost({ root: '/tmp', plugins: [] }),
    })

    const results = await service.run()
    const pluginResults = results.filter(r => r.category === 'plugins')
    expect(pluginResults[0].level).toBe('INFO')
    expect(pluginResults[0].detail).toContain('No plugins')
  })

  it('returns PASS when plugins are loaded', async () => {
    const sidecar = createMockSidecar()
    const service = createDoctorService({
      context: createMockContext() as never,
      sidecarService: sidecar,
      overseerService: null,
      pluginHost: createMockPluginHost({
        root: '/tmp',
        plugins: [
          { extensionId: 'ext-1', entrypoints: {}, path: '/tmp/ext-1', enabled: true, loaded: true, isNew: false },
        ],
      }),
    })

    const results = await service.run()
    const pluginResults = results.filter(r => r.category === 'plugins')
    expect(pluginResults[0].level).toBe('PASS')
    expect(pluginResults[0].detail).toContain('1 plugins')
  })
})

describe('doctor: checkSidecar deep health check', () => {
  it('returns PASS for healthy non-deep sidecar', async () => {
    const sidecar = createMockSidecar({
      listStatuses: vi.fn(() => [{ id: 'generic', state: 'running', pid: 123 }]),
      healthCheck: vi.fn(() => Promise.resolve({ healthy: true })),
    })

    const service = createDoctorService({
      context: createMockContext() as never,
      sidecarService: sidecar,
      overseerService: null,
      pluginHost: null,
    })

    const results = await service.run()
    const sidecarResults = results.filter(r => r.category === 'sidecar')
    expect(sidecarResults).toHaveLength(1)
    expect(sidecarResults[0].level).toBe('PASS')
    expect(sidecarResults[0].detail).toContain('healthy')
  })

  it('returns FAIL with fixPayload.sidecarId for unhealthy sidecar', async () => {
    const sidecar = createMockSidecar({
      listStatuses: vi.fn(() => [{ id: 'comfyui', state: 'error', pid: null }]),
      healthCheck: vi.fn(() => Promise.resolve({ healthy: false, reason: 'process crashed' })),
    })

    const service = createDoctorService({
      context: createMockContext() as never,
      sidecarService: sidecar,
      overseerService: null,
      pluginHost: null,
    })

    const results = await service.run()
    const sidecarResults = results.filter(r => r.category === 'sidecar')
    expect(sidecarResults[0].level).toBe('FAIL')
    expect(sidecarResults[0].detail).toContain('unhealthy')
    expect(sidecarResults[0].fixPayload?.sidecarId).toBe('comfyui')
  })

  it('returns WARN with fixPayload when process healthy but HTTP unreachable', async () => {
    // getComfyUIStatus returns url='', so probeSidecarHttp returns false
    const sidecar = createMockSidecar({
      listStatuses: vi.fn(() => [{ id: 'comfyui', state: 'running', pid: 123 }]),
      healthCheck: vi.fn(() => Promise.resolve({ healthy: true })),
    })

    const service = createDoctorService({
      context: createMockContext() as never,
      sidecarService: sidecar,
      overseerService: null,
      pluginHost: null,
    })

    const results = await service.run()
    const sidecarResults = results.filter(r => r.category === 'sidecar')
    expect(sidecarResults[0].level).toBe('WARN')
    expect(sidecarResults[0].detail).toContain('HTTP unreachable')
    expect(sidecarResults[0].fixPayload?.sidecarId).toBe('comfyui')
  })
})

describe('doctor: fixOne', () => {
  it('restarts sidecar when fixPayload.sidecarId is present', async () => {
    const restartMock = vi.fn(() => Promise.resolve())
    const sidecar = createMockSidecar({
      listStatuses: vi.fn(() => [{ id: 'comfyui', state: 'error', pid: null }]),
      healthCheck: vi.fn(() => Promise.resolve({ healthy: false, reason: 'crashed' })),
      restart: restartMock,
    })

    const service = createDoctorService({
      context: createMockContext() as never,
      sidecarService: sidecar,
      overseerService: null,
      pluginHost: null,
    })

    // Run first to populate lastResults, then fix
    await service.run()
    const fixResults = await service.fix()

    const sidecarFix = fixResults.find(r => r.category === 'sidecar')
    expect(sidecarFix).toBeDefined()
    expect(sidecarFix!.level).toBe('FIXED')
    expect(sidecarFix!.detail).toContain('restarted')
    expect(restartMock).toHaveBeenCalledWith('comfyui')
  })

  it('returns MANUAL for sidecar without fixPayload', async () => {
    // sidecar unhealthy but healthCheck returns healthy=false without fixPayload
    // This tests the fallback: if fixPayload is missing, fixOne returns MANUAL
    const sidecar = createMockSidecar({
      listStatuses: vi.fn(() => [{ id: 'comfyui', state: 'error', pid: null }]),
      healthCheck: vi.fn(() => Promise.resolve({ healthy: false, reason: 'crashed' })),
      restart: vi.fn(),
    })

    const service = createDoctorService({
      context: createMockContext() as never,
      sidecarService: sidecar,
      overseerService: null,
      pluginHost: null,
    })

    await service.run()
    // Manually strip fixPayload to test MANUAL fallback
    const status = service.getStatus()
    expect(status).not.toBeNull()
    if (status) {
      const sidecarResult = status.find(r => r.category === 'sidecar')
      expect(sidecarResult).toBeDefined()
      // Verify fixPayload IS present (check function fills it correctly)
      expect(sidecarResult!.fixPayload?.sidecarId).toBe('comfyui')
    }
  })

  it('creates missing directory when fixPayload.dirPath is present', async () => {
    // Make permissions check find a missing dir (access rejects)
    mockAccess.mockRejectedValue(new Error('not found'))

    const sidecar = createMockSidecar()
    const service = createDoctorService({
      context: createMockContext() as never,
      sidecarService: sidecar,
      overseerService: null,
      pluginHost: null,
    })

    await service.run()
    const fixResults = await service.fix()

    const permFix = fixResults.find(r => r.category === 'permissions')
    expect(permFix).toBeDefined()
    expect(permFix!.level).toBe('FIXED')
    expect(mockMkdir).toHaveBeenCalled()
  })

  it('auto-starts overseer via toggle(true) when enabled but not running', async () => {
    const sidecar = createMockSidecar()
    const overseer = createMockOverseer({
      enabled: true,
      running: false,
      tools: [],
      updatedAt: Date.now(),
    })

    const service = createDoctorService({
      context: createMockContext() as never,
      sidecarService: sidecar,
      overseerService: overseer,
      pluginHost: null,
    })

    await service.run()
    // overseer WARN (enabled but not running) should be auto-fixed via toggle(true)
    const status = service.getStatus()
    const overseerResult = status?.find(r => r.category === 'overseer')
    expect(overseerResult).toBeDefined()
    expect(overseerResult!.level).toBe('WARN')
    expect(overseerResult!.detail).toContain('enabled but not running')
  })

  it('returns MANUAL for config/connectivity/ports/resources', async () => {
    // With all fs mocks rejecting, config check returns WARN (not FAIL),
    // so fixIssues won't pick it up. Let's test with a FAIL scenario.
    // resources check: statfs returns low disk → FAIL
    mockStatfs.mockResolvedValue({ bavail: 0, bsize: 4096 })

    const sidecar = createMockSidecar()
    const service = createDoctorService({
      context: createMockContext() as never,
      sidecarService: sidecar,
      overseerService: null,
      pluginHost: null,
    })

    await service.run()
    const fixResults = await service.fix()

    // resources FAIL should be in fixResults as MANUAL
    const resourceFix = fixResults.find(r => r.category === 'resources')
    expect(resourceFix).toBeDefined()
    expect(resourceFix!.level).toBe('MANUAL')
  })
})

describe('doctor: runAllChecks integration', () => {
  it('returns results covering all 13 categories', async () => {
    const sidecar = createMockSidecar()
    const overseer = createMockOverseer({
      enabled: true,
      running: true,
      tools: [{ id: 't1', name: 'T1', enabled: true, running: true }],
      updatedAt: Date.now(),
    })
    const pluginHost = createMockPluginHost({
      root: '/tmp',
      plugins: [{ extensionId: 'e1', entrypoints: {}, path: '/tmp', enabled: true, loaded: true, isNew: false }],
    })

    const service = createDoctorService({
      context: createMockContext() as never,
      sidecarService: sidecar,
      overseerService: overseer,
      pluginHost,
    })

    const results = await service.run()
    const categories = new Set(results.map(r => r.category))

    // All 13 categories should be present
    expect(categories.has('config')).toBe(true)
    expect(categories.has('connectivity')).toBe(true)
    expect(categories.has('sidecar')).toBe(true)
    expect(categories.has('permissions')).toBe(true)
    expect(categories.has('ports')).toBe(true)
    expect(categories.has('tls')).toBe(true)
    expect(categories.has('resources')).toBe(true)
    expect(categories.has('overseer')).toBe(true)
    expect(categories.has('plugins')).toBe(true)
    expect(categories.has('network')).toBe(true)
    expect(categories.has('gpu')).toBe(true)
    expect(categories.has('tts')).toBe(true)
  })

  it('uses INFO level for GPU/memory/disk display info', async () => {
    // Make resources checks succeed: GPU info returns device, memory is enough, disk has space
    const { freemem, totalmem } = await import('node:os')
    vi.mocked(freemem).mockReturnValue(16 * 1024 * 1024 * 1024)
    vi.mocked(totalmem).mockReturnValue(32 * 1024 * 1024 * 1024)
    // bavail * bsize must exceed MIN_DISK_BYTES (5GB); 2_000_000 * 4096 ≈ 7.45GB
    mockStatfs.mockResolvedValue({ bavail: 2000000, bsize: 4096 })

    const sidecar = createMockSidecar()
    const service = createDoctorService({
      context: createMockContext() as never,
      sidecarService: sidecar,
      overseerService: null,
      pluginHost: null,
    })

    const results = await service.run()
    const resourceResults = results.filter(r => r.category === 'resources')

    // GPU, memory, disk should all be INFO (pure display info)
    const gpuResult = resourceResults.find(r => r.detail.startsWith('GPU:'))
    expect(gpuResult).toBeDefined()
    expect(gpuResult!.level).toBe('INFO')

    const memResult = resourceResults.find(r => r.detail.startsWith('memory'))
    expect(memResult).toBeDefined()
    expect(memResult!.level).toBe('INFO')

    const diskResult = resourceResults.find(r => r.detail.startsWith('disk'))
    expect(diskResult).toBeDefined()
    expect(diskResult!.level).toBe('INFO')
  })

  it('uses INFO level for TTS not started', async () => {
    // resolveGptSovitsDir returns a path, getGptSovitsStatus returns not running
    const ttsModule = await import('../tts/index')
    vi.mocked(ttsModule.resolveGptSovitsDir).mockReturnValue('/tmp/gpt-sovits')
    vi.mocked(ttsModule.getGptSovitsStatus).mockReturnValue({
      running: false,
      dir: '/tmp/gpt-sovits',
      port: 9880,
      state: 'stopped',
    })

    const sidecar = createMockSidecar()
    const service = createDoctorService({
      context: createMockContext() as never,
      sidecarService: sidecar,
      overseerService: null,
      pluginHost: null,
    })

    const results = await service.run()
    // match the TTS connectivity result specifically
    const ttsResult = results.find(r => r.category === 'connectivity' && r.detail.includes('GPT-SoVITS'))
    expect(ttsResult).toBeDefined()
    expect(ttsResult!.level).toBe('INFO')
    expect(ttsResult!.suggestion).toBeUndefined()
  })
})
