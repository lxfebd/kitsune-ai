/**
 * 流水线阶段定义 —「自主运行」单页化视图的左流程条数据源。
 *
 * 八阶段对齐用户心智：目标 → 生成计划 → 计划审核批准 → 分配计划 →
 * 子 agent 接收任务开始工作 → 桌宠监控计划执行 → 审核产物 → 最终产物审核后提交。
 *
 * 阶段状态由事件驱动的快照（PipelineSnapshot）投影，纯函数可单测。
 */

export type PipelineStageId =
  | 'goal'
  | 'plan'
  | 'review'
  | 'assign'
  | 'work'
  | 'monitor'
  | 'product'
  | 'submit'

export interface PipelineStage {
  id: PipelineStageId
  /** i18n label key，挂在 settings.pages.pipeline.stages.<id> 下 */
  labelKey: string
  descriptionKey: string
  icon: string
}

export const PIPELINE_STAGES: PipelineStage[] = [
  { id: 'goal', labelKey: 'label', descriptionKey: 'description', icon: 'i-solar:target-bold-duotone' },
  { id: 'plan', labelKey: 'label', descriptionKey: 'description', icon: 'i-solar:diagram-up-bold-duotone' },
  { id: 'review', labelKey: 'label', descriptionKey: 'description', icon: 'i-solar:user-id-bold-duotone' },
  { id: 'assign', labelKey: 'label', descriptionKey: 'description', icon: 'i-solar:users-group-rounded-bold-duotone' },
  { id: 'work', labelKey: 'label', descriptionKey: 'description', icon: 'i-solar:sledgehammer-bold-duotone' },
  { id: 'monitor', labelKey: 'label', descriptionKey: 'description', icon: 'i-solar:eye-bold-duotone' },
  { id: 'product', labelKey: 'label', descriptionKey: 'description', icon: 'i-solar:widget-5-bold-duotone' },
  { id: 'submit', labelKey: 'label', descriptionKey: 'description', icon: 'i-solar:cloud-check-bold-duotone' },
]

/** 阶段状态 — 左流程条节点的展示状态 */
export type StageState = 'idle' | 'active' | 'done' | 'failed'

/**
 * 流水线运行快照 — 由 use-run-pipeline 在事件接收时增量累积，stageState 投影用。
 * 全部字段可选，缺省视为「尚未发生」。
 */
export interface PipelineSnapshot {
  /** 正在调用 LLM 生成计划 */
  generating?: boolean
  /** 计划已生成（含终态 plan） */
  hasPlan?: boolean
  /** plan.status — pending/running/completed/aborted */
  planStatus?: 'pending' | 'running' | 'completed' | 'aborted' | null
  /** executor 正在执行任务 */
  isRunning?: boolean
  /** 总监裁决：approved=通过，rejected=驳回，null=未裁决 */
  verdict?: 'approved' | 'rejected' | null
  /** 收到过 coordination_started（编排已派活） */
  coordinationStarted?: boolean
  /** 收到过 agent_outcome（子 agent 已回传结果） */
  agentOutcomes?: number
  /** 已完成任务数 */
  completedCount?: number
  /** 失败任务数 */
  failedCount?: number
}

/** 阶段状态投影 — 纯函数，供左流程条与单测使用。 */
export function stageState(stage: PipelineStageId, s: PipelineSnapshot): StageState {
  switch (stage) {
    case 'goal':
      // 目标输入区永远是本阶段入口
      return 'active'
    case 'plan':
      if (s.generating)
        return 'active'
      if (s.hasPlan)
        return 'done'
      return 'idle'
    case 'review':
      if (s.verdict === 'approved')
        return 'done'
      if (s.verdict === 'rejected')
        return 'failed'
      if (s.hasPlan)
        return 'active'
      return 'idle'
    case 'assign':
      if (s.coordinationStarted && (s.agentOutcomes ?? 0) > 0)
        return 'done'
      if (s.coordinationStarted || s.isRunning)
        return 'active'
      return 'idle'
    case 'work':
      if (s.isRunning)
        return 'active'
      if ((s.completedCount ?? 0) > 0)
        return s.failedCount ? 'failed' : 'done'
      return 'idle'
    case 'monitor':
      if (s.isRunning)
        return 'active'
      if (s.planStatus === 'completed' || s.planStatus === 'aborted')
        return s.failedCount ? 'failed' : 'done'
      return 'idle'
    case 'product':
      if ((s.completedCount ?? 0) > 0)
        return s.failedCount ? 'failed' : 'done'
      return 'idle'
    case 'submit':
      if (s.planStatus === 'completed')
        return 'done'
      if (s.planStatus === 'aborted')
        return 'failed'
      if (s.planStatus === 'running' || s.isRunning)
        return 'active'
      return 'idle'
    default:
      return 'idle'
  }
}