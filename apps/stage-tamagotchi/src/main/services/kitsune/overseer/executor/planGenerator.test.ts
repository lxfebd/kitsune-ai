import { describe, expect, it, vi } from 'vitest'

import { generatePlan } from './planGenerator'

// generatePlan 内部会调 callLlm（真实网络）与 analyzeCodeStyle（真实文件 IO）。
// 这里整体 mock callLlm 返回固定 JSON，让 normalizeTask 的兜底逻辑可被独立验证。
vi.mock('./llmHelper', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./llmHelper')>()
  return {
    ...actual,
    callLlm: vi.fn(),
  }
})

import { callLlm } from './llmHelper'

describe('generatePlan CLI 任务 prompt 兜底', () => {
  it('prompt 缺失时回退到 title，避免 dsh 收到空任务文本假执行', async () => {
    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        tasks: [
          {
            title: '扫描项目目录结构',
            type: 'cli',
            provider: 'dsh',
            critical: true,
          },
        ],
      }),
    } as never)

    const result = await generatePlan('梳理项目功能模块', 'J:\\test\\proj', undefined, [
      { id: 'dsh', name: 'DeepSeek Harness', binary: 'dsh', personality: '', timeoutMs: 300000 },
    ])

    expect(result.ok).toBe(true)
    const task = result.plan?.tasks[0]
    expect(task).toBeDefined()
    if (task?.type === 'cli') {
      // 模型只给 title 没给 prompt → 兜底用 title 作为可执行指令
      expect(task.prompt).toBe('扫描项目目录结构')
      expect(task.provider).toBe('dsh')
    }
  })

  it('prompt 正常提供时原样保留', async () => {
    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        tasks: [
          {
            title: '写报告',
            type: 'cli',
            provider: 'dsh',
            prompt: '把结果写入 module_report.md',
            critical: false,
          },
        ],
      }),
    } as never)

    const result = await generatePlan('写报告', 'J:\\test\\proj', undefined, [
      { id: 'dsh', name: 'DeepSeek Harness', binary: 'dsh', personality: '', timeoutMs: 300000 },
    ])

    expect(result.ok).toBe(true)
    const task = result.plan?.tasks[0]
    if (task?.type === 'cli') {
      expect(task.prompt).toBe('把结果写入 module_report.md')
    }
  })
})
