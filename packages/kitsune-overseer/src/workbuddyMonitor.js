/**
 * Workbuddy 监控器（v1：audit-log.jsonl 结构化信号优先）
 *
 * Workbuddy 把每次命令安全性裁决写到
 *   ~/.workbuddy/audit-log/*.jsonl
 *
 * 每行是一段 audition 记录，关键字段：
 *   category        — 命令类别（command-safety 等）
 *   decision        — 裁决结果（sandbox-executed / auto-approved / ...）
 *   commandPreview  — 被评估的命令预览
 *   sessionId       — 归属会话
 *
 * 与 ClaudeCodeMonitor 同范式：
 *   1. audit-log 目录 mtime 在阈值内 → 正在运行（主信号，跨平台一致）
 *   2. 进程检测辅助（Windows 上名称多为 workbuddy，可辅助）
 *   3. 文件信号惯性：2 倍阈值内曾活动仍视为运行中
 *
 * 事件输出协议与 GenericAiToolMonitor/ClaudeCodeMonitor 对齐：
 *   this.bus.publish('monitor.<id>.status', {...})
 *   this.bus.publish('hooks.state_updated', { state: mapToUnifiedState(...) })
 */

const fs = require('node:fs');
const path = require('node:path');
const chokidar = require('chokidar');
const { mapToUnifiedState } = require('./activityStates');
const { TailFiles } = require('./tailFiles');

// Workbuddy 数据根目录（可被环境变量覆盖；默认 ~/.workbuddy）
const WORKBUDDY_HOME = process.env.WORKBUDDY_HOME
  || path.join(process.env.USERPROFILE || process.env.HOME || '', '.workbuddy');

// audit-log 目录
const AUDIT_LOG_DIR = path.join(WORKBUDDY_HOME, 'audit-log');

// 检测存活阈值：此秒数内 audit-log 有更新即视为"正在运行"
const FILE_ACTIVITY_THRESHOLD_MS = 60_000; // 60 秒

// decision 值 → 统一 activity（category 为 command-safety 时）
const DECISION_ACTIVITY = {
  'sandbox-executed': 'executing',
  'auto-approved': 'executing',
  'approved': 'executing',
  'blocked': 'error',
  'denied': 'error',
  'error': 'error',
};
const KNOWN_DECISIONS = new Set(Object.keys(DECISION_ACTIVITY));

class WorkbuddyMonitor {
  /**
   * @param {Object} options
   * @param {EventBus} [options.bus] - EventBus 实例
   * @param {number} [options.pollInterval] - 轮询间隔（毫秒），默认 10000
   * @param {boolean} [options.watchMode] - 是否启用 chokidar（默认 true）
   * @param {Object} [options.logger] - 日志实例
   */
  constructor({ bus, eventBus, pollInterval, watchMode, logger } = {}) {
    this.bus = bus || eventBus;
    this.logger = logger || console;
    this.isRunning = false;
    this.lastStatus = null;

    this.pollInterval = typeof pollInterval === 'number' && pollInterval > 0
      ? pollInterval
      : 10000;
    this.watchMode = watchMode !== false;
    this.fileWatcher = null;
    this._wakeTimer = null;
    this._wakePending = false;
    this._wakeDebounceMs = 800;

    this.tail = new TailFiles();

    // 缓存：最新 audit-log 文件
    this._latestLog = '';
    this._lastLogMTime = 0;
    this._recentLines = [];
    this._lastFileSignalAt = 0;
  }

  get eventName() {
    return 'monitor.workbuddy.status';
  }

  get hookToolName() {
    return 'workbuddy';
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.logger.info(`[WorkbuddyMonitor] 已启动，监控路径: ${AUDIT_LOG_DIR}`);
    if (this.watchMode) {
      this._startWatcher();
    }
    this._startPolling();
  }

  stop() {
    this.isRunning = false;
    if (this.pollTimer) { clearTimeout(this.pollTimer); this.pollTimer = null; }
    if (this._wakeTimer) { clearTimeout(this._wakeTimer); this._wakeTimer = null; }
    if (this.fileWatcher) { this.fileWatcher.close(); this.fileWatcher = null; }
    this.logger.info('[WorkbuddyMonitor] 已停止');
  }

  _startWatcher() {
    try {
      this.fileWatcher = chokidar.watch(AUDIT_LOG_DIR, {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
      });
      const wake = () => this._scheduleWake();
      this.fileWatcher.on('add', wake);
      this.fileWatcher.on('change', wake);
      this.fileWatcher.on('error', (err) => {
        this.logger.error('[WorkbuddyMonitor] watcher 错误:', err.message);
      });
    } catch (err) {
      this.logger.error('[WorkbuddyMonitor] 文件监控启动失败，仅保留轮询兜底:', err.message);
      this.fileWatcher = null;
    }
  }

  _scheduleWake() {
    this._wakePending = true;
    if (this._wakeTimer) return;
    this._wakeTimer = setTimeout(() => {
      this._wakeTimer = null;
      if (!this.isRunning || !this._wakePending) return;
      this._wakePending = false;
      this._check().catch((err) => this.logger.error('[WorkbuddyMonitor] 事件唤醒检查失败:', err.message));
    }, this._wakeDebounceMs);
  }

  _startPolling() {
    if (!this.isRunning) return;
    this._check().catch((err) => this.logger.error('[WorkbuddyMonitor] 检查失败:', err.message));
    this.pollTimer = setTimeout(() => this._startPolling(), this.pollInterval);
  }

  _hasAuditLog() {
    try { return fs.existsSync(AUDIT_LOG_DIR); } catch { return false; }
  }

  /** 找 audit-log 目录下最新的 .jsonl 文件 */
  _findLatestLog() {
    try {
      const files = fs.readdirSync(AUDIT_LOG_DIR)
        .filter((f) => f.endsWith('.jsonl'))
        .map((f) => ({ name: f, mtime: fs.statSync(path.join(AUDIT_LOG_DIR, f)).mtimeMs }));
      files.sort((a, b) => b.mtime - a.mtime);
      return files.length > 0 ? path.join(AUDIT_LOG_DIR, files[0].name) : '';
    } catch { return ''; }
  }

  async _detectRunning() {
    const latest = this._findLatestLog();
    if (!latest) return { running: false, signal: 'none' };

    let fileFresh = false;
    try {
      if (Date.now() - fs.statSync(latest).mtimeMs < FILE_ACTIVITY_THRESHOLD_MS) fileFresh = true;
    } catch {}

    if (fileFresh) {
      this._lastFileSignalAt = Date.now();
      if (latest !== this._latestLog) {
        this.tail.readNewLinesSync(latest);
        this._recentLines = [];
        this._latestLog = latest;
        this._lastLogMTime = fs.statSync(latest).mtimeMs;
      }
      return { running: true, signal: 'file', latest };
    }

    const proc = await this._detectByProcess();
    if (proc) return { running: true, signal: 'process', latest };

    if (this._lastFileSignalAt && Date.now() - this._lastFileSignalAt < FILE_ACTIVITY_THRESHOLD_MS * 2) {
      return { running: true, signal: 'file_inertia', latest };
    }
    return { running: false, signal: 'none', latest };
  }

  _detectByProcess() {
    return new Promise((resolve) => {
      if (process.platform === 'win32') {
        // Windows 上 workbuddy 进程名可识别情况不定，暂不做进程探测
        resolve(false);
        return;
      }
      const { execFile } = require('node:child_process');
      execFile('ps', ['aux'], { timeout: 5000 }, (err, stdout) => {
        if (err) { resolve(false); return; }
        resolve(/workbuddy/.test(stdout.toLowerCase()));
      });
    });
  }

  _readNewAuditLines() {
    if (!this._latestLog) return null;
    try {
      if (!fs.existsSync(this._latestLog)) return null;
      const st = fs.statSync(this._latestLog);
      if (st.mtimeMs === this._lastLogMTime) return null;
      this._lastLogMTime = st.mtimeMs;

      const { lines, truncated } = this.tail.readNewLinesSync(this._latestLog);
      if (truncated) this._recentLines = [];
      if (lines.length > 0) {
        this._recentLines.push(...lines);
        if (this._recentLines.length > 200) this._recentLines = this._recentLines.slice(-200);
      }
      return truncated ? lines : this._recentLines.slice(-80);
    } catch {
      return null;
    }
  }

  /** 从最近审计记录解析活动 */
  _analyzeActivity(lines) {
    if (!lines || lines.length === 0) return null;
    let activity = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        const decision = entry?.decision;
        if (decision && KNOWN_DECISIONS.has(decision)) {
          activity = DECISION_ACTIVITY[decision];
          break;
        }
      } catch {}
    }
    return activity;
  }

  /** 从最近审计记录取最后一条命令预览 */
  _readLastCommand(lines) {
    if (!lines || lines.length === 0) return '';
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry?.commandPreview && typeof entry.commandPreview === 'string') {
          return entry.commandPreview.substring(0, 200);
        }
      } catch {}
    }
    return '';
  }

  async _check() {
    if (!this._hasAuditLog()) {
      this._emitStatus({
        isRunning: false, activity: 'idle', detectSignal: 'none',
        currentTask: '', lastOutput: '', hasError: false,
        errorMessage: '', timestamp: Date.now(),
      });
      return;
    }

    const detect = await this._detectRunning();
    const status = {
      isRunning: detect.running,
      activity: 'idle',
      currentTask: '',
      lastOutput: '',
      lastToolCall: '',
      lastFilePath: '',
      hasError: false,
      errorMessage: '',
      tokenUsage: 0,
      detectSignal: detect.signal,
      timestamp: Date.now(),
    };

    if (detect.running) {
      const lines = this._readNewAuditLines();
      const activity = this._analyzeActivity(lines);
      if (activity) status.activity = activity;
      const cmd = this._readLastCommand(lines);
      if (cmd) status.lastOutput = cmd;
      if (lines && lines.length) {
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const entry = JSON.parse(lines[i]);
            if (entry?.decision === 'blocked' || entry?.decision === 'denied') {
              status.hasError = true;
              status.errorMessage = `命令被拦截: ${entry.commandPreview?.substring(0, 60) || ''}`;
            }
          } catch {}
        }
      }
    }

    this._emitStatus(status);
    this.lastStatus = status;
  }

  _emitStatus(status) {
    const key = `${status.isRunning}:${status.activity}:${status.hasError}`;
    if (this.lastStatus && `${this.lastStatus.isRunning}:${this.lastStatus.activity}:${this.lastStatus.hasError}` === key) {
      return;
    }

    const event = {
      type: 'workbuddy_status',
      ...status,
      petReaction: this._suggestPetReaction(status),
    };
    if (this.bus) {
      this.bus.publish('monitor.workbuddy.status', event);
      try {
        this.bus.publish('hooks.state_updated', {
          session_id: 'workbuddy_monitor',
          state: mapToUnifiedState(status.activity, 'generic'),
          data: {
            tool_name: 'workbuddy',
            summary: this._getSummary(status),
            status,
          },
        });
      } catch {}
    }
  }

  _getSummary(status) {
    if (!status.isRunning) return 'Workbuddy 未运行';
    const cmd = status.lastOutput ? `: ${status.lastOutput.substring(0, 50)}` : '';
    switch (status.activity) {
      case 'executing': return `Workbuddy 执行命令${cmd}`;
      case 'error': return `Workbuddy 拦截/出错了: ${status.errorMessage?.substring(0, 50) || ''}`;
      case 'completed': return 'Workbuddy 完成一批命令';
      default: return `Workbuddy 运行中${cmd}`;
    }
  }

  _suggestPetReaction(status) {
    const signal = {
      toolName: status.lastToolCall || undefined,
      hasError: Boolean(status.hasError),
      errorMessage: status.errorMessage || undefined,
    };
    if (!status.isRunning) {
      return this.lastStatus?.isRunning
        ? { emotion: 'sleepy', action: 'sleep', message: 'Workbuddy 休息了', ...signal }
        : { emotion: 'sleepy', action: 'sleep', message: 'Workbuddy 未运行', ...signal };
    }
    switch (status.activity) {
      case 'executing':
        return { emotion: 'focused', action: 'watch', message: 'Workbuddy 在跑命令', ...signal };
      case 'error':
        return { emotion: 'worried', action: 'concern', message: `Workbuddy 拦截了命令: ${status.errorMessage?.substring(0, 50) || ''}`, ...signal };
      default:
        return { emotion: 'neutral', action: 'idle', message: 'Workbuddy 运行中', ...signal };
    }
  }

  getStatus() {
    return this.lastStatus || {
      isRunning: false, activity: 'idle', currentTask: '',
      lastOutput: '', lastToolCall: '', lastFilePath: '',
      hasError: false, errorMessage: '', tokenUsage: 0,
      detectSignal: 'none', timestamp: 0,
    };
  }
}

module.exports = { WorkbuddyMonitor };