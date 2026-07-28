/**
 * 建议推送模块（Phase 2: 智能打扰策略）
 *
 * 职责：
 * 1. 监听 EventBus 的 overseer 事件（代码审查结果、冲突告警、规则命中）
 * 2. 通过 DisturbancePolicy 判断是否允许推送
 * 3. 使用优先级队列管理被拦截的建议
 * 4. 用户状态变化时自动重试队列中的高优先级建议
 * 5. 写入 .agentpet/suggestions/ 目录供 AI 工具读取
 *
 * 优先级：critical > urgent > normal
 * 冷静期：连续忽略后延长推送间隔
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { DisturbancePolicy, PRIORITY_LEVELS } = require('./disturbancePolicy');

const QUEUE_TIMEOUT_MS = 10 * 60 * 1000; // 队列中建议超时 10 分钟
const QUEUE_FLUSH_INTERVAL_MS = 65 * 1000; // 定期刷新队列间隔 65 秒（略大于 DisturbancePolicy.minPushIntervalMs=60s）

class SuggestionPusher {
  constructor({
    bus,
    broadcastBus,
    projectDir = process.cwd(),
    logger = console,
    disturbancePolicy = null,
  }) {
    this.bus = bus;
    this.broadcastBus = broadcastBus;
    this.projectDir = projectDir;
    this.logger = logger;
    this._suggestionsDir = path.join(projectDir, '.trae', 'suggestions');
    this._subscriptions = [];

    // 策略引擎
    this._policy = disturbancePolicy || new DisturbancePolicy({ logger });

    // 优先级队列（按优先级排序）
    this._queue = []; // [{ suggestion, priority, enqueueTime }]

    // 定期刷新队列的定时器
    this._flushTimer = null;

    // 监听用户状态变化，自动重试队列
    this._setupStateListener();
  }

  /**
   * 监听用户状态变化，触发队列重试
   */
  _setupStateListener() {
    if (!this.bus) return;

    this._subscriptions.push(
      this.bus.subscribe('activity.context_changed', (context) => {
        this._policy.updateUserState(context);
        this._retryQueuedSuggestions();
      })
    );
  }

  async start() {
    await fsp.mkdir(this._suggestionsDir, { recursive: true });

    if (this.bus) {
      // 监听代码审查结果
      this._subscriptions.push(
        this.bus.subscribe('overseer.review_completed', (payload) => {
          this._handleReviewResult(payload);
        })
      );

      // 监听冲突告警
      this._subscriptions.push(
        this.bus.subscribe('watcher.conflict_detected', (payload) => {
          this._handleConflict(payload);
        })
      );

      // 监听 LL-DB 规则命中
      this._subscriptions.push(
        this.bus.subscribe('overseer.rule_hit', (payload) => {
          this._handleRuleHit(payload);
        })
      );

      // 监听 AI 工具 error 事件
      this._subscriptions.push(
        this.bus.subscribe('hooks.state_updated', (payload) => {
          if (payload?.state === 'error') {
            this._handleError(payload);
          }
        })
      );
    }

    this.logger.log('[SuggestionPusher] 启动（智能打扰策略已启用）');

    // 启动定期刷新队列的定时器
    this._startFlushTimer();
  }

  /**
   * 启动定期刷新队列的定时器
   * 防止 activity.context_changed 事件长期不触发导致队列建议超时丢弃
   */
  _startFlushTimer() {
    this._stopFlushTimer();
    this._flushTimer = setInterval(() => {
      if (this._queue.length > 0) {
        this.logger.log?.(`[SuggestionPusher] 定期刷新队列 (${this._queue.length} 条待处理)`);
        this._retryQueuedSuggestions();
      }
    }, QUEUE_FLUSH_INTERVAL_MS);
  }

  _stopFlushTimer() {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
  }

  stop() {
    this._stopFlushTimer();
    for (const unsub of this._subscriptions) {
      if (typeof unsub === 'function') unsub();
    }
    this._subscriptions = [];
    this._queue = [];
    this.logger.log('[SuggestionPusher] 已停止');
  }

  /**
   * 推送建议（带策略判断和优先级队列）
   */
  async _pushSuggestion(suggestion, priority = 'normal') {
    const { allowed, reason } = this._policy.shouldPush(priority);

    if (allowed) {
      await this._writeSuggestion(suggestion);
      if (suggestion.type === 'code_review') {
        await this._appendToAiInstructions(suggestion);
      }
      this._policy.recordPush();
      this.logger.log?.(`[SuggestionPusher] 建议已推送: ${suggestion.type} (priority: ${priority})`);
      if (this.broadcastBus) this.broadcastBus.publish('suggestion', suggestion);
      return true;
    }

    // 被策略拦截，入队等待
    this._enqueue(suggestion, priority);
    this.logger.log?.(`[SuggestionPusher] 建议被拦截，入队: ${suggestion.type} (reason: ${reason})`);
    return false;
  }

  /**
   * 入队建议（按优先级排序）
   */
  _enqueue(suggestion, priority = 'normal') {
    const entry = {
      suggestion,
      priority,
      priorityLevel: PRIORITY_LEVELS[priority] ?? PRIORITY_LEVELS.normal,
      enqueueTime: Date.now(),
    };

    // 按优先级插入（数值小的优先级高）
    let insertIndex = this._queue.length;
    for (let i = 0; i < this._queue.length; i++) {
      if (entry.priorityLevel < this._queue[i].priorityLevel) {
        insertIndex = i;
        break;
      }
    }
    this._queue.splice(insertIndex, 0, entry);
  }

  /**
   * 重试队列中的建议（用户状态变化时调用）
   */
  async _retryQueuedSuggestions() {
    if (this._queue.length === 0) return;

    const now = Date.now();
    const toRetry = [];
    const toKeep = [];

    for (const entry of this._queue) {
      // 清理超时的建议
      if (now - entry.enqueueTime > QUEUE_TIMEOUT_MS) {
        this.logger.log?.(
          `[SuggestionPusher] 队列建议超时，丢弃: ${entry.suggestion.type} (age: ${Math.round((now - entry.enqueueTime) / 1000)}s)`
        );
        this._policy.recordIgnore();
        continue;
      }
      toRetry.push(entry);
    }

    this._queue = [];

    // 队列 flush 时跳过 min interval 检查，直接推送所有未超时的建议
    // 原因：flush 本身已经受 QUEUE_FLUSH_INTERVAL_MS 控制，每条建议之间不需要额外间隔
    for (const entry of toRetry) {
      try {
        await this._writeSuggestion(entry.suggestion);
        if (entry.suggestion.type === 'code_review') {
          await this._appendToAiInstructions(entry.suggestion);
        }
        this._policy.recordPush();
        this.logger.log?.(
          `[SuggestionPusher] 队列建议推送成功: ${entry.suggestion.type} (priority: ${entry.priority})`
        );
      } catch (err) {
        this.logger.error?.(
          `[SuggestionPusher] 队列建议推送失败: ${entry.suggestion.type}`, err
        );
        toKeep.push(entry);
      }
    }

    this._queue = toKeep;
  }

  /**
   * 手动触发队列重试（供外部调用，如用户切换焦点时）
   */
  async retryQueue() {
    return this._retryQueuedSuggestions();
  }

  /**
   * 显式忽略一条建议（供外部调用，如用户点击"忽略"按钮时）
   * 会通知 DisturbancePolicy 进入冷静期计数
   */
  dismissSuggestion(suggestionId) {
    this._policy.recordIgnore();
    this.logger.log?.(`[SuggestionPusher] 建议被用户忽略: ${suggestionId}`);
  }

  /**
   * 处理代码审查结果
   */
  async _handleReviewResult(payload) {
    const suggestion = {
      type: 'code_review',
      severity: payload.severity || 'info',
      source: payload.source || 'overseer',
      summary: payload.summary || '',
      details: payload.details || '',
      files: payload.files || [],
      timestamp: Date.now(),
    };

    // 根据严重程度确定优先级
    const priority = payload.severity === 'error' ? 'critical'
      : payload.severity === 'warning' ? 'urgent'
      : 'normal';

    await this._pushSuggestion(suggestion, priority);
  }

  /**
   * 处理文件冲突
   */
  async _handleConflict(payload) {
    for (const conflict of payload.conflicts || []) {
      const suggestion = {
        type: 'conflict_warning',
        severity: 'warning',
        source: 'codeWatcher',
        summary: `文件冲突: ${conflict.file} 被 ${conflict.agents.join(' 和 ')} 同时修改`,
        details: `涉及工具: ${conflict.agents.join(', ')}，请手动检查合并`,
        files: [conflict.file],
        timestamp: Date.now(),
      };

      await this._pushSuggestion(suggestion, 'urgent');
    }
  }

  /**
   * 处理 LL-DB 规则命中
   */
  async _handleRuleHit(payload) {
    const suggestion = {
      type: 'rule_violation',
      severity: payload.severity || 'warning',
      source: 'llDbRuleChecker',
      summary: `规则命中: ${payload.ruleId} - ${payload.ruleContent}`,
      details: payload.context || '',
      ruleId: payload.ruleId,
      timestamp: Date.now(),
    };

    const priority = payload.severity === 'error' ? 'critical' : 'urgent';
    await this._pushSuggestion(suggestion, priority);
  }

  /**
   * 处理 AI 工具 error 事件
   */
  async _handleError(payload) {
    const suggestion = {
      type: 'agent_error',
      severity: 'error',
      source: 'hooks',
      summary: `${payload.data?.agent || 'unknown'} 发生错误: ${payload.data?.summary || '未知错误'}`,
      details: payload.data?.summary || '',
      agent: payload.data?.agent,
      timestamp: Date.now(),
    };

    await this._pushSuggestion(suggestion, 'critical');
  }

  /**
   * 写入建议文件
   */
  async _writeSuggestion(suggestion) {
    const id = `sug-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const filename = `${id}.json`;
    const filePath = path.join(this._suggestionsDir, filename);

    try {
      await fsp.writeFile(filePath, JSON.stringify({ id, ...suggestion }, null, 2), 'utf8');
      this.logger.log(`[SuggestionPusher] 建议已写入: ${filename} (${suggestion.type})`);
    } catch (err) {
      this.logger.error?.(`[SuggestionPusher] 写入失败:`, err.message);
    }
  }

  /**
   * 追加到 AI 工具的指令文件
   */
  async _appendToAiInstructions(suggestion) {
    const instructionsFile = path.join(this._suggestionsDir, 'latest.md');
    const line = `- [${suggestion.severity}] ${suggestion.summary}\n`;

    try {
      let content = '';
      try {
        content = await fsp.readFile(instructionsFile, 'utf8');
      } catch {
        // file doesn't exist yet
      }

      if (content) {
        const lines = content.split('\n');
        if (lines.length > 50) {
          const header = lines.slice(0, 3).join('\n');
          const recent = lines.slice(-47).join('\n');
          await fsp.writeFile(instructionsFile, header + '\n' + recent + line, 'utf8');
          return;
        }
        await fsp.appendFile(instructionsFile, line, 'utf8');
      } else {
        await fsp.writeFile(instructionsFile, '# Pet-Agent 实时建议\n\n' + line, 'utf8');
      }
    } catch {}
  }

  /**
   * 获取所有未读建议
   */
  async getPendingSuggestions() {
    try {
      await fsp.access(this._suggestionsDir);
    } catch {
      return [];
    }

    try {
      const files = (await fsp.readdir(this._suggestionsDir))
        .filter(f => f.startsWith('sug-') && f.endsWith('.json'))
        .sort();
      const results = [];
      for (const f of files) {
        try {
          const content = await fsp.readFile(path.join(this._suggestionsDir, f), 'utf8');
          results.push(JSON.parse(content));
        } catch { /* skip */ }
      }
      return results;
    } catch {
      return [];
    }
  }

  /**
   * 获取队列状态（用于调试/监控）
   */
  getQueueStats() {
    return {
      queueLength: this._queue.length,
      queue: this._queue.map(e => ({
        type: e.suggestion.type,
        priority: e.priority,
        age: Date.now() - e.enqueueTime,
      })),
      policyStats: this._policy.getStats(),
    };
  }
}

module.exports = { SuggestionPusher };
