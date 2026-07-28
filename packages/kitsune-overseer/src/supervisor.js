/**
 * 监工模式 — 统一监控调度器
 * 协调 Claude Code、Trae、Cursor、Windsurf、龙虾 等多个 AI 工具的监控
 * 汇总状态，触发桌宠反应，推送通知
 */

const { ClaudeCodeMonitor } = require('./claudeCodeMonitor');
const { TraeMonitor } = require('./traeMonitor');
const { GenericAiToolMonitor, TOOL_PRESETS } = require('./genericAiToolMonitor');
const { MonitorStore } = require('./monitorStore');
const { IdleDetector } = require('./idleDetector');

class Supervisor {
  /**
   * @param {Object} options
   * @param {EventBus} [options.bus] - EventBus 实例（与 eventBus 二选一）
   * @param {EventBus} [options.eventBus] - EventBus 实例的别名
   * @param {EventBus} [options.broadcastBus] - 广播总线
   * @param {(reaction: Object) => void} [options.onPetReaction] - 桌宠反应回调
   * @param {Object} [options.monitorStore] - 数据持久化层
   * @param {Object} [options.live2dBridge] - Live2D 状态桥（由外部注入）
   * @param {Array<{id: string, enabled: boolean, name?: string}>} [options.tools=[]]
   *   来自 overseer.yaml 的 tools[] 配置；仅 enabled === true 的工具会被实例化。
   *   工具 id → 监控器映射：
   *     claude_code → ClaudeCodeMonitor
   *     trae        → TraeMonitor
   *     其它（cursor/windsurf/lobster/codex/aider...） → GenericAiToolMonitor
   * @param {number} [options.pollInterval] - 监控器轮询间隔（毫秒），来自 overseer.yaml；
   *   缺失时由各监控器自行回退到内置默认值。
   */
  constructor({ bus, eventBus, broadcastBus, onPetReaction, monitorStore, live2dBridge, tools = [], pollInterval } = {}) {
    this.bus = bus || eventBus;
    this.broadcastBus = broadcastBus;
    this.onPetReaction = onPetReaction;
    this.monitorStore = monitorStore; // 可选：数据持久化
    this.pollInterval = pollInterval;

    // 统一监控器集合：tool id → Monitor 实例
    // 不再硬编码 GENERIC_TOOL_KEYS，仅依据配置的 tools[] 实例化；
    // yaml 中缺失的工具不会被实例化，enabled !== true 的工具也会被跳过
    this.monitors = {};
    // 已启用工具 id 的有序列表，供事件订阅与状态查询使用
    this.enabledToolIds = [];
    for (const tool of tools) {
      if (!tool || tool.enabled !== true) continue;
      const id = tool.id;
      // 缺失 id 或重复 id 直接跳过，避免覆盖已实例化的监控器
      if (!id || this.monitors[id]) continue;

      let monitor;
      if (id === 'claude_code') {
        monitor = new ClaudeCodeMonitor({ bus, eventBus, pollInterval: this.pollInterval });
      } else if (id === 'trae') {
        monitor = new TraeMonitor({ bus, eventBus });
      } else {
        // 通用工具：优先用 TOOL_PRESETS[id] 提供的进程/日志/输出模式；
        // yaml 中新增但 TOOL_PRESETS 未覆盖的工具会落到 GenericAiToolMonitor 内部兜底（cursor 预设）
        monitor = new GenericAiToolMonitor({
          toolKey: id,
          config: TOOL_PRESETS[id],
          bus,
        });
      }
      this.monitors[id] = monitor;
      this.enabledToolIds.push(id);
    }

    this.isRunning = false;
    this.enabled = true;
    this.lastReaction = null;
    this.reactionCooldown = 10000; // 10 秒冷却
    this.lastReactionTime = 0;

    // IdleDetector — 5分钟提醒 / 10分钟睡觉
    this.idleDetector = new IdleDetector({
      bus: this.bus,
      logger: console,
      thresholds: [300000, 600000],
    });

    // Live2dStateBridge — 由外部注入，避免重复实例化
    this.live2dBridge = live2dBridge || null;
  }

  /**
   * 启动所有监控
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('[监工] 启动所有监控模块');
    for (const [id, mon] of Object.entries(this.monitors)) {
      try {
        mon.start();
      } catch (err) {
        console.log(`[监工] ${id} 监控启动失败:`, err.message);
      }
    }

    // 启动 idle 检测
    this.idleDetector.start();
    // Live2D 桥由外部注入并启动，此处仅检查是否可用
    if (this.live2dBridge && typeof this.live2dBridge.start === 'function') {
      try { this.live2dBridge.start(); } catch {}
    }
    console.log('[监工] idleDetector 已启动' + (this.live2dBridge ? '，live2dStateBridge 已连接' : ''));

    // 监听监控事件，触发桌宠反应
    this._subscribeEvents();
  }

  /**
   * 停止所有监控
   */
  stop() {
    this.isRunning = false;
    for (const mon of Object.values(this.monitors)) {
      try { mon.stop(); } catch {}
    }
    // 停止 idle 与 Live2D 桥，释放监听器与定时器
    try { this.idleDetector.stop(); } catch {}
    if (this.live2dBridge) { try { this.live2dBridge.stop(); } catch {} }
    console.log('[监工] 已停止所有监控');
  }

  /**
   * 启用/禁用监工模式
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.stop();
    } else {
      this.start();
    }
  }

  /**
   * 订阅监控事件 — 通用处理所有工具的状态变更
   */
  _subscribeEvents() {
    if (!this.bus || typeof this.bus.subscribe !== 'function') return;

    // 仅匹配当前已启用的工具 id，避免为未实例化的工具触发反应
    const enabledIds = this.enabledToolIds;

    try {
      this.bus.subscribe('hooks.state_updated', (event) => {
        const toolName = event.data?.tool_name;
        if (!enabledIds.includes(toolName)) return;

        // 根据来源选择对应的 reaction 方法
        if (toolName === 'claude_code') {
          this._handleClaudeReaction(event.data.status, event.data.summary);
        } else if (toolName === 'trae') {
          this._handleTraeReaction(event.data.status, event.data.summary);
        } else {
          // 通用工具：直接从事件中提取 reaction
          this._handleGenericReaction(toolName, event.data.status, event.data.summary);
        }
      });
    } catch {
      // EventBus 可能不支持 subscribe
    }
  }

  /**
   * 处理 Claude Code 状态反应
   */
  _handleClaudeReaction(status, summary) {
    if (!this.enabled || !this.isRunning) return;
    const monitor = this.monitors.claude_code;
    // 配置未启用 claude_code 时直接返回，避免访问不存在的方法
    if (!monitor) return;
    const reaction = monitor._suggestPetReaction(status);
    if (!reaction?.message) return;
    this._emitPetReaction(reaction, 'claude_code', summary, status);
  }

  /**
   * 处理 Trae 状态反应
   */
  _handleTraeReaction(status, summary) {
    if (!this.enabled || !this.isRunning) return;
    const monitor = this.monitors.trae;
    if (!monitor) return;
    const reaction = monitor._suggestPetReaction(status);
    if (!reaction?.message) return;
    this._emitPetReaction(reaction, 'trae', summary, status);
  }

  /**
   * 处理通用工具状态反应
   */
  _handleGenericReaction(toolName, status, summary) {
    if (!this.enabled || !this.isRunning) return;
    const monitor = this.monitors[toolName];
    const reaction = monitor ? monitor._suggestReaction(status) : null;
    if (!reaction?.message) return;
    this._emitPetReaction(reaction, toolName, summary, status);
  }

  /**
   * 触发桌宠反应（带冷却控制）
   * @param {Object} reaction - { emotion, action, message }
   * @param {string} source - 工具来源 (claude_code/trae/cursor 等)
   * @param {string} summary - 状态摘要
   * @param {string} [activity] - 统一状态值（如 error/completed/coding），用于 AutoRouter 路由匹配
   */
  _emitPetReaction(reaction, source, summary, activity) {
    const now = Date.now();
    if (now - this.lastReactionTime < this.reactionCooldown) return;
    if (this.lastReaction && this.lastReaction.message === reaction.message) return;

    this.lastReactionTime = now;
    this.lastReaction = reaction;

    console.log(`[监工] 桌宠反应: [${source}] ${reaction.message}`);

    // 调用回调（保持向后兼容）
    if (typeof this.onPetReaction === 'function') {
      try { this.onPetReaction({
        type: 'supervisor_reaction',
        source,
        emotion: reaction.emotion,
        action: reaction.action,
        message: reaction.message,
        summary: summary || '',
        timestamp: now
      }); } catch (err) {
        console.error('[监工] onPetReaction 错误:', err.message);
      }
    }

    // 发布事件
    if (this.bus && typeof this.bus.publish === 'function') {
      try {
        // ★ 核心修复：发布 supervisor.reaction 事件
        // 这是 AutoRouter、ProactiveNotifier、AutonomousAgentLoop 等模块的事件入口
        // 之前此事件从未发布，导致下游模块全部失聪
        //
        // activity 字段传递统一状态值（如 error/completed），AutoRouter 用它匹配 EVENT_RULES
        // 之前没有这个字段，导致 AutoRouter 只能从 emotion 推断 activity，error 规则永远匹配不上
        this.bus.publish('supervisor.reaction', {
          source,
          emotion: reaction.emotion,
          action: reaction.action,
          activity: activity || 'completed',
          message: reaction.message,
          summary: summary || '',
          status: activity || reaction.status || 'completed',
          timestamp: now,
        });

        // 同时发布 hooks.state_updated（由 live2dStateBridge 按 emotion-mapping.json 映射）
        this.bus.publish('hooks.state_updated', {
          tool_name: source,
          status: activity || 'completed',
          summary: summary || reaction.message,
          emotion: reaction.emotion
        });
      } catch {}
    }

    if (this.broadcastBus) {
      this.broadcastBus.publish('supervisor', { source, emotion: reaction.emotion, activity: activity || 'completed', message: reaction.message });
    }
  }

  /**
   * 获取所有监控状态
   */
  getStatus() {
    const toolStatus = {};
    for (const [id, mon] of Object.entries(this.monitors)) {
      toolStatus[id] = mon.getStatus();
    }

    const status = {
      enabled: this.enabled,
      isRunning: this.isRunning,
      ...toolStatus,
      lastReaction: this.lastReaction,
      // 暴露当前已启用的工具 id 列表，便于上游 UI/IPC 反映配置真实情况
      supportedTools: this.enabledToolIds,
    };

    // 自动记录快照到持久化层
    if (this.monitorStore) {
      try { this.monitorStore.recordSnapshot(status); } catch {}
    }

    return status;
  }
}

module.exports = { Supervisor };
