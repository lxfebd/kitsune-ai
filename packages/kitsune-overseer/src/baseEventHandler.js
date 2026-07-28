/**
 * BaseEventHandler — 统一事件处理基类
 *
 * 提取 AutonomousAgentLoop 与 AutoRouter 共有的公共逻辑：
 * - 事件过滤（静默事件、触发列表）
 * - 频率控制（每小时上限）
 * - 冷却期检查（同一来源同类事件）
 * - 队列管理（防并发）
 * - 统计信息
 *
 * 子类只需实现 _subscribeEvents() 和 _processEvent(event) 即可。
 */

// 静默事件列表 — 不需要任何处理的活动类型
const SILENT_EVENTS = [
  'idle', 'thinking', 'coding', 'executing',
  'editing', 'compiling', 'active', 'stopped',
  'file_changes',
];

class BaseEventHandler {
  constructor({
    bus,
    maxActionsPerHour = 60,
    cooldownMs = 5 * 60_000,
    silentEvents = SILENT_EVENTS,
    logger = console,
  } = {}) {
    this.bus = bus;
    this.logger = logger;
    this.maxActionsPerHour = maxActionsPerHour;
    this.cooldownMs = cooldownMs;
    this.silentEvents = silentEvents;

    this.enabled = false;
    this.subscribed = false;

    // 频率控制
    this.actionCount = 0;
    this.actionHour = new Date().getHours();

    // 冷却期
    this.cooldownMap = new Map();

    // 队列（防并发）
    this.queue = [];
    this.processing = false;

    // 统计
    this.stats = {
      totalEvents: 0,
      processed: 0,
      ignored: 0,
      errors: 0,
    };
  }

  // 生命周期

  start() {
    if (this.subscribed) return;
    this.subscribed = true;
    this.enabled = true;
    this._subscribeEvents();
    this._startHourlyReset();
    this.logger.log?.(`[${this.constructor.name}] 已启动`);
  }

  stop() {
    this.subscribed = false;
    this.enabled = false;
    if (this._hourlyResetTimer) {
      clearInterval(this._hourlyResetTimer);
      this._hourlyResetTimer = null;
    }
    this.logger.log?.(`[${this.constructor.name}] 已停止`);
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  // 事件处理主流程（模板方法）

  _onEvent(event) {
    if (!this.enabled) return;

    this.stats.totalEvents++;

    // 1. 静默事件过滤
    const activity = this._extractActivity(event);
    if (this.silentEvents.includes(activity)) {
      this.stats.ignored++;
      return;
    }

    // 2. 频率检查
    if (!this._checkRateLimit()) {
      this.stats.ignored++;
      return;
    }

    // 3. 冷却期检查
    if (!this._checkCooldown(event)) {
      this.stats.ignored++;
      return;
    }

    // 4. 子类自定义过滤
    if (typeof this._shouldProcessEvent === 'function' && !this._shouldProcessEvent(event, activity)) {
      this.stats.ignored++;
      return;
    }

    // 5. 入队处理
    this._enqueue(event);
  }

  // 队列处理

  _enqueue(event) {
    // 去重
    const dedupeKey = this._getDedupeKey(event);
    if (this.queue.some(q => q._dedupeKey === dedupeKey)) return;

    this.queue.push({ ...event, _dedupeKey: dedupeKey, _queuedAt: Date.now() });
    this._processQueue();
  }

  async _processQueue() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const event = this.queue.shift();

      // 处理前再检查频率
      if (!this._checkRateLimit()) {
        this.logger.log?.(`[${this.constructor.name}] 达到每小时上限，停止处理`);
        break;
      }

      try {
        await this._processEvent(event);
        this.stats.processed++;
        this.actionCount++;
      } catch (err) {
        this.logger.error?.(`[${this.constructor.name}] 处理失败:`, err.message);
        this.stats.errors++;
      }
    }

    this.processing = false;
  }

  // 频率与冷却期

  _checkRateLimit() {
    this._resetHourIfNeeded();
    return this.actionCount < this.maxActionsPerHour;
  }

  _checkCooldown(event) {
    const key = this._getCooldownKey(event);
    const lastTime = this.cooldownMap.get(key) || 0;
    if (Date.now() - lastTime < this.cooldownMs) {
      return false;
    }
    this.cooldownMap.set(key, Date.now());
    return true;
  }

  _resetHourIfNeeded() {
    const now = new Date();
    if (now.getHours() !== this.actionHour) {
      this.actionHour = now.getHours();
      this.actionCount = 0;
    }
  }

  _startHourlyReset() {
    this._hourlyResetTimer = setInterval(() => {
      this._resetHourIfNeeded();
    }, 60_000);
  }

  // 工具方法（子类可覆盖）

  /**
   * 从事件中提取活动类型
   */
  _extractActivity(event) {
    return event.activity || event.emotion || event.action || '';
  }

  /**
   * 生成冷却期 key
   */
  _getCooldownKey(event) {
    return `${event.source}:${this._extractActivity(event)}`;
  }

  /**
   * 生成去重 key
   */
  _getDedupeKey(event) {
    return `${event.source}:${this._extractActivity(event)}:${(event.message || '').substring(0, 100)}`;
  }

  // 子类必须实现

  /**
   * 订阅事件总线（子类实现）
   */
  _subscribeEvents() {
    throw new Error('子类必须实现 _subscribeEvents()');
  }

  /**
   * 处理单个事件（子类实现）
   */
  async _processEvent(event) {
    throw new Error('子类必须实现 _processEvent(event)');
  }

  // 查询接口

  getStatus() {
    return {
      enabled: this.enabled,
      subscribed: this.subscribed,
      actionCount: this.actionCount,
      actionLimit: this.maxActionsPerHour,
      queueLength: this.queue.length,
      processing: this.processing,
      stats: { ...this.stats },
    };
  }
}

module.exports = { BaseEventHandler, SILENT_EVENTS };
