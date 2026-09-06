/**
 * Live2D 状态联动桥（配置驱动版 — v2）
 *
 * 职责：
 *   1. 监听 EventBus 的所有关键事件（review/rule/git/ai/idle 等）
 *   2. 根据 emotion-mapping.json 配置，将事件映射为 Live2D 动作 + 气泡
 *   3. 发布 ui.live2d.action / ui.live2d.bubble 事件驱动前端
 *
 * 设计要点：
 *   - 配置文件：pet-agent/src/config/emotion-mapping.json
 *   - 同一事件名可以有多条映射，按 conditions 匹配第一条最佳
 *   - idle 事件由 IdleDetector 独立触发（5分钟/10分钟两档）
 *   - 所有数据流节点都会打 [Live2D] 前缀日志，方便调试
 */

const fs = require('fs');
const path = require('path');

// NOTICE:
// Why this no-op is needed: the original code required a shared module at
// `../../../live2d/shared/live2dActionMessage` (two identical try/catch paths),
// but that module does not exist anywhere in the repo. Both require calls
// failed and the second (uncaught) one crashed module loading.
// Root cause: the live2d shared message contract was never implemented, yet
// this bridge already depends on `normalizeLive2dActionMessage` and
// `ACTION_EVENT_NAME` from it.
// Source/context: packages/kitsune-overseer/src/live2dStateBridge.js lines 19-24.
// Removal condition: once `live2d/shared/live2dActionMessage` is implemented,
// delete the no-op/constant below and restore the real require + destructure.
function normalizeLive2dActionMessage(msg) {
  return msg;
}
const ACTION_EVENT_NAME = 'live2d-action';

const DEFAULT_MAPPING_PATH = path.resolve(__dirname, '..', '..', '..', 'config', 'emotion-mapping.json');

/**
 * 判定 payload 是否匹配 conditions
 * @param {Object} payload - 事件负载
 * @param {Object} [conditions={}] - 条件对象（字段值比较）
 * @returns {boolean} 是否匹配
 * 
 * 匹配规则：
 * - null/undefined 的条件视为"不要求该项"
 * - 字符串比较时忽略大小写
 */
function matchConditions(payload, conditions = {}) {
  if (!conditions || typeof conditions !== 'object' || Object.keys(conditions).length === 0) return true;
  for (const [key, expected] of Object.entries(conditions)) {
    if (expected === null || expected === undefined) continue;
    const actual = payload?.[key];
    if (actual === undefined) return false;
    if (String(actual).toLowerCase() !== String(expected).toLowerCase()) return false;
  }
  return true;
}

/**
 * 从模板字符串中替换 ${var} 占位符
 * @param {string} template - 模板字符串
 * @param {Object} [payload={}] - 数据对象
 * @returns {string} 替换后的字符串
 * 
 * 支持嵌套属性访问，如 ${user.name}
 */
function interpolate(template, payload = {}) {
  if (typeof template !== 'string') return template;
  return template.replace(/\$\{([^}]+)\}/g, (_, key) => {
    const parts = key.trim().split('.');
    let val = payload;
    for (const p of parts) {
      if (val && typeof val === 'object' && p in val) val = val[p];
      else return '';
    }
    return val !== null && val !== undefined ? String(val) : '';
  });
}

/**
 * 读取 emotion-mapping.json 配置文件
 * @param {string} [configPath] - 配置文件路径
 * @returns {Object} 情绪映射配置对象
 */
function loadEmotionMapping(configPath = DEFAULT_MAPPING_PATH) {
  try {
    if (!fs.existsSync(configPath)) {
      console.warn('[Live2D] 配置文件不存在，使用降级硬编码：', configPath);
      return buildFallbackMapping();
    }
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log(`[Live2D] 已加载情绪映射：${raw.eventMappings?.length || 0} 条，来自 ${path.basename(configPath)}`);
    return raw;
  } catch (err) {
    console.warn('[Live2D] 情绪映射加载失败，使用降级映射：', err.message);
    return buildFallbackMapping();
  }
}

/**
 * 构建降级的硬编码映射（配置文件缺失时使用）
 * @returns {Object} 降级映射配置
 */
function buildFallbackMapping() {
  return {
    version: 0,
    globalSettings: { defaultExpressionDuration: 2.5, defaultBubbleDuration: 5500 },
    eventAliases: {
      'overseer.review_completed': 'overseer.reviewCompleted',
      'overseer.rule_hit': 'overseer.ruleHit',
      'watcher.conflict_detected': 'watcher.conflictDetected',
      'watcher.code_changed': 'watcher.codeChanged',
      'hooks.state_updated': 'hooks.stateUpdated',
      'user.idle_timeout': 'user.idleTimeout',
      'git.push_completed': 'git.pushCompleted',
    },
    eventMappings: [
      { id: 'fb_review_ok', event: 'overseer.review_completed', conditions: {}, priority: 'normal',
        expression: { type: 'emote', name: 'happy', duration: 2.5 }, bubble: { template: '审查完成~', tone: 'success', duration: 4000 }, queuePolicy: 'append' },
      { id: 'fb_rule_hit', event: 'overseer.rule_hit', conditions: {}, priority: 'normal',
        expression: { type: 'emote', name: 'thinking', duration: 2 }, bubble: { template: '发现一个规则问题', tone: 'warning', duration: 5000 }, queuePolicy: 'append' },
      { id: 'fb_conflict', event: 'watcher.conflict_detected', conditions: {}, priority: 'high',
        expression: { type: 'emote', name: 'surprise', duration: 3 }, bubble: { template: '检测到文件冲突！', tone: 'error', duration: 7000 }, queuePolicy: 'interrupt' },
      { id: 'fb_code_change', event: 'watcher.code_changed', conditions: {}, priority: 'low',
        expression: { type: 'emote', name: 'thinking', duration: 1.5 }, bubble: null, queuePolicy: 'append' },
      { id: 'fb_ai_error', event: 'hooks.state_updated', conditions: { state: 'error' }, priority: 'high',
        expression: { type: 'emote', name: 'sad', duration: 2.5 }, bubble: { template: 'AI 工具出错了...', tone: 'error', duration: 6000 }, queuePolicy: 'interrupt' },
      { id: 'fb_idle_5m', event: 'user.idle_timeout', conditions: {}, priority: 'low',
        expression: { type: 'emote', name: 'sleepy', duration: 3 }, bubble: { template: '主人好久没理我了...', tone: 'info', duration: 5500 }, queuePolicy: 'append' },
    ]
  };
}

/**
 * 查找匹配的情绪映射
 * @param {Array} eventMappings - 映射列表
 * @param {string} eventName - 事件名
 * @param {Object} payload - 事件负载
 * @returns {Object|null} 匹配的映射对象或 null
 * 
 * 匹配逻辑：
 * 1. 先按事件名筛选候选
 * 2. 按条件严格度排序（条件多的优先）
 * 3. 按条件匹配第一条符合的映射
 */
function findMapping(eventMappings, eventName, payload) {
  const candidates = eventMappings.filter((m) => m.event === eventName);
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const la = Object.entries(a.conditions || {}).filter(([, v]) => v !== null && v !== undefined).length;
    const lb = Object.entries(b.conditions || {}).filter(([, v]) => v !== null && v !== undefined).length;
    return lb - la;
  });

  for (const m of candidates) {
    if (matchConditions(payload, m.conditions)) return m;
  }
  return null;
}

/**
 * Live2D 状态联动桥核心类
 * 
 * @class
 * @description 负责监听事件、映射情绪、分发动作/气泡
 */
class Live2dStateBridge {
  /**
   * 构造函数
   * @param {Object} options - 配置选项
   * @param {Object} options.bus - EventBus 实例
   * @param {Object} [options.logger=console] - 日志器
   * @param {string} [options.emotionMappingPath] - 情绪映射配置路径
   */
  constructor({ bus, logger = console, emotionMappingPath = DEFAULT_MAPPING_PATH } = {}) {
    this.bus = bus;
    this.logger = logger;
    this._subscriptions = [];
    this._lastActionTime = new Map();
    this._throttleMsDefault = 2000;
    this._emotionMapping = loadEmotionMapping(emotionMappingPath);
    this._globalSettings = this._emotionMapping.globalSettings || {};
    this._started = false;
  }

  /**
   * 启动 bridge，注册所有事件监听器
   */
  start() {
    if (this._started) return;
    if (!this.bus) {
      this.logger.error?.('[Live2D] 缺少 bus，无法启动 bridge');
      return;
    }
    this._started = true;
    const mappings = this._emotionMapping.eventMappings || [];
    const aliases = this._emotionMapping.eventAliases || {};

    // 收集所有在配置文件中声明的事件名（兼容 snake_case / camelCase）
    const eventSet = new Set(mappings.map((m) => m.event));
    // 同时添加规范化的 camelCase 版本
    for (const originalEvent of mappings.map((m) => m.event)) {
      if (aliases[originalEvent]) {
        eventSet.add(aliases[originalEvent]);
      }
    }

    // 保底：确保几个关键事件必定被监听（支持新旧两种命名）
    const guaranteedEvents = [
      // snake_case (旧)
      'overseer.review_completed',
      'overseer.feedback_to_desktop',
      'overseer.rule_hit',
      'overseer.alert',
      'overseer.task_pushed',
      'watcher.conflict_detected',
      'watcher.code_changed',
      'hooks.state_updated',
      'autonomous_loop.action',
      'proactive.notification',
      'system.notification',
      'user.idle_timeout',
      'git.push_completed',
      'build.status_changed',
      'monitor.claude_code.status',
      'monitor.trae.status',
      // 新增监工核心事件
      'supervisor.reaction',
      'auto_router.action',
      // camelCase (新规范)
      'overseer.reviewCompleted',
      'overseer.feedbackToDesktop',
      'overseer.ruleHit',
      'watcher.conflictDetected',
      'watcher.codeChanged',
      'hooks.stateUpdated',
      'user.idleTimeout',
      'git.pushCompleted',
      'build.statusChanged',
    ];
    for (const e of guaranteedEvents) eventSet.add(e);

    this.logger.log(`[Live2D] 启动 bridge：将监听 ${eventSet.size} 个事件`);

    // 给每个事件名创建一个监听器
    for (const eventName of eventSet) {
      this._subscriptions.push(
        this.bus.subscribe(eventName, (payload) => {
          this._handleEvent(eventName, payload);
        })
      );
    }
  }

  /**
   * 停止 bridge，清理所有监听器
   */
  stop() {
    for (const unsub of this._subscriptions) {
      try { if (typeof unsub === 'function') unsub(); } catch { /* ignore */ }
    }
    this._subscriptions = [];
    this._lastActionTime.clear();
    this._started = false;
    this.logger.log('[Live2D] bridge 已停止');
  }

  /**
   * 热更新配置（开发期可手动调用）
   * @param {string} [configPath] - 配置文件路径
   */
  reloadMapping(configPath = DEFAULT_MAPPING_PATH) {
    this._emotionMapping = loadEmotionMapping(configPath);
    this._globalSettings = this._emotionMapping.globalSettings || {};
    this.logger.log('[Live2D] 情绪映射已热重载');
  }

  /**
   * 通用事件处理器
   * @param {string} eventName - 事件名
   * @param {Object} payload - 事件负载
   */
  _handleEvent(eventName, payload) {
    if (!this._started || !this.bus) return;

    // 特殊优先：feedback_to_desktop 自带完整情绪元数据，直接执行
    if (eventName === 'overseer.feedback_to_desktop' && payload?.emotion) {
      this._handleFeedbackDirect(payload);
      return;
    }

    // 通用：按配置匹配
    const mapping = findMapping(this._emotionMapping.eventMappings || [], eventName, payload);
    if (!mapping) {
      // 没配置映射的事件跳过（属于"非关键"事件）
      if (eventName === 'watcher.code_changed') {
        // 代码变更走节流：如果有配置则已在上方命中；无配置也给个最小表情
        this._throttledEmit(eventName, () => {
          this._emitAction('thinking', 1.5, 'append', { throttled: true });
        });
      }
      return;
    }

    const priority = mapping.priority || 'normal';
    const useThrottle = priority === 'low'; // 低优先级的事件走节流

    this.logger.log?.(
      `[Live2D] Received event: ${eventName} -> Mapping: ${mapping.id} (priority=${priority})`
    );

    const runAll = () => {
      // 1) 表情/动作
      if (mapping.expression) {
        this._emitActionFromMapping(mapping);
      }
      // 2) motion（独立）
      if (mapping.motion && mapping.motion.group) {
        this._emitMotion(mapping.motion.group, mapping.motion.index || 0, mapping.expression?.duration || 2.5, mapping.queuePolicy || 'append');
      }
      // 3) 气泡
      if (mapping.bubble && mapping.bubble.template) {
        this._emitBubbleFromMapping(mapping, payload);
      }
    };

    if (useThrottle) {
      this._throttledEmit(eventName, runAll);
    } else {
      runAll();
    }
  }

  /** feedback_to_desktop 是“完整情绪包”，直接分发 */
  _handleFeedbackDirect(payload) {
    const { emotion } = payload;
    this.logger.log?.(
      `[Live2D] feedback_to_desktop: expression=${emotion.expression} bubble_tone=${emotion.bubble?.tone || 'n/a'}`
    );

    if (emotion.expression) {
      this._emitAction(emotion.expression, emotion.duration_sec || 2.5, emotion.queue_policy || 'append', { throttled: false, type: 'expression' });
    }
    if (emotion.motion && emotion.motion.group) {
      this._emitMotion(emotion.motion.group, emotion.motion.index ?? 0, 2.5, emotion.queue_policy || 'append');
    }
    if (emotion.bubble) {
      this.bus.publish('ui.live2d.bubble', {
        title: emotion.bubble.title || '',
        message: emotion.bubble.message || '',
        tone: emotion.bubble.tone || 'info',
        review_id: payload?.review_id,
        priority: payload?.priority || 'normal',
        risk_level: payload?.risk_level || 'low',
        source: payload?.source,
        summary: payload?.summary,
        issues: payload?.issues || [],
        action_type: payload?.action_type || [],
        files_changed: payload?.files_changed || [],
        duration_ms: payload?.priority === 'urgent' ? 8000 : 5500,
        timestamp: Date.now(),
      });
    }
  }

  /** 从配置驱动执行 expression / emote */
  _emitActionFromMapping(mapping) {
    const { expression, queuePolicy } = mapping;
    if (!expression?.name) return;

    const actionType = expression.type || 'expression';
    const durationSec = Number(expression.duration) || this._globalSettings.defaultExpressionDuration || 2.5;
    const action = {
      type: actionType, // expression | emote | gesture | react
      name: expression.name,
      args: {},
    };

    this.logger.log?.(`[Live2D] -> action: type=${actionType} name=${expression.name} duration=${durationSec}s`);
    this._publishAction(action, durationSec, queuePolicy || 'append');
  }

  /** 按旧的简化签名发 expression（为 feedback_to_desktop / 降级逻辑兼容） */
  _emitAction(name, durationSec, queuePolicy = 'append', opts = {}) {
    const actionType = opts.type || 'expression';
    this.logger.log?.(`[Live2D] -> action: type=${actionType} name=${name} duration=${durationSec}s`);
    this._publishAction({ type: actionType, name, args: {} }, durationSec, queuePolicy);
  }

  _emitMotion(group, index, durationSec, queuePolicy = 'append') {
    this.logger.log?.(`[Live2D] -> motion: group=${group} index=${index} duration=${durationSec}s`);
    this._publishAction({ type: 'motion', name: group, args: { index } }, durationSec, queuePolicy);
  }

  _publishAction(action, durationSec, queuePolicy) {
    const raw = { action, duration_sec: durationSec, queue_policy: queuePolicy };
    const result = normalizeLive2dActionMessage(raw);
    if (!result.ok) {
      this.logger.error?.(`[Live2D] 动作消息校验失败: ${result.error} action=${JSON.stringify(action)}`);
      return;
    }
    this.bus.publish(ACTION_EVENT_NAME, result.value);
  }

  _emitBubbleFromMapping(mapping, payload) {
    const { bubble } = mapping;
    const message = interpolate(bubble.template, payload) || bubble.template;
    const tone = bubble.tone || 'info';
    const durationMs = Number(bubble.duration) || this._globalSettings.defaultBubbleDuration || 5500;

    this.logger.log?.(`[Live2D] -> bubble: tone=${tone} duration=${durationMs}ms message="${message.slice(0, 80)}"`);

    this.bus.publish('ui.live2d.bubble', {
      title: bubble.title || '',
      message,
      tone,
      duration_ms: durationMs,
      mapping_id: mapping.id,
      priority: mapping.priority || 'normal',
      source: payload?.source,
      review_id: payload?.review_id,
      timestamp: Date.now(),
    });
  }

  _throttledEmit(eventName, fn) {
    const now = Date.now();
    const last = Number(this._lastActionTime.get(eventName) || 0);
    if (now - last < this._throttleMsDefault) return;
    this._lastActionTime.set(eventName, now);
    fn();
  }
}

module.exports = { Live2dStateBridge, loadEmotionMapping, DEFAULT_MAPPING_PATH };
