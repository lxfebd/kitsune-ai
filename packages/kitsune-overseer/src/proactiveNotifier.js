/**
 * 主动通知器 — 让 AI 桌宠主动向用户汇报
 *
 * 设计原则：
 * 1. 不是每个事件都通知（防打扰）— 只通知"用户关心的"
 * 2. 消息分级：info(静默记录) / notify(气泡提示) / alert(强提醒)
 * 3. 冷却期：同一工具同类事件 N 分钟内不重复通知
 * 4. 可配置：通过前端设置控制哪些事件类型启用
 */

const { DisturbancePolicy } = require('./disturbancePolicy');

// 事件 → 通知规则映射
const EVENT_RULES = {
  // Claude Code
  'claude_code_status': {
    // 值得主动通知的状态变化
    notifyOn: ['error', 'completed', 'executing'],
    // 忽略（太频繁或无意义）
    silentOn: ['idle', 'thinking', 'coding', 'stopped'],
    // 通知模板
    templates: {
      error: { level: 'alert', icon: '', prefix: 'Claude Code 出错了' },
      completed: { level: 'notify', icon: '', prefix: 'Claude Code 完成了任务' },
      executing: { level: 'info', icon: '', prefix: 'Claude Code 正在执行命令' },
    },
    cooldownMs: 5 * 60_000, // 同类事件 5 分钟冷却
  },
  // Trae
  'trae_status': {
    notifyOn: ['build_error', 'test_failed', 'build_success', 'test_passed'],
    silentOn: ['idle', 'editing', 'compiling', 'active', 'stopped'],
    templates: {
      build_error: { level: 'alert', icon: '', prefix: 'Trae 编译失败了' },
      test_failed: { level: 'alert', icon: '', prefix: 'Trae 测试没过' },
      build_success: { level: 'notify', icon: '', prefix: 'Trae 编译通过了' },
      test_passed: { level: 'notify', icon: '', prefix: 'Trae 测试全过了' },
    },
    cooldownMs: 5 * 60_000,
  },
  // 通用工具 (cursor/windsurf/lobster)
  'generic_status': {
    notifyOn: ['error', 'completed'],
    silentOn: ['idle', 'active', 'editing', 'coding', 'stopped', 'thinking', 'executing'],
    templates: {
      error: { level: 'alert', icon: '', prefix: '' },  // prefix 动态填充工具名
      completed: { level: 'notify', icon: '', prefix: '' },
    },
    cooldownMs: 10 * 60_000, // 通用工具冷却更长
  },
};

class ProactiveNotifier {
  constructor({ bus, broadcastBus, disturbancePolicy } = {}) {
    this.bus = bus;
    this.broadcastBus = broadcastBus;
    this.disturbancePolicy = disturbancePolicy || new DisturbancePolicy();
    this.messages = [];           // 通知消息队列（最多 200 条）
    this.maxMessages = 200;
    this.enabled = true;          // 全局开关
    this.lastNotifyTime = {};     // { "claude_code:error": timestamp } 冷却追踪
    this.subscribed = false;
    // 统计
    this.stats = { total: 0, notified: 0, silenced: 0, byLevel: { alert: 0, notify: 0, info: 0 } };
  }

  /**
   * 启动 — 订阅所有监工事件
   */
  start() {
    if (this.subscribed || !this.bus) return;
    this.subscribed = true;

    // 监听 Supervisor 的桌宠反应事件（这是所有状态变更的统一出口）
    this.bus.subscribe('supervisor.reaction', (event) => {
      this._handleEvent(event);
    });

    // 监听告警事件
    this.bus.subscribe('overseer.alert', (alert) => {
      this._pushMessage({
        id: `proactive-alert-${Date.now()}`,
        level: 'alert',
        icon: '',
        title: '监工告警',
        content: alert.message || alert.summary || JSON.stringify(alert).substring(0, 300),
        source: 'overseer',
        toolName: alert.tool_name || 'system',
        timestamp: Date.now(),
        type: 'alert',
      });
    });

    // 监听审查完成
    this.bus.subscribe('overseer.review_completed', (review) => {
      const passed = review.passed !== false;
      const fileCount = review.files_changed?.length || review.file_count || 0;
      this._pushMessage({
        id: `proactive-review-${Date.now()}`,
        level: passed ? 'notify' : 'alert',
        icon: '',
        title: passed ? '代码审查通过' : '代码审查发现问题',
        content: passed
          ? `${fileCount} 个文件审查通过`
          : `发现 ${review.issue_count || 1} 个问题: ${(review.summary || '').substring(0, 200)}`,
        source: 'code_reviewer',
        timestamp: Date.now(),
        type: 'review',
        data: review,
      });
    });

    console.log('[ProactiveNotifier] 已启动，订阅监工事件');
  }

  stop() {
    this.subscribed = false;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * 核心事件处理 — 判断是否需要通知
   */
  _handleEvent(event) {
    if (!this.enabled) return;

    this.stats.total++;
    const source = event.source;       // claude_code / trae / cursor / windsurf / lobster
    const emotion = event.emotion;     // happy / worried / excited / focused ...
    const action = event.action;       // celebrate / concern / watch / nod ...
    const message = event.message;     // 用户可读的消息文本

    if (!source || !message) return;

    // 确定规则集
    let ruleKey = 'generic_status';
    let eventActivity = emotion;       // 用 emotion 作为活动状态代理
    if (source === 'claude_code') ruleKey = 'claude_code_status';
    else if (source === 'trae') ruleKey = 'trae_status';

    const rules = EVENT_RULES[ruleKey];
    if (!rules) return;

    // 判断是否在通知列表中
    const shouldNotify = rules.notifyOn.includes(eventActivity);
    const isSilent = rules.silentOn.includes(eventActivity);

    if (!shouldNotify && !isSilent) {
      // 未明确分类，默认静默
      this.stats.silenced++;
      return;
    }

    if (isSilent) {
      this.stats.silenced++;
      return;
    }

    // 打扰策略检查
    if (!this.disturbancePolicy.canNotify()) {
      this.stats.silenced++;
      return;
    }

    // 冷却期检查
    const cooldownKey = `${source}:${eventActivity}`;
    const now = Date.now();
    const lastTime = this.lastNotifyTime[cooldownKey] || 0;
    if (now - lastTime < rules.cooldownMs) {
      this.stats.silenced++;
      return;
    }
    this.lastNotifyTime[cooldownKey] = now;

    // 获取模板
    const template = rules.templates[eventActivity] || rules.templates['error'] || {};
    const prefix = template.prefix || `${source} `;
    const icon = template.icon || '';

    // 构建通知内容
    const detailText = event.summary || message;
    const fullContent = `${prefix}${detailText}`;

    this._pushMessage({
      id: `proactive-${source}-${Date.now()}`,
      level: template.level || 'notify',
      icon,
      title: prefix.trim(),
      content: detailText,
      source,
      toolName: source,
      timestamp: now,
      type: 'status_change',
      emotion,
      action,
    });

    this.stats.notified++;
    this.stats.byLevel[template.level || 'notify'] = (this.stats.byLevel[template.level || 'notify'] || 0) + 1;
  }

  /**
   * 推送消息到队列
   */
  _pushMessage(msg) {
    this.messages.push(msg);
    if (this.messages.length > this.maxMessages) {
      this.messages.shift();
    }
    // 同时发布事件，供前端实时监听（SSE 或 polling）
    if (this.bus) {
      try { this.bus.publish('proactive.notification', msg); } catch {}
    }
    // 广播到 AgentLoop 上下文
    if (this.broadcastBus) {
      this.broadcastBus.publish('proactive', msg);
    }
  }

  /**
   * 获取通知列表
   */
  getMessages({ limit = 30, since, level, unreadOnly = false } = {}) {
    let result = [...this.messages].reverse(); // 最新的在前

    if (since) result = result.filter(m => m.timestamp >= since);
    if (level) result = result.filter(m => m.level === level);
    if (unreadOnly) result = result.filter(m => !m.read);

    return result.slice(0, limit);
  }

  /**
   * 标记已读
   */
  markRead(messageId) {
    const msg = this.messages.find(m => m.id === messageId);
    if (msg) msg.read = true;
    return !!msg;
  }

  /**
   * 标记全部已读
   */
  markAllRead() {
    this.messages.forEach(m => m.read = true);
  }

  /**
   * 获取未读数量
   */
  getUnreadCount() {
    return this.messages.filter(m => !m.read && m.level !== 'info').length;
  }

  /**
   * 清空消息
   */
  clear() {
    this.messages = [];
  }

  getStats() {
    return { ...this.stats, queueSize: this.messages.length, unreadCount: this.getUnreadCount() };
  }
}

module.exports = { ProactiveNotifier };
