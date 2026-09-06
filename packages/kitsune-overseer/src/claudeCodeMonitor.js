/**
 * Claude Code 进程监控（v3：文件系统信号优先）
 *
 * ── 修复笔记 ──
 * 原实现依赖 tasklist/ps 进程名搜索来检测 Claude Code 是否运行。
 * 问题：Windows 上 Claude Code 的主进程是 node.exe，tasklist 搜 "claude" 永远匹配不到，
 * 且 Cursor/Trae 等基于 VS Code 的工具进程名可能是 Code.exe/Electron.exe，不是 trae/cursor。
 * 结果：监控器永远以为工具没在运行，整个监工系统形同虚设。
 *
 * 修复方案：改用文件系统信号作为主要检测手段。
 *   Claude Code 在运行时一定会写 ~/.claude/history.jsonl 和 trace 文件，
 *   检测文件 mtime 是否在最近 N 秒内更新，比进程名可靠得多，且跨平台一致。
 *   进程检测保留为辅助信号（仅 Unix 上 node/claude 进程名可识别时）。
 *
 * 监控来源（按优先级）：
 * 1. ~/.claude/history.jsonl mtime — 只要有交互就会更新
 * 2. ~/.claude/cc-haha/traces/*.jsonl — 旧版执行 trace（已被新版替代但仍保留兼容）
 * 3. ~/.claude/projects/<proj>/records/<file>.jsonl — 新版执行 trace
 * 4. 进程状态检测（tasklist/ps）— 辅助信号，仅用于非 Windows 或进程名可识别时
 * 5. git 变更分析
 */

const fs = require('node:fs');
const fsp = fs.promises;
const path = require('path');
const { execFile } = require('node:child_process');
const { mapToUnifiedState } = require('./activityStates');

// Claude Code 数据路径（跨平台）
const CLAUDE_HOME = process.env.CLAUDE_HOME || process.env.XDG_CONFIG_HOME
  ? path.join(process.env.XDG_CONFIG_HOME, 'claude')
  : path.join(process.env.USERPROFILE || process.env.HOME || '', '.claude');
const CLAUDE_HISTORY_FILE = path.join(CLAUDE_HOME, 'history.jsonl');
const OLD_TRACES_DIR = path.join(CLAUDE_HOME, 'cc-haha', 'traces');
const NEW_TRACES_DIR = path.join(CLAUDE_HOME, 'projects');

// 检测存活阈值：此秒数内文件有更新即视为"正在运行"
const FILE_ACTIVITY_THRESHOLD_MS = 60_000; // 60 秒

// Claude Code 进程名称特征（仅作为辅助信号）
const CLAUDE_PROCESS_PATTERNS = ['claude', '@anthropic-ai/claude-code', 'node'];

// NOTICE: 原实现用正则 matchPatterns 去"猜" activity（thinking/coding/executing…），
// 误报率极高——一段解释性文本里含 "running" 就会被误判成 executing。
// 新实现优先采用 trace 中的**真实结构化信号**：
//   1. entry.type === 'tool_use' / 'tool_result' → 直接拿到工具名，活动类型确定
//   2. entry.record.status === 'ok'|'error'      → 直接拿到执行结果状态
//   3. 仅当完全没有结构化信号时，才退回正则兜底（见 _analyzeActivityFallback）。
//
// 此外暴露 STRUCTURED_TOOL_ACTIVITY 映射，把 Claude 真实工具名（Write/Edit/Bash/…）
// 映射到统一活动类型，供下游 Supervisor 精确路由，不再依赖模糊文本。

// 真实工具名 → 统一活动类型（从 cc-haha trace 的 tool_use 条目提取）
const STRUCTURED_TOOL_ACTIVITY = {
  // 思考/规划类
  Task: 'thinking',
  TodoWrite: 'thinking',
  EnterPlanMode: 'thinking',
  // 编码类
  Write: 'coding',
  Edit: 'coding',
  MultiEdit: 'coding',
  NotebookEdit: 'coding',
  // 执行类
  Bash: 'executing',
  Shell: 'executing',
  // 检索类
  Read: 'thinking',
  Grep: 'thinking',
  Glob: 'thinking',
  WebFetch: 'thinking',
  WebSearch: 'thinking',
};

// 活动状态模式（仅作最后的文本兜底，优先级最低）
const ACTIVITY_PATTERNS = {
  thinking: [/thinking/i, /analyzing/i, /let me/i, /i'll/i, /i think/i],
  coding: [/writing code/i, /creating file/i, /editing/i, /file created/i, /updated/i, /Write/i, /Edit/i],
  executing: [/running/i, /executing/i, /shell command/i, /\$ /, /Bash/i, /command executed/i],
  completed: [/done/i, /completed/i, /finished/i, /successfully/i, /Task completed/i],
  error: [/error/i, /failed/i, /cannot/i, /unable to/i, /exception/i],
};

function matchPatterns(patterns, text) {
  if (Array.isArray(patterns)) return patterns.some(p => p.test(text));
  return false;
}

/**
 * 文本兜底：仅在 trace 完全无结构化信号时调用。
 * 把"正则匹配到的最后一个匹配类别"作为活动，避免多类别误叠加。
 */
function analyzeActivityFallback(text) {
  if (!text) return 'active';
  if (matchPatterns(ACTIVITY_PATTERNS.error, text)) return 'error';
  if (matchPatterns(ACTIVITY_PATTERNS.completed, text)) return 'completed';
  if (matchPatterns(ACTIVITY_PATTERNS.coding, text)) return 'coding';
  if (matchPatterns(ACTIVITY_PATTERNS.executing, text)) return 'executing';
  if (matchPatterns(ACTIVITY_PATTERNS.thinking, text)) return 'thinking';
  return 'active';
}

class ClaudeCodeMonitor {
  constructor({ bus, eventBus, pollInterval } = {}) {
    this.bus = bus || eventBus;
    this.isRunning = false;
    this.lastStatus = null;
    // NOTICE:
    // 轮询间隔从硬编码 3000ms 改为可配置，默认 10000ms。
    // 原因：3s 间隔会频繁触发 tasklist/ps 子进程与 history.jsonl/trace 文件读取，
    // 在 Claude Code 空闲时持续占用 CPU（R6 性能问题）。
    // 10s 间隔在状态感知延迟与 CPU 开销之间取得平衡，由 overseer.yaml 的
    // pollInterval 字段统一注入，缺失时回退到 10000。
    this.pollInterval = typeof pollInterval === 'number' && pollInterval > 0
      ? pollInterval
      : 10000;
    this.pollTimer = null;

    // 缓存
    this._lastHistoryLine = 0;
    this._lastTraceMTime = 0;
    this._currentTask = '';
    this._lastActivity = 'idle';
    this._lastToolCall = '';
    this._lastFilePath = '';
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[ClaudeCodeMonitor] 已启动，监控路径:', CLAUDE_HOME);
    this._startPolling();
  }

  stop() {
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    console.log('[ClaudeCodeMonitor] 已停止');
  }

  _startPolling() {
    if (!this.isRunning) return;
    this._check().catch(err => {
      console.error('[ClaudeCodeMonitor] 检查失败:', err.message);
    });
    this.pollTimer = setTimeout(() => this._startPolling(), this.pollInterval);
  }

  async _check() {
    const status = {
      isRunning: false,
      activity: 'idle',
      currentTask: '',
      lastOutput: '',
      lastToolCall: '',
      lastFilePath: '',
      hasError: false,
      errorMessage: '',
      tokenUsage: 0,
      detectSignal: 'none',
      timestamp: Date.now(),
    };

    // 1. 检测运行状态（文件系统信号优先 + 进程辅助）
    const detect = await this._checkProcessRunning();
    status.isRunning = detect.running;
    status.detectSignal = detect.signal;

    // 2. 读取用户最新输入（当前任务）
    const latestUserInput = this._readLatestUserInput();
    if (latestUserInput) {
      this._currentTask = latestUserInput;
    }
    status.currentTask = this._currentTask;

    // 3. 如果检测到运行，读取实时 trace
    if (status.isRunning) {
      const traceInfo = this._readLatestTrace();
      if (traceInfo) {
        status.activity = traceInfo.activity;
        status.lastOutput = traceInfo.lastOutput;
        status.lastToolCall = traceInfo.lastToolCall;
        status.lastFilePath = traceInfo.lastFilePath;
        status.hasError = traceInfo.hasError;
        status.errorMessage = traceInfo.errorMessage;
        status.tokenUsage = traceInfo.tokenUsage;

        this._lastActivity = traceInfo.activity;
        this._lastToolCall = traceInfo.lastToolCall;
        this._lastFilePath = traceInfo.lastFilePath;
      } else {
        // trace 读取失败，保持上次状态
        status.activity = this._lastActivity;
        status.lastToolCall = this._lastToolCall;
        status.lastFilePath = this._lastFilePath;
      }
    } else {
      // 未检测到运行，检查 git 变更
      const gitChanges = await this._getRecentGitChanges();
      if (gitChanges.hasChanges) {
        status.activity = 'code_changed';
        status.lastOutput = `代码已变更: +${gitChanges.addedLines} -${gitChanges.removedLines}`;
      } else if (this.lastStatus?.isRunning) {
        status.activity = 'stopped';
      }
    }

    this._emitStatus(status);
    this.lastStatus = status;
  }

  /**
   * 检测 Claude Code 是否在运行。
   *
   * 策略（按优先级）：
   * 1. 文件系统信号：history.jsonl 或 traces 目录中最新文件 mtime 在最近
   *    FILE_ACTIVITY_THRESHOLD_MS 内 → 正在运行（最可靠，跨平台一致）
   * 2. 进程检测：tasklist/ps 搜索进程名（辅助信号，Windows 上 node.exe 无法识别）
   *
   * 返回 { running, signal } 结构，signal 标明检测来源（'file'|'process'|'none'），
   * 供调试与日志排查。
   */
  async _checkProcessRunning() {
    // 1. 文件系统信号（主检测手段）
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

    // 3. 文件信号的"惯性"——如果 2 倍阈值内曾检测到文件活动，仍视为运行中
    // 避免 Claude Code 空闲时（不写文件但进程仍在）被误判为已停止
    if (this._lastFileSignalAt && Date.now() - this._lastFileSignalAt < FILE_ACTIVITY_THRESHOLD_MS * 2) {
      return { running: true, signal: 'file_inertia' }
    }

    return { running: false, signal: 'none' }
  }

  /**
   * 通过文件系统信号检测。
   * 检查 history.jsonl 和所有 trace 目录下最新文件的 mtime。
   * 任一文件在阈值内更新 → 返回 true。
   */
  _detectByFileActivity() {
    const now = Date.now()
    const threshold = FILE_ACTIVITY_THRESHOLD_MS
    const candidates = [CLAUDE_HISTORY_FILE]

    // 扫描新版 trace 目录：~/.claude/projects/*/records/*.jsonl
    try {
      if (fs.existsSync(NEW_TRACES_DIR)) {
        const projects = fs.readdirSync(NEW_TRACES_DIR)
        for (const project of projects) {
          const recordsDir = path.join(NEW_TRACES_DIR, project, 'records')
          if (fs.existsSync(recordsDir)) {
            const traceFiles = fs.readdirSync(recordsDir)
              .filter(f => f.endsWith('.jsonl'))
              .map(f => path.join(recordsDir, f))
            candidates.push(...traceFiles)
          }
        }
      }
    } catch { /* 目录不可读则跳过 */ }

    // 扫描旧版 trace 目录
    try {
      if (fs.existsSync(OLD_TRACES_DIR)) {
        const oldFiles = fs.readdirSync(OLD_TRACES_DIR)
          .filter(f => f.endsWith('.jsonl'))
          .map(f => path.join(OLD_TRACES_DIR, f))
        candidates.push(...oldFiles)
      }
    } catch { /* 跳过 */ }

    // 检查所有候选文件，任一文件在阈值内更新 → 有活动
    for (const filePath of candidates) {
      try {
        const stat = fs.statSync(filePath)
        if (now - stat.mtimeMs < threshold) {
          return true
        }
      } catch { /* 文件不存在或不可读，跳过 */ }
    }

    return false
  }

  /**
   * 通过进程列表检测（辅助信号）。
   * 仅用于非 Windows 平台（进程名可识别时）。
   * Windows 上 node.exe 无法区分，返回 false。
   */
  _detectByProcessList() {
    return new Promise((resolve) => {
      // Windows 上 Claude Code 进程名是 node.exe，无法区分，直接返回 false
      if (process.platform === 'win32') {
        resolve(false)
        return
      }
      const cmd = 'ps';
      const args = ['aux'];
      execFile(cmd, args, { timeout: 5000 }, (err, stdout) => {
        if (err) { resolve(false); return; }
        const output = stdout.toLowerCase();
        resolve(CLAUDE_PROCESS_PATTERNS.some(p => output.includes(p.toLowerCase())));
      });
    });
  }

  /**
   * 读取用户最新输入（从 history.jsonl）
   */
  _readLatestUserInput() {
    try {
      if (!fs.existsSync(CLAUDE_HISTORY_FILE)) return null;

      const content = fs.readFileSync(CLAUDE_HISTORY_FILE, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      if (lines.length === 0) return null;

      // 读取最后几行，找最新的用户输入
      const recentLines = lines.slice(-5);
      for (let i = recentLines.length - 1; i >= 0; i--) {
        try {
          const entry = JSON.parse(recentLines[i]);
          if (entry.display && typeof entry.display === 'string') {
            // 截断过长的输入
            return entry.display.substring(0, 200);
          }
        } catch {}
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 读取最新 trace 文件（实时活动）
   *
   * 探测路径（按优先级）：
   * 1. ~/.claude/projects/<proj>/records/<file>.jsonl — 新版 Claude Code
   * 2. ~/.claude/cc-haha/traces/*.jsonl — 旧版 Claude Code
   *
   * 返回第一个有内容的 trace 目录的最新文件内容。
   */
  _readLatestTrace() {
    // 收集所有候选 trace 目录
    const traceDirs = []
    // 新版路径：~/.claude/projects/*/records/
    try {
      if (fs.existsSync(NEW_TRACES_DIR)) {
        const projects = fs.readdirSync(NEW_TRACES_DIR)
        for (const project of projects) {
          const recordsDir = path.join(NEW_TRACES_DIR, project, 'records')
          if (fs.existsSync(recordsDir)) {
            traceDirs.push(recordsDir)
          }
        }
      }
    } catch { /* 跳过 */ }
    // 旧版路径
    if (fs.existsSync(OLD_TRACES_DIR)) {
      traceDirs.push(OLD_TRACES_DIR)
    }
    // 默认回退（兼容旧版配置）
    if (traceDirs.length === 0) return null;

    // 在所有目录中找最新的 trace 文件
    let latestFile = '';
    let latestMtime = 0;
    for (const dir of traceDirs) {
      try {
        const files = fs.readdirSync(dir)
          .filter(f => f.endsWith('.jsonl'))
          .map(f => ({
            name: f,
            mtime: fs.statSync(path.join(dir, f)).mtimeMs,
          }))
        for (const f of files) {
          if (f.mtime > latestMtime) {
            latestMtime = f.mtime
            latestFile = path.join(dir, f.name)
          }
        }
      } catch { /* 跳过 */ }
    }

    if (!latestFile) return null;

    // 如果文件没变，跳过（避免重复解析相同内容）
    if (latestMtime === this._lastTraceMTime) {
      return null;
    }
    this._lastTraceMTime = latestMtime;

    // 读取最后 50 行
    const content = fs.readFileSync(latestFile, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    const recentLines = lines.slice(-50);

      let activity = 'active';
      let lastOutput = '';
      let lastToolCall = '';
      let lastFilePath = '';
      let hasError = false;
      let errorMessage = '';
      let tokenUsage = 0;

      // 结构化权威信号：最后一个 tool_use 的真实工具名映射出的活动类型。
      // 只有命中 STRUCTURED_TOOL_ACTIVITY 时才更新 activity，
      // 避免非工具类文本行（如 assistant 的解释）覆盖掉真实状态。
      let structuredActivity = null;

      for (const line of recentLines) {
        try {
          const entry = JSON.parse(line);

          // 解析 call 记录（API 调用、工具调用）
          if (entry.type === 'call' && entry.record) {
            const rec = entry.record;

            // 检测工具调用
            if (rec.request?.headers?.['x-app'] === 'cli') {
              // 这是一个 CLI 调用
              const body = rec.request?.body;
              if (body?.messages) {
                // 从最后一条用户消息提取任务
                const lastMsg = body.messages[body.messages.length - 1];
                if (lastMsg?.role === 'user' && typeof lastMsg.content === 'string') {
                  lastOutput = lastMsg.content.substring(0, 300);
                }
              }
            }

            // 检测状态 —— 直接采用 record 的真实 status，不再靠文本猜
            if (rec.status === 'error') {
              hasError = true;
              errorMessage = rec.error?.message || 'Unknown error';
              activity = 'error';
              structuredActivity = 'error';
            } else if (rec.status === 'ok') {
              // 提取 token 使用量
              if (rec.usage?.output_tokens) {
                tokenUsage = rec.usage.output_tokens;
              }
              // 若尚无任何结构化工具活动，才用文本兜底猜测一次
              if (!structuredActivity && rec.response?.content) {
                const content = Array.isArray(rec.response.content)
                  ? rec.response.content.map(c => c.text || '').join(' ')
                  : String(rec.response.content);
                const fb = analyzeActivityFallback(content);
                if (fb !== 'active') {
                  activity = fb;
                  structuredActivity = fb;
                }
              }
            }
          }

          // 解析真实工具使用 —— 这是最权威的活动来源
          if (entry.type === 'tool_use' || entry.type === 'tool_result') {
            const toolName = entry.name || entry.tool_name || '';
            if (toolName) {
              lastToolCall = toolName;
              const mapped = STRUCTURED_TOOL_ACTIVITY[toolName];
              if (mapped) {
                activity = mapped;
                structuredActivity = mapped;
              } else {
                // 未知工具名：默认视为执行类，但仍以结构化信号为准
                activity = 'executing';
                structuredActivity = 'executing';
              }
            }
            if (entry.file_path || entry.filePath) {
              lastFilePath = entry.file_path || entry.filePath;
            }
          }
        } catch {}
      }

      return { activity, lastOutput, lastToolCall, lastFilePath, hasError, errorMessage, tokenUsage };
    }

  /**
   * 获取最近的 git 变更
   */
  _getRecentGitChanges() {
    return new Promise((resolve) => {
      execFile('git', ['diff', '--stat', 'HEAD'], { cwd: process.cwd(), timeout: 5000 }, (err, stdout) => {
        if (err || !stdout) {
          resolve({ hasChanges: false, addedLines: 0, removedLines: 0 });
          return;
        }
        let addedLines = 0, removedLines = 0;
        for (const line of stdout.split('\n')) {
          const addMatch = line.match(/\+\s*(\d+)/);
          const delMatch = line.match(/-\s*(\d+)/);
          if (addMatch) addedLines += parseInt(addMatch[1], 10);
          if (delMatch) removedLines += parseInt(delMatch[1], 10);
        }
        resolve({ hasChanges: addedLines > 0 || removedLines > 0, addedLines, removedLines });
      });
    });
  }

  /**
   * 发布状态变更事件
   */
  _emitStatus(status) {
    const statusKey = `${status.isRunning}:${status.activity}:${status.hasError}`;
    if (this.lastStatus && `${this.lastStatus.isRunning}:${this.lastStatus.activity}:${this.lastStatus.hasError}` === statusKey) {
      return; // 状态没变，跳过
    }

    const event = {
      type: 'claude_code_status',
      ...status,
      petReaction: this._suggestPetReaction(status),
    };

    if (this.bus) {
      this.bus.publish('monitor.claude_code.status', event);
      try {
        this.bus.publish('hooks.state_updated', {
          session_id: 'claude_code_monitor',
          state: mapToUnifiedState(status.activity, 'claude'),
          data: {
            tool_name: 'claude_code',
            summary: this._getSummary(status),
            status,
          },
        });
      } catch {}
    }
  }

  _suggestPetReaction(status) {
    if (!status.isRunning) {
      return status.activity === 'code_changed'
        ? { emotion: 'happy', action: 'nod', message: '代码更新了~' }
        : { emotion: 'sleepy', action: 'sleep', message: 'Claude 休息了' };
    }

    // 有具体任务时显示任务内容
    const taskHint = status.currentTask ? `: ${status.currentTask.substring(0, 30)}` : '';

    switch (status.activity) {
      case 'thinking':
        return { emotion: 'curious', action: 'tilt_head', message: `Claude 在思考${taskHint}` };
      case 'coding':
        return { emotion: 'excited', action: 'happy', message: `Claude 在写代码${taskHint}` };
      case 'executing':
        return { emotion: 'focused', action: 'watch', message: `执行中: ${status.lastToolCall || '...'}` };
      case 'completed':
        return { emotion: 'happy', action: 'celebrate', message: '任务完成了！' };
      case 'error':
        return { emotion: 'worried', action: 'concern', message: `出错了: ${status.errorMessage?.substring(0, 50) || ''}` };
      default:
        return { emotion: 'neutral', action: 'idle', message: `Claude 运行中${taskHint}` };
    }
  }

  _getSummary(status) {
    if (!status.isRunning) return 'Claude Code 未运行';
    const task = status.currentTask ? ` - ${status.currentTask.substring(0, 50)}` : '';
    switch (status.activity) {
      case 'thinking': return `Claude 正在思考${task}`;
      case 'coding': return `Claude 正在写代码${task}`;
      case 'executing': return `Claude 正在执行: ${status.lastToolCall || '...'}`;
      case 'completed': return 'Claude 完成任务';
      case 'error': return `Claude 出错: ${status.errorMessage?.substring(0, 50) || ''}`;
      default: return `Claude 运行中${task}`;
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

module.exports = { ClaudeCodeMonitor };
