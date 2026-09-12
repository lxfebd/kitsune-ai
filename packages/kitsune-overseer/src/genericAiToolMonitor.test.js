/**
 * GenericAiToolMonitor 单测 — 聚焦进程检测误判回归。
 *
 * 背景：Windows 上 `tasklist /FI "IMAGENAME eq cursor*"` 在无匹配进程时
 * 仍输出本地化提示行（如"信息: 没有运行的任务匹配指定标准。"）且退出码为 0，
 * 旧实现 `stdout.trim().length > 0` 恒真 → 所有 Generic 工具永远显示"运行中"。
 * 修复后 Windows 改全量 tasklist + 进程名子串匹配，无匹配不再误报。
 *
 * 测试不依赖真实系统进程表：通过注入可控的 execFile 桩验证判定逻辑。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { GenericAiToolMonitor } from './genericAiToolMonitor'

// 还原被桩替换的 execFile（require('node:child_process') 返回缓存对象）
import childProcess from 'node:child_process'

const ORIGINAL_EXECFILE = childProcess.execFile

/** 构造带 execFile 桩的 monitor：platform 固定为 win32 */
function makeMonitor(execFileStub, { toolKey = 'cursor' } = {}) {
  childProcess.execFile = execFileStub
  return new GenericAiToolMonitor({ toolKey })
}

/** 桩：模拟 tasklist 输出与回调 */
function winTasklistStub(output, err = null) {
  return (cmd, args, opts, cb) => {
    expect(cmd).toBe('tasklist')
    cb(err, output)
  }
}

afterEach(() => {
  childProcess.execFile = ORIGINAL_EXECFILE
})

describe('GenericAiToolMonitor._detectByProcessList (Windows)', () => {
  it('无匹配进程（仅本地化提示行）时不误报运行中', async () => {
    const stub = winTasklistStub('信息: 没有运行的任务匹配指定标准。\r\n')
    const monitor = makeMonitor(stub)
    const result = await monitor._detectByProcessList()
    expect(result).toBe(false)
  })

  it('存在匹配进程名时正确判定运行中（子串命中）', async () => {
    const stub = winTasklistStub(
      '"cursor.exe","1234","Console","1","12,345 K"\r\n' +
      '"Code.exe","5678","Console","1","98,765 K"\r\n'
    )
    const monitor = makeMonitor(stub)
    const result = await monitor._detectByProcessList()
    expect(result).toBe(true)
  })

  it('进程表无匹配名称时返回 false（即使有其它进程）', async () => {
    const stub = winTasklistStub('"Code.exe","5678","Console","1","98,765 K"\r\n')
    const monitor = makeMonitor(stub)
    const result = await monitor._detectByProcessList()
    expect(result).toBe(false)
  })

  it('tasklist 执行出错时安全返回 false', async () => {
    const stub = winTasklistStub('', new Error('ENOENT'))
    const monitor = makeMonitor(stub)
    const result = await monitor._detectByProcessList()
    expect(result).toBe(false)
  })
})

describe('GenericAiToolMonitor 未知工具兜底', () => {
  it('TOOL_PRESETS 之外的未知工具不再回落 Cursor 预设', () => {
    childProcess.execFile = ORIGINAL_EXECFILE
    const monitor = new GenericAiToolMonitor({ toolKey: 'some-unknown-tool' })
    // 名称跟随工具自身，而不是"Cursor"
    expect(monitor.config.name).toBe('some-unknown-tool')
    // 进程检测应以工具自身名为模式，而不是 cursor
    expect(monitor.config.processPatterns).toEqual(['some-unknown-tool'])
  })
})

describe('GenericAiToolMonitor._checkProcess 信号优先级', () => {
  it('无任何信号时返回 running=false / signal=none', async () => {
    // 桩：文件活动 false（无日志目录）、进程 false、无惯性
    childProcess.execFile = winTasklistStub('信息: 没有运行的任务匹配指定标准。\r\n')
    const monitor = new GenericAiToolMonitor({
      toolKey: 'cursor',
      config: { name: 'Cursor', processPatterns: ['cursor'], outputPatterns: {}, logPaths: [] },
    })
    const result = await monitor._checkProcess()
    expect(result.running).toBe(false)
    expect(result.signal).toBe('none')
  })
})
