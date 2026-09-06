import { describe, expect, it, vi } from 'vitest'

// NOTICE: taskRunner.ts 的 import 链包含 shared/eventa（路径在测试环境不可解析），
// 但 isPathSafe 纯函数不依赖任何导入。这里 mock eventa 仅为了通过模块解析。
vi.mock('../../../../../shared/eventa', () => ({
  electronConnectorTaskResult: 'mock',
  electronExecutorEvent: 'mock',
}))

const { isPathSafe } = await import('./taskRunner')

describe('isPathSafe', () => {
  const allowedRoots = ['/home/user/project', '/var/data']

  it('allows exact match path', () => {
    expect(isPathSafe('/home/user/project', allowedRoots)).toBe(true)
  })

  it('allows path in subdirectory', () => {
    expect(isPathSafe('/home/user/project/src/index.ts', allowedRoots)).toBe(true)
  })

  it('rejects path outside allowed roots', () => {
    expect(isPathSafe('/tmp/evil', allowedRoots)).toBe(false)
  })

  it('rejects path traversing out of allowed root', () => {
    expect(isPathSafe('/home/user/project/../outside', allowedRoots)).toBe(false)
  })

  it('allows all paths when allowedRoots is empty', () => {
    expect(isPathSafe('/tmp/anywhere', [])).toBe(true)
  })

  it('matches second root if first does not contain path', () => {
    expect(isPathSafe('/var/data/db.sqlite', allowedRoots)).toBe(true)
  })

  it('rejects path when no root contains it', () => {
    expect(isPathSafe('/etc/passwd', allowedRoots)).toBe(false)
  })
})