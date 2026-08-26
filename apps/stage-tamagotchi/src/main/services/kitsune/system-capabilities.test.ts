import { beforeEach, describe, expect, it, vi } from 'vitest'

// vi.mock factories are hoisted to the top of the file by vitest, so any
// variables they reference must also be hoisted via vi.hoisted(), otherwise
// the factory runs before the const declaration and throws ReferenceError.
const { mockExecFile, mockTotalmem } = vi.hoisted(() => ({
  // execFile 的 callback 签名是 (err, stdout, stderr)；下面每个用例按 cmd 路由返回不同 stdout。
  mockExecFile: vi.fn(),
  // totalmem 用 vi.fn 以便低配用例覆盖返回值。
  mockTotalmem: vi.fn(() => 32 * 1024 ** 3),
}))

vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
}))

// NOTICE: promisify(execFile) 的真实行为依赖 child_process.execFile 上挂载的
// [Symbol.for('util.promisify.custom')]，但 vi.fn() mock 不带该 symbol，默认
// promisify 会把多参数 callback resolve 成数组而非 { stdout }。因此参照
// doctor/index.test.ts 的范式，mock node:util 的 promisify，把 mockExecFile
// 包装成 (cmd, args, opts) => Promise<{ stdout }>，行为与真实 promisify(execFile)
// 等价（err 拒绝、否则 resolve { stdout, stderr }，这里 stderr 在实现中未使用）。
// 不改变实现的行为语义，仅适配测试边界。
vi.mock('node:util', () => ({
  promisify: vi.fn((fn: unknown) => {
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

vi.mock('node:os', () => ({
  cpus: () => new Array(8).fill({ model: 'Intel i7' }),
  totalmem: mockTotalmem,
  platform: () => 'win32',
}))

vi.mock('@guiiai/logg', () => ({
  useLogg: vi.fn(() => ({
    useGlobalConfig: () => ({
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  })),
}))

// 按 cmd 与 args 末段 command 文本路由 execFile 调用，避免依赖 Promise.all 的并发调用顺序。
function routeExecFile(routes: {
  numberOfCores?: string
  nvidiaSmi?: string
  videoController?: string
  fallback?: string
}): void {
  mockExecFile.mockImplementation((cmd: string, args: unknown, _opts: unknown, cb: (err: Error | null, stdout: string, stderr: string) => void) => {
    let stdout: string
    if (cmd === 'powershell') {
      const command = String(Array.isArray(args) ? args[args.length - 1] : '')
      if (command.includes('NumberOfCores')) {
        stdout = routes.numberOfCores ?? '8\r\n'
      }
      else if (command.includes('VideoController')) {
        stdout = routes.videoController ?? ''
      }
      else {
        stdout = routes.fallback ?? ''
      }
    }
    else if (cmd === 'nvidia-smi') {
      stdout = routes.nvidiaSmi ?? ''
    }
    else {
      stdout = routes.fallback ?? ''
    }
    cb(null, stdout, '')
    return {} as never
  })
}

describe('system-capabilities', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    // resetModules 后重新 import node:os 会重建工厂，但工厂引用同一 hoisted mockTotalmem，
    // 这里把 totalmem 重置回默认 32GB，供后续用例按需覆盖。
    mockTotalmem.mockReturnValue(32 * 1024 ** 3)
  })

  it('解析 nvidia-smi 输出拿 GPU 与 VRAM', async () => {
    routeExecFile({
      numberOfCores: '8\r\n',
      nvidiaSmi: 'GeForce RTX 4060, 8188',
      videoController: '',
    })
    const { getSystemCapabilities } = await import('./system-capabilities')
    const caps = await getSystemCapabilities()
    expect(caps.gpu?.vendor).toBe('NVIDIA')
    expect(caps.gpu?.model).toBe('GeForce RTX 4060')
    expect(caps.gpu?.vramMB).toBe(8188)
    expect(caps.logicalCores).toBe(8)
    expect(caps.totalMemoryGB).toBe(32)
  })

  it('nvidia-smi 失败时回退 WMI Win32_VideoController', async () => {
    // nvidia-smi 抛错，使 detectGpu 走 WMI 回退分支。
    mockExecFile.mockImplementation((cmd: string, args: unknown, _opts: unknown, cb: (err: Error | null, stdout: string, stderr: string) => void) => {
      if (cmd === 'nvidia-smi') {
        cb(new Error('not found'), '', '')
        return {} as never
      }
      const command = String(Array.isArray(args) ? args[args.length - 1] : '')
      let stdout: string
      if (command.includes('NumberOfCores')) {
        stdout = '8\r\n'
      }
      else if (command.includes('VideoController')) {
        stdout = 'RTX 4060\r\n'
      }
      else {
        stdout = ''
      }
      cb(null, stdout, '')
      return {} as never
    })
    const { getSystemCapabilities } = await import('./system-capabilities')
    const caps = await getSystemCapabilities()
    expect(caps.physicalCores).toBe(8)
    expect(caps.gpu?.model).toBe('RTX 4060')
  })

  it('低配判定：物理核 < 4', async () => {
    routeExecFile({
      numberOfCores: '2\r\n',
      nvidiaSmi: '',
      videoController: 'Some GPU\r\n',
    })
    mockTotalmem.mockReturnValue(4 * 1024 ** 3)
    const { getSystemCapabilities } = await import('./system-capabilities')
    const caps = await getSystemCapabilities()
    expect(caps.isLowSpec).toBe(true)
  })

  it('缓存：第二次不重复 exec', async () => {
    routeExecFile({
      numberOfCores: '8\r\n',
      nvidiaSmi: '',
      videoController: 'Some GPU\r\n',
    })
    const { getSystemCapabilities } = await import('./system-capabilities')
    await getSystemCapabilities()
    const callsAfterFirst = mockExecFile.mock.calls.length
    await getSystemCapabilities()
    // 第二次应命中进程内缓存，不再触发任何 execFile 调用。
    expect(mockExecFile.mock.calls.length).toBe(callsAfterFirst)
  })
})
