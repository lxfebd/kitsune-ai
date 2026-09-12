/**
 * ZCode 监控器（v1：transcript.jsonl 结构化信号优先）
 *
 * ZCode(ZCode CLI) 在会话目录 `~/.zcode/cli/agents/sess_{id}/agent_{id}/` 下记录
 * 两块数据：
 *
 *   1. metadata.json          — 会话元信息（agentId、cwd、description、status）
 *   2. transcript.jsonl       — 事件流，含模型/工具事件（本监控的主信号源）
 *
 * 事件类型（实测）与统一状态的映射：
 *   model_streaming              → thinking（LLM 正在生成）
 *   tool_call_scheduled          → executing（已排程工具调用 → 待执行）
 *   tool_batch_complete          → completed（一批工具调用完成）
 *   streaming_tool_ledger_updated→ executing（工具调用进度更新）
 *   model_complete               → thinking / completed（模型回复完成）
 *
 * 检测策略（沿用 ClaudeCodeMonitor 的文件系统信号优先范式）：
 *   1. transcript 目录 mtime 在阈值内 → 正在运行（主信号，跨平台一致）
 *   2. 进程检测辅助（Windows 上 zcode/cli 可能以 node.exe 形式存在 → 弱化）
 *   3. 文件信号惯性：2 倍阈值内曾检测到活动仍视为运行中
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

// ZCode 根目录（可被环境变量覆盖；默认 ~/.zcode）
const ZCODE_HOME = process.env.ZCODE_HOME
  || path.join(process.env.USERPROFILE || process.env.HOME || '', '.zcode');

// agents 会话根目录：~/.zcode/cli/agents/
const AGENTS_ROOT = path.join(ZCODE_HOME, 'cli', 'agents');

// 运行日志根目录：~/.zcode/cli/log/zcode-YYYY-MM-DD.jsonl（实时工具级事件，主信号源）
const LOG_ROOT = path.join(ZCODE_HOME, 'cli', 'log');

// 主会话模型调用目录：~/.zcode/cli/rollout/model-io-sess_*.jsonl（会话活跃信号）
const ROLLOUT_ROOT = path.join(ZCODE_HOME, 'cli', 'rollout');

// 检测存活阈值：此秒数内 log/model-io/transcript 有更新即视为"正在运行"
// 60s 对"每次模型调用完成后才追加"的主会话 transcript 太紧（一轮 LLM 可能 >1 分钟），
// 放宽到 3 分钟：主会话即使写入间隔长也能被识别为活跃，同时不会把已结束的会话误判。
const FILE_ACTIVITY_THRESHOLD_MS = 3 * 60_000; // 180 秒

// 运行日志 event → 统一 activity 映射（tool 级实时信号）
const LOG_EVENT_ACTIVITY = {
  'tool.call.started': 'executing',
  'tool.call.completed': 'completed',
  'tool.call.failed': 'error',
  'turn.started': 'thinking',
  'model.request.completed': 'thinking',
  'hook.run.failed': 'error',
};

// transcript 每行 JSON 的 type 字段 → 统一 activity
const TRANSCRIPT_TYPE_ACTIVITY = {
  model_streaming: 'thinking',
  model_complete: 'thinking',
  tool_call_scheduled: 'executing',
  streaming_tool_ledger_updated: 'executing',
  tool_batch_complete: 'completed',
};

// transcript 中出现的额外类型（统一归类，避免落入默认）
const KNOWN_TYPES = new Set(Object.keys(TRANSCRIPT_TYPE_ACTIVITY));

/**
 * 追加的会话级状态：作用于所有监控的会话，只读一份元信息
 */
class ZCodeMonitor {
  /**
   * @param {Object} options
   * @param {EventBus} [options.bus] - EventBus 实例
   * @param {number} [options.pollInterval] - 轮询间隔（毫秒），默认 10000
   * @param {boolean} [options.watchMode] - 是否启用 chokidar 事件驱动（默认 true）
   * @param {Object} [options.logger] - 日志实例
   * @param {string} [options.agentsRoot] - 会话根目录覆盖（测试注入；默认 AGENTS_ROOT）
   */
  constructor({ bus, eventBus, pollInterval, watchMode, logger, agentsRoot, logRoot, rolloutRoot } = {}) {
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

    // 会话根目录：可注入（测试），默认 AGENTS_ROOT
    this.agentsRoot = agentsRoot || AGENTS_ROOT;
    // 运行日志/模型调用目录同样可注入（测试隔离），默认真实路径
    this.logRoot = logRoot || LOG_ROOT;
    this.rolloutRoot = rolloutRoot || ROLLOUT_ROOT;

    // 增量 tail：每个 transcript 文件各自维护 offset（TailFiles 内部按 filePath 区分）
    this.tail = new TailFiles();

    // 缓存：当前最新（mtime 最大）的 transcript 文件与其目录
    this._latestSessionDir = '';
    this._latestTranscript = '';
    this._lastTranscriptMTime = 0;

    // 最近事件窗口（用于解析活动；随文件截断重置）
    this._recentLines = [];
    this._lastFileSignalAt = 0;
  }

  get eventName() {
    return 'monitor.zcode.status';
  }

  get hookToolName() {
    return 'zcode';
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.logger.info(`[ZCodeMonitor] 已启动，监控路径: ${this.agentsRoot}`);
    if (this.watchMode) {
      this._startWatcher();
    }
    this._startPolling();
  }  stop() {
    this.isRunning = false;
    if (this.pollTimer) { clearTimeout(this.pollTimer); this.pollTimer = null; }
    if (this._wakeTimer) { clearTimeout(this._wakeTimer); this._wakeTimer = null; }
    if (this.fileWatcher) { this.fileWatcher.close(); this.fileWatcher = null; }
    this.logger.info('[ZCodeMonitor] 已停止');
  }

  /** 事件驱动唤醒（chokidar 监听 agents + rollout 目录树） */
  _startWatcher() {
    try {
      // agents（子会话 transcript）+ rollout（主会话 model-io）都要盯，
      // 否则新会话/主会话活动只靠轮询才感知，延迟会放大到 pollInterval。
      const watchPaths = [this.agentsRoot, this.rolloutRoot];
      this.fileWatcher = chokidar.watch(watchPaths, {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
        ignored: (p) => p.includes('node_modules') || p.includes('.git'),
      });
      const wake = () => this._scheduleWake();
      this.fileWatcher.on('add', wake);
      this.fileWatcher.on('change', wake);
      this.fileWatcher.on('error', (err) => {
        this.logger.error('[ZCodeMonitor] watcher 错误:', err.message);
      });
    } catch (err) {
      this.logger.error('[ZCodeMonitor] 文件监控启动失败，仅保留轮询兜底:', err.message);
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
      this._check().catch((err) => {
        this.logger.error('[ZCodeMonitor] 事件唤醒检查失败:', err.message);
      });
    }, this._wakeDebounceMs);
  }

  _startPolling() {
    if (!this.isRunning) return;
    this._check().catch((err) => {
      this.logger.error('[ZCodeMonitor] 检查失败:', err.message);
    });
    this.pollTimer = setTimeout(() => this._startPolling(), this.pollInterval);
  }

  /** 全局根目录是否可读 */
  _hasZcodeRoot() {
    try {
      return fs.existsSync(this.agentsRoot);
    } catch { return false; }
  }

  /**
   * 在 agents 树下找所有近期活跃的 transcript.jsonl。
   * 只扫描一层 sess_* -> agent_* 结构，尽量少读目录。
   * 返回按 mtime 降序的文件路径数组；目录不可读时返回 []。
   *
   * 注意：ZCode 会并行跑多个会话，主会话（正在干活的）的 transcript 往往
   * 不是 mtime 最新的一条（它只在每轮 LLM 完成后追加，跨度可能超过阈值），
   * 因此不能只挑"最新"一条，而是收集所有在阈值内写入的活跃文件。
   */
  _findActiveTranscripts() {
    const active = [];
    try {
      for (const sessDir of fs.readdirSync(this.agentsRoot)) {
        if (!sessDir.startsWith('sess_')) continue;
        const sessPath = path.join(this.agentsRoot, sessDir);
        const agentDirs = fs.readdirSync(sessPath);
        for (const agentDir of agentDirs) {
          const candidate = path.join(sessPath, agentDir, 'transcript.jsonl');
          try {
            const st = fs.statSync(candidate);
            if (Date.now() - st.mtimeMs < FILE_ACTIVITY_THRESHOLD_MS) {
              active.push({ file: candidate, mtime: st.mtimeMs });
            }
          } catch { /* 文件不存在则跳过 */ }
        }
      }
    } catch { /* AGENTS_ROOT 不可读 */ }
    active.sort((a, b) => b.mtime - a.mtime);
    return active;
  }

  /**
   * 在 rollout 目录找所有近期活跃的 model-io 文件（主会话实时信号源）。
   * ZCode 主 agent 的每次模型调用完成后追加一行，主会话活跃时必然有近期写入。
   */
  _findActiveModelIoFiles() {
    const active = [];
    try {
      const files = fs.readdirSync(this.rolloutRoot);
      for (const f of files) {
        if (!f.startsWith('model-io-sess_') || !f.endsWith('.jsonl')) continue;
        const full = path.join(ROLLOUT_ROOT, f);
        try {
          const st = fs.statSync(full);
          if (Date.now() - st.mtimeMs < FILE_ACTIVITY_THRESHOLD_MS) {
            active.push({ file: full, mtime: st.mtimeMs });
          }
        } catch { /* 跳过 */ }
      }
    } catch { /* rollout 目录不可读 */ }
    active.sort((a, b) => b.mtime - a.mtime);
    return active;
  }

  /**
   * 找近期活跃的运行日志文件（~/.zcode/cli/log/zcode-YYYY-MM-DD.jsonl）。
   * 运行日志是 ZCode 的实时事件流（tool.call.started 等），主信号源。
   */
  _findActiveLogFiles() {
    const active = [];
    try {
      const files = fs.readdirSync(this.logRoot);
      // 日志文件名用本地日期（zcode-YYYY-MM-DD.jsonl），不能用 UTC 日期
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      for (const f of files) {
        if (!/^zcode-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)) continue;
        // 只看今天的日志，避免扫描历史大文件
        if (!f.includes(today)) continue;
        const full = path.join(this.logRoot, f);
        try {
          const st = fs.statSync(full);
          if (Date.now() - st.mtimeMs < FILE_ACTIVITY_THRESHOLD_MS) {
            active.push({ file: full, mtime: st.mtimeMs });
          }
        } catch { /* 跳过 */ }
      }
    } catch { /* log 目录不可读 */ }
    active.sort((a, b) => b.mtime - a.mtime);
    return active;
  }

  /**
   * 从运行日志尾部提取最近的工具级事件（tool.call.* / turn.* / model.request.completed）。
   * 日志文件可能很大（几十 MB），只读尾部最近 N 字节，逐行解析出
   * { timestamp, event, toolName?, sessionId?, hasError } 数组（时间降序）。
   */
  _readRecentLogEvents(tailBytes = 256 * 1024) {
    const logFiles = this._findActiveLogFiles();
    if (logFiles.length === 0) return [];
    const events = [];
    for (const { file } of logFiles) {
      try {
        const st = fs.statSync(file);
        const start = Math.max(0, st.size - tailBytes);
        const fd = fs.openSync(file, 'r');
        const buf = Buffer.alloc(st.size - start);
        fs.readSync(fd, buf, 0, buf.length, start);
        fs.closeSync(fd);
        const text = buf.toString('utf8');
        const lines = text.split('\n').filter(Boolean);
        for (const l of lines) {
          try {
            const e = JSON.parse(l);
            const event = e.event;
            if (!event || !LOG_EVENT_ACTIVITY[event]) continue;
            const ctx = e.context && typeof e.context === 'object' ? e.context : {};
            // 事件是直写失败行时，把 level/status 之外的真实原因带上
            // （tool.call.failed 的错误消息在 e.error.message，如
            // "File has not been read yet. Read it first..."）
            let errorMessage = '';
            if (e.level === 'error' || e.status === 'failed') {
              errorMessage = typeof e.error?.message === 'string'
                ? e.error.message
                : (typeof e.message === 'string' && e.message !== 'Tool call failed' ? e.message : '');
            }
            events.push({
              ts: e.timestamp || '',
              event,
              toolName: typeof ctx.toolName === 'string' ? ctx.toolName : '',
              sessionId: e.sessionId || '',
              hasError: Boolean(errorMessage) || e.level === 'error' || e.status === 'failed',
              errorMessage,
            });
          } catch { /* 忽略不可解析行 */ }
        }
      } catch { /* 跳过不可读日志 */ }
    }
    events.sort((a, b) => b.ts.localeCompare(a.ts));
    return events.slice(0, 60);
  }

  /**
   * 校验目录下存在 metadata.json（防止把非 agent 会话目录当候选）。
   * 用于 watcher add 事件（此时文件可能刚创建）。
   */
  _isSessionDir(dir) {
    try {
      return fs.existsSync(path.join(dir, 'metadata.json'));
    } catch { return false; }
  }

  /**
   * 读取主信号：是否"正在运行"。
   * 1. 任一活跃 transcript（agents 树）在阈值内 → 是（子 agent 信号）
   * 2. 任一活跃 model-io（rollout 主会话信号）在阈值内 → 是（主 agent 信号）
   * 3. 进程辅助（非 Windows）→ 是（弱信号）
   * 4. 文件信号惯性（2 倍阈值内曾活动）→ 是
   *
   * 注意：本方法只判"是否在跑"，不维护追踪文件（_latestTranscript 由 _check
   * 占用做活动细节解析）；否则 model-io 与 transcript 互相覆盖基线，增量永远读不到。
   */
  async _detectRunning() {
    const activeTranscripts = this._findActiveTranscripts();
    const activeModelIo = this._findActiveModelIoFiles();
    const activeLogs = this._findActiveLogFiles();

    if (activeTranscripts.length > 0 || activeModelIo.length > 0 || activeLogs.length > 0) {
      this._lastFileSignalAt = Date.now();
      return { running: true, signal: 'file' };
    }

    const proc = await this._detectByProcess();
    if (proc) return { running: true, signal: 'process' };

    if (this._lastFileSignalAt && Date.now() - this._lastFileSignalAt < FILE_ACTIVITY_THRESHOLD_MS * 2) {
      return { running: true, signal: 'file_inertia' };
    }
    return { running: false, signal: 'none' };
  }

  /**
   * 进程辅助检测。Windows 上 zcode 以被 Electron 包裹表现为 zcode.exe / 真实进程名，
   * 进程贴合度低；保留用于非 Windows。
   */
  _detectByProcess() {
    return new Promise((resolve) => {
      if (process.platform === 'win32') {
        // Windows:zcode 进程名多为 zcode 或由 CLI 宿主包裹，探测结果不可靠 → 不采纳
        resolve(false);
        return;
      }
      const { execFile } = require('node:child_process');
      execFile('ps', ['aux'], { timeout: 5000 }, (err, stdout) => {
        if (err) { resolve(false); return; }
        resolve(/zcode/.test(stdout.toLowerCase()));
      });
    });
  }

  /** 增量读取最新 transcript 的新增行 */
  _readNewTranscription() {
    if (!this._latestTranscript) return null;
    try {
      if (!fs.existsSync(this._latestTranscript)) return null;
      const st = fs.statSync(this._latestTranscript);
      if (st.mtimeMs === this._lastTranscriptMTime) return null;
      this._lastTranscriptMTime = st.mtimeMs;

      const { lines, truncated } = this.tail.readNewLinesSync(this._latestTranscript);
      if (truncated) this._recentLines = []; // 文件被归零重写
      if (lines.length > 0) {
        this._recentLines.push(...lines);
        if (this._recentLines.length > 200) {
          this._recentLines = this._recentLines.slice(-200);
        }
      }
      const window = truncated ? lines : this._recentLines.slice(-80);
      return window;
    } catch {
      return null;
    }
  }

  /** 从最近事件窗口解析活动类型 */
  _analyzeActivity(lines) {
    if (!lines || lines.length === 0) return null;
    let activity = null;
    // 从新到旧找最后一个能映射的事件类型 —— 保证"最新状态"优先，
    // 且 text/未知行不覆盖真实工具状态（与 ClaudeCodeMonitor 同一策略）
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        const type = entry?.type;
        if (type && KNOWN_TYPES.has(type)) {
          activity = TRANSCRIPT_TYPE_ACTIVITY[type];
          break;
        }
      } catch {}
    }
    return activity;
  }

  /**
   * 汇总所有活跃 transcript 的最近事件窗口（多源合并，按时间升序）。
   * 主会话 transcript 每轮 LLM 才追加一次、且多个会话并行时，
   * 只盯一条会漏掉真实活动；合并所有活跃源的尾部行能稳定拿到工具调用信号。
   * 返回行数组（按 timestamp 从旧到新，数组尾部=最新，与 tail 尾窗口一致），
   * 无活跃源时返回 null。
   */
  _collectRecentActivityLines() {
    const activeTranscripts = this._findActiveTranscripts();
    if (activeTranscripts.length === 0) return null;

    const MAX_PER_FILE = 80;
    const MAX_TOTAL = 200;
    const rows = [];
    for (const { file } of activeTranscripts) {
      try {
        const raw = fs.readFileSync(file, 'utf8');
        const lines = raw.split('\n').filter(Boolean).slice(-MAX_PER_FILE);
        for (const l of lines) {
          try {
            const e = JSON.parse(l);
            rows.push({ ts: e.timestamp || '', line: l });
          } catch { /* 忽略不可解析行 */ }
        }
      } catch { /* 文件瞬态不可读则跳过 */ }
    }
    // 按时间戳升序（旧 → 新），无时间戳的排最后
    rows.sort((a, b) => {
      if (a.ts && b.ts) return a.ts.localeCompare(b.ts);
      if (a.ts) return -1;
      if (b.ts) return 1;
      return 0;
    });
    return rows.slice(-MAX_TOTAL).map(r => r.line);
  }

  /** 读取当前会话最新 metadata（cwd / 描述），失败返回 '' */
  _readMetadata() {
    try {
      if (!this._latestSessionDir) return '';
      const raw = fs.readFileSync(path.join(this._latestSessionDir, 'metadata.json'), 'utf8');
      const meta = JSON.parse(raw);
      if (meta && meta.cwd) return String(meta.cwd);
      return '';
    } catch {
      return '';
    }
  }

  /** 主检查 */
  async _check() {
    if (!this._hasZcodeRoot()) {
      this._emitStatus({
        isRunning: false, activity: 'idle', detectSignal: 'none',
        currentTask: '', lastOutput: '', hasError: false,
        errorMessage: '', timestamp: Date.now(), sessionCwd: '',
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
      sessionCwd: this._readMetadata(),
      timestamp: Date.now(),
    };

    if (detect.running) {
      // 活动细节主信号：运行日志的工具级事件（tool.call.started/completed/failed 等）。
      // 运行日志实时连续（每次工具调用都写），比 agents transcript（会话结束才落盘）可靠得多。
      const logEvents = this._readRecentLogEvents();
      let activityFromLog = null;
      let lastToolCallFromLog = '';
      let errorFromLog = false;
      let errorMessageFromLog = '';

      if (logEvents.length > 0) {
        // 从新到旧找第一个可映射的 tool 级事件 → 活动类型；同时记下最近的工具名与失败
        for (const ev of logEvents) {
          if (!activityFromLog) {
            activityFromLog = LOG_EVENT_ACTIVITY[ev.event] || null;
          }
          if (ev.toolName && !lastToolCallFromLog) lastToolCallFromLog = ev.toolName;
          if (ev.hasError) {
            errorFromLog = true;
            if (ev.errorMessage && !errorMessageFromLog) errorMessageFromLog = ev.errorMessage;
          }
          if (activityFromLog && lastToolCallFromLog && errorFromLog) break;
        }
      }

      // transcript 信号（结构化 tool_call_scheduled / tool_batch_complete）：仅当有活跃
      // transcript 且能解析出事件时优先于日志 —— 它是子 agent 的真实工具调用记录。
      const lines = this._collectRecentActivityLines();
      const activityFromTranscript = this._analyzeActivity(lines);

      // 日志信号是"兜底主信号"：transcript 无活动时才用日志（日志里 model.request.completed
      // 这类思考事件会把 transcript 的工具级结果盖掉，反之亦然）。
      let useLog = false;
      if (!activityFromTranscript) {
        useLog = true;
        if (activityFromLog) status.activity = activityFromLog;
        if (lastToolCallFromLog) status.lastToolCall = lastToolCallFromLog;
      }
      else {
        status.activity = activityFromTranscript;
      }

      // 事件窗口内提取工具调用活动与失败信号（transcript 优先路径）：
      //   - tool_call_scheduled → payload.toolName 是正在执行的工具名（Bash/Edit/Read…）
      //   - tool_batch_complete  → payload.errorCount > 0 才算失败（result 字段实测不存在）
      if (!useLog && lines && lines.length) {
        // 全窗扫描（不提前 break）：最近一条 tool call 的 toolName 作 lastToolCall；
        // 最新一条失败批次（errorCount>0）置 hasError。两条信号独立，失败不吞工具名。
        let errorCount = 0
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const entry = JSON.parse(lines[i]);
            if (!entry?.type) continue;
            if (entry.type === 'tool_call_scheduled' && !status.lastToolCall) {
              const name = entry.payload?.toolName;
              if (typeof name === 'string' && name) {
                status.lastToolCall = name;
              }
            }
            else if (entry.type === 'tool_batch_complete') {
              const payload = entry.payload;
              if (payload && typeof payload === 'object' && errorCount === 0) {
                errorCount = Number(payload.errorCount) || 0;
              }
            }
          } catch {}
        }
        if (errorCount > 0) {
          status.hasError = true;
          status.activity = 'error';
          status.errorMessage = `工具执行失败 (errorCount=${errorCount})`;
        }
      }
      else if (useLog && errorFromLog) {
        status.hasError = true;
        status.errorMessage = errorMessageFromLog
          ? `工具执行失败: ${errorMessageFromLog.substring(0, 120)}`
          : '工具执行失败';
        status.activity = 'error';
      }
      else if (!lines && this.lastStatus?.isRunning) {
        // 主会话在跑但暂无可解析的新行：保留上次已知的活动细节
        status.activity = this.lastStatus.activity || 'idle';
        status.lastToolCall = this.lastStatus.lastToolCall || '';
        status.currentTask = this.lastStatus.currentTask || '';
      }
      // currentTask 取最近一次工具调用名，避免 UI 上「当前任务」一直为空
      if (!status.currentTask && status.lastToolCall) {
        status.currentTask = `工具调用: ${status.lastToolCall}`;
      }
    }

    this._emitStatus(status);
    this.lastStatus = status;
  }

  /** 发布状态变更事件（协议对齐 GenericAiToolMonitor / ClaudeCodeMonitor） */
  _emitStatus(status) {
    // 去重 key 加入 lastToolCall：连续 executing（不同工具调用）也要触发新事件，
    // 否则桌宠/事件流只会看到第一次「执行工具」，后续工具调用被吞掉。
    const key = `${status.isRunning}:${status.activity}:${status.hasError}:${status.lastToolCall || ''}`;
    if (this.lastStatus && `${this.lastStatus.isRunning}:${this.lastStatus.activity}:${this.lastStatus.hasError}:${this.lastStatus.lastToolCall || ''}` === key) {
      return;
    }

    const event = {
      type: 'zcode_status',
      ...status,
      petReaction: this._suggestPetReaction(status),
    };
    if (this.bus) {
      this.bus.publish('monitor.zcode.status', event);
      try {
        this.bus.publish('hooks.state_updated', {
          session_id: 'zcode_monitor',
          state: mapToUnifiedState(status.activity, 'generic'),
          data: {
            tool_name: 'zcode',
            summary: this._getSummary(status),
            status,
          },
        });
      } catch {}
    }
  }

  _getSummary(status) {
    if (!status.isRunning) return 'ZCode 未运行';
    const cwd = status.sessionCwd ? ` @ ${status.sessionCwd.substring(0, 40)}` : '';
    switch (status.activity) {
      case 'thinking': return `ZCode 正在思考${cwd}`;
      case 'executing': return `ZCode 执行工具${status.lastToolCall ? ` ${status.lastToolCall}` : ''}${cwd}`;
      case 'coding': return `ZCode 在写代码${cwd}`;
      case 'completed': return 'ZCode 完成一批工具';
      case 'error': return `ZCode 出错: ${status.errorMessage?.substring(0, 50) || ''}${cwd}`;
      default: return `ZCode 运行中${cwd}`;
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
        ? { emotion: 'sleepy', action: 'sleep', message: 'ZCode 休息了', activity: 'idle', ...signal }
        : { emotion: 'sleepy', action: 'sleep', message: 'ZCode 未运行', activity: 'idle', ...signal };
    }
    const taskHint = status.currentTask ? `: ${status.currentTask.substring(0, 30)}` : '';
    switch (status.activity) {
      case 'thinking':
        return { emotion: 'curious', action: 'tilt_head', message: `ZCode 在思考${taskHint}`, activity: 'thinking', ...signal };
      case 'executing':
        return { emotion: 'focused', action: 'watch', message: `ZCode 执行工具中${taskHint}`, activity: 'executing', ...signal };
      case 'coding':
        return { emotion: 'excited', action: 'happy', message: `ZCode 在写代码${taskHint}`, activity: 'coding', ...signal };
      case 'completed':
        return { emotion: 'happy', action: 'celebrate', message: 'ZCode 完成了一批工作', activity: 'completed', ...signal };
      case 'error':
        return { emotion: 'worried', action: 'concern', message: `ZCode 出错: ${status.errorMessage?.substring(0, 50) || ''}`, activity: 'error', ...signal };
      default:
        return { emotion: 'neutral', action: 'idle', message: `ZCode 运行中${taskHint}`, activity: status.activity, ...signal };
    }
  }

  getStatus() {
    return this.lastStatus || {
      isRunning: false, activity: 'idle', currentTask: '',
      lastOutput: '', lastToolCall: '', lastFilePath: '',
      hasError: false, errorMessage: '', tokenUsage: 0,
      detectSignal: 'none', timestamp: 0, sessionCwd: '',
    };
  }
}

module.exports = { ZCodeMonitor };