/**
 * pet_report 上报 → 监工消费侧 的纯函数映射层
 *
 * ── 职责边界 ──
 * MCP server（petMcpHttpServer）收到 pet_report 后，把契约交给本层映射成
 * 内部编排层（overseer）可消费的 PetReaction / OverseerEvent，再走现有管线
 * （triggerPetReaction → mapReactionToEvent → handleEvent）。
 *
 * 本层是纯函数：不依赖 SDK、不依赖 electron、不碰端口——因此可单测。
 *
 * ── 与 triggerReaction（事件型）的差异 ──
 * triggerReaction 是低频闲聊（celebrate/critique/warn/…，桌宠开口），
 * pet_report 是高频活动信号（thinking/executing/completed/error，监工状态）。
 * 高频信号不应每次触发桌宠说话，所以 activity=completed/error 才向上映射为
 * 可推送事件（TaskEnd/TaskFailed），thinking/executing 等细粒度信号映射为
 * status_update（内部状态更新，不进 PushFilter 白名单，不打扰用户）。
 */

import type { PetReaction } from '@kitsune/overseer'
import { mapToUnifiedState } from '@kitsune/overseer'

import type { PetReportContract } from './petContract'

/**
 * 把 pet_report 契约归一化成统一状态值。
 * activityStates.mapToUnifiedState 对未知值兜底 idle，故对外部上报天然健壮。
 */
export function normalizePetReportActivity(raw: string | undefined): string {
  return mapToUnifiedState(raw ?? 'idle', 'generic')
}

/**
 * 映射为监工侧 PetReaction。
 *
 * activity=completed → happy/celebrate
 * activity=error     → worried/concern（errorMessage 透传，供 mapReactionToEvent 判 crash/timeout 等）
 * 其余（thinking/executing/coding/…）→ 中性信息，仅更新状态不开口。
 *
 * @returns 结构化信号（toolName/hasError/errorMessage/activity）透传给编排层，
 *          编排层据此映射 OverseerEventType（结构化信号优先于关键词兜底）。
 */
export function mapPetReportToReaction(report: PetReportContract): PetReaction {
  const activity = normalizePetReportActivity(report.activity)

  const base: PetReaction = {
    type: 'supervisor_reaction',
    source: report.source,
    emotion: activity === 'completed' ? 'happy' : activity === 'error' ? 'worried' : 'neutral',
    action: activity === 'completed' ? 'celebrate' : activity === 'error' ? 'concern' : 'idle',
    message: report.message ?? defaultMessage(activity, report.tool),
    summary: report.message ?? defaultMessage(activity, report.tool),
    timestamp: Date.now(),
    toolName: report.tool,
    hasError: activity === 'error',
    errorMessage: report.errorMessage,
    // activity 显式透传：mapReactionToEvent 优先读它做结构化映射，
    // 不再走关键词猜测（P0.3 结构化信号优先路径）。
    activity,
    raw: {
      activity,
      message: report.message,
      tool: report.tool,
    },
  }

  return base
}

function defaultMessage(activity: string, tool?: string): string {
  if (activity === 'error') return 'agent 上报了错误'
  const toolHint = tool ? ` ${tool}` : ''
  const labels: Record<string, string> = {
    thinking: '思考中',
    coding: '写代码中',
    executing: `执行工具${toolHint}`,
    building: '构建中',
    testing: '测试中',
    completed: '完成了一批工作',
    stopped: '已停止',
    code_changed: '代码有变更',
  }
  return labels[activity] ?? '运行中'
}
