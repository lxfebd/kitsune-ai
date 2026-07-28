/**
 * UnifiedSmartRouter — 统一智能路由器
 *
 * 替代原有的 AutoRouter + AutonomousAgentLoop 双模块架构，
 * 用单一入口处理所有监工事件，消除重复代码和运行时冲突。
 *
 * 核心设计：
 * - 继承 BaseEventHandler，复用事件过滤/频率控制/冷却期/队列
 * - 使用 DecisionEngine 进行决策（支持规则/LLM/混合模式）
 * - 复用已有的 ActionExecutor 执行动作（retry_last、auto_fix、log_result 等）
 * - 复用已有的 LLMEnhancer 进行 LLM 增强分析
 * - 保持与原有 API 路由完全兼容（getStatus、getHistory、setEnabled）
 *
 * 向后兼容：
 * - 保持 autoRouter / autonomous 相关 API 端点不变
 * - getStatus() 返回包含 stats、rulesCount 的完整状态
 * - getHistory() 返回执行历史记录
 */

const { BaseEventHandler } = require('./baseEventHandler');
const {
  RuleDecisionEngine,
  LLMDecisionEngine,
  HybridDecisionEngine,
} = require('./decisionEngine');
const { EVENT_RULES, RISK_LEVELS } = require('./routeConfig');

// 配置

const DEFAULT_CONFIG = {
  maxActionsPerHour: 60,
  cooldownMs: 5 * 60_000,
  maxHistory: 50,
};

class UnifiedSmartRouter extends BaseEventHandler {
  constructor({
    bus,
    taskPusher,
    proactiveNotifier,
    monitorStore,
    taskStore,
    actionExecutor,
    llmEnhancer,
    strategy = 'rules_first',  // 'rules_first' | 'llm_first' | 'rules_only'
    logger = console,
    ...rest
  } = {}) {
    super({
      bus,
      maxActionsPerHour: rest.maxActionsPerHour || DEFAULT_CONFIG.maxActionsPerHour,
      cooldownMs: rest.cooldownMs || DEFAULT_CONFIG.cooldownMs,
      logger,
    });

    this.proactiveNotifier = proactiveNotifier;
    this.monitorStore = monitorStore;
    this.taskStore = taskStore;
    this.actionExecutor = actionExecutor;
    this.strategy = strategy;

    // ── 决策引擎 ──
    const ruleEngine = new RuleDecisionEngine({ rules: EVENT_RULES });
    const llmEngine = llmEnhancer ? new LLMDecisionEngine({ llmEnhancer }) : null;

    if (strategy === 'llm_first' && llmEngine) {
      this.decisionEngine = new HybridDecisionEngine({
        ruleEngine,
        llmEngine,
        mode: 'llm_first',
        logger,
      });
    } else if (strategy === 'rules_first' && llmEngine) {
      this.decisionEngine = new HybridDecisionEngine({
        ruleEngine,
        llmEngine,
        mode: 'rules_first',
        logger,
      });
    } else {
      // rules_only 或 LLM 不可用
      this.decisionEngine = ruleEngine;
    }

    // ── 执行历史 ──
    this.history = [];
    this.maxHistory = rest.maxHistory || DEFAULT_CONFIG.maxHistory;
  }

  // 事件订阅

  _subscribeEvents() {
    if (!this.bus || typeof this.bus.subscribe !== 'function') return;

    // 监听监工反应事件（核心入口）
    this.bus.subscribe('supervisor.reaction', (event) => {
      this._onEvent(event);
    });

    // 审查完成事件
    this.bus.subscribe('overseer.review_completed', (event) => {
      this._onEvent({
        source: 'code_review',
        emotion: event.passed !== false ? 'completed' : 'error',
        activity: event.passed !== false ? 'completed' : 'error',
        action: 'review_done',
        message: event.summary || '',
        summary: event.summary || '',
        data: event,
      });
    });

    // 文件冲突事件
    this.bus.subscribe('watcher.conflict_detected', (event) => {
      this._onEvent({
        source: 'code_watcher',
        emotion: 'conflict_detected',
        activity: 'conflict_detected',
        action: 'conflict',
        message: `文件冲突: ${(event.conflicts || []).map(c => c.file).join(', ')}`,
        data: event,
      });
    });
  }

  // 事件处理

  async _processEvent(event) {
    const activity = this._extractActivity(event);
    this.logger.log?.(`[UnifiedSmartRouter] 处理: ${event.source} | ${activity}`);

    // 1. 决策分析
    const decision = await this.decisionEngine.analyze(event);
    if (!decision) {
      this.logger.log?.(`[UnifiedSmartRouter] 无决策: ${event.source} | ${activity}`);
      return;
    }

    this.logger.log?.(
      `[UnifiedSmartRouter] 决策: ${decision.action} ` +
      `(置信度: ${decision.confidence}, 风险: ${decision.risk || 'unknown'})`
    );

    // 2. 执行动作
    const result = await this._executeDecision(decision, event);

    // 3. 记录历史
    this._addHistory({
      id: `action-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      source: event.source,
      activity,
      risk: decision.risk || 'unknown',
      action: decision.action,
      title: decision.description,
      content: event.message || `${event.source}: ${activity}`,
      autoExecuted: RISK_LEVELS[decision.risk]?.autoExecute !== false,
      result: result?.ok ? 'success' : (result?.error || 'unknown'),
      timestamp: Date.now(),
    });

    // 4. 持久化
    if (this.monitorStore) {
      try {
        this.monitorStore.trackSuggestion('auto_routed', {
          risk: decision.risk,
          action: decision.action,
          strategy: this.strategy,
        });
      } catch {}
    }
  }

  // 决策执行

  async _executeDecision(decision, event) {
    const riskConfig = RISK_LEVELS[decision.risk] || RISK_LEVELS.low;

    // 1. 通知用户（medium/high 风险）
    if (riskConfig.notify) {
      this._notify(decision, event);
    }

    // 2. 自动执行（low/medium 风险）
    if (riskConfig.autoExecute && this.actionExecutor) {
      const result = await this.actionExecutor.execute(
        {
          action: decision.action,
          risk: decision.risk,
          description: decision.description,
        },
        event,
        { confirmed: true }
      );

      // LLM 决策的通知（带标题和内容）
      if (decision.data?.title) {
        this._notify(decision, event);
      }

      return result;
    }

    // 3. 高风险操作 — 仅通知
    if (!riskConfig.autoExecute) {
      this._notify(decision, event);
      return { ok: true, notified: true };
    }

    return { ok: true };
  }

  /**
   * 发送通知
   */
  _notify(decision, event) {
    const level = decision.risk === 'high' || decision.risk === 'critical' ? 'alert' : 'notify';
    const msg = {
      level,
      icon: '',
      title: decision.data?.title || decision.description,
      content: decision.data?.content || decision.reason || event.message || '',
      source: 'unified_smart_router',
      toolName: event.source,
      timestamp: Date.now(),
      type: 'auto_route',
      aiDecision: decision.data?.llmDecision || undefined,
    };

    // 推送到 ProactiveNotifier
    if (this.proactiveNotifier) {
      try { this.proactiveNotifier._pushMessage(msg); } catch {}
    }

    // 发布事件
    if (this.bus && typeof this.bus.publish === 'function') {
      try { this.bus.publish('unified_router.action', msg); } catch {}
    }
  }

  // 历史管理

  _addHistory(record) {
    this.history.push(record);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  /**
   * 获取历史 — 兼容原有的两种调用方式
   */
  getHistory(limitOrOpts = 20) {
    const limit = typeof limitOrOpts === 'number' ? limitOrOpts : (limitOrOpts?.limit || 20);
    return this.history.slice(-limit).reverse();
  }

  // 状态查询

  getStatus() {
    return {
      ...super.getStatus(),
      strategy: this.strategy,
      decisionEngine: this.decisionEngine.getStatus(),
      rulesCount: EVENT_RULES.length,
      historyLength: this.history.length,
    };
  }
}

module.exports = { UnifiedSmartRouter };
