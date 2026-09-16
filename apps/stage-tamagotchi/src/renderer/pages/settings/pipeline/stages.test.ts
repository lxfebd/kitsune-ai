import { describe, expect, it } from 'vitest'

import { PIPELINE_STAGES, stageState, type PipelineSnapshot } from './stages'

describe('stageState 阶段状态投影', () => {
  it('初始快照：仅 goal 激活，其余 idle', () => {
    const s: PipelineSnapshot = {}
    expect(stageState('goal', s)).toBe('active')
    expect(stageState('plan', s)).toBe('idle')
    expect(stageState('review', s)).toBe('idle')
    expect(stageState('assign', s)).toBe('idle')
    expect(stageState('work', s)).toBe('idle')
    expect(stageState('monitor', s)).toBe('idle')
    expect(stageState('product', s)).toBe('idle')
    expect(stageState('submit', s)).toBe('idle')
  })

  it('生成计划中：plan 激活', () => {
    const s: PipelineSnapshot = { generating: true }
    expect(stageState('plan', s)).toBe('active')
    expect(stageState('review', s)).toBe('idle')
  })

  it('计划已生成：plan done、review 待裁决（active）', () => {
    const s: PipelineSnapshot = { hasPlan: true }
    expect(stageState('plan', s)).toBe('done')
    expect(stageState('review', s)).toBe('active')
  })

  it('总监已批准：review done；assign 待协调开始（idle）', () => {
    const s: PipelineSnapshot = { hasPlan: true, verdict: 'approved' }
    expect(stageState('review', s)).toBe('done')
    // 批准后编排未开始派活 → assign 仍 idle，等 coordination_started 事件才激活
    expect(stageState('assign', s)).toBe('idle')
  })

  it('总监驳回：review failed', () => {
    const s: PipelineSnapshot = { hasPlan: true, verdict: 'rejected' }
    expect(stageState('review', s)).toBe('failed')
  })

  it('编排已派活且子 agent 有产出：assign done', () => {
    const s: PipelineSnapshot = { coordinationStarted: true, agentOutcomes: 2 }
    expect(stageState('assign', s)).toBe('done')
  })

  it('执行中：assign/work/monitor/submit 全部 active', () => {
    const s: PipelineSnapshot = { isRunning: true, planStatus: 'running' }
    expect(stageState('assign', s)).toBe('active')
    expect(stageState('work', s)).toBe('active')
    expect(stageState('monitor', s)).toBe('active')
    expect(stageState('submit', s)).toBe('active')
  })

  it('部分任务失败：work/product failed，monitor failed', () => {
    const s: PipelineSnapshot = { hasPlan: true, completedCount: 3, failedCount: 1, planStatus: 'aborted' }
    expect(stageState('work', s)).toBe('failed')
    expect(stageState('product', s)).toBe('failed')
    expect(stageState('monitor', s)).toBe('failed')
    expect(stageState('submit', s)).toBe('failed')
  })

  it('全部完成：monitor/product/submit done', () => {
    const s: PipelineSnapshot = { hasPlan: true, completedCount: 5, failedCount: 0, planStatus: 'completed' }
    expect(stageState('monitor', s)).toBe('done')
    expect(stageState('product', s)).toBe('done')
    expect(stageState('submit', s)).toBe('done')
  })

  it('流水线八阶段定义完整且 id 唯一', () => {
    const ids = PIPELINE_STAGES.map(s => s.id)
    expect(ids).toHaveLength(8)
    expect(new Set(ids).size).toBe(8)
    expect(ids).toEqual(['goal', 'plan', 'review', 'assign', 'work', 'monitor', 'product', 'submit'])
  })
})
