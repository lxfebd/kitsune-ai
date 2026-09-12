/**
 * 指导服务（GuidanceService）— 桌宠「方法指导」的门面。
 *
 * 组装三件事：
 *   1. 内置规则库（builtInRules.ts）— errorMessage → 修复步骤
 *   2. 失败计数器（failureCounter.ts）— 持久化重复失败记忆，跨会话
 *   3. 语言 — 主进程可用的 i18n locale 解析（事件数据内嵌 zh/en，由渲染进程按当前语言取，
 *      同时这里按主进程当前语言选好 title/steps 文本放进事件，事件流卡片零逻辑）
 *
 * 消费方（overseer/index.ts）在 handleEvent pushFilter 之前与 triggerPetReaction
 * 内调用 `recordFailure`；触发时返回 GuidanceTrigger，由消费方决定 emit 事件 + 桌宠演出。
 */

import { app } from 'electron'

import { localize, matchRule, type BuiltInGuidanceRule } from './builtInRules'
import { GuidedFailureCounter, type FailureRecord, type GuidanceTrigger } from './failureCounter'

export type { BuiltInGuidanceRule } from './builtInRules'
export type { FailureRecord, GuidanceTrigger } from './failureCounter'

export interface GuidanceServiceOptions {
  /** 覆盖持久化目录（测试注入 tmp dir；生产用 userData） */
  rootDir?: string
  windowMs?: number
  cooldownMs?: number
  /** 阈值：同一失败累计多少次触发指导（默认 3） */
  threshold?: number
  /** 当前界面语言（zh-Hans/en…），用于给事件内嵌本地化文本 */
  locale?: string
}

export interface GuidanceService {
  /** 记录一次失败；达阈值且过冷却则返回触发（含规则），否则 null */
  recordFailure: (input: { source: string, errorMessage: string, toolName?: string }) => Promise<GuidanceTrigger | null>
  /** 命中规则且当前次数（不消费计数，只读查询） */
  match: (errorMessage: string, toolName?: string, source?: string) => BuiltInGuidanceRule | null
  /** 本地化规则文本（zh/en 按当前语言） */
  localizeRule: (rule: BuiltInGuidanceRule) => { title: string, steps: string[] }
  /** 清空失败记忆（设置页） */
  reset: () => Promise<void>
  /** 全部失败记录（统计/展示） */
  getRecords: () => Promise<FailureRecord[]>
  /** 持久化计数器实例（供测试断言） */
  counter: GuidedFailureCounter
}

export function createGuidanceService(options: GuidanceServiceOptions = {}): GuidanceService {
  const counter = new GuidedFailureCounter({
    rootDir: options.rootDir ?? app.getPath('userData'),
    windowMs: options.windowMs,
    cooldownMs: options.cooldownMs,
    threshold: options.threshold,
  })
  const locale = options.locale ?? 'zh-Hans'

  return {
    counter,
    recordFailure: input => counter.recordFailure(input),
    match: (errorMessage, toolName, source) => matchRule(errorMessage, toolName, source),
    localizeRule: (rule) => ({
      title: localize(rule.title, locale),
      steps: rule.steps.map(s => localize(s, locale)),
    }),
    reset: () => counter.reset(),
    getRecords: () => counter.getRecords(),
  }
}
