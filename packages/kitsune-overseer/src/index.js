/**
 * Kitsune Overseer 入口 — 监工系统核心模块统一导出
 *
 * NOTICE:
 * 现有 .js 实现均使用 CommonJS（require / module.exports），
 * 但 package.json 此前误标 "type": "module"，导致 .js 在 ESM 解析下无法加载。
 * 已在 package.json 中移除该字段以恢复 CommonJS 语义，此处入口同样使用 CommonJS。
 * 不改动任何既有 .js 实现，仅做聚合再导出。
 *
 * ── 架构边界（重要）──
 * 本包是监工系统的「感知层 + 命令原语」，主进程（Electron main）仅消费其中两个节点：
 *   - Supervisor        ：调度各类 Monitor，汇总状态
 *   - TaskPusher        ：CLI 命令引擎（白名单 / 防注入 / 超时强杀），被现代 executor 委托调用
 * 以及 Monitor 内部使用的 mapToUnifiedState（状态归一）。
 *
 * 以下模块构成「老自主执行链」（Supervisor → UnifiedSmartRouter → DecisionEngine →
 * ActionExecutor → RiskController → SuggestionPusher 等），属于遗留实现：
 *   @deprecated 已被 apps/stage-tamagotchi 的 services/kitsune/overseer（TypeScript 编排层）
 *   的 executor/{loop,taskRunner,planner,acceptance} + permission 取代。生产路径不再调用，
 *   仅保留供 *.test.js 运行与历史参考。后续清理时可直接移除此导出组并删除对应文件。
 * 遗留模块清单（仅 test / 其它遗留模块引用，生产路径不引用）：UnifiedSmartRouter,
 * DecisionEngine, ActionExecutor, RiskController, SuggestionPusher, ProjectImprover,
 * CodeReviewer, AgenticTaskRunner, AutonomousAgentLoop, AutonomousTaskStore, AgentToolKit,
 * LLMEnhancer, LlDbAutoRecorder, LlDbRuleChecker, ProactiveNotifier, ArchDuplicationDetector,
 * DisturbancePolicy, BaseEventHandler, TaskPlanner。（注：原清单中的 MonitorStore 与
 * IdleDetector 并非死代码——supervisor.js 在运行时 require 二者，属活跃依赖，已保留。）
 * 上述遗留文件已于 2026-08-07 整体移出 src/ 至仓库根 `_dead_overseer_js_2026-08-07/`
 * （可还原），仅保留其对应测试/活跃节点的引用关系不变。
 */

const { Supervisor } = require('./supervisor')
const { TaskPusher, TOOL_ALLOWLIST } = require('./taskPusher')
const { ClaudeCodeMonitor } = require('./claudeCodeMonitor')
const { TraeMonitor } = require('./traeMonitor')
const { GenericAiToolMonitor, TOOL_PRESETS } = require('./genericAiToolMonitor')
const { Live2dStateBridge, loadEmotionMapping, DEFAULT_MAPPING_PATH } = require('./live2dStateBridge')
const { mapToUnifiedState } = require('./activityStates')

// ── 遗留自主执行链：不再导出（详见本文件顶部架构边界说明）──
// 这些模块构成老监工时代的「自主执行链」，已被 TS 编排层取代，生产路径不使用。
// 保留文件本身供 *.test.js 本地运行与历史参考，但停止对外暴露，防止新代码误用。
// const { SuggestionPusher } = require('./suggestionPusher')
// const { MonitorStore } = require('./monitorStore')
// const { IdleDetector } = require('./idleDetector')
// const { DisturbancePolicy, PRIORITY_LEVELS } = require('./disturbancePolicy')
// const { TaskStore } = require('./taskStore')
// const { TaskPlanner, AVAILABLE_TOOLS } = require('./taskPlanner')
// const { ActionExecutor } = require('./actionExecutor')
// const { RiskController } = require('./riskController')
// const { ProactiveNotifier } = require('./proactiveNotifier')
// const { UnifiedSmartRouter } = require('./unifiedSmartRouter')
// const { AutonomousAgentLoop } = require('./autonomousAgentLoop')
// const { AutonomousTaskStore } = require('./autonomousTaskStore')
// const { AgenticTaskRunner } = require('./agenticTaskRunner')
// const { AgentToolKit } = require('./agentToolKit')
// const { CodeReviewer } = require('./codeReviewer')
// const { ProjectImprover } = require('./projectImprover')
// const { ArchDuplicationDetector } = require('./archDuplicationDetector')
// const { LLMEnhancer } = require('./llmEnhancer')
// const { LlDbAutoRecorder } = require('./llDbAutoRecorder')
// const { LlDbRuleChecker } = require('./llDbRuleChecker')
// const { BaseEventHandler, SILENT_EVENTS } = require('./baseEventHandler')
// const { RISK_LEVELS, EVENT_RULES } = require('./routeConfig')

module.exports = {
  // ── 当前主进程生产路径实际消费的节点 ──
  Supervisor,
  TaskPusher,
  TOOL_ALLOWLIST,
  // 感知层 Monitor（供需要直接实例化的调用方使用）
  ClaudeCodeMonitor,
  TraeMonitor,
  GenericAiToolMonitor,
  TOOL_PRESETS,
  // Monitor 内部状态归一工具
  mapToUnifiedState,
  // 桌宠情绪映射桥接
  Live2dStateBridge,
  loadEmotionMapping,
  DEFAULT_MAPPING_PATH,
}
