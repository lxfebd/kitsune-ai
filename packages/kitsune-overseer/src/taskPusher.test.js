import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { TaskPusher, TOOL_ALLOWLIST } from './taskPusher.js'

describe('TaskPusher P2 运行时注册表', () => {
  it('registerTool 规范化配置并进入查找链', () => {
    const tp = new TaskPusher()
    const ok = tp.registerTool('gemini', {
      name: 'Gemini CLI',
      binary: 'gemini',
      templates: [{ key: 'prompt', label: '发指令', args: ['--print'], inputParam: '-p', maxLen: 500 }],
      timeoutMs: 30000,
      riskLevel: 'high',
    })
    expect(ok).toBe(true)
    expect(tp.getRegisteredTools()).toEqual(['gemini'])

    const cfg = tp.getToolConfig('gemini')
    expect(cfg.binary).toBe('gemini')
    expect(cfg.timeoutMs).toBe(30000)
    expect(cfg.riskLevel).toBe('high')
    expect(cfg.templates[0]).toMatchObject({ key: 'prompt', args: ['--print'], inputParam: '-p', maxLen: 500 })
    // 缺省字段被补全
    expect(cfg.templates[0].label).toBe('发指令')
    expect(cfg.templates[0].custom).toBe(false)
  })

  it('registerTool 拒绝非法配置（缺 binary/templates）', () => {
    const tp = new TaskPusher()
    expect(tp.registerTool('bad1', { templates: [] })).toBe(false)
    expect(tp.registerTool('bad2', { binary: 'x' })).toBe(false)
    expect(tp.registerTool('', { binary: 'x', templates: [{}] })).toBe(false)
    expect(tp.getRegisteredTools()).toEqual([])
  })

  it('registerTool 覆盖同 key 时告警但以新配置生效', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const tp = new TaskPusher()
    tp.registerTool('gemini', { binary: 'gemini', templates: [{ key: 'prompt', maxLen: 100 }] })
    tp.registerTool('gemini', { binary: 'gemini2', templates: [{ key: 'prompt', maxLen: 999 }] })
    expect(warnSpy).toHaveBeenCalled()
    expect(tp.getToolConfig('gemini').binary).toBe('gemini2')
    warnSpy.mockRestore()
  })

  it('pushTask 走注册表工具（spawn stub）', async () => {
    const tp = new TaskPusher()
    tp.registerTool('gemini', {
      binary: 'gemini',
      templates: [{ key: 'prompt', label: '发指令', args: ['--print'], inputParam: '-p', maxLen: 1000 }],
      timeoutMs: 30000,
      riskLevel: 'low',
    })
    const spawnSpy = vi.spyOn(tp, 'spawnCommand').mockResolvedValue({ ok: true, output: 'done' })
    const result = await tp.pushTask({ tool: 'gemini', templateKey: 'prompt', input: '修 bug', userPermission: 'medium' })
    expect(result.ok).toBe(true)
    // env 缺省时合并输出仍含进程 env（含 PATH/SystemRoot），只校验 spawn 参数前缀与超时
    expect(spawnSpy).toHaveBeenCalledWith('gemini', ['--print', '-p', '修 bug'], expect.any(String), 30000, expect.objectContaining({ PATH: expect.any(String) }))
    spawnSpy.mockRestore()
  })

  it('pushTask 透传工具级 env 到 spawnCommand（dsh DSH_HOME 场景）', async () => {
    const tp = new TaskPusher()
    tp.registerTool('dsh', {
      binary: 'dsh',
      templates: [{ key: 'prompt', label: '派发任务(headless)', args: ['--profile', 'headless'], inputParam: null, maxLen: 3000 }],
      timeoutMs: 300000,
      riskLevel: 'medium',
      env: { DSH_HOME: 'J:/deepseekhar/dsh-home' },
    })
    const spawnSpy = vi.spyOn(tp, 'spawnCommand').mockResolvedValue({ ok: true, output: 'done' })
    const result = await tp.pushTask({ tool: 'dsh', templateKey: 'prompt', input: '列出目录', userPermission: 'medium' })
    expect(result.ok).toBe(true)
    // 任务文本是位置参数（inputParam:null → append 到 args 末尾），env 合并工具级 DSH_HOME
    expect(spawnSpy).toHaveBeenCalledWith('dsh', ['--profile', 'headless', '列出目录'], expect.any(String), 300000, expect.objectContaining({ DSH_HOME: 'J:/deepseekhar/dsh-home', PATH: expect.any(String) }))
    spawnSpy.mockRestore()
  })

  it('pushTask 对未注册工具返回 UNKNOWN_TOOL，对未注册模板返回 UNKNOWN_TEMPLATE', async () => {
    const tp = new TaskPusher()
    tp.registerTool('gemini', { binary: 'gemini', templates: [{ key: 'prompt' }] })
    expect(await tp.pushTask({ tool: 'nope', templateKey: 'prompt' })).toMatchObject({ ok: false, code: 'UNKNOWN_TOOL' })
    expect(await tp.pushTask({ tool: 'gemini', templateKey: 'nope' })).toMatchObject({ ok: false, code: 'UNKNOWN_TEMPLATE' })
  })

  it('getAvailableTools 同时列出内置与注册工具，probeToolAvailability 缓存可失效', () => {
    const tp = new TaskPusher()
    expect(tp.getAvailableTools().some(t => t.key === 'claude')).toBe(true)
    tp.registerTool('gemini', { binary: 'gemini', templates: [{ key: 'prompt' }] })
    const tools = tp.getAvailableTools()
    expect(tools.some(t => t.key === 'gemini')).toBe(true)

    // 注册后 PATH 探测缓存失效（_binaryCache 被清空 → probe 重跑）
    const probeSpy = vi.spyOn(tp, 'probeToolAvailability')
    tp.registerTool('gemini2', { binary: 'gemini2', templates: [{ key: 'prompt' }] })
    expect(probeSpy).not.toHaveBeenCalled() // 此处只验证缓存失效会在下次 probe 体现
    tp.getAvailableTools() // 触发 probe
    expect(tp.probeToolAvailability()['gemini2']).toBe(false) // 不存在的二进制
    probeSpy.mockRestore()
  })

  it('_resolveBinary Windows 上把 PATH 里的 .cmd 包装为 cmd.exe 调用（dsh 安装即启用）', () => {
    const tp = new TaskPusher()
    const platSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    // 真实临时目录里放 dsh.cmd（模拟 npm 全局安装入口）
    const fakeBin = mkdtempSync(join(tmpdir(), 'dshbin-'))
    writeFileSync(join(fakeBin, 'dsh.cmd'), '@echo off\necho mock\n')
    const origPath = process.env.PATH
    process.env.PATH = fakeBin + ';' + (origPath || '')
    try {
      const resolved = tp._resolveBinary('dsh')
      expect(resolved).toEqual({ command: 'cmd.exe', argsPrefix: ['/d', '/s', '/c', join(fakeBin, 'dsh.cmd')] })
      // PATH 里没有的二进制 → null（探活 available=false）
      expect(tp._resolveBinary('nope')).toBeNull()
    } finally {
      platSpy.mockRestore()
      process.env.PATH = origPath
      rmSync(fakeBin, { recursive: true, force: true })
    }
  })

  it('_resolveBinary 非 win32 直接原样返回 binary（无 .cmd 包装）', () => {
    const tp = new TaskPusher()
    const platSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
    try {
      expect(tp._resolveBinary('dsh')).toEqual({ command: 'dsh', argsPrefix: [] })
    } finally {
      platSpy.mockRestore()
    }
  })

  it('_resolveBinary 绝对路径 binary（config 直接写安装位置）不依赖 PATH：命中 .CMD 包装为 cmd.exe', () => {
    const tp = new TaskPusher()
    const platSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const fakeBin = mkdtempSync(join(tmpdir(), 'dshabs-'))
    writeFileSync(join(fakeBin, 'dsh.CMD'), '@echo off\necho mock\n')
    // 进程 PATH 完全不含 fakeBin — 证明绝对路径探测不沿 PATH
    const origPath = process.env.PATH
    process.env.PATH = 'C:\\Windows\\system32;C:\\Windows'
    try {
      const absPath = join(fakeBin, 'dsh.CMD')
      const resolved = tp._resolveBinary(absPath)
      expect(resolved).toEqual({ command: 'cmd.exe', argsPrefix: ['/d', '/s', '/c', absPath] })
      // 不存在/不存在的绝对路径 → null
      expect(tp._resolveBinary(join(fakeBin, 'missing.exe'))).toBeNull()
    } finally {
      platSpy.mockRestore()
      process.env.PATH = origPath
      rmSync(fakeBin, { recursive: true, force: true })
    }
  })

  it('_resolveBinary node-shim .CMD（npm/pnpm 生成）直调 node，绕开 cmd.exe 二次解析破坏中文参数', () => {
    const tp = new TaskPusher()
    const platSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const fakeBin = mkdtempSync(join(tmpdir(), 'dshshim-'))
    const pkgDir = mkdtempSync(join(tmpdir(), 'dshpkg-'))
    // 模拟 npm/pnpm 生成的 node shim：node "…\@pkg\bin.js" %*
    const binJs = join(pkgDir, 'bin.js')
    writeFileSync(binJs, '// mock\n')
    writeFileSync(join(fakeBin, 'dsh.CMD'), `@IF EXIST "%~dp0\\node.exe" (\n  "%~dp0\\node.exe"  "%~dp0\\..\\@pkg\\bin.js" %*\n) ELSE (\n  node  "%~dp0\\..\\@pkg\\bin.js" %*\n)\n`)
    // shim 目录与包目录的差异：%~dp0 = fakeBin，bin.js 实际在 pkgDir；手动把它对齐到 fakeBin\..\@pkg
    mkdirSync(join(fakeBin, '..', '@pkg'), { recursive: true })
    writeFileSync(join(fakeBin, '..', '@pkg', 'bin.js'), '// mock\n')
    const origPath = process.env.PATH
    process.env.PATH = 'C:\\Windows\\system32;C:\\Windows'
    try {
      const resolved = tp._resolveBinary(join(fakeBin, 'dsh.CMD'))
      // 命中 node shim → 直调 node + bin.js，不再走 cmd.exe（否则中文 prompt 被 /c 二次解析拆坏）
      expect(resolved.command).toBe('node')
      expect(resolved.argsPrefix.length).toBe(1)
      expect(resolved.argsPrefix[0].replace(/\\/g, '/')).toContain('@pkg/bin.js')
      // 普通批处理（无 node shim 模式）仍走 cmd.exe 包装
      writeFileSync(join(fakeBin, 'plain.CMD'), '@echo off\necho mock\n')
      expect(tp._resolveBinary(join(fakeBin, 'plain.CMD'))).toEqual({
        command: 'cmd.exe',
        argsPrefix: ['/d', '/s', '/c', join(fakeBin, 'plain.CMD')],
      })
    } finally {
      platSpy.mockRestore()
      process.env.PATH = origPath
      rmSync(fakeBin, { recursive: true, force: true })
      rmSync(pkgDir, { recursive: true, force: true })
    }
  })

  it('_nodeShimTarget 无匹配（非 node shim 批处理）返回 null，安全回退 cmd.exe', () => {
    const tp = new TaskPusher()
    const fakeBin = mkdtempSync(join(tmpdir(), 'dshplain-'))
    writeFileSync(join(fakeBin, 'x.CMD'), '@echo off\nset FOO=1\necho done\n')
    try {
      expect(tp._nodeShimTarget(join(fakeBin, 'x.CMD'))).toBeNull()
    } finally {
      rmSync(fakeBin, { recursive: true, force: true })
    }
  })

  it('probeToolAvailability 绝对路径 binary 直接存在性探活，即使 PATH 不含它（安装即启用不依赖 PATH）', () => {
    const tp = new TaskPusher()
    const platSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const fakeBin = mkdtempSync(join(tmpdir(), 'dshprob-'))
    writeFileSync(join(fakeBin, 'dsh.CMD'), '@echo off\necho mock\n')
    const origPath = process.env.PATH
    const absPath = join(fakeBin, 'dsh.CMD')
    process.env.PATH = 'C:\\Windows\\system32;C:\\Windows'
    try {
      tp.registerTool('dsh-abs', {
        binary: absPath,
        templates: [{ key: 'prompt', args: ['--profile', 'headless'] }],
      })
      const avail = tp.probeToolAvailability()
      expect(avail['dsh-abs']).toBe(true)
      // 绝对路径指向不存在 → 不可用
      tp.registerTool('dsh-missing', { binary: join(fakeBin, 'nope.CMD'), templates: [{ key: 'prompt' }] })
      expect(tp.probeToolAvailability()['dsh-missing']).toBe(false)
    } finally {
      platSpy.mockRestore()
      process.env.PATH = origPath
      rmSync(fakeBin, { recursive: true, force: true })
    }
  })

  it('_candidatePathDirs 进程 PATH 缺失时仍能发现用户级 PATH 里的 dsh.cmd（安装即启用不重启）', () => {
    const tp = new TaskPusher()
    const platSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    // 只在「用户级 PATH 目录」里放 dsh.cmd；进程 PATH 不含该目录
    const fakeBin = mkdtempSync(join(tmpdir(), 'dshusr-'))
    writeFileSync(join(fakeBin, 'dsh.cmd'), '@echo off\necho mock\n')
    // 模拟进程启动早于安装：process.env.PATH 完全不含 fakeBin
    const origPath = process.env.PATH
    const origExec = require('node:child_process').execFileSync
    try {
      process.env.PATH = 'C:\\Windows\\system32;C:\\Windows'
      // 拦截 reg query，返回 fakeBin 作为用户级 PATH（形如 reg 输出）
      vi.spyOn(require('node:child_process'), 'execFileSync').mockImplementation((cmd, args) => {
        if (cmd === 'reg')
          return `\r\n\r\nHKEY_CURRENT_USER\\Environment\r\n    Path    REG_EXPAND_SZ    ${fakeBin}\r\n`
        return origExec(cmd, args)
      })
      const resolved = tp._resolveBinary('dsh')
      expect(resolved).toEqual({ command: 'cmd.exe', argsPrefix: ['/d', '/s', '/c', join(fakeBin, 'dsh.cmd')] })
    } finally {
      platSpy.mockRestore()
      require('node:child_process').execFileSync.mockRestore?.()
      process.env.PATH = origPath
      rmSync(fakeBin, { recursive: true, force: true })
    }
  })

  it('_resolveBinary 发现链：PATH 未命中时经 npm prefix -g 的全局 bin 找到 dsh（跨机器不写死路径）', () => {
    const tp = new TaskPusher()
    const platSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    // 模拟 npm 全局安装：dsh.cmd 只存在于 npm prefix 根目录（Windows npm 行为），
    // PATH 与用户级 PATH 均不含它 → 只能靠 npm prefix -g 发现。
    const fakeNpmRoot = mkdtempSync(join(tmpdir(), 'npmglob-'))
    writeFileSync(join(fakeNpmRoot, 'dsh.cmd'), '@echo off\necho mock\n')
    const origPath = process.env.PATH
    const origExec = require('node:child_process').execFileSync
    try {
      process.env.PATH = 'C:\\Windows\\system32;C:\\Windows'
      vi.spyOn(require('node:child_process'), 'execFileSync').mockImplementation((cmd, args) => {
        // 拦截 Windows 包装调用 cmd.exe /c npm prefix -g → 返回假 npm 全局根
        if (cmd === 'cmd.exe' && Array.isArray(args) && args.some(a => typeof a === 'string' && a.includes('npm prefix')))
          return `${fakeNpmRoot}\r\n`
        if (cmd === 'reg') // 用户级 PATH 也空
          return `\r\n\r\nHKEY_CURRENT_USER\\Environment\r\n`
        return origExec(cmd, args)
      })
      const resolved = tp._resolveBinary('dsh')
      expect(resolved).toEqual({ command: 'cmd.exe', argsPrefix: ['/d', '/s', '/c', join(fakeNpmRoot, 'dsh.cmd')] })
      // probe 探活走同一条发现链 → 也命中
      tp.registerTool('dsh', { binary: 'dsh', templates: [{ key: 'prompt', args: ['--profile', 'headless'] }] })
      expect(tp.probeToolAvailability()['dsh']).toBe(true)
    } finally {
      platSpy.mockRestore()
      require('node:child_process').execFileSync.mockRestore?.()
      process.env.PATH = origPath
      rmSync(fakeNpmRoot, { recursive: true, force: true })
      delete tp._npmBinCache
    }
  })
})

describe('TaskPusher P3 结构化结果解析', () => {
  it('解析 success 结果', async () => {
    const tp = new TaskPusher()
    const out = [
      JSON.stringify({ type: 'system', subtype: 'init' }),
      JSON.stringify({ type: 'result', subtype: 'success', result: { duration_ms: 100 } }),
    ].join('\n')
    const spawnSpy = vi.spyOn(tp, 'spawnCommand').mockResolvedValue({ ok: true, output: out })
    const result = await tp.pushTask({ tool: 'claude', templateKey: 'prompt-json', input: 'hi' })
    expect(result.ok).toBe(true)
    expect(result.structured).toMatchObject({ parsed: true, subtype: 'success', error: null })
    spawnSpy.mockRestore()
  })

  it('解析 error 结果并回填 ok=false', async () => {
    const tp = new TaskPusher()
    const out = [
      JSON.stringify({ type: 'result', subtype: 'error_max_turns', result: { error: 'reached max turns', is_error: true } }),
    ].join('\n')
    const spawnSpy = vi.spyOn(tp, 'spawnCommand').mockResolvedValue({ ok: true, output: out })
    const result = await tp.pushTask({ tool: 'claude', templateKey: 'prompt-json', input: 'hi' })
    expect(result.ok).toBe(false)
    expect(result.structured.error).toContain('max turns')
    spawnSpy.mockRestore()
  })

  it('收集 assistant tool_use 信号', async () => {
    const tp = new TaskPusher()
    const out = [
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', id: 't1', input: { command: 'ls' } }] } }),
      JSON.stringify({ type: 'result', subtype: 'success' }),
    ].join('\n')
    const spawnSpy = vi.spyOn(tp, 'spawnCommand').mockResolvedValue({ ok: true, output: out })
    const result = await tp.pushTask({ tool: 'claude', templateKey: 'prompt-json', input: 'hi' })
    expect(result.structured.toolUses).toEqual([{ type: 'tool_use', name: 'Bash', id: 't1', input: { command: 'ls' } }])
    spawnSpy.mockRestore()
  })

  it('非 JSON 输出静默跳过（不炸）', async () => {
    const tp = new TaskPusher()
    const spawnSpy = vi.spyOn(tp, 'spawnCommand').mockResolvedValue({ ok: true, output: 'plain text reply' })
    const result = await tp.pushTask({ tool: 'claude', templateKey: 'prompt-json', input: 'hi' })
    expect(result.ok).toBe(true)
    expect(result.structured).toMatchObject({ parsed: false })
    spawnSpy.mockRestore()
  })
})

describe('TaskPusher spawnCommand 超时分支', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('超时分支返回 exitCode=124 且 output/partialOutput 均截断', async () => {
    vi.useFakeTimers()
    // 用 vi.doMock 在重新加载前替换 spawn，返回可手动触发的假 child。
    // kill 模拟「发信号后子进程退出」→ 同步触发 close，让超时分支确定性 resolve
    // （避免墙钟断言在全量并行跑时抖动）。
    vi.resetModules()
    vi.doMock('node:child_process', () => {
      const { EventEmitter } = require('node:events')
      function fakeSpawn() {
        const child = new EventEmitter()
        child.stdout = new EventEmitter()
        child.stderr = new EventEmitter()
        child.pid = 999
        child.kill = vi.fn(() => child.emit('close', null))
        return child
      }
      return { spawn: fakeSpawn }
    })

    const { TaskPusher: TP2 } = await import('./taskPusher.js')
    const tp = new TP2()
    const promise = tp.spawnCommand('node', ['-e', 'sleep(5)'], '/tmp', 100)
    // 推进 100ms → 超时定时器触发 → kill → close → 走 timedOut 分支
    await vi.advanceTimersByTimeAsync(100)
    const result = await promise

    expect(result).toMatchObject({ ok: false, code: 'TIMEOUT' })
    expect(result.exitCode).toBe(124)
    expect(typeof result.output).toBe('string')
    expect(typeof result.partialOutput).toBe('string')
    expect(result.output.length).toBeLessThanOrEqual(10000)
    expect(result.partialOutput.length).toBeLessThanOrEqual(3000)
  })
})