/**
 * 统一活动状态枚举 — 消除 Monitor → CodeReviewer/AutoRouter 的状态格式断裂
 *
 * 所有 Monitor 发送的 hooks.state_updated 事件中的 state 字段
 * 必须使用此处定义的统一枚举值。
 *
 * 原问题：
 *   ClaudeCodeMonitor 发送 'thinking'/'coding'/'executing'/'completed'/'error'
 *   TraeMonitor 发送 'compiling'/'build_success'/'build_error'/'editing'/'test_passed'/'test_failed'
 *   CodeReviewer 只接受 'tool_use'/'complete'/'editing'/'build_success'/'build_error'/'compiling'/'test_passed'/'test_failed'/'file_changes'/'stopped'
 *   → 大部分状态对不上，审查永远不触发
 *
 * 解决方案：
 *   所有 Monitor 统一发送下方的 STATE 值，下游消费者统一用 REVIEWABLE_STATES 判断
 */

// 统一状态枚举

const STATE = {
  IDLE:      'idle',
  THINKING:  'thinking',
  CODING:    'coding',
  EXECUTING: 'executing',
  BUILDING:  'building',
  TESTING:   'testing',
  COMPLETED: 'completed',
  ERROR:     'error',
  STOPPED:   'stopped',
  CODE_CHANGED: 'code_changed',
};

// 需要触发代码审查的状态

const REVIEWABLE_STATES = new Set([
  STATE.THINKING,
  STATE.CODING,
  STATE.EXECUTING,
  STATE.BUILDING,
  STATE.TESTING,
  STATE.COMPLETED,
  STATE.ERROR,
  STATE.STOPPED,
  STATE.CODE_CHANGED,
]);

// 需要触发自动路由的状态

const ROUTABLE_STATES = new Set([
  STATE.ERROR,
  STATE.COMPLETED,
  STATE.BUILDING,
  STATE.TESTING,
  STATE.CODE_CHANGED,
]);

// 需要主动通知用户的状态

const NOTIFYABLE_STATES = new Set([
  STATE.ERROR,
  STATE.COMPLETED,
]);

// 各 Monitor 的原始状态 → 统一状态映射表

// Claude Code Monitor 原始状态映射
const CLAUDE_ACTIVITY_MAP = {
  thinking:   STATE.THINKING,
  coding:     STATE.CODING,
  executing:  STATE.EXECUTING,
  completed:  STATE.COMPLETED,
  error:      STATE.ERROR,
  active:     STATE.EXECUTING,
  idle:       STATE.IDLE,
  code_changed: STATE.CODE_CHANGED,
  stopped:    STATE.STOPPED,
};

// Trae Monitor 原始状态映射
const TRAE_ACTIVITY_MAP = {
  compiling:    STATE.BUILDING,
  build_success: STATE.COMPLETED,
  build_error:   STATE.ERROR,
  editing:       STATE.CODING,
  test_passed:   STATE.COMPLETED,
  test_failed:   STATE.ERROR,
  file_changes:  STATE.CODING,
  idle:          STATE.IDLE,
  stopped:       STATE.STOPPED,
  active:        STATE.EXECUTING,
};

// 通用工具 Monitor 原始状态映射
const GENERIC_ACTIVITY_MAP = {
  thinking:   STATE.THINKING,
  coding:     STATE.CODING,
  executing:  STATE.EXECUTING,
  completed:  STATE.COMPLETED,
  error:      STATE.ERROR,
  active:     STATE.EXECUTING,
  editing:    STATE.CODING,
  idle:       STATE.IDLE,
  file_changes: STATE.CODING,
  stopped:    STATE.STOPPED,
};

/**
 * 将 Monitor 原始 activity 映射到统一状态
 * @param {string} rawActivity - Monitor 检测到的原始状态
 * @param {'claude'|'trae'|'generic'} monitorType - Monitor 类型
 * @returns {string} 统一状态值
 */
function mapToUnifiedState(rawActivity, monitorType = 'generic') {
  const maps = {
    claude: CLAUDE_ACTIVITY_MAP,
    trae: TRAE_ACTIVITY_MAP,
    generic: GENERIC_ACTIVITY_MAP,
  };
  const map = maps[monitorType] || maps.generic;
  return map[rawActivity] || STATE.IDLE;
}

module.exports = {
  STATE,
  REVIEWABLE_STATES,
  ROUTABLE_STATES,
  NOTIFYABLE_STATES,
  CLAUDE_ACTIVITY_MAP,
  TRAE_ACTIVITY_MAP,
  GENERIC_ACTIVITY_MAP,
  mapToUnifiedState,
};
