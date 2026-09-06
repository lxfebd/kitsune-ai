/**
 * 通用 AI 编程工具监控器
 * 可配置化监控任意 AI 编程工具（Cursor、Windsurf、龙虾等）
 *
 * 设计原则：
 * 1. 复用 ClaudeCodeMonitor/TraeMonitor 的进程检测+文件监控模式
 * 2. 通过构造函数配置差异化行为（进程名、日志路径、输出模式）
 * 3. 统一事件格式，Supervisor 无需区分来源
 */

const fs = require('node:fs');
const fsp = fs.promises;
const path = require('path');
const { execFile } = require('node:child_process');
const { mapToUnifiedState } = require('./activityStates');

// ── 常量 ──
const POLL_INTERVAL_MS = 8000;
const RECENT_WINDOW_MS = 60000;
const MAX_RECENT_CHANGES = 100;
const MAX_LOG_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_OUTPUT_LENGTH = 2000;
const MAX_FULL_LENGTH = 30000;
const PROCESS_TIMEOUT = 3000;
const LINES_TAIL_COUNT = 30;

// NOTICE: fs.watch(recursive: true) 在 Windows 上无法排除子目录，node_modules/.git 等大型目录
// 会触发海量事件导致 CPU 飙升和事件队列阻塞（R3/R4）。在回调中按路径段过滤是最稳妥的跨平台方案。
const IGNORED_DIRS = ['node_modules', '.git', 'dist', 'out', '.pnpm', 'build', '.turbo'];

// 预设工具配置
const TOOL_PRESETS = {
  cursor: {
    name: 'Cursor',
    processPatterns: ['cursor', 'Cursor'],
    outputPatterns: {
      thinking: [/thinking/i, /analyzing/i, /let me/i],
      coding: [/writing code/i, /creating file/i, /editing/i, /applied/i],
      executing: [/running/i, /executing/i, /terminal/i],
      completed: [/done/i, /completed/i, /finished/i],
      error: [/error/i, /failed/i, /cannot/i, /exception/i],
    },
    logPaths: [
      () => path.join(process.cwd(), '.cursor', 'logs'),
      () => path.join(process.env.APPDATA || '', 'Cursor', 'User', 'logs'),
    ],
  },
  trae: {
    name: 'Trae',
    processPatterns: ['trae', 'Trae'],
    outputPatterns: {
      thinking: [/thinking/i, /analyzing/i, /让我/i, /思考/i],
      coding: [/writing code/i, /creating file/i, /editing/i, /写代码/i, /创建文件/i],
      executing: [/running/i, /executing/i, /terminal/i, /运行/i, /执行/i],
      completed: [/done/i, /completed/i, /finished/i, /完成/i],
      error: [/error/i, /failed/i, /cannot/i, /exception/i, /错误/i, /失败/i],
    },
    logPaths: [
      () => path.join(process.cwd(), '.trae', 'logs'),
      () => path.join(process.env.APPDATA || '', 'Trae', 'User', 'logs'),
    ],
  },
  windsurf: {
    name: 'Windsurf',
    processPatterns: ['windsurf', 'Windsurf'],
    outputPatterns: {
      thinking: [/thinking/i, /analyzing/i, /planning/i],
      coding: [/applying edit/i, /editing/i, /file changed/i],
      executing: [/running/i, /executing/i, /shell/i],
      completed: [/done/i, /completed/i, /applied/i],
      error: [/error/i, /failed/i, /conflict/i],
    },
    logPaths: [
      () => path.join(process.cwd(), '.windsurf', 'logs'),
    ],
  },
  lobster: {
    name: '龙虾',
    processPatterns: ['lobster', 'Lobster', 'longke'],
    outputPatterns: {
      thinking: [/思考/i, /分析/i, /让我/i],
      coding: [/写代码/i, /创建文件/i, /编辑/i, /修改/i],
      executing: [/运行/i, /执行/i, /命令/i],
      completed: [/完成/i, /完成啦/i, /好了/i],
      error: [/错误/i, /失败/i, /不行/i],
    },
    logPaths: [
      () => path.join(process.cwd(), '.lobster', 'logs'),
    ],
  },
  aider: {
    name: 'Aider',
    processPatterns: ['aider', 'Aider'],
    outputPatterns: {
      thinking: [/thinking/i, /analyzing/i, /planning/i],
      coding: [/applying/i, /editing/i, /file changed/i],
      executing: [/running/i, /executing/i, /command/i],
      completed: [/done/i, /completed/i, /applied/i],
      error: [/error/i, /failed/i, /conflict/i],
    },
    logPaths: [
      () => path.join(process.cwd(), '.aider', 'logs'),
    ],
  },
  codex: {
    name: 'Codex (OpenAI)',
    processPatterns: ['codex', 'Codex'],
    outputPatterns: {
      thinking: [/searching/i, /reading/i, /planning/i],
      coding: [/writing/i, /creating/i, /editing/i, /patch/i],
      executing: [/running/i, /executing/i, /command/i],
      completed: [/done/i, /completed/i, /success/i],
      error: [/error/i, /failed/i, /issue/i],
    },
    logPaths: [
      () => path.join(process.cwd(), '.codex', 'sessions'),
    ],
  },
};

function matchPatterns(patterns, text) {
  if (patterns instanceof RegExp) return patterns.test(text);
  if (Array.isArray(patterns)) return patterns.some(p => p.test(text));
  return false;
}

// NOTICE: fs.watch 在 Windows 上可能返回 '\' 或 '/' 分隔的路径，统一按两种分隔符拆分以稳健识别忽略目录。
function isIgnoredPath(filePath) {
  if (!filePath) return false;
  const segments = filePath.split(/[\\/]/);
  return segments.some(seg => IGNORED_DIRS.includes(seg));
}

class GenericAiToolMonitor {
  /**
   * @param {Object} options
   * @param {string} options.toolKey - 工具标识 (cursor/windsurf/lobster/codex) 或自定义
   * @param {Object} options.config - 工具配置（不传则使用预设）
   * @param {EventBus} options.bus - EventBus 实例
   * @param {Object} [options.logger] - 日志实例，降级为 console
   */
  constructor({ toolKey, config: customConfig, bus, logger } = {}) {
    this.toolKey = toolKey || 'unknown';
    this.config = customConfig || TOOL_PRESETS[this.toolKey] || TOOL_PRESETS.cursor;
    this.bus = bus;
    this.logger = logger || console;
    this.isRunning = false;
    this.lastStatus = null;
    this.pollInterval = POLL_INTERVAL_MS;
    this.pollTimer = null;
    this.fileWatcher = null;
    this.recentFileChanges = [];
  }

  get eventName() {
    return `monitor.${this.toolKey}.status`;
  }

  get hookToolName() {
    return this.toolKey;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.logger.info(`[GenericMonitor:${this.config.name}] 已启动`);
    this._startFileWatcher();
    this._startPolling();
  }

  stop() {
    this.isRunning = false;
    if (this.pollTimer) { clearTimeout(this.pollTimer); this.pollTimer = null; }
    if (this.fileWatcher) { this.fileWatcher.close(); this.fileWatcher = null; }
    this.logger.info(`[GenericMonitor:${this.config.name}] 已停止`);
  }

  _startFileWatcher() {
    try {
      const watchExts = ['.js', '.ts', '.jsx', '.tsx', '.vue', '.py', '.go', '.rs', '.css', '.html'];
      this.fileWatcher = fs.watch(process.cwd(), { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        if (isIgnoredPath(filename)) return;
        const ext = path.extname(filename).toLowerCase();
        if (!watchExts.includes(ext)) return;

        this.recentFileChanges.push({ file: filename, type: eventType, time: Date.now() });
        // 容量上限：防止构建任务导致数组膨胀
        if (this.recentFileChanges.length > MAX_RECENT_CHANGES) {
          this.recentFileChanges = this.recentFileChanges.slice(-MAX_RECENT_CHANGES);
        }
        const oneMinAgo = Date.now() - RECENT_WINDOW_MS;
        this.recentFileChanges = this.recentFileChanges.filter(c => c.time > oneMinAgo);

        this._check().catch(err => this.logger?.debug('[Monitor] check failed:', err.message));
      });
    } catch (err) {
      this.logger.warn(`[GenericMonitor:${this.config.name}] 文件监控启动失败:`, err.message);
    }
  }

  _startPolling() {
    if (!this.isRunning) return;
    this._check().catch(err => {
      this.logger.error(`[GenericMonitor:${this.config.name}] 检查失败:`, err.message);
    });
    this.pollTimer = setTimeout(() => this._startPolling(), this.pollInterval);
  }

  async _check() {
    const status = {
      isRunning: false,
      activity: 'idle',
      recentChanges: this.recentFileChanges.length,
      lastOutput: '',
      hasError: false,
      errorMessage: '',
      timestamp: Date.now(),
    };

    const detect = await this._checkProcess();
    status.isRunning = detect.running;
    status.detectSignal = detect.signal;

    if (!detect.running) {
      if (this.recentFileChanges.length > 0) {
        status.activity = 'file_changes';
        status.lastOutput = `${this.recentFileChanges.length} 个文件变更`;
        this._emitStatus(status);
      } else if (this.lastStatus?.isRunning) {
        status.activity = 'stopped';
        this._emitStatus(status);
      }
      this.lastStatus = status;
      return;
    }

    const logContent = await this._readLogs();
    if (logContent) {
      status.lastOutput = logContent.recent;
      status.hasError = logContent.hasError;
      status.errorMessage = logContent.errorMessage || '';
      status.activity = this._analyzeActivity(logContent.recent);
    } else if (this.recentFileChanges.length > 0) {
      status.activity = 'editing';
    }

    this._emitStatus(status);
    this.lastStatus = status;
  }

  /**
   * 检测工具进程是否在运行。
   *
   * 策略（优先级）：
   * 1. 文件系统信号：日志目录下的最新文件 mtime 在阈值内 → 正在运行
   * 2. 进程检测：tasklist/pgrep（辅助，Windows 上进程名可能不匹配）
   *
   * 返回 { running, signal }
   */
  async _checkProcess() {
    // 1. 文件系统信号：检查日志目录中最新文件的 mtime
    const fileSignal = await this._detectByFileActivity()
    if (fileSignal) {
      this._lastFileSignalAt = Date.now()
      return { running: true, signal: 'file' }
    }

    // 2. 进程检测（辅助信号）
    const processRunning = await this._detectByProcessList()
    if (processRunning) {
      return { running: true, signal: 'process' }
    }

    // 3. 文件信号惯性（2 倍阈值内曾检测到文件活动，仍视为运行中）
    if (this._lastFileSignalAt && Date.now() - this._lastFileSignalAt < POLL_INTERVAL_MS * 3) {
      return { running: true, signal: 'file_inertia' }
    }

    return { running: false, signal: 'none' }
  }

  /**
   * 通过文件系统信号检测。
   * 检查 logPaths 中最新文件的 mtime 是否在阈值内。
   */
  _detectByFileActivity() {
    const now = Date.now()
    const threshold = POLL_INTERVAL_MS * 2
    const logPathFns = this.config.logPaths || []

    for (const fn of logPathFns) {
      try {
        const logDir = typeof fn === 'function' ? fn() : fn
        if (!logDir) continue
        if (!fs.existsSync(logDir)) continue

        const files = fs.readdirSync(logDir)
        for (const file of files.slice(-5)) {
          try {
            const filePath = path.join(logDir, file)
            const stat = fs.statSync(filePath)
            if (now - stat.mtimeMs < threshold) {
              return true
            }
          } catch { /* 跳过 */ }
        }
      } catch { /* 跳过 */ }
    }

    return false
  }

  /**
   * 通过进程列表检测（辅助）。
   * Windows 上 tasklist 过滤，Unix 上 pgrep。
   */
  _detectByProcessList() {
    return new Promise((resolve) => {
      let cmd, args;
      if (process.platform === 'win32') {
        cmd = 'tasklist';
        const pattern = (this.config.processPatterns || [])[0];
        args = ['/FI', `IMAGENAME eq ${pattern}*`, '/FO', 'CSV', '/NH'];
      } else {
        cmd = 'pgrep';
        const pattern = (this.config.processPatterns || [])[0];
        args = ['-f', pattern];
      }
      execFile(cmd, args, { timeout: PROCESS_TIMEOUT }, (err, stdout) => {
        if (err) { resolve(false); return; }
        resolve(stdout.trim().length > 0);
      });
    });
  }

  // 异步日志读取 + 文件大小保护，避免阻塞主线程和OOM
  async _readLogs() {
    const logPathFns = this.config.logPaths || [];
    let recentLines = [];
    let fullContent = '';
    let hasError = false;
    let errorMessage = '';

    for (const fn of logPathFns) {
      try {
        const logDir = typeof fn === 'function' ? fn() : fn;
        if (!logDir) continue;
        // 异步检查目录存在性
        let stat;
        try { stat = await fsp.stat(logDir); } catch { continue; }
        if (!stat.isDirectory()) continue;

        const files = await fsp.readdir(logDir);
        const logFiles = files.filter(f =>
          f.endsWith('.jsonl') || f.endsWith('.json') || f.endsWith('.log') || f.endsWith('.txt')
        );

        for (const file of logFiles.slice(-2)) {
          const filePath = path.join(logDir, file);
          try {
            const stats = await fsp.stat(filePath);
            if (stats.size > MAX_LOG_FILE_SIZE) continue; // 跳过超大文件
            const content = await fsp.readFile(filePath, 'utf8');
            fullContent += content;
            const lines = content.trim().split('\n');
            recentLines.push(...lines.slice(-LINES_TAIL_COUNT));
            if (matchPatterns(this.config.outputPatterns?.error, content)) {
              hasError = true;
              const m = content.match(/(error|failed|exception|错误)[\s\S]{0,200}/i);
              if (m) errorMessage = m[0].substring(0, 200);
            }
          } catch (err) { this.logger?.debug('[Monitor] read log failed:', filePath, err.message); }
        }
      } catch (err) { this.logger?.debug('[Monitor] logDir failed:', err.message); }
    }

    if (recentLines.length === 0 && fullContent) {
      recentLines = fullContent.split('\n').slice(-20);
    }

    return {
      recent: recentLines.join('\n').substring(0, MAX_OUTPUT_LENGTH),
      full: fullContent.substring(0, MAX_FULL_LENGTH),
      hasError,
      errorMessage,
    };
  }

  _analyzeActivity(text) {
    if (!text) return 'idle';
    const op = this.config.outputPatterns || {};
    if (matchPatterns(op.error, text)) return 'error';
    if (matchPatterns(op.completed, text)) return 'completed';
    if (matchPatterns(op.coding, text)) return 'coding';
    if (matchPatterns(op.executing, text)) return 'executing';
    if (matchPatterns(op.thinking, text)) return 'thinking';
    return 'active';
  }

  _emitStatus(status) {
    const statusKey = `${status.isRunning}:${status.activity}:${status.hasError}`;
    if (this.lastStatus &&
        `${this.lastStatus.isRunning}:${this.lastStatus.activity}:${this.lastStatus.hasError}` === statusKey) {
      return;
    }

    const event = {
      type: `${this.toolKey}_status`,
      ...status,
      toolName: this.config.name,
      petReaction: this._suggestReaction(status),
    };

    if (this.bus) {
      this.bus.publish(this.eventName, event);
      this.bus.publish('hooks.state_updated', {
        session_id: `${this.toolKey}_monitor`,
        state: mapToUnifiedState(status.activity, 'generic'),
        data: {
          tool_name: this.hookToolName,
          summary: this._getSummary(status),
          status,
        },
      });
    }
  }

  _suggestReaction(status) {
    if (!status.isRunning) {
      return status.activity === 'file_changes'
        ? { emotion: 'happy', action: 'nod', message: `${this.config.name} 在改代码` }
        : { emotion: 'sleepy', action: 'sleep', message: `${this.config.name} 休息了` };
    }
    const map = {
      thinking: { emotion: 'curious', action: 'tilt_head', message: `${this.config.name} 在思考~` },
      coding: { emotion: 'excited', action: 'happy', message: `${this.config.name} 写代码中！` },
      executing: { emotion: 'focused', action: 'watch', message: `${this.config.name} 执行中...` },
      completed: { emotion: 'happy', action: 'celebrate', message: `${this.config.name} 搞定啦！` },
      error: { emotion: 'worried', action: 'concern', message: `${this.config.name} 出问题了` },
    };
    return map[status.activity] || { emotion: 'neutral', action: 'idle', message: '' };
  }

  _getSummary(status) {
    if (!status.isRunning) return `${this.config.name} 未运行`;
    const labels = {
      thinking: '思考中', coding: '编写代码', executing: '执行命令',
      completed: '任务完成', error: `错误: ${status.errorMessage?.substring(0, 40)}`,
      editing: '编辑文件',
    };
    return `${this.config.name}: ${labels[status.activity] || status.activity}`;
  }

  getStatus() {
    return this.lastStatus || {
      isRunning: false,
      activity: 'idle',
      recentChanges: 0,
      lastOutput: '',
      hasError: false,
      errorMessage: '',
      timestamp: 0,
      toolName: this.config.name,
    };
  }
}

module.exports = { GenericAiToolMonitor, TOOL_PRESETS };
