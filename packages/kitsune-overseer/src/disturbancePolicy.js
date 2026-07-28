/**
 * DisturbancePolicy — 智能打扰策略
 *
 * 职责：
 * 1. 根据用户状态（idle/active/deep_focus）和眼动追踪判断是否允许推送建议
 * 2. 实现冷静期机制：连续忽略后延长推送间隔
 * 3. 支持优先级队列：critical > urgent > normal
 *
 * 依赖：
 * - activityMonitor.js（用户状态 + eyeContact）
 * - modelCapabilitiesLoader.js（模型是否支持眼动追踪）
 */

const PRIORITY_LEVELS = {
  critical: 0,
  urgent: 1,
  normal: 2,
};

const DEFAULT_CONFIG = {
  // 冷静期配置
  cooldownThreshold: 3,        // 连续忽略 N 次后进入冷静期
  cooldownBaseMs: 30 * 60 * 1000, // 冷静期基础时长 30 分钟
  cooldownMaxMs: 2 * 60 * 60 * 1000, // 最大冷静期 2 小时

  // 推送间隔
  minPushIntervalMs: 60 * 1000, // 最小推送间隔 1 分钟

  // 超时重试
  queueTimeoutMs: 10 * 60 * 1000, // 队列中建议超时 10 分钟
};

class DisturbancePolicy {
  constructor({
    config = {},
    activityMonitor = null,
    modelCapabilities = null,
    logger = console,
  } = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.activityMonitor = activityMonitor;
    this.modelCapabilities = modelCapabilities;
    this.logger = logger;

    // 状态追踪
    this._consecutiveIgnores = 0;
    this._lastPushTime = 0;
    this._cooldownUntil = 0;
    this._currentState = 'active';
    this._eyeContact = false;
  }

  /**
   * 更新用户状态（由 activityMonitor 事件驱动）
   */
  updateUserState(context) {
    if (!context || typeof context.type !== 'string') return;
    this._currentState = context.type;
    if (typeof context.eyeContact === 'boolean') {
      this._eyeContact = context.eyeContact;
    }

    // 用户从 deep_focus 切换到 idle/active，重置冷静期
    if (this._currentState !== 'deep_focus' && this._cooldownUntil > 0) {
      this.logger.log?.('[DisturbancePolicy] 用户状态变化，提前结束冷静期');
      this._cooldownUntil = 0;
      this._consecutiveIgnores = 0;
    }
  }

  /**
   * 设置眼动追踪状态
   */
  setEyeContact(hasContact) {
    this._eyeContact = Boolean(hasContact);
  }

  /**
   * 判断是否允许推送建议
   * @param {string} priority - 建议优先级 ('critical'|'urgent'|'normal')
   * @returns {{ allowed: boolean, reason: string }}
   */
  shouldPush(priority = 'normal') {
    const now = Date.now();
    const priorityLevel = PRIORITY_LEVELS[priority] ?? PRIORITY_LEVELS.normal;

    // 1. critical 优先级始终允许
    if (priorityLevel === PRIORITY_LEVELS.critical) {
      return { allowed: true, reason: 'critical_always_allowed' };
    }

    // 2. 检查冷静期
    if (now < this._cooldownUntil) {
      const remainingMs = this._cooldownUntil - now;
      return {
        allowed: false,
        reason: `cooldown_active (remaining: ${Math.round(remainingMs / 1000)}s)`,
      };
    }

    // 3. 检查最小推送间隔
    if (now - this._lastPushTime < this.config.minPushIntervalMs) {
      return {
        allowed: false,
        reason: 'min_push_interval_not_reached',
      };
    }

    // 4. 根据用户状态判断
    const hasEyeTracking = this.modelCapabilities?.has_eye_tracking === true;

    if (hasEyeTracking && this._eyeContact) {
      // 用户正在看屏幕 → 深度专注，仅允许 urgent 及以上
      if (priorityLevel > PRIORITY_LEVELS.urgent) {
        return { allowed: false, reason: 'eye_contact_deep_focus' };
      }
    }

    if (this._currentState === 'deep_focus') {
      // 深度专注状态，仅允许 urgent 及以上
      if (priorityLevel > PRIORITY_LEVELS.urgent) {
        return { allowed: false, reason: 'deep_focus' };
      }
    }

    if (this._currentState === 'idle') {
      // 空闲状态，所有优先级都允许
      return { allowed: true, reason: 'user_idle' };
    }

    // active 状态，允许所有（已排除 deep_focus）
    return { allowed: true, reason: 'user_active' };
  }

  /**
   * 记录建议被推送
   */
  recordPush() {
    this._lastPushTime = Date.now();
    this._consecutiveIgnores = 0;
  }

  /**
   * 记录建议被忽略
   */
  recordIgnore() {
    this._consecutiveIgnores++;

    // 达到冷静期阈值
    if (this._consecutiveIgnores >= this.config.cooldownThreshold) {
      const cooldownMs = Math.min(
        this.config.cooldownBaseMs * Math.pow(2, this._consecutiveIgnores - this.config.cooldownThreshold),
        this.config.cooldownMaxMs
      );
      this._cooldownUntil = Date.now() + cooldownMs;
      this.logger.log?.(
        `[DisturbancePolicy] 进入冷静期: ${Math.round(cooldownMs / 1000)}s (连续忽略 ${this._consecutiveIgnores} 次)`
      );
    }
  }

  /**
   * 获取当前策略状态（用于调试/监控）
   */
  getStats() {
    return {
      currentState: this._currentState,
      eyeContact: this._eyeContact,
      consecutiveIgnores: this._consecutiveIgnores,
      cooldownActive: Date.now() < this._cooldownUntil,
      cooldownRemainingMs: Math.max(0, this._cooldownUntil - Date.now()),
      lastPushTime: this._lastPushTime,
    };
  }
}

module.exports = { DisturbancePolicy, PRIORITY_LEVELS };
