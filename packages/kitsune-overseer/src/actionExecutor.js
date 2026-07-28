/**
 * 统一动作执行器
 * 负责执行各种自动操作：retry、fix、refactor 等
 *
 * 设计原则：
 * - 使用工厂函数创建标准化的任务推送处理器，避免重复代码
 * - 高风险操作需要 confirm=true 参数或用户确认
 * - 所有执行结果都写入 TaskStore
 * - 执行失败时自动记录到 TaskStore 的失败队列
 */

/**
 * 创建标准化的任务推送处理器
 *
 * Call stack:
 *
 * createTaskPushHandler
 *   -> handler (rule, event, options)
 *     -> buildPrompt(rule, event, options)
 *     -> this.taskPusher.pushTask({ tool, templateKey, input })
 *
 * @param {Object} config - 处理器配置
 * @param {string} config.actionName - 动作名称（用于日志）
 * @param {Function} config.buildPrompt - prompt 构建函数 (rule, event, options) => string
 * @param {string} [config.tool='claude'] - 目标工具
 * @param {string} [config.templateKey='prompt'] - 命令模板
 * @returns {Function} 动作处理器函数，绑定到 ActionExecutor 实例
 */
function createTaskPushHandler({
  actionName,
  buildPrompt,
  tool = 'claude',
  templateKey = 'prompt',
}) {
  return async function handler(rule, event, options) {
    // 检查 taskPusher 可用性
    if (!this.taskPusher) {
      return { ok: false, error: 'taskPusher not available' };
    }

    // 构建 prompt
    const prompt = buildPrompt.call(this, rule, event, options);

    // 记录日志
    this.logger.log?.(`[ActionExecutor] ${actionName}: ${event.source}`);

    // 推送任务
    const result = await this.taskPusher.pushTask({
      tool,
      templateKey,
      input: prompt,
    });

    return result;
  };
}

class ActionExecutor {
  constructor({ bus, broadcastBus, taskPusher, proactiveNotifier, taskStore, logger = console }) {
    this.bus = bus;
    this.broadcastBus = broadcastBus;
    this.taskPusher = taskPusher;
    this.proactiveNotifier = proactiveNotifier;
    this.taskStore = taskStore;
    this.logger = logger;

    // 动作处理器映射
    this._handlers = {
      retry_last: this._handleRetryLast.bind(this),
      log_result: this._handleLogResult.bind(this),
      // 使用工厂函数创建标准化处理器
      auto_fix: createTaskPushHandler({
        actionName: '自动修复',
        buildPrompt: (rule, event) =>
          `检测到错误: ${event.message || event.emotion || '未知错误'}\n\n请分析错误原因并修复这个问题。`,
      }).bind(this),
      refactor_code: createTaskPushHandler({
        actionName: '执行重构',
        buildPrompt: (rule, event) =>
          `代码重构建议:\n${event.message || event.summary || ''}\n\n请分析代码并执行重构。`,
      }).bind(this),
      update_deps: createTaskPushHandler({
        actionName: '更新依赖',
        buildPrompt: () =>
          '请检查并更新项目依赖到最新兼容版本。',
      }).bind(this),
    };

    // 高风险操作列表
    this._highRiskActions = new Set(['refactor_code', 'update_deps']);
  }

  /**
   * 执行动作
   * @param {Object} rule - 事件规则
   * @param {Object} event - 事件数据
   * @param {Object} options - 执行选项
   * @param {boolean} options.confirmed - 用户已确认（高风险操作需要）
   * @returns {Object} 执行结果
   */
  async execute(rule, event, options = {}) {
    const { action } = rule;
    const handler = this._handlers[action];

    if (!handler) {
      this.logger.warn?.(`[ActionExecutor] 未知动作: ${action}`);
      return { ok: false, error: 'unknown_action' };
    }

    // 高风险操作需要确认
    if (this._highRiskActions.has(action) && !options.confirmed) {
      this.logger.log?.(`[ActionExecutor] 高风险操作需要确认: ${action}`);
      return this._enqueueConfirmation(rule, event);
    }

    try {
      const result = await handler(rule, event, options);

      // 写入 TaskStore
      if (this.taskStore) {
        await this.taskStore.recordAction({
          action,
          source: event.source,
          risk: rule.risk,
          result,
          event,
        });
      }

      if (this.broadcastBus) this.broadcastBus.publish('action', { action, result, event });
      return result;
    } catch (err) {
      this.logger.error?.(`[ActionExecutor] 执行失败: ${action}`, err.message);

      // 记录失败
      if (this.taskStore) {
        await this.taskStore.recordAction({
          action,
          source: event.source,
          risk: rule.risk,
          result: { ok: false, error: err.message },
          event,
        });
      }

      return { ok: false, error: err.message };
    }
  }

  // 特殊动作处理器（不适用于工厂模式）

  /**
   * 重试上次失败的任务
   * 需要查询 TaskStore 获取最近失败的任务，逻辑特殊
   */
  async _handleRetryLast(rule, event) {
    if (!this.taskPusher || !this.taskStore) {
      return { ok: false, error: 'taskPusher or taskStore not available' };
    }

    const lastFailed = await this.taskStore.getLastFailedTask(event.source);
    if (!lastFailed) {
      this.logger.log?.(`[ActionExecutor] 没有找到最近失败的任务: ${event.source}`);
      return { ok: false, error: 'no_failed_task_found' };
    }

    this.logger.log?.(`[ActionExecutor] 重试上次失败的任务: ${lastFailed.action}`);

    const result = await this.taskPusher.pushTask({
      tool: lastFailed.result?.tool || 'claude',
      templateKey: 'prompt',
      input: lastFailed.event?.message || '请重试上次失败的操作',
    });

    return result;
  }

  /**
   * 记录结果（仅日志，不推送任务）
   */
  async _handleLogResult(rule, event) {
    this.logger.log?.(`[ActionExecutor] 任务完成: ${event.source} - ${event.message}`);
    return { ok: true, logged: true };
  }

  // 辅助方法

  /**
   * 将高风险操作加入确认队列
   */
  _enqueueConfirmation(rule, event) {
    const confirmation = {
      id: `confirm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      rule,
      event,
      createdAt: Date.now(),
      status: 'pending',
    };

    // 发布确认请求事件
    if (this.bus) {
      try {
        this.bus.publish('action.confirm_required', confirmation);
      } catch {}
    }

    // 通知用户
    if (this.proactiveNotifier) {
      this.proactiveNotifier._pushMessage({
        level: 'alert',
        icon: '',
        title: '需要确认',
        content: `高风险操作需要确认: ${rule.description}`,
        source: 'action_executor',
        timestamp: Date.now(),
        type: 'confirmation_required',
        data: confirmation,
      });
    }

    return { ok: false, requiresConfirmation: true, confirmation };
  }
}

module.exports = { ActionExecutor };
