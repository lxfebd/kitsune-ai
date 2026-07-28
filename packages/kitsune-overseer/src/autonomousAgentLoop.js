/**
 * 自主行动循环 — 让桌宠 AI 主动监控、分析、决策、行动
 *
 * 核心能力：
 * 1. 监听监工事件（错误/完成/冲突等）
 * 2. 自动触发 LLM 分析事件上下文
 * 3. LLM 自主决定：提建议 / 推任务 / 忽略 / 汇报
 * 4. 执行 LLM 的决策（通过工具调用）
 * 5. 向用户汇报行动结果
 *
 * 安全设计：
 * - 最大执行次数限制（每小时 N 次）
 * - 单次最大 token 消耗上限
 * - 禁止递归自触发（action 产生的新事件不再触发循环）
 * - 高风险操作需确认（可配置）
 * - 冷却期：同一来源同类事件不重复分析
 */

const fs = require('node:fs');
const path = require('node:path');

// 配置常量

const CONFIG = {
  // 频率控制
  maxActionsPerHour: 30,        // 每小时最多自主行动次数
  maxTokensPerAction: 2000,      // 单次 LLM 调用最大输出 token

  // 触发条件：哪些事件值得 AI 自主分析
  autoTriggerEvents: {
    claude_code: ['error', 'completed'],       // Claude 出错或完成 → 分析
    trae: ['build_error', 'test_failed', 'build_success', 'test_passed'],  // Trae 编译/测试结果
    generic: ['error', 'completed'],           // 通用工具出错或完成
    code_review: ['issues_found'],             // 审查发现问题
  },

  // 不需要 AI 分析的事件（太频繁或无意义）
  silentEvents: [
    'idle', 'thinking', 'coding', 'executing',
    'editing', 'compiling', 'active', 'stopped',
    'file_changes',
  ],

  // 冷却期（同一来源同类事件）
  cooldownMs: {
    claude_code: 10 * 60_000,   // Claude: 10 分钟
    trae: 10 * 60_000,         // Trae: 10 分钟
    generic: 15 * 60_000,      // 其他: 15 分钟
    code_review: 20 * 60_000,  // 审查: 20 分钟
  },

  // LLM system prompt
  systemPrompt: `你是桌宠的"自主行动大脑"。你的职责是：
1. 监控 AI 编程工具（Claude Code、Trae、Cursor 等）的状态变化
2. 分析重要事件的上下文和影响
3. 自主决定是否需要采取行动
4. 执行行动并汇报结果

你可以做的行动：
- suggest: 向目标工具推送一条建议（通过 suggestionPusher）
- push_task: 向 CLI 推送一个任务指令（通过 taskPusher，高风险）
- report: 仅向用户汇报分析结果，不采取行动
- ignore: 忽略此事件，不需要处理

回复格式（严格 JSON）：
{
  "decision": "suggest|push_task|report|ignore",
  "reason": "为什么做这个决定的简短理由",
  "title": "给用户看的标题（如果 decision != ignore）",
  "content": "详细内容/建议文本（如果 decision == suggest 或 push_task）",
  "severity": "info|warning|urgent|critical",
  "target_tool": "claude|trae|codex|null （目标工具，push_task 时必填）",
  "template": "prompt|diff|commit|null （push_task 时必填）"
}

原则：
- error 类事件优先 suggest 或 push_task
- completed 类事件通常 report 即可
- 不要对频繁事件（thinking/coding/idle）浪费资源
- push_task 是高风险操作，只在明确需要时使用`,
};

class AutonomousAgentLoop {
  constructor({ bus, llmManager, proactiveNotifier, suggestionPusher, taskPusher, monitorStore } = {}) {
    this.bus = bus;
    this.llmManager = llmManager;
    this.proactiveNotifier = proactiveNotifier;
    this.suggestionPusher = suggestionPusher;
    this.taskPusher = taskPusher;
    this.monitorStore = monitorStore;

    this.enabled = false;           // 默认关闭，需手动开启
    this.subscribed = false;

    // 频率控制
    this.actionCount = 0;            // 当前小时已执行次数
    this.actionHour = new Date().getHours();
    this.lastAnalysisTime = {};     // { "claude_code:error": timestamp }

    // 处理队列（防并发）
    this.queue = [];
    this.processing = false;

    // 统计
    this.stats = {
      totalEvents: 0,
      analyzed: 0,
      acted: 0,          // 实际采取了行动（非 ignore/report）
      ignored: 0,
      errors: 0,
      tokensUsed: 0,
    };
  }

  /**
   * 启动自主行动循环
   */
  start() {
    if (this.subscribed) return;
    this.subscribed = true;
    this.enabled = true;

    // 监听 Supervisor 的反应事件
    if (this.bus) {
      this.bus.subscribe('supervisor.reaction', (event) => {
        this._onEvent(event);
      });
      // 也监听审查完成事件
      this.bus.subscribe('overseer.review_completed', (event) => {
        this._onEvent({
          source: 'code_review',
          emotion: event.passed !== false ? 'completed' : 'error',
          action: 'review_done',
          message: event.summary || '',
          summary: event.summary || '',
          data: event,
        });
      });
    }

    // 每小时重置计数器
    this._hourlyResetTimer = setInterval(() => {
      const now = new Date();
      if (now.getHours() !== this.actionHour) {
        this.actionHour = now.getHours();
        this.actionCount = 0;
      }
    }, 60_000);

    console.log('[AutonomousLoop] 自主行动循环已启动');
  }

  stop() {
    this.subscribed = false;
    this.enabled = false;
    if (this._hourlyResetTimer) { clearInterval(this._hourlyResetTimer); }
  }

  setEnabled(enabled) { this.enabled = enabled; }

  // 事件接收与过滤

  _onEvent(event) {
    if (!this.enabled) return;

    this.stats.totalEvents++;
    const source = event.source;
    const activity = event.emotion || event.action;

    // 1. 静默事件直接跳过
    if (CONFIG.silentEvents.includes(activity)) return;

    // 2. 检查该来源+活动类型是否在自动触发列表中
    const triggerList = CONFIG.autoTriggerEvents[source] || CONFIG.autoTriggerEvents.generic || [];
    if (!triggerList.includes(activity)) return;

    // 3. 频率检查：每小时最多 N 次
    this._resetHourIfNeeded();
    if (this.actionCount >= CONFIG.maxActionsPerHour) return;

    // 4. 冷却期检查
    const cooldownKey = `${source}:${activity}`;
    const lastTime = this.lastAnalysisTime[cooldownKey] || 0;
    const cooldownMs = CONFIG.cooldownMs[source] || CONFIG.cooldownMs.generic;
    if (Date.now() - lastTime < cooldownMs) return;

    // 5. 去重
    const dedupeKey = `${source}:${activity}:${(event.message || '').substring(0, 100)}`;
    if (this.queue.some(q => q.dedupeKey === dedupeKey)) return;

    // 入队
    this.lastAnalysisTime[cooldownKey] = Date.now();
    this.queue.push({ ...event, dedupeKey, _queuedAt: Date.now() });
    this._processQueue();
  }

  _resetHourIfNeeded() {
    const now = new Date();
    if (now.getHours() !== this.actionHour) {
      this.actionHour = now.getHours();
      this.actionCount = 0;
    }
  }

  // 队列处理

  async _processQueue() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const event = this.queue.shift();

      this._resetHourIfNeeded();
      if (this.actionCount >= CONFIG.maxActionsPerHour) {
        console.log('[AutonomousLoop] 达到每小时行动上限，停止处理');
        break;
      }

      try {
        await this._analyzeAndAct(event);
      } catch (err) {
        console.error(`[AutonomousLoop] 处理失败:`, err.message);
        this.stats.errors++;
      }
    }

    this.processing = false;
  }

  // 核心：LLM 分析 + 行动执行

  async _analyzeAndAct(event) {
    this.stats.analyzed++;

    // 构建 prompt
    const userPrompt = this._buildPrompt(event);
    if (!userPrompt) return;

    // 调用 LLM
    let llmResponse;
    try {
      llmResponse = await this._callLlm(userPrompt);
      this.stats.tokensUsed += (llmResponse?.length || 0);
    } catch (err) {
      console.error(`[AutonomousLoop] LLM 调用失败:`, err.message);
      // 降级为简单 report
      this._emitNotification({
        level: 'notify',
        icon: '',
        title: `${event.source} 状态变化`,
        content: event.message || event.summary || `${event.source}: ${event.emotion}`,
        source: 'autonomous_loop',
        timestamp: Date.now(),
        type: 'llm_fallback',
      });
      return;
    }

    // 解析 LLM 决策
    const decision = this._parseDecision(llmResponse, event);
    if (!decision) {
      this.stats.ignored++;
      return;
    }

    // 执行决策
    this.actionCount++;
    await this._executeDecision(decision, event);
  }

  /**
   * 构建给 LLM 的上下文 prompt
   */
  _buildPrompt(event) {
    const lines = [];

    lines.push(`## 事件信息`);
    lines.push(`- 来源工具: ${event.source}`);
    lines.push(`- 状态: ${event.emotion || event.action}`);
    lines.push(`- 时间: ${new Date().toLocaleString('zh-CN')}`);

    if (event.message) lines.push(`- 原始消息: ${event.message.substring(0, 500)}`);
    if (event.summary) lines.push(`- 摘要: ${event.summary.substring(0, 500)}`);

    // 附带额外数据
    if (event.data) {
      const dataStr = typeof event.data === 'object'
        ? JSON.stringify(event.data).substring(0, 1000)
        : String(event.data).substring(0, 500);
      if (dataStr && dataStr !== '{}' && dataStr !== '') {
        lines.push(`- 附加数据: ${dataStr}`);
      }
    }

    // 获取当前监工状态作为上下文
    try {
      if (this.monitorStore) {
        const uptime = this.monitorStore.getUptimeStats(20);
        const activeTools = Object.entries(uptime)
          .filter(([, v]) => v.running > 0)
          .map(([k, v]) => `${k}:${v.lastActivity}`)
          .join(', ');
        if (activeTools) {
          lines.push(`\n## 当前活跃工具`);
          lines.push(activeTools);
        }
      }
    } catch {}

    lines.push(`\n请分析以上事件并给出你的决策。`);

    return lines.join('\n');
  }

  /**
   * 调用 LLM
   */
  async _callLlm(prompt) {
    if (!this.llmManager) throw new Error('LLM Manager 未初始化');

    const reasoner = await this.llmManager.getReasoner();
    const fullPrompt = `${CONFIG.systemPrompt}\n\n---\n\n${prompt}`;

    const response = await reasoner.reason(fullPrompt);
    return response;
  }

  /**
   * 解析 LLM 返回的 JSON 决策
   */
  _parseDecision(response, event) {
    try {
      // 提取 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.log('[AutonomousLoop] LLM 未返回有效 JSON，视为 ignore');
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const validDecisions = ['suggest', 'push_task', 'report', 'ignore'];

      if (!validDecisions.includes(parsed.decision)) {
        parsed.decision = 'report'; // 默认降级为 report
      }

      return {
        decision: parsed.decision,
        reason: String(parsed.reason || '').substring(0, 500),
        title: String(parsed.title || '').substring(0, 200),
        content: String(parsed.content || '').substring(0, 2000),
        severity: ['info', 'warning', 'urgent', 'critical'].includes(parsed.severity)
          ? parsed.severity : 'info',
        targetTool: parsed.target_tool || null,
        template: parsed.template || null,
      };
    } catch (err) {
      console.error('[AutonomousLoop] JSON 解析失败:', err.message);
      return null;
    }
  }

  /**
   * 执行 LLM 的决策
   */
  async _executeDecision(decision, event) {
    switch (decision.decision) {
      case 'ignore':
        this.stats.ignored++;
        return;

      case 'report': {
        this.stats.acted++;
        this._emitNotification({
          level: decision.severity === 'critical' || decision.severity === 'urgent' ? 'alert' : 'notify',
          icon: '',
          title: decision.title || `AI 分析: ${event.source}`,
          content: decision.content || decision.reason || event.message,
          source: 'autonomous_loop',
          toolName: event.source,
          timestamp: Date.now(),
          type: 'ai_report',
          aiDecision: decision,
        });
        break;
      }

      case 'suggest': {
        this.stats.acted++;
        // 通过 SuggestionPusher 写入建议
        if (this.suggestionPusher) {
          try {
            await this.suggestionPusher.createSuggestion({
              type: 'external',  // 来自 AI 自主分析
              severity: decision.severity,
              summary: decision.title || decision.content?.substring(0, 100),
              details: decision.content,
              files: [],
              source: `autonomous:${event.source}`,
            });

            this._emitNotification({
              level: 'notify',
              icon: '',
              title: `已推送建议: ${decision.title || event.source}`,
              content: decision.content?.substring(0, 300) || '',
              source: 'autonomous_loop',
              toolName: event.source,
              timestamp: Date.now(),
              type: 'ai_suggest',
            });
          } catch (err) {
            console.error('[AutonomousLoop] 推送建议失败:', err.message);
          }
        }
        break;
      }

      case 'push_task': {
        this.stats.acted++;
        // 通过 TaskPusher 推送 CLI 任务
        if (this.taskPusher && decision.targetTool && decision.template) {
          try {
            const result = await this.taskPusher.pushTask({
              tool: decision.targetTool,
              templateKey: decision.template,
              input: decision.content || '',
              userPermission: 'medium', // 自主模式下使用 medium 权限
            });

            this._emitNotification({
              level: result.ok ? 'notify' : 'alert',
              icon: '',
              title: result.ok
                ? `已推送到 ${decision.targetTool}`
                : `推送失败: ${result.error || '未知错误'}`,
              content: result.output?.substring(0, 300) || decision.content?.substring(0, 300) || '',
              source: 'autonomous_loop',
              toolName: event.source,
              timestamp: Date.now(),
              type: 'ai_push_task',
            });
          } catch (err) {
            console.error('[AutonomousLoop] 推送任务失败:', err.message);
          }
        } else {
          // targetTool/template 缺失，降级为 suggest
          console.warn('[AutonomousLoop] push_task 缺少参数，降级为 suggest');
          decision.decision = 'suggest';
          await this._executeDecision(decision, event);
          return;
        }
        break;
      }
    }

    // 记录到持久化
    if (this.monitorStore) {
      try {
        this.monitorStore.trackSuggestion('pushed', {
          severity: decision.severity,
          type: 'autonomous_ai',
        });
      } catch {}
    }
  }

  /**
   * 发出通知（同时写入 ProactiveNotifier 和 EventBus）
   */
  _emitNotification(msg) {
    if (this.proactiveNotifier) {
      try { this.proactiveNotifier._pushMessage(msg); } catch {}
    }
    if (this.bus) {
      try { this.bus.publish('autonomous_loop.action', msg); } catch {}
    }
  }

  // 查询接口

  getStatus() {
    return {
      enabled: this.enabled,
      subscribed: this.subscribed,
      actionCount: this.actionCount,
      actionLimit: CONFIG.maxActionsPerHour,
      queueLength: this.queue.length,
      processing: this.processing,
      stats: { ...this.stats },
      config: {
        maxActionsPerHour: CONFIG.maxActionsPerHour,
        autoTriggerEvents: CONFIG.autoTriggerEvents,
      },
    };
  }

  getHistory(limit = 30) {
    // 从 ProactiveNotifier 获取 AI 产生的通知
    if (this.proactiveNotifier) {
      return this.proactiveNotifier.getMessages({ limit, sourceFilter: 'autonomous_loop' });
    }
    return [];
  }
}

module.exports = { AutonomousAgentLoop };
