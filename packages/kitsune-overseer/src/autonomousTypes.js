/**
 * @fileoverview 自主任务（Agentic Collaboration）类型定义
 *
 * 本文件仅包含类型枚举与 JSDoc 类型注释，禁止包含业务逻辑实现。
 */

/** @typedef {'pending'|'running'|'paused'|'completed'|'failed'|'cancelled'} TaskStatus */
/** @typedef {'pending'|'running'|'completed'|'failed'|'skipped'} StepStatus */
/** @typedef {'strict'|'normal'|'autonomous'} RiskMode */

/** @typedef {'read'|'write'|'shell'|'network'|'browser'} ToolCategory */

/**
 * 自主任务记录
 * @typedef {Object} AutonomousTask
 * @property {string} id 任务唯一标识
 * @property {string} goal 用户原始目标
 * @property {TaskStatus} status 当前状态
 * @property {RiskMode} riskMode 风控模式
 * @property {PlanStep[]} plan 执行计划
 * @property {string[]} logs 运行日志
 * @property {number} createdAt 创建时间戳
 * @property {number} updatedAt 最后更新时间戳
 * @property {number|null} completedAt 完成/失败时间戳
 * @property {string} [result] 最终结果摘要
 * @property {string} [error] 失败原因
 */

/**
 * 计划步骤
 * @typedef {Object} PlanStep
 * @property {string} id 步骤唯一标识
 * @property {string} description 步骤描述（给人看）
 * @property {string} tool 要调用的工具名
 * @property {Object} params 工具参数
 * @property {StepStatus} status 步骤状态
 * @property {any} [result] 工具返回结果
 * @property {string} [error] 错误信息
 * @property {number|null} startedAt 开始时间戳
 * @property {number|null} completedAt 完成时间戳
 */

/**
 * 风控评估结果
 * @typedef {Object} RiskAssessment
 * @property {boolean} needsConfirm 是否需要用户确认
 * @property {ToolCategory} category 工具风险类别
 * @property {string} reason 评估理由
 * @property {'low'|'medium'|'high'} level 风险等级
 */

/**
 * 工具执行请求
 * @typedef {Object} ToolExecutionRequest
 * @property {string} taskId 所属任务 ID
 * @property {string} stepId 所属步骤 ID
 * @property {string} tool 工具名
 * @property {Object} params 工具参数
 * @property {ToolCategory} category 风险类别
 */

module.exports = {
  TASK_STATUS: Object.freeze(['pending', 'running', 'paused', 'completed', 'failed', 'cancelled']),
  STEP_STATUS: Object.freeze(['pending', 'running', 'completed', 'failed', 'skipped']),
  RISK_MODE: Object.freeze({ STRICT: 'strict', NORMAL: 'normal', AUTONOMOUS: 'autonomous' }),
  TOOL_CATEGORY: Object.freeze({ READ: 'read', WRITE: 'write', SHELL: 'shell', NETWORK: 'network', BROWSER: 'browser' }),
};
