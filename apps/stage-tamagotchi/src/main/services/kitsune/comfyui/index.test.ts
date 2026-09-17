import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SidecarService } from '../sidecar'

// 与 tts 测试同款：createConfig 走内存 Map，不碰真实 userData 配置
const { configStoreMap } = vi.hoisted(() => ({ configStoreMap: new Map<string, unknown>() }))

vi.mock('../../../libs/electron/persistence', () => ({
  createConfig: (namespace: string, filename: string, _schema: unknown, options?: { default?: unknown }) => {
    const key = `${namespace}:${filename}`
    configStoreMap.set(key, options?.default !== undefined ? { ...options.default } : undefined)
    return {
      setup: () => ({ status: 'ok' as const, path: '', value: configStoreMap.get(key) }),
      setupAsync: async () => ({ status: 'ok' as const, path: '', value: configStoreMap.get(key) }),
      get: () => configStoreMap.get(key),
      update: (data: unknown) => { configStoreMap.set(key, data) },
      getDiagnostics: () => undefined,
    }
  },
}))

// stopComfyUI 的 taskkill /T 兜底（win32）或 process.kill SIGTERM（unix）会接触真实进程，
// 这里 mock spawn 让其立即 exit、mock process.kill 记录调用
vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => {
    const child = {
      stdout: { on: () => {} },
      stderr: { on: () => {} },
      stdin: { on: () => {}, write: () => true, end: () => {} },
      on: (_event: string, cb: (...args: unknown[]) => void) => {
        setImmediate(() => cb(0))
      },
      once: (_event: string, cb: (...args: unknown[]) => void) => {
        setImmediate(() => cb(0))
      },
      kill: () => {},
    }
    return child
  }),
}))

function makeFakeSidecar(overrides: Partial<Record<'start' | 'stop' | 'getStatus', unknown>> = {}) {
  const svc = {
    start: vi.fn(async () => ({ id: 'comfyui', state: 'running', pid: 11, restartCount: 0, updatedAt: 0 })),
    stop: vi.fn(async () => ({ id: 'comfyui', state: 'stopped', pid: null, restartCount: 0, updatedAt: 0 })),
    getStatus: vi.fn(() => null),
    ...overrides,
  } as unknown as SidecarService & { start: ReturnType<typeof vi.fn>, stop: ReturnType<typeof vi.fn>, getStatus: ReturnType<typeof vi.fn> }
  return svc
}

function stubFetch(ok: boolean, body: unknown = {}) {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok,
    json: async () => body,
  })))
}

describe('resolveComfyuiDir', () => {
  const tempRoots: string[] = []

  afterEach(async () => {
    for (const root of tempRoots)
      await rm(root, { recursive: true, force: true })
    tempRoots.length = 0
    delete process.env.COMFYUI_DIR
  })

  it('环境变量优先于持久化配置', async () => {
    const envDir = await mkdtemp(join(tmpdir(), 'comfyui-env-'))
    tempRoots.push(envDir)
    process.env.COMFYUI_DIR = envDir

    const { resolveComfyuiDir } = await import('./index')
    expect(resolveComfyuiDir()).toBe(envDir)
  })

  it('环境变量缺失时回落持久化配置', async () => {
    const configDir = await mkdtemp(join(tmpdir(), 'comfyui-cfg-'))
    tempRoots.push(configDir)
    configStoreMap.set('comfyui:config.json', { dir: configDir, port: 8188 })

    const { resolveComfyuiDir } = await import('./index')
    expect(resolveComfyuiDir()).toBe(configDir)
  })

  it('配置路径不存在时返回 null', async () => {
    configStoreMap.set('comfyui:config.json', { dir: join(tmpdir(), 'nonexistent-comfyui'), port: 8188 })

    const { resolveComfyuiDir } = await import('./index')
    expect(resolveComfyuiDir()).toBeNull()
  })
})

describe('getComfyuiPort 三级回退', () => {
  beforeEach(() => {
    vi.resetModules()
    configStoreMap.clear()
    delete process.env.COMFYUI_PORT
  })

  afterEach(() => {
    delete process.env.COMFYUI_PORT
  })

  it('配置 → 环境变量 → 默认 8188', async () => {
    const { getComfyuiPort } = await import('./index')

    configStoreMap.set('comfyui:config.json', { dir: undefined, port: 9002 })
    expect(getComfyuiPort()).toBe(9002)

    configStoreMap.set('comfyui:config.json', { dir: undefined, port: 80 }) // 非法
    process.env.COMFYUI_PORT = '12345'
    expect(getComfyuiPort()).toBe(12345)

    process.env.COMFYUI_PORT = 'abc'
    expect(getComfyuiPort()).toBe(8188)
  })
})

describe('startComfyUI', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'comfyui-start-'))
    process.env.COMFYUI_DIR = tempDir
    configStoreMap.clear()
  })

  afterEach(async () => {
    delete process.env.COMFYUI_DIR
    vi.unstubAllGlobals()
    await rm(tempDir, { recursive: true, force: true })
  })

  it('HTTP 探测到已在运行 → 幂等成功', async () => {
    const { startComfyUI } = await import('./index')
    const svc = makeFakeSidecar()
    stubFetch(true) // /system_stats 立即 ok

    const res = await startComfyUI(svc)

    expect(res.success).toBe(true)
    expect(res.message).toContain('已在运行')
    expect(svc.start).not.toHaveBeenCalled()
  })

  it('目录结构不完整（缺 python_embeded）→ 报错且不 spawn', async () => {
    const { startComfyUI } = await import('./index')
    const svc = makeFakeSidecar()
    stubFetch(false) // 未运行 → 走启动分支

    // 只有 ComfyUI/main.py，缺 python_embeded/python.exe
    await mkdir(join(tempDir, 'ComfyUI'), { recursive: true })
    await writeFile(join(tempDir, 'ComfyUI', 'main.py'), '')

    const res = await startComfyUI(svc)

    expect(res.success).toBe(false)
    expect(res.message).toContain('目录结构不完整')
    expect(svc.start).not.toHaveBeenCalled()
  })

  it('spawn 成功后轮询 /system_stats 就绪 → 启动成功并传标准 args', async () => {
    const { startComfyUI } = await import('./index')
    // 补齐完整目录结构：ComfyUI/main.py + python_embeded/python.exe
    await mkdir(join(tempDir, 'ComfyUI'), { recursive: true })
    await writeFile(join(tempDir, 'ComfyUI', 'main.py'), '')
    await mkdir(join(tempDir, 'python_embeded'), { recursive: true })
    await writeFile(join(tempDir, 'python_embeded', 'python.exe'), '')
    const captured: unknown[] = []
    const svc = makeFakeSidecar({
      start: vi.fn(async (config: unknown) => {
        captured.push(config)
        return { id: 'comfyui', state: 'running', pid: 11, restartCount: 0, updatedAt: 0 }
      }),
    })
    // 第一次探测失败（未运行），spawn 后第二/三次探测成功
    let call = 0
    vi.stubGlobal('fetch', vi.fn(() => {
      call += 1
      return Promise.resolve({ ok: call >= 2, json: async () => ({}) })
    }))

    const res = await startComfyUI(svc)

    expect(res.success).toBe(true)
    const cfg = captured[0] as { id: string, command: string, args: string[], cwd: string }
    expect(cfg.id).toBe('comfyui')
    expect(cfg.command).toBe(join(tempDir, 'python_embeded', 'python.exe'))
    expect(cfg.args).toContain('--windows-standalone-build')
    expect(cfg.args).toContain('--port')
    expect(cfg.cwd).toBe(tempDir)
  })

  it('isStarting 锁：启动挂起期间第二次调用被拒绝', async () => {
    const { startComfyUI } = await import('./index')
    let release!: (v: unknown) => void
    const pending = new Promise<unknown>((resolve) => { release = resolve })
    const svc = makeFakeSidecar({ start: vi.fn(() => pending) })
    // 按调用段区分：第 1 次探测（startComfyUI 进入前）失败 → 进入 spawn；
    // 后续探测成功，让首次调用轮询立即结束，避免等满 60s 超时。
    let call = 0
    vi.stubGlobal('fetch', vi.fn(() => {
      call += 1
      return Promise.resolve({ ok: call >= 2, json: async () => ({}) })
    }))
    await mkdir(join(tempDir, 'ComfyUI'), { recursive: true })
    await writeFile(join(tempDir, 'ComfyUI', 'main.py'), '')
    await mkdir(join(tempDir, 'python_embeded'), { recursive: true })
    await writeFile(join(tempDir, 'python_embeded', 'python.exe'), '')

    // first 在 await isComfyUIRunning() 处挂起前已把 isStarting 置 true？
    // —— 不：startComfyUI 是先 await isComfyUIRunning() 才置 isStarting。
    // 所以必须等 first 真正进入 spawn（即 start 被调用）后再触发 second。
    // 但 start 被 pending 挂住，first 停在 spawn 处，isStarting 已为 true。
    const firstPromise = startComfyUI(svc)
    // 等待 first 进入 spawn（sidecar.start 被调用、isStarting=true）
    await vi.waitFor(() => {
      expect(svc.start).toHaveBeenCalled()
    })

    const second = await startComfyUI(svc)

    expect(second.success).toBe(false)
    expect(second.message).toContain('正在启动中')

    release({ id: 'comfyui', state: 'running', pid: 11, restartCount: 0, updatedAt: 0 })
    await firstPromise
  })
})

describe('stopComfyUI', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'comfyui-stop-'))
    process.env.COMFYUI_DIR = tempDir
    configStoreMap.clear()
    stubFetch(true)
  })

  afterEach(async () => {
    delete process.env.COMFYUI_DIR
    vi.unstubAllGlobals()
    await rm(tempDir, { recursive: true, force: true })
  })

  it('sidecar handle 不存在 → 短路成功（不调 stop）', async () => {
    const { stopComfyUI } = await import('./index')
    const svc = makeFakeSidecar({ getStatus: vi.fn(() => null) })

    const res = await stopComfyUI(svc)

    expect(res.success).toBe(true)
    expect(res.message).toContain('未运行')
    expect(svc.stop).not.toHaveBeenCalled()
  })

  it('stop 前读取 pid 并触发进程树兜底（win32 taskkill /T，unix SIGTERM）', async () => {
    const { stopComfyUI } = await import('./index')
    const isWin = process.platform === 'win32'
    let taskkillCalled = false
    const spawnMock = (await import('node:child_process')).spawn as unknown as ReturnType<typeof vi.fn>
    spawnMock.mockImplementation((bin: string, args: string[]) => {
      if (bin === 'taskkill') {
        taskkillCalled = true
        expect(args).toEqual(['/pid', '42', '/T', '/F'])
      }
      const child = {
        stdout: { on: () => {} },
        stderr: { on: () => {} },
        stdin: { on: () => {}, write: () => true, end: () => {} },
        on: (_e: string, cb: (...a: unknown[]) => void) => { setImmediate(() => cb(0)) },
        once: (_e: string, cb: (...a: unknown[]) => void) => { setImmediate(() => cb(0)) },
        kill: () => {},
      }
      return child
    })
    const killSpy = isWin ? null : vi.spyOn(process, 'kill').mockImplementation(() => true)
    const svc = makeFakeSidecar({
      getStatus: vi.fn(() => ({ id: 'comfyui', state: 'running', pid: 42, restartCount: 0, updatedAt: 0 })),
    })

    const res = await stopComfyUI(svc)

    expect(res.success).toBe(true)
    expect(svc.stop).toHaveBeenCalled()
    if (isWin)
      expect(taskkillCalled).toBe(true)
    else
      expect(killSpy).toHaveBeenCalledWith(42, 'SIGTERM')
    killSpy?.mockRestore()
  })
})

describe('setComfyuiConfig', () => {
  beforeEach(() => {
    vi.resetModules()
    configStoreMap.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('合并写入 dir/port 并保留其他字段', async () => {
    const { setComfyuiConfig } = await import('./index')
    configStoreMap.set('comfyui:config.json', { dir: '/old', port: 8188 })
    stubFetch(false)

    await setComfyuiConfig({ port: 9000 })

    expect(configStoreMap.get('comfyui:config.json')).toMatchObject({ dir: '/old', port: 9000 })
  })

  it('ComfyUI 运行时返回 needsRestart', async () => {
    const { setComfyuiConfig } = await import('./index')
    stubFetch(true)

    const res = await setComfyuiConfig({ dir: '/new' })

    expect(res.needsRestart).toBe(true)
  })

  it('未运行时返回 needsRestart=false', async () => {
    const { setComfyuiConfig } = await import('./index')
    stubFetch(false)

    const res = await setComfyuiConfig({ dir: '/new' })

    expect(res.needsRestart).toBe(false)
  })
})