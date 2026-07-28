/**
 * DecisionEngine — 统一决策引擎接口
 *
 * 统一 AutoRouter（规则引擎）和 AutonomousAgentLoop（LLM）的决策逻辑，
 * 消除两者各自实现决策的重复。
 *
 * 支持三种模式：
 * - rules: 仅规则引擎（快速、确定性）
 * - llm: 仅 LLM 分析（灵活、上下文感知）
 * - hybrid: 规则优先 + LLM 补充（默认，兼顾速度和智能）
 *
 * 降级策略：
 * - LLM 不可用 → 回退到规则引擎
 * - LLM 超时/错误 → 回退到规则引擎
 * - 规则不匹配 → 尝试 LLM（hybrid 模式）
 */

const { EVENT_RULES } = require('./routeConfig');

// 决策结果

class Decision {
  constructor({ action, reason, confidence, risk, description, data = {} }) {
    this.action = action;           // 'auto_fix' | 'retry_last' | 'log_result' | 'suggest' | 'report' | 'ignore' | 'notify_review_issue' | 'notify_conflict'
    this.reason = reason;
    this.confidence = confidence;   // 0-1
    this.risk = risk;               // 'low' | 'medium' | 'high'
    this.description = description; // 人类可读描述
    this.data = data;               // 附加数据
  }
}

// 规则决策引擎

class RuleDecisionEngine {
  constructor({ rules = EVENT_RULES } = {}) {
    this.rules = rules;
  }

  getName() { return 'RuleDecisionEngine'; }

  /**
   * 匹配事件对应的规则，返回 Decision
   * @param {Object} event - 事件数据
   * @returns {Promise<Decision|null>} 匹配到的决策，null 表示无匹配规则
   */
  async analyze(event) {
    const source = event.source;
    const activity = event.activity || event.emotion || event.action;

    const rule = this.rules.find(r => r.source === source && r.activity === activity)
      || this.rules.find(r => r.source === 'generic' && r.activity === activity);

    if (!rule) return null;

    return new Decision({
      action: rule.action,
      reason: rule.description,
      confidence: 1.0,
      risk: rule.risk,
      description: rule.description,
      data: { rule },
    });
  }

  getStatus() {
    return { name: this.getName(), rulesCount: this.rules.length };
  }
}

// LLM 决策引擎（委托给 LLMEnhancer）

class LLMDecisionEngine {
  /**
   * @param {Object} llmEnhancer - 已有的 LLMEnhancer 实例（复用，不重复造轮子）
   */
  constructor({ llmEnhancer } = {}) {
    this.llmEnhancer = llmEnhancer;
  }

  getName() { return 'LLMDecisionEngine'; }

  /**
   * 分析事件，返回 LLM 生成的 Decision
   * @param {Object} event - 事件数据
   * @returns {Promise<Decision|null>} LLM 决策，null 表示 LLM 决定忽略或不可用
   */
  async analyze(event) {
    if (!this.llmEnhancer || !this.llmEnhancer.enabled) return null;

    const llmDecision = await this.llmEnhancer.analyze(event);
    if (!llmDecision) return null;

    // 将 LLMEnhancer 的 decision 格式转换为统一 Decision 格式
    const action = this._mapAction(llmDecision.decision);

    return new Decision({
      action,
      reason: llmDecision.reason || '',
      confidence: 0.8,
      risk: llmDecision.severity === 'critical' ? 'high' : 'medium',
      description: llmDecision.title || `LLM 分析: ${event.source}`,
      data: {
        title: llmDecision.title,
        content: llmDecision.content,
        severity: llmDecision.severity,
        targetTool: llmDecision.targetTool,
        files: llmDecision.files,
        llmDecision,
      },
    });
  }

  _mapAction(decision) {
    const mapping = {
      suggest: 'auto_fix',
      fix: 'auto_fix',
      refactor: 'auto_fix',
      schedule_task: 'log_result',
      report: 'log_result',
      push_task: 'auto_fix',
    };
    return mapping[decision] || 'log_result';
  }

  getStatus() {
    return {
      name: this.getName(),
      enabled: this.llmEnhancer?.enabled || false,
      mode: this.llmEnhancer?.mode || 'unknown',
    };
  }
}

// 混合决策引擎（路由器）

class HybridDecisionEngine {
  /**
   * @param {Object} options
   * @param {RuleDecisionEngine} options.ruleEngine
   * @param {LLMDecisionEngine} options.llmEngine
   * @param {string} options.mode - 'rules_first' | 'llm_first'
   * @param {Function} options.logger
   */
  constructor({ ruleEngine, llmEngine, mode = 'rules_first', logger = console }) {
    this.ruleEngine = ruleEngine;
    this.llmEngine = llmEngine;
    this.mode = mode;
    this.logger = logger;

    this.stats = {
      totalDecisions: 0,
      ruleHits: 0,
      llmHits: 0,
      llmFallbacks: 0,
    };
  }

  getName() { return 'HybridDecisionEngine'; }

  async analyze(event) {
    this.stats.totalDecisions++;

    if (this.mode === 'llm_first') {
      return this._llmFirst(event);
    }
    return this._rulesFirst(event);
  }

  /**
   * 规则优先策略：先规则，规则不匹配再 LLM
   */
  async _rulesFirst(event) {
    // 1. 尝试规则引擎
    const ruleDecision = await this.ruleEngine.analyze(event);
    if (ruleDecision) {
      this.stats.ruleHits++;
      return ruleDecision;
    }

    // 2. 规则不匹配，尝试 LLM
    if (this.llmEngine) {
      try {
        const llmDecision = await this.llmEngine.analyze(event);
        if (llmDecision) {
          this.stats.llmHits++;
          return llmDecision;
        }
      } catch (err) {
        this.logger.error?.(`[HybridDecisionEngine] LLM 降级:`, err.message);
        this.stats.llmFallbacks++;
      }
    }

    return null;
  }

  /**
   * LLM 优先策略：先 LLM，LLM 失败再用规则
   */
  async _llmFirst(event) {
    // 1. 尝试 LLM
    if (this.llmEngine) {
      try {
        const llmDecision = await this.llmEngine.analyze(event);
        if (llmDecision) {
          this.stats.llmHits++;
          return llmDecision;
        }
      } catch (err) {
        this.logger.error?.(`[HybridDecisionEngine] LLM 失败，降级到规则:`, err.message);
        this.stats.llmFallbacks++;
      }
    }

    // 2. LLM 未返回结果，使用规则
    const ruleDecision = await this.ruleEngine.analyze(event);
    if (ruleDecision) {
      this.stats.ruleHits++;
      return ruleDecision;
    }

    return null;
  }

  getStatus() {
    return {
      name: this.getName(),
      mode: this.mode,
      ruleEngine: this.ruleEngine.getStatus(),
      llmEngine: this.llmEngine?.getStatus() || null,
      stats: { ...this.stats },
    };
  }
}

module.exports = {
  Decision,
  RuleDecisionEngine,
  LLMDecisionEngine,
  HybridDecisionEngine,
};
