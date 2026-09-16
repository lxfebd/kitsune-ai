/**
 * TraeMonitor 单测 — 聚焦进程探测与状态字段一致性。
 *
 * 背景：TraeMonitor.getStatus() 返回的字段名是 `isTraeRunning`，
 * 而 overseer 聚合层（apps/stage-tamagotchi overseer/index.ts buildToolStatusList）
 * 统一读 `supervisorStatus[t.id]?.isRunning` —— 字段对不上，Trae 进程在跑也永远显示未运行。
 * 回归断言：getStatus().isRunning 必须存在，且与内部判定一致。
 *
 * 测试不依赖真实系统进程表：通过注入可控的 execFile 桩验证判定逻辑。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import childProcess from 'node:child_process'

import { TraeMonitor } from './TraeMonitor'

const ORIGINAL_EXECFILE = childProcess.execFile

/** 构造带 execFile 桩的 monitor：platform 固定为 win32，watchDir 指向不存在的目录避免 fs.watch 抛错 */
function makeMonitor(execFileStub) {
  childProcess.execFile = execFileStub
  return new TraeMonitor({ watchDir: 'Z:\\__nonexistent__' })
}

/** 桩：模拟 tasklist 输出与回调；git 调用（_check 内部）返回空变更 */
function winTasklistStub(output, err = null) {
  return (cmd, args, opts, cb) => {
    if (cmd === 'tasklist') {
      cb(err, output)
      return
    }
    // git diff --stat：无变更
    cb(null, '')
  }
}

describe('TraeMonitor', () => {
  afterEach(() => {
    childProcess.execFile = ORIGINAL_EXECFILE
  })

  it('tasklist 含 Trae CN.exe（含空格进程名）时判定运行中', async () => {
    const stub = winTasklistStub('Image Name\nTrae CN.exe\nnode.exe\n')
    const monitor = makeMonitor(stub)
    const detect = await monitor._checkProcess()
    expect(detect.running).toBe(true)
    expect(detect.signal).toBe('process')
  })

  it('tasklist 无 Trae 进程时判定未运行', async () => {
    const stub = winTasklistStub('Image Name\nnode.exe\nchrome.exe\n')
    const monitor = makeMonitor(stub)
    const detect = await monitor._checkProcess()
    expect(detect.running).toBe(false)
  })

  it('getStatus().isRunning 与内部 isTraeRunning 判定一致（字段名回归）', async () => {
    const stub = winTasklistStub('Image Name\nTrae CN.exe\n')
    const monitor = makeMonitor(stub)
    await monitor._check()

    const status = monitor.getStatus()
    // 聚合层读 isRunning 必须拿到真实判定
    expect(status.isRunning).toBe(true)
    expect(status.isTraeRunning).toBe(true)
    expect(status.detectSignal).toBe('process')
  })

  it('未启动检查时 getStatus 兜底返回 isRunning:false', () => {
    const monitor = makeMonitor(() => {})
    const status = monitor.getStatus()
    expect(status.isRunning).toBe(false)
    expect(status.isTraeRunning).toBe(false)
  })
})
