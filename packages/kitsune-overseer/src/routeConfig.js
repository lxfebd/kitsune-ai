/**
 * routeConfig.js — 事件路由规则与风险等级定义
 *
 * 从 autoRouter.js 提取的纯配置数据，避免循环依赖。
 * 被 decisionEngine.js、unifiedSmartRouter.js、autoRouter.js 共同引用。
 */

// 风险等级定义

const RISK_LEVELS = {
  low: { autoExecute: true, notify: false, label: '低风险' },
  medium: { autoExecute: true, notify: true, label: '中风险' },
  high: { autoExecute: false, notify: true, label: '高风险' },
};

// 事件 → 风险等级 + 自动修复动作映射

const EVENT_RULES = [
  // ── Claude Code 事件 ──
  { source: 'claude_code', activity: 'error', risk: 'medium', action: 'retry_last', description: 'Claude Code 执行出错，自动重试' },
  { source: 'claude_code', activity: 'completed', risk: 'low', action: 'log_result', description: 'Claude Code 完成任务，记录结果' },

  // ── Trae 事件 ──
  { source: 'trae', activity: 'build_error', risk: 'medium', action: 'auto_fix', description: '编译错误，自动修复' },
  { source: 'trae', activity: 'test_failed', risk: 'medium', action: 'auto_fix', description: '测试失败，自动修复' },
  { source: 'trae', activity: 'build_success', risk: 'low', action: 'log_result', description: '编译成功' },
  { source: 'trae', activity: 'test_passed', risk: 'low', action: 'log_result', description: '测试通过' },
  { source: 'trae', activity: 'error', risk: 'medium', action: 'retry_last', description: 'Trae 执行出错，自动重试' },
  { source: 'trae', activity: 'completed', risk: 'low', action: 'log_result', description: 'Trae 完成任务' },

  // ── Cursor 事件 ──
  { source: 'cursor', activity: 'error', risk: 'medium', action: 'retry_last', description: 'Cursor 执行出错，自动重试' },
  { source: 'cursor', activity: 'completed', risk: 'low', action: 'log_result', description: 'Cursor 完成任务' },

  // ── Windsurf 事件 ──
  { source: 'windsurf', activity: 'error', risk: 'medium', action: 'retry_last', description: 'Windsurf 执行出错，自动重试' },
  { source: 'windsurf', activity: 'completed', risk: 'low', action: 'log_result', description: 'Windsurf 完成任务' },

  // ── 代码审查事件 ──
  { source: 'code_review', activity: 'error', risk: 'high', action: 'notify_review_issue', description: '代码审查发现问题' },
  { source: 'code_review', activity: 'completed', risk: 'low', action: 'log_result', description: '代码审查完成' },

  // ── 通用工具事件（兜底规则）──
  { source: 'generic', activity: 'error', risk: 'medium', action: 'retry_last', description: '工具执行出错' },
  { source: 'generic', activity: 'completed', risk: 'low', action: 'log_result', description: '工具执行完成' },

  // ── 文件冲突 ──
  { source: 'code_watcher', activity: 'conflict_detected', risk: 'high', action: 'notify_conflict', description: '检测到文件冲突，需手动解决' },
];

module.exports = { RISK_LEVELS, EVENT_RULES };
