/**
 * 失败计数器测试 — 阈值触发、窗口清理、冷却、互不干扰、持久化、注入时钟。
 * 用注入 now() 精确控制窗口/冷却边界，不用 fake timers（stage-tamagotchi 已有教训）。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { GuidedFailureCounter, normalizeErrorMessage } from './failureCounter'

const tmpDirs: string[] = []

function makeTmpRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'guidance-counter-'))
  tmpDirs.push(dir)
  return dir
}

function makeCounter(now: () => number, opts: { windowMs?: number, cooldownMs?: number } = {}) {
  return new GuidedFailureCounter({ rootDir: makeTmpRoot(), now, ...opts })
}

afterEach(() => {
  // tmp 目录由操作系统清理；此处仅释放引用
  tmpDirs.length = 0
})

describe('normalizeErrorMessage', () => {
  it('小写、压缩空白、截断到 120', () => {
    expect(normalizeErrorMessage('  File   Has Not  Been Read Yet ')).toBe('file has not been read yet')
    const long = 'x'.repeat(300)
    expect(normalizeErrorMessage(long).length).toBe(120)
  })
})

describe('GuidedFailureCounter', () => {
  it('阈值（默认 3）触发一次指导，且携带规则与当前次数', async () => {
    let t = 1_000
    const counter = makeCounter(() => t)
    const fire = { source: 'zcode', errorMessage: 'File has not been read yet. Please read it first.', toolName: 'Edit' }

    expect(await counter.recordFailure(fire)).toBeNull()
    t += 1_000
    expect(await counter.recordFailure(fire)).toBeNull()
    t += 1_000
    const trigger = await counter.recordFailure(fire)
    expect(trigger).not.toBeNull()
    expect(trigger!.rule.id).toBe('zcode-edit-not-read')
    expect(trigger!.count).toBe(3)
  })

  it('窗口过期后重置计数（新一轮失败从 1 开始）', async () => {
    let t = 0
    const counter = makeCounter(() => t)
    const fire = { source: 'zcode', errorMessage: 'File has not been read yet' }

    await counter.recordFailure(fire)
    await counter.recordFailure(fire)
    // 距上次失败超过 windowMs → 视为新一轮
    t += 16 * 60_000
    expect(await counter.recordFailure(fire)).toBeNull()
    // 本轮只有 1 次 → 不触发
    t += 1_000
    await counter.recordFailure(fire)
    t += 1_000
    const trigger = await counter.recordFailure(fire)
    expect(trigger).not.toBeNull()
    expect(trigger!.count).toBe(3)
  })

  it('冷却期内同一规则不重复触发', async () => {
    let t = 0
    const counter = makeCounter(() => t, { cooldownMs: 10 * 60_000 })
    const fire = { source: 'zcode', errorMessage: 'File has not been read yet' }

    // 2 次 → 计数到 2，未触发
    for (let i = 0; i < 2; i++) {
      t += 1_000
      await counter.recordFailure(fire)
    }
    // 第 3 次触发指导
    t += 1_000
    const first = await counter.recordFailure(fire)
    expect(first).not.toBeNull()

    // 冷却期内再来 3 次同类失败 → 计数继续但不触发
    for (let i = 0; i < 3; i++) {
      t += 1_000
      const r = await counter.recordFailure(fire)
      expect(r).toBeNull()
    }

    // 冷却期过后（11min > 10min）首次失败再次触发，随后进入新一轮冷却
    t += 11 * 60_000
    const afterCooldown = await counter.recordFailure(fire)
    expect(afterCooldown).not.toBeNull()
    for (let i = 0; i < 2; i++) {
      t += 1_000
      expect(await counter.recordFailure(fire)).toBeNull()
    }
  })

  it('不同 source / 不同错误互不干扰', async () => {
    let t = 0
    const counter = makeCounter(() => t)
    // 三条互不干扰：不同 source、命中不同规则（避免共享规则冷却挡住）
    const fireA = { source: 'zcode', errorMessage: 'File has not been read yet' }
    const fireB = { source: 'cursor', errorMessage: 'ENOENT: no such file' }
    const fireC = { source: 'zcode', errorMessage: 'Request timed out' }

    // 各 2 次 → 计数到 2，未触发
    for (let i = 0; i < 2; i++) {
      t += 1_000
      expect(await counter.recordFailure(fireA)).toBeNull()
      expect(await counter.recordFailure(fireB)).toBeNull()
      expect(await counter.recordFailure(fireC)).toBeNull()
    }
    // 各自第 3 次触发，互不干扰
    t += 1_000
    expect((await counter.recordFailure(fireA))?.rule.id).toBe('zcode-edit-not-read')
    t += 1_000
    expect((await counter.recordFailure(fireB))?.rule.id).toBe('read-not-found')
    t += 1_000
    expect((await counter.recordFailure(fireC))?.rule.id).toBe('network-failure')
  })

  it('未命中规则的失败也计数（统计不丢）', async () => {
    let t = 0
    const counter = makeCounter(() => t)
    const fire = { source: 'zcode', errorMessage: 'Division by zero' }
    for (let i = 0; i < 3; i++) {
      t += 1_000
      expect(await counter.recordFailure(fire)).toBeNull()
    }
    const records = await counter.getRecords()
    expect(records).toHaveLength(1)
    expect(records[0]!.count).toBe(3)
    expect(records[0]!.ruleId).toBeNull()
  })

  it('reset 清空计数与冷却记录', async () => {
    let t = 0
    const counter = makeCounter(() => t)
    const fire = { source: 'zcode', errorMessage: 'File has not been read yet' }
    for (let i = 0; i < 3; i++) {
      t += 1_000
      await counter.recordFailure(fire)
    }
    expect(await counter.getRecords()).toHaveLength(1)
    await counter.reset()
    expect(await counter.getRecords()).toHaveLength(0)
  })

  it('getLastGuidanceAt 记录各规则最近触发时间（reset 后清空）', async () => {
    let t = 0
    const counter = makeCounter(() => t)
    const fire = { source: 'zcode', errorMessage: 'File has not been read yet' }
    for (let i = 0; i < 3; i++) {
      t += 1_000
      await counter.recordFailure(fire)
    }
    const last = await counter.getLastGuidanceAt()
    expect(last['zcode-edit-not-read']).toBe(t)
    await counter.reset()
    expect(await counter.getLastGuidanceAt()).toEqual({})
  })

  it('持久化：重启（新实例同一目录）后计数保留', async () => {
    let t = 0
    const root = makeTmpRoot()
    const fire = { source: 'zcode', errorMessage: 'File has not been read yet' }
    const c1 = new GuidedFailureCounter({ rootDir: root, now: () => t })
    await c1.recordFailure(fire)
    t += 1_000
    await c1.recordFailure(fire)
    t += 1_000
    expect((await c1.recordFailure(fire))?.rule.id).toBe('zcode-edit-not-read')

    // 模拟重启：新实例，同一目录
    const c2 = new GuidedFailureCounter({ rootDir: root, now: () => t })
    const records = await c2.getRecords()
    expect(records).toHaveLength(1)
    expect(records[0]!.count).toBe(3)
  })

  it('空 errorMessage 不计数', async () => {
    const counter = makeCounter(() => 0)
    expect(await counter.recordFailure({ source: 'zcode', errorMessage: '' })).toBeNull()
    expect(await counter.recordFailure({ source: 'zcode', errorMessage: '  ' })).toBeNull()
    expect(await counter.getRecords()).toHaveLength(0)
  })
})