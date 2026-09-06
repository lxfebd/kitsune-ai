import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SidecarService } from '../sidecar'

import { resolveVoiceMeta } from './index'

// NOTICE:
// createConfig 默认会把配置写到 app.getPath('userData') 下的真实文件，
// 测试中若调用 setGptSovitsConfig 会污染用户真实配置。这里用 vi.hoisted
// 拿到一张进程内 Map 作为内存存储，createConfig 的 get/update/setup 全部
// 走内存，不碰磁盘。
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

// NOTICE:
// cuda / cuda-half 档会触发 probeCudaAvailability，内部 spawn 一个真实
// Python 子进程去 `import torch`——冷启动可能耗时 30s 甚至因 PATH 无 python
// 而抛错。这里 mock spawn 让它立即 emit stdout '0'（CUDA 不可用）并 close，
// 使 probe 快速 resolve(false)。由于 args 分支基于 configuredDevice（非
// probe 后的 device），mock 的探测结果不影响各档 args 断言。
vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => {
    const handlers: Record<string, Array<(...args: unknown[]) => void>> = {}
    const stdoutHandlers: Record<string, Array<(...args: unknown[]) => void>> = {}
    const child = {
      pid: 12345,
      stdout: {
        on: (event: string, cb: (...args: unknown[]) => void) => {
          (stdoutHandlers[event] ??= []).push(cb)
        },
      },
      stderr: { on: () => {} },
      stdin: { on: () => {}, write: () => true, end: () => {} },
      on: (event: string, cb: (...args: unknown[]) => void) => {
        (handlers[event] ??= []).push(cb)
      },
      kill: () => {},
    }
    setImmediate(() => {
      stdoutHandlers.data?.forEach(cb => cb(Buffer.from('0')))
      handlers.close?.forEach(cb => cb(0))
    })
    return child
  }),
}))

// NOTICE:
// restartGptSovits 的 threads 校验通过 dynamic import 调用 getSystemCapabilities，
// 这里 mock 让 physicalCores=8 以验证越界拒绝逻辑。
vi.mock('../system-capabilities', () => ({
  getSystemCapabilities: vi.fn(async () => ({
    cpuModel: 'Test CPU',
    physicalCores: 8,
    logicalCores: 16,
    totalMemoryGB: 32,
    gpu: { vendor: 'Test', model: 'Test GPU', vramMB: 8192 },
    isLowSpec: false,
  })),
}))

describe('resolveVoiceMeta', () => {
  const tempRoots: string[] = []

  async function makeGptSovitsDir(overrides: {
    voiceId?: string
    displayName?: string
    language?: string
    reference?: string
  } = {}): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'gptsovits-test-'))
    tempRoots.push(root)

    const voiceId = overrides.voiceId ?? 'ailini'
    const displayName = overrides.displayName ?? voiceId
    const voiceDir = join(root, 'voices', voiceId)
    await mkdir(voiceDir, { recursive: true })

    const manifest = {
      id: voiceId,
      display_name: displayName,
      language: overrides.language ?? 'zh',
      default_reference: overrides.reference ?? 'reference.wav',
      default_prompt_text: '你好，这是一个测试。',
      gpt_model: 'weights/gpt.ckpt',
      sovits_model: 'weights/sovits.pth',
    }
    await writeFile(join(voiceDir, 'manifest.json'), JSON.stringify(manifest), 'utf-8')
    await writeFile(join(voiceDir, 'reference.wav'), Buffer.from('RIFF'), 'utf-8')

    return root
  }

  afterEach(async () => {
    for (const root of tempRoots) {
      await rm(root, { recursive: true, force: true })
    }
    tempRoots.length = 0
  })

  it('resolves voice meta from direct voices/<id>/manifest.json', async () => {
    const root = await makeGptSovitsDir({ voiceId: 'ailini', language: 'ja' })

    const meta = resolveVoiceMeta(root, 'ailini')

    expect(meta.voiceDir).toBe(join(root, 'voices', 'ailini'))
    expect(meta.referWavPath).toBe(join(root, 'voices', 'ailini', 'reference.wav'))
    expect(meta.promptText).toBe('你好，这是一个测试。')
    expect(meta.promptLanguage).toBe('ja')
    expect(meta.gptModel).toBe('weights/gpt.ckpt')
    expect(meta.sovitsModel).toBe('weights/sovits.pth')
    expect(meta.expiresAt).toBeGreaterThan(Date.now())
  })

  it('matches voice by display_name when directory id differs', async () => {
    const root = await makeGptSovitsDir({ voiceId: 'voice-1', displayName: '艾琳' })

    const meta = resolveVoiceMeta(root, '艾琳')

    expect(meta.voiceDir).toBe(join(root, 'voices', 'voice-1'))
  })

  it('throws when the voice does not exist', async () => {
    const root = await makeGptSovitsDir()

    expect(() => resolveVoiceMeta(root, 'missing-voice')).toThrow(/不存在/)
  })

  it('caches the resolved meta across calls for the same (dir, voiceId)', async () => {
    const root = await makeGptSovitsDir({ voiceId: 'ailini' })

    const first = resolveVoiceMeta(root, 'ailini')
    const second = resolveVoiceMeta(root, 'ailini')

    // 同一缓存对象：命中缓存而非重新解析（expiresAt 保持原值）
    expect(second).toBe(first)
    expect(second.expiresAt).toBe(first.expiresAt)
  })
})

// NOTICE:
// 抽出 startGptSovits 实际调用的 sidecarService.start 参数捕获器，
// 便于断言 args/env 分支，不依赖真实进程。
function makeFakeSidecar() {
  const captured: Array<{ id: unknown, command: unknown, args: string[], cwd: string, env: Record<string, string> }> = []
  const svc = {
    start: vi.fn(async (config: any) => {
      captured.push(config)
      return { id: config.id, state: 'running', pid: 1, restartCount: 0, updatedAt: 0 }
    }),
    stop: vi.fn(async () => ({ id: 'gpt-sovits', state: 'stopped', pid: null, restartCount: 0, updatedAt: 0 })),
    getStatus: vi.fn(() => ({ id: 'gpt-sovits', state: 'stopped', pid: null, restartCount: 0, updatedAt: 0 })),
  }
  return { svc: svc as unknown as SidecarService, captured }
}

describe('startGptSovits args/env 分支', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'gptsovits-args-test-'))
    // GPT_SOVITS_DIR 让 resolveGptSovitsDir 命中第一步（环境变量），不依赖
    // 真实安装目录，使 startGptSovits 不会因「未找到引擎」提前 return。
    process.env.GPT_SOVITS_DIR = tempDir
    // 清空内存配置 store，让每个用例从默认 device=cpu / threads=4 起步。
    configStoreMap.clear()
    // stub fetch 让 isGptSovitsRunning 与 pollGptSovitsHealth 立即返回 ready，
    // 避免 health 轮询在测试环境里空转 180s。
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: async () => ({ status: 'ready' }),
    })))
  })

  afterEach(async () => {
    delete process.env.GPT_SOVITS_DIR
    vi.unstubAllGlobals()
    await rm(tempDir, { recursive: true, force: true })
  })

  it('cpu 档：传 -d cpu -fp + CUDA_VISIBLE_DEVICES 空串 + 三线程变量', async () => {
    const { startGptSovits } = await import('./index')
    const { svc, captured } = makeFakeSidecar()
    await startGptSovits(svc)
    const cfg = captured[0]
    expect(cfg.args).toEqual(['api.py', '-p', expect.any(String), '-sm', 'normal', '-mt', 'raw', '-d', 'cpu', '-fp'])
    expect(cfg.env.CUDA_VISIBLE_DEVICES).toBe('')
    expect(cfg.env.OMP_NUM_THREADS).toBeDefined()
    expect(cfg.env.MKL_NUM_THREADS).toBeDefined()
    expect(cfg.env.OPENBLAS_NUM_THREADS).toBeDefined()
  })

  it('cuda 档：传 -d cuda -fp（修复假全精度）', async () => {
    const { startGptSovits, setGptSovitsConfig } = await import('./index')
    const { svc, captured } = makeFakeSidecar()
    await setGptSovitsConfig({ device: 'cuda' })
    await startGptSovits(svc)
    const cfg = captured[0]
    expect(cfg.args).toContain('-d')
    expect(cfg.args).toContain('cuda')
    expect(cfg.args).toContain('-fp')
    expect(cfg.env.CUDA_VISIBLE_DEVICES).toBeUndefined()
  })

  it('cuda-half 档：传 -hp，不设 CUDA_VISIBLE_DEVICES', async () => {
    const { startGptSovits, setGptSovitsConfig } = await import('./index')
    const { svc, captured } = makeFakeSidecar()
    await setGptSovitsConfig({ device: 'cuda-half' })
    await startGptSovits(svc)
    const cfg = captured[0]
    expect(cfg.args).toContain('-hp')
    expect(cfg.env.CUDA_VISIBLE_DEVICES).toBeUndefined()
  })
})

describe('restartGptSovits', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'gptsovits-restart-test-'))
    process.env.GPT_SOVITS_DIR = tempDir
    configStoreMap.clear()
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: async () => ({ status: 'ready' }),
    })))
  })

  afterEach(async () => {
    delete process.env.GPT_SOVITS_DIR
    vi.unstubAllGlobals()
    await rm(tempDir, { recursive: true, force: true })
  })

  it('threads 越界时前置校验拒绝且不触碰 sidecar', async () => {
    const { restartGptSovits } = await import('./index')
    const { svc } = makeFakeSidecar()

    const res = await restartGptSovits(svc, { threads: 999 })

    expect(res.success).toBe(false)
    expect(res.message).not.toContain('切换进行中')
    expect(res.message).toContain('线程数')
    expect(svc.stop).not.toHaveBeenCalled()
    expect(svc.start).not.toHaveBeenCalled()
  })

  it('首次启动失败时回滚到旧配置并用旧参数重新 spawn', async () => {
    const { restartGptSovits, setGptSovitsConfig } = await import('./index')
    const { svc, captured } = makeFakeSidecar()

    // 旧配置 device=cuda-half；首次用新配置 cpu 启动时侧载 start reject
    await setGptSovitsConfig({ device: 'cuda-half' })
    ;(svc.start as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'))

    const res = await restartGptSovits(svc, { device: 'cpu' })

    expect(res.success).toBe(false)
    expect(res.message).toContain('已回滚到原配置')
    // 回滚用旧配置（cuda-half）重新 spawn，args 应含 -hp
    const lastSpawn = captured[captured.length - 1]
    expect(lastSpawn.args).toContain('-hp')
  })

  it('并发锁：进行中的第二次调用立即返回「切换进行中」', async () => {
    const { restartGptSovits } = await import('./index')
    // NOTICE:
    // 用 deferred promise 让首次调用的 sidecarService.start 挂起，
    // 模拟"切换进行中"。断言后释放 deferred 以让首次调用走完 finally、
    // 释放模块级 restartLock——vitest 在同一文件内复用同一 module 实例，
    // 若首次调用永不 settle，restartLock 会残留并污染后续用例。
    let releaseStart!: (v: unknown) => void
    const pendingStart = new Promise<unknown>((resolve) => { releaseStart = resolve })
    const svc = {
      start: vi.fn(() => pendingStart),
      stop: vi.fn(async () => ({ id: 'gpt-sovits', state: 'stopped', pid: null, restartCount: 0, updatedAt: 0 })),
      getStatus: vi.fn(() => ({ id: 'gpt-sovits', state: 'stopped', pid: null, restartCount: 0, updatedAt: 0 })),
    } as unknown as SidecarService

    const first = restartGptSovits(svc, { device: 'cpu' })
    // 第二次调用在首次同步设置 restartLock 后进入，应被锁拒绝
    const second = await restartGptSovits(svc, { device: 'cpu' })

    expect(second.success).toBe(false)
    expect(second.message).toContain('切换进行中')

    releaseStart({ id: 'gpt-sovits', state: 'running', pid: 1, restartCount: 0, updatedAt: 0 })
    await first
  })
})
