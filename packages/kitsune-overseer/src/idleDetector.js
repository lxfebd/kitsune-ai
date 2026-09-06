/**
 * 空闲检测器 — 用户长时间无操作时主动触发待机/提醒动作
 *
 * 功能：
 * 1. 监听用户的鼠标、键盘、触摸等交互事件
 * 2. 跟踪最后交互时间
 * 3. 当超过阈值时触发 idle_timeout 事件
 * 4. 支持多个阈值级别（如 5 分钟提醒、10 分钟睡觉）
 * 5. 页面不可见时自动暂停检测
 *
 * 事件发布：
 * - user.idle_timeout — 带 idleDurationMs 参数
 *
 * 集成方式：
 *   const { IdleDetector } = require('./idleDetector');
 *   const idleDetector = new IdleDetector({
 *     bus,
 *     logger,
 *     thresholds: [300000, 600000] // 5分钟、10分钟
 *   });
 *   idleDetector.start();
 */

class IdleDetector {
  /**
   * @param {Object} options
   * @param {Object} options.bus - EventBus 实例
   * @param {Object} [options.logger=console] - 日志记录器
   * @param {number[]} [options.thresholds=[300000, 600000]] - 空闲阈值数组（毫秒），按升序排列
   *   - [300000] = 5分钟提醒
   *   - [300000, 600000] = 5分钟提醒 + 10分钟睡觉
   */
  constructor({ bus, logger = console, thresholds = [300000, 600000] } = {}) {
    this.bus = bus;
    this.logger = logger;
    // 确保阈值数组升序排列
    this.thresholds = [...thresholds].sort((a, b) => a - b);
    this.lastActivityTime = Date.now();
    this.timers = [];
    this.running = false;
    this._boundHandleActivity = this._handleActivity.bind(this);
    this._boundHandleVisibilityChange = this._handleVisibilityChange.bind(this);
    // 节流：mousemove 事件节流间隔（毫秒）
    this._throttleMs = 250;
    this._lastMoveTime = 0;
    // 记录已触发的阈值索引，用于避免重复触发
    this._triggeredLevels = new Set();
  }

  /**
   * 启动空闲检测
   */
  start() {
    if (this.running) {
      this.logger.log?.('[IdleDetector] 已在运行中');
      return;
    }

    if (!this.bus) {
      this.logger.error?.('[IdleDetector] 缺少 bus，无法启动');
      return;
    }

    this.running = true;
    this.lastActivityTime = Date.now();
    this._triggeredLevels.clear();

    // 只在 DOM 可用时注册浏览器事件（Node.js 主进程 / renderer 进程兼容）
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      const events = ['mousemove', 'click', 'keydown', 'scroll', 'touchstart', 'mousedown'];
      for (const event of events) {
        document.addEventListener(event, this._boundHandleActivity, { passive: true });
      }
      document.addEventListener('visibilitychange', this._boundHandleVisibilityChange);
      this.logger.log?.('[IdleDetector] 浏览器环境：已注册用户交互事件监听');
    } else {
      // Node.js 环境：通过 process / bus 事件重置空闲计时
      if (typeof process !== 'undefined' && typeof process.on === 'function') {
        this._nodeActivityHandler = () => this._handleActivity();
        process.on('message', this._nodeActivityHandler);
      }
      // 通过 bus 接收显式的 activity 事件
      if (this.bus && typeof this.bus.subscribe === 'function') {
        this._busActivityUnsub = this.bus.subscribe('overseer.user_activity', () => this._handleActivity());
      }
      this.logger.log?.('[IdleDetector] Node.js 环境：使用 bus/process 事件驱动空闲计时');
    }

    // 设置定时器检查空闲
    this._scheduleNextCheck();

    this.logger.log(`[IdleDetector] 已启动，阈值: ${this.thresholds.map(t => t / 1000 + 's').join(', ')}`);
  }

  /**
   * 停止空闲检测
   */
  stop() {
    if (!this.running) return;
    this.running = false;

    // 浏览器环境：清理 DOM 事件
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      const events = ['mousemove', 'click', 'keydown', 'scroll', 'touchstart', 'mousedown'];
      for (const event of events) {
        try { document.removeEventListener(event, this._boundHandleActivity); } catch {}
      }
      try { document.removeEventListener('visibilitychange', this._boundHandleVisibilityChange); } catch {}
    }

    // Node.js 环境：清理 process / bus 监听
    if (this._nodeActivityHandler && typeof process !== 'undefined' && typeof process.off === 'function') {
      try { process.off('message', this._nodeActivityHandler); } catch {}
      this._nodeActivityHandler = null;
    }
    if (typeof this._busActivityUnsub === 'function') {
      try { this._busActivityUnsub(); } catch {}
      this._busActivityUnsub = null;
    }

    this._clearAllTimers();
    this.logger.log('[IdleDetector] 已停止');
  }

  /**
   * 重置空闲计时器
   */
  resetTimer() {
    this.lastActivityTime = Date.now();
    this._triggeredLevels.clear();
    this.logger.log?.('[IdleDetector] 计时器已重置');

    // 如果正在运行，重新调度检查
    if (this.running) {
      this._clearAllTimers();
      this._scheduleNextCheck();
    }
  }

  /**
   * 获取当前空闲时长（毫秒）
   */
  getIdleDuration() {
    return Date.now() - this.lastActivityTime;
  }

  /**
   * 获取当前状态
   */
  getStatus() {
    return {
      running: this.running,
      idleDurationMs: this.getIdleDuration(),
      thresholds: this.thresholds,
      triggeredLevels: [...this._triggeredLevels],
    };
  }

  /**
   * 处理用户活动事件
   * @private
   */
  _handleActivity(event) {
    // 对 mousemove 进行节流（仅浏览器事件带 type 字段）
    if (event && typeof event === 'object' && event.type === 'mousemove') {
      const now = Date.now();
      if (now - this._lastMoveTime < this._throttleMs) {
        return;
      }
      this._lastMoveTime = now;
    }

    // 只要检测到任何交互就重置计时器
    this.resetTimer();
  }

  /**
   * 处理页面可见性变化
   * @private
   */
  _handleVisibilityChange() {
    // 仅浏览器环境下有 document
    if (typeof document === 'undefined') return;
    if (document.hidden) {
      this.logger.log?.('[IdleDetector] 页面隐藏，暂停空闲检测');
      this._clearAllTimers();
    } else {
      this.logger.log?.('[IdleDetector] 页面恢复，重置空闲检测');
      this.resetTimer();
    }
  }

  /**
   * 调度下一次检查
   * @private
   */
  _scheduleNextCheck() {
    if (!this.running) return;

    // 计算距离下一个阈值的剩余时间
    const idleDuration = this.getIdleDuration();
    // 找到第一个尚未触发的阈值索引
    let nextIndex = -1;
    for (let i = 0; i < this.thresholds.length; i++) {
      if (!this._triggeredLevels.has(i)) { nextIndex = i; break; }
    }

    if (nextIndex === -1) {
      // 所有阈值都已触发，等待用户交互重置
      return;
    }

    const nextThreshold = this.thresholds[nextIndex];
    const delay = nextThreshold - idleDuration;

    if (delay <= 0) {
      this._checkIdle();
      return;
    }

    const timerId = setTimeout(() => {
      this._checkIdle();
      this._scheduleNextCheck();
    }, Math.min(delay, 60000));

    this.timers.push(timerId);
  }

  /**
   * 检查是否达到空闲阈值
   * @private
   */
  _checkIdle() {
    if (!this.running) return;

    const idleDuration = this.getIdleDuration();

    for (let i = 0; i < this.thresholds.length; i++) {
      const threshold = this.thresholds[i];
      if (idleDuration >= threshold && !this._triggeredLevels.has(i)) {
        this._triggeredLevels.add(i);
        this._emitIdleEvent(threshold, idleDuration);
      }
    }
  }

  /**
   * 发布空闲事件
   * @param {number} threshold - 触发的阈值（毫秒）
   * @param {number} idleDuration - 当前空闲时长（毫秒）
   * @private
   */
  _emitIdleEvent(threshold, idleDuration) {
    const levelIndex = this.thresholds.indexOf(threshold);
    const payload = {
      threshold,
      thresholdIndex: levelIndex,
      idleDurationMs: idleDuration,
      timestamp: Date.now(),
    };

    this.logger.log(
      `[IdleDetector] 触发 idle_timeout: 阈值=${threshold}ms (${threshold / 1000}s), ` +
      `空闲时长=${idleDuration}ms (${(idleDuration / 1000).toFixed(1)}s), 级别=${levelIndex}`
    );

    try {
      this.bus.publish('user.idle_timeout', payload);
    } catch (err) {
      this.logger.error?.('[IdleDetector] 发布事件失败:', err.message);
    }
  }

  /**
   * 清理所有定时器
   * @private
   */
  _clearAllTimers() {
    for (const timerId of this.timers) {
      clearTimeout(timerId);
    }
    this.timers = [];
  }
}

module.exports = { IdleDetector };
