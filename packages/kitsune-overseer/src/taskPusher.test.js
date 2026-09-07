import { describe, expect, it, vi } from 'vitest'

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
    expect(spawnSpy).toHaveBeenCalledWith('gemini', ['--print', '-p', '修 bug'], expect.any(String), 30000)
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