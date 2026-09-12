/**
 * 将 Supervisor 的桌宠反应映射为 OverseerEvent。
 *
 * P0.3 重构：优先读取感知层透传的结构化信号（hasError/errorMessage/toolName），
 * 直接映射为确定的事件类型与 category，不再依赖关键词猜测；仅当结构化信号
 * 缺失时才回退到关键词兜底（兼容旧 .js 监控器与外部触发源）。
 *
 * 从 overseer/index.ts 析出（D2 拆聚合根）。
 */
import type { PetReaction } from '@kitsune/overseer'

import { randomUUID } from 'node:crypto'

import {
  OverseerEventCategory,
  OverseerEventType,
  OverseerSeverity,
  type OverseerEvent,
  type StructuredToolSignal,
} from '../../../../shared/eventa'

export function mapReactionToEvent(reaction: PetReaction): OverseerEvent {
  // —— 结构化信号优先（感知层已算出的确定性信息） ——
  if (reaction.hasError) {
    const errText = `${reaction.errorMessage ?? ''} ${reaction.message ?? ''} ${reaction.summary ?? ''}`.toLowerCase()
    let type: OverseerEventType
    if (/crash|崩溃/.test(errText)) {
      type = OverseerEventType.ProcessCrash
    }
    else if (/timeout|超时/.test(errText)) {
      type = OverseerEventType.Timeout
    }
    else if (/test|测试/.test(errText)) {
      type = OverseerEventType.TestFailed
    }
    else if (/compile|build|编译/.test(errText)) {
      type = OverseerEventType.CompileFailed
    }
    else {
      type = OverseerEventType.TaskFailed
    }
    return {
      id: randomUUID(),
      type,
      source: reaction.source,
      timestamp: reaction.timestamp,
      severity: OverseerSeverity.Error,
      category: OverseerEventCategory.Diagnostic,
      data: {
        emotion: reaction.emotion,
        action: reaction.action,
        message: reaction.message,
        summary: reaction.summary,
        toolName: reaction.toolName,
        hasError: true,
        errorMessage: reaction.errorMessage,
        raw: reaction.raw,
      } satisfies StructuredToolSignal & Record<string, unknown>,
    }
  }

  // —— 无结构化错误 → 结构化活动信号 + 关键词兜底（保持向后兼容） ——
  // 感知层显式上报的 activity（thinking/executing/completed/error…）优先，
  // 映射为可推送的细粒度事件；缺失时才回退到关键词猜测。
  const activity = (reaction as PetReaction & { activity?: string }).activity
    ?? (reaction.raw && typeof reaction.raw === 'object' ? (reaction.raw as Record<string, unknown>).activity as string | undefined : undefined)

  if (activity) {
    if (activity === 'error') {
      return {
        id: randomUUID(),
        type: OverseerEventType.TaskFailed,
        source: reaction.source,
        timestamp: reaction.timestamp,
        severity: OverseerSeverity.Error,
        category: OverseerEventCategory.Diagnostic,
        data: {
          emotion: reaction.emotion,
          action: reaction.action,
          message: reaction.message,
          summary: reaction.summary,
          toolName: reaction.toolName,
          hasError: reaction.hasError,
          errorMessage: reaction.errorMessage ?? reaction.message,
          raw: reaction.raw,
        } satisfies StructuredToolSignal & Record<string, unknown>,
      }
    }
    if (activity === 'completed') {
      return {
        id: randomUUID(),
        type: OverseerEventType.TaskEnd,
        source: reaction.source,
        timestamp: reaction.timestamp,
        severity: OverseerSeverity.Info,
        category: OverseerEventCategory.Lifecycle,
        data: {
          emotion: reaction.emotion,
          action: reaction.action,
          message: reaction.message,
          summary: reaction.summary,
          toolName: reaction.toolName,
          hasError: reaction.hasError,
          errorMessage: reaction.errorMessage,
          raw: reaction.raw,
        } satisfies StructuredToolSignal & Record<string, unknown>,
      }
    }
    // thinking / executing / coding 等工具活动 → 结构化工具调用信号
    if (activity === 'thinking' || activity === 'executing' || activity === 'coding') {
      return {
        id: randomUUID(),
        type: OverseerEventType.ToolInvocation,
        source: reaction.source,
        timestamp: reaction.timestamp,
        severity: OverseerSeverity.Info,
        category: OverseerEventCategory.Lifecycle,
        data: {
          emotion: reaction.emotion,
          action: reaction.action,
          message: reaction.message,
          summary: reaction.summary,
          toolName: reaction.toolName,
          hasError: reaction.hasError,
          errorMessage: reaction.errorMessage,
          raw: reaction.raw,
        } satisfies StructuredToolSignal & Record<string, unknown>,
      }
    }
  }

  const text = `${reaction.message} ${reaction.summary}`.toLowerCase()
  let type: OverseerEventType
  let severity: OverseerSeverity

  if (/permission|confirm|allow|授权|确认/.test(text)) {
    type = OverseerEventType.PermissionRequest
    severity = OverseerSeverity.Warn
  }
  else if (/crash|崩溃/.test(text)) {
    type = OverseerEventType.ProcessCrash
    severity = OverseerSeverity.Error
  }
  else if (/timeout|超时/.test(text)) {
    type = OverseerEventType.Timeout
    severity = OverseerSeverity.Error
  }
  else if (/test|测试/.test(text) && /fail|error|失败/.test(text)) {
    type = OverseerEventType.TestFailed
    severity = OverseerSeverity.Error
  }
  else if (/compile|build|编译/.test(text) && /fail|error|失败/.test(text)) {
    type = OverseerEventType.CompileFailed
    severity = OverseerSeverity.Error
  }
  else if (/fail|error|失败|错误/.test(text)) {
    type = OverseerEventType.TaskFailed
    severity = OverseerSeverity.Error
  }
  else if (/done|complete|finish|完成|结束/.test(text)) {
    type = OverseerEventType.TaskEnd
    severity = OverseerSeverity.Info
  }
  else {
    // 普通状态更新 — 仅更新内部状态，不推送桌宠
    type = OverseerEventType.StatusUpdate
    severity = OverseerSeverity.Info
  }

  return {
    id: randomUUID(),
    type,
    source: reaction.source,
    timestamp: reaction.timestamp,
    severity,
    category: type === OverseerEventType.TaskEnd
      ? OverseerEventCategory.Lifecycle
      : (type === OverseerEventType.PermissionRequest ? OverseerEventCategory.Lifecycle : OverseerEventCategory.Diagnostic),
    data: {
      emotion: reaction.emotion,
      action: reaction.action,
      message: reaction.message,
      summary: reaction.summary,
      toolName: reaction.toolName,
      hasError: reaction.hasError,
      errorMessage: reaction.errorMessage,
      raw: reaction.raw,
    } satisfies StructuredToolSignal & Record<string, unknown>,
  }
}
