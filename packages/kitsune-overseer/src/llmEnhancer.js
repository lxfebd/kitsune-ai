/**
 * LLM 决策增强模块
 *
 * 不再独立调用 LLM，而是将需要增强决策的事件推送给主 AI（Agent Loop）
 * 由主 AI 通过已配置的 provider 统一决策，避免双轨 LLM 配置问题。
 *
 * 工作模式：
 * - auto: 仅规则引擎（默认）
 * - enhanced: 规则引擎 + 主 AI 增强（事件注入 systemQueue，主 AI 在下轮循环中决策）
 * - llm_first: 主 AI 优先，规则作为 fallback
 *
 * 降级策略：
 * - pushSystemMessage 不可用：降级到规则引擎
 */

class LLMEnhancer {
  /**
   * @param {Object} opts
   * @param {EventBus} opts.bus - EventBus 实例
   * @param {BroadcastBus} opts.broadcastBus - 广播总线（可注入主 AI 上下文）
   * @param {Function} [opts.pushSystemMessage] - 主 AI 的系统消息注入函数（来自 AICoreRunner）
   * @param {Object} opts.actionExecutor - 动作执行器
   * @param {Object} opts.proactiveNotifier - 主动通知器
   * @param {Object} opts.taskStore - 任务存储
   * @param {Object} [opts.llmManager] - 保留兼容（不再用于自主 LLM 调用）
   * @param {Object} [logger=console]
   */
  constructor({ bus, broadcastBus, pushSystemMessage, actionExecutor, proactiveNotifier, taskStore, llmManager, logger = console }) {
    this.bus = bus;
    this.broadcastBus = broadcastBus;
    this.pushSystemMessage = pushSystemMessage; // 主 AI 注入点
    this.actionExecutor = actionExecutor;
    this.proactiveNotifier = proactiveNotifier;
    this.taskStore = taskStore;
    this.llmManager = llmManager; // 兼容保留，不再用于 analyze()
    this.logger = logger;

    this.enabled = false;
    this.mode = 'auto';  // auto | enhanced | llm_first

    // 频率控制
    this.actionCount = 0;
    this.actionHour = new Date().getHours();
    this.maxActionsPerHour = 30;

    // 冷却期
    this.cooldownMap = new Map();
    this.cooldownMs = 10 * 60_000;  // 10 分钟

    // 统计
    this.stats = {
      totalEvents: 0,
      delegatedToMainAI: 0,
      decisions: 0,
      errors: 0,
      fallbackToRules: 0,
    };
  }

  setMode(mode) {
    if (['auto', 'enhanced', 'llm_first'].includes(mode)) {
      this.mode = mode;
      this.logger.log?.(`[LLMEnhancer] 模式切换: ${mode}`);
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (enabled && this.mode === 'auto') {
      this.mode = 'enhanced';
    }
  }

  /**
   * 分析事件 — enhanced/llm_first 模式下委托主 AI 决策
   */
  async analyze(event, ruleMatch = null) {
    if (!this.enabled || this.mode === 'auto') {
      return null;
    }

    if (this.mode === 'enhanced' && ruleMatch) {
      return null; // 规则能处理就不打扰主 AI
    }

    // 频率限制
    this._checkHourlyReset();
    if (this.actionCount >= this.maxActionsPerHour) {
      this.stats.fallbackToRules++;
      return null;
    }

    // 冷却期检查
    const cooldownKey = `${event.source}:${event.activity || event.emotion}`;
    const now = Date.now();
    const lastTime = this.cooldownMap.get(cooldownKey) || 0;
    if (now - lastTime < this.cooldownMs) {
      return null;
    }

    // 主 AI 注入点不可用 → 降级规则
    if (!this.pushSystemMessage) {
      this.stats.fallbackToRules++;
      return null;
    }

    try {
      this.stats.totalEvents++;

      // 格式化事件为系统消息，推入主 AI 上下文
      const msg = this._formatForMainAI(event);
      this.pushSystemMessage(msg);
      this.stats.delegatedToMainAI++;
      this.cooldownMap.set(cooldownKey, now);
      this.actionCount++;

      // 返回 null 表示"已委托"，不阻塞规则引擎的默认行为
      // 主 AI 决策结果会在后续循环中通过 broadcastBus 或工具调用来体现
      return null;
    } catch (err) {
      this.logger.error?.(`[LLMEnhancer] 委托主 AI 失败:`, err.message);
      this.stats.errors++;
      this.stats.fallbackToRules++;
      return null;
    }
  }

  /**
   * 执行决策（由外部调用，如主 AI 返回了明确指令时）
   */
  async executeDecision(decision, event) {
    if (!decision || !this.actionExecutor) {
      return { ok: false, error: 'no decision or actionExecutor' };
    }

    const rule = {
      action: this._mapDecisionToAction(decision),
      risk: decision.severity === 'critical' ? 'high' : 'medium',
      description: decision.title || 'AI 决策',
    };

    const result = await this.actionExecutor.execute(rule, event, { confirmed: true });

    if (this.proactiveNotifier) {
      this.proactiveNotifier._pushMessage({
        level: decision.severity === 'critical' ? 'alert' : 'notify',
        icon: '',
        title: decision.title || `AI 分析: ${event.source}`,
        content: decision.content || decision.reason,
        source: 'main_ai', // 标记来源为主 AI
        toolName: event.source,
        timestamp: Date.now(),
        type: 'ai_decision',
        data: { decision, result },
      });
    }

    if (this.broadcastBus) {
      this.broadcastBus.publish('ai_decision', { decision, event, result });
    }

    this.stats.decisions++;
    return result;
  }

  getStatus() {
    return {
      enabled: this.enabled,
      mode: this.mode,
      hasPushSystemMessage: !!this.pushSystemMessage,
      actionCount: this.actionCount,
      actionLimit: this.maxActionsPerHour,
      stats: { ...this.stats },
    };
  }

  // ── 内部方法 ──

  _formatForMainAI(event) {
    const lines = [
      `[感知决策请求] 检测到以下事件，请决定桌宠反应：`,
      `- 来源: ${event.source}`,
      `- 状态: ${event.activity || event.emotion || 'unknown'}`,
    ];
    if (event.message || event.summary) {
      lines.push `- 详情: ${event.message || event.summary}`;
    }
    if (event.data) {
      const dataStr = JSON.stringify(event.data).substring(0, 300);
      lines.push(`- 数据: ${dataStr}`);
    }
    lines.push(
      `可选反应: 表情变化(Thinking/Happy/Worry/Sleepy)、动作(nod/celebrate/concern/sleep)、或忽略此事件。`
    );
    return lines.join('\n');
  }

  _mapDecisionToAction(decision) {
    const mapping = {
      suggest: 'auto_fix',
      fix: 'auto_fix',
      refactor: 'refactor_code',
      schedule_task: 'log_result',
      report: 'log_result',
    };
    return mapping[decision.decision] || 'log_result';
  }

  _checkHourlyReset() {
    const now = new Date();
    if (now.getHours() !== this.actionHour) {
      this.actionHour = now.getHours();
      this.actionCount = 0;
    }
  }
}

module.exports = { LLMEnhancer };
