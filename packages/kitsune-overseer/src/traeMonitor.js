/**
 * Trae 编辑器监控
 * 监控 Trae 的运行状态、终端输出、代码变更
 *
 * 监控来源：
 * 1. Trae 进程状态
 * 2. Trae 日志文件
 * 3. git 变更分析
 * 4. 文件变更监控
 */

const fs = require('node:fs');
const path = require('path');
const { execFile } = require('node:child_process');
const { mapToUnifiedState } = require('./activityStates');

// Trae 进程特征（仅辅助信号）
const TRAE_PROCESS_PATTERNS = ['trae', 'Trae'];
// 检测存活阈值
const FILE_ACTIVITY_THRESHOLD_MS = 60_000;

// NOTICE: fs.watch(recursive: true) 在 Windows 上无法排除子目录，node_modules/.git 等大型目录
// 会触发海量事件导致 CPU 飙升和事件队列阻塞（R3/R4）。在回调中按路径段过滤是最稳妥的跨平台方案。
const IGNORED_DIRS = ['node_modules', '.git', 'dist', 'out', '.pnpm', 'build', '.turbo'];

// NOTICE: fs.watch 在 Windows 上可能返回 '\' 或 '/' 分隔的路径，统一按两种分隔符拆分以稳健识别忽略目录。
function isIgnoredPath(filePath) {
  if (!filePath) return false;
  const segments = filePath.split(/[\\/]/);
  return segments.some(seg => IGNORED_DIRS.includes(seg));
}

// Trae 输出状态模式
const TRAE_OUTPUT_PATTERNS = {
  // 编译中
  compiling: [
    /compiling/i,
    /building/i,
    /webpack/i,
    /vite/i,
    /bundling/i,
  ],
  // 编译成功
  buildSuccess: [
    /compiled successfully/i,
    /build complete/i,
    /compiled ok/i,
    /webpack compiled/i,
    /vite.*ready/i,
  ],
  // 编译错误
  buildError: [
    /compilation error/i,
    /build failed/i,
    /error in/i,
    /failed to compile/i,
    /syntax error/i,
  ],
  // 测试运行
  testing: [
    /running test/i,
    /test run/i,
    /jest/i,
    /vitest/i,
    /mocha/i,
  ],
  // 测试通过
  testPassed: [
    /tests passed/i,
    /all tests passed/i,
    /test successful/i,
    /✓.*passed/i,
  ],
  // 测试失败
  testFailed: [
    /test failed/i,
    /tests? failed/i,
    /assertion error/i,
    /✗.*failed/i,
  ],
  // Lint 问题
  lintIssues: [
    /\d+ problem/i,
    /\d+ error/i,
    /eslint/i,
    /tslint/i,
  ],
};

class TraeMonitor {
  constructor({ bus, eventBus, watchDir } = {}) {
    this.bus = bus || eventBus;
    this.watchDir = watchDir || process.cwd();
    this.isRunning = false;
    this.lastStatus = null;
    this.pollInterval = 5000;
    this.pollTimer = null;
    this.fileWatcher = null;
    this.recentFileChanges = [];
    this.lastBuildStatus = null;
  }

  /**
   * 启动监控
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[TraeMonitor] 已启动，开始监控 Trae 状态');

    // 文件变更监控
    this._startFileWatcher();
    this._startPolling();
  }

  /**
   * 停止监控
   */
  stop() {
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }
    console.log('[TraeMonitor] 已停止');
  }

  /**
   * 文件变更监控
   */
  _startFileWatcher() {
    try {
      // 只监控代码文件，排除 node_modules、.git 等
      const watchPatterns = ['.js', '.ts', '.jsx', '.tsx', '.vue', '.py', '.go', '.css', '.scss', '.html'];

      this.fileWatcher = fs.watch(this.watchDir, { recursive: true }, (eventType, filename) => {
        if (!filename) return;

        // 跳过不需要监控的路径
        if (isIgnoredPath(filename)) return;

        const ext = path.extname(filename).toLowerCase();
        if (!watchPatterns.includes(ext)) return;

        this.recentFileChanges.push({
          file: filename,
          type: eventType,
          time: Date.now()
        });

        // 只保留最近 1 分钟内的变更
        const oneMinAgo = Date.now() - 60000;
        this.recentFileChanges = this.recentFileChanges.filter(c => c.time > oneMinAgo);

        this._check();
      });
    } catch (err) {
      console.log('[TraeMonitor] 文件监控启动失败:', err.message);
    }
  }

  /**
   * 轮询检查
   */
  _startPolling() {
    if (!this.isRunning) return;

    this._check().catch(err => {
      console.error('[TraeMonitor] 检查失败:', err.message);
    });

    this.pollTimer = setTimeout(() => {
      this._startPolling();
    }, this.pollInterval);
  }

  /**
   * 执行一次检查
   */
  async _check() {
    const status = {
      isTraeRunning: false,
      activity: 'idle',
      recentChanges: this.recentFileChanges.length,
      hasBuildError: false,
      buildError: '',
      hasTestResult: false,
      testResult: '',
      timestamp: Date.now()
    };

    // 1. 检测 Trae 进程（文件系统信号优先 + 进程辅助）
    const detect = await this._checkProcess();
    status.isTraeRunning = detect.running;
    status.detectSignal = detect.signal;

    if (!detect.running) {
      // 检查是否有最近的文件变更（可能是 Trae 自动编辑的）
      if (this.recentFileChanges.length > 0) {
        status.activity = 'file_changes';
        status.recentChanges = this.recentFileChanges.length;
        this._emitStatus(status);
      } else if (this.lastStatus?.isTraeRunning) {
        status.activity = 'stopped';
        this._emitStatus(status);
      }
      this.lastStatus = status;
      return;
    }

    // 2. 检测 git 变更
    const gitChanges = await this._getRecentGitChanges();
    status.recentGitChanges = gitChanges;

    // 3. 检测编译状态（尝试读取常见日志文件）
    const buildStatus = await this._checkBuildStatus();
    if (buildStatus.hasStatus) {
      status.activity = buildStatus.activity;
      status.hasBuildError = buildStatus.hasError;
      status.buildError = buildStatus.error || '';
    } else if (this.recentFileChanges.length > 0) {
      status.activity = 'editing';
    } else {
      status.activity = 'idle';
    }

    // 4. 检测测试结果
    const testResult = await this._checkTestResult();
    if (testResult.hasResult) {
      status.hasTestResult = true;
      status.testResult = testResult.result;
      status.activity = testResult.passed ? 'test_passed' : 'test_failed';
    }

    this._emitStatus(status);
    this.lastStatus = status;
  }

  /**
   * 检测 Trae 是否在运行。
   *
   * 策略（优先级）：
   * 1. 文件系统信号：watchDir/日志目录中的文件 mtime 在阈值内 → 正在运行
   * 2. 进程检测：tasklist/ps（辅助，Windows 上进程名可能不匹配）
   *
   * 返回 { running, signal }
   */
  async _checkProcess() {
    // 1. 文件系统信号（主检测手段）
    const fileSignal = await this._detectByFileActivity()
    if (fileSignal) {
      this._lastFileSignalAt = Date.now()
      return { running: true, signal: 'file' }
    }

    // 2. 进程检测（辅助信号）
    const processRunning = await this._checkProcessRunning()
    if (processRunning) {
      return { running: true, signal: 'process' }
    }

    // 3. 文件信号惯性
    if (this._lastFileSignalAt && Date.now() - this._lastFileSignalAt < FILE_ACTIVITY_THRESHOLD_MS * 2) {
      return { running: true, signal: 'file_inertia' }
    }

    return { running: false, signal: 'none' }
  }

  /**
   * 通过文件系统信号检测。
   * 检查 .trae 目录及日志文件 mtime 是否在阈值内。
   */
  _detectByFileActivity() {
    const now = Date.now()
    const threshold = FILE_ACTIVITY_THRESHOLD_MS
    const candidates = [
      path.join(this.watchDir, '.trae', 'build.log'),
      path.join(this.watchDir, '.trae', 'test-result.log'),
      path.join(this.watchDir, 'logs', 'build.log'),
      path.join(this.watchDir, 'test-results', 'latest.log'),
    ]

    for (const filePath of candidates) {
      try {
        if (!fs.existsSync(filePath)) continue
        const stat = fs.statSync(filePath)
        if (now - stat.mtimeMs < threshold) {
          return true
        }
      } catch { /* 跳过 */ }
    }

    return false
  }

  /**
   * 通过进程列表检测（辅助）。
   */
  _checkProcessRunning() {
    return new Promise((resolve) => {
      const cmd = process.platform === 'win32' ? 'tasklist' : 'ps';
      const args = process.platform === 'win32' ? [] : ['aux'];

      execFile(cmd, args, { timeout: 5000 }, (err, stdout) => {
        if (err) {
          resolve(false);
          return;
        }

        const output = stdout.toLowerCase();
        const isRunning = TRAE_PROCESS_PATTERNS.some(pattern =>
          output.includes(pattern.toLowerCase())
        );
        resolve(isRunning);
      });
    });
  }

  /**
   * 检测编译状态
   */
  async _checkBuildStatus() {
    // 尝试读取常见的编译输出文件
    const possibleLogPaths = [
      path.join(this.watchDir, '.trae', 'build.log'),
      path.join(this.watchDir, 'logs', 'build.log'),
    ];

    for (const logPath of possibleLogPaths) {
      try {
        if (!fs.existsSync(logPath)) continue;

        const content = fs.readFileSync(logPath, 'utf8');
        const recentLines = content.split('\n').slice(-30).join('\n');

        if (TRAE_OUTPUT_PATTERNS.buildSuccess.test(recentLines)) {
          return { hasStatus: true, activity: 'build_success', hasError: false };
        }
        if (TRAE_OUTPUT_PATTERNS.buildError.test(recentLines)) {
          const errorMatch = recentLines.match(/(error|Error)[\s\S]{0,300}/);
          return {
            hasStatus: true,
            activity: 'build_error',
            hasError: true,
            error: errorMatch ? errorMatch[0].substring(0, 200) : '编译错误'
          };
        }
        if (TRAE_OUTPUT_PATTERNS.compiling.test(recentLines)) {
          return { hasStatus: true, activity: 'compiling', hasError: false };
        }
      } catch {
        // 跳过无法读取的文件
      }
    }

    // 也可以通过检测常见的编译进程来判断
    return new Promise((resolve) => {
      const cmd = process.platform === 'win32' ? 'tasklist' : 'ps';
      const args = process.platform === 'win32' ? [] : ['aux'];

      execFile(cmd, args, { timeout: 3000 }, (err, stdout) => {
        if (err || !stdout) {
          resolve({ hasStatus: false });
          return;
        }

        const output = stdout.toLowerCase();
        if (output.includes('webpack') || output.includes('vite') || output.includes('tsc')) {
          resolve({ hasStatus: true, activity: 'compiling', hasError: false });
        } else {
          resolve({ hasStatus: false });
        }
      });
    });
  }

  /**
   * 检测测试结果
   */
  async _checkTestResult() {
    // 尝试读取测试输出文件
    const possibleTestPaths = [
      path.join(this.watchDir, '.trae', 'test-result.log'),
      path.join(this.watchDir, 'test-results', 'latest.log'),
    ];

    for (const testPath of possibleTestPaths) {
      try {
        if (!fs.existsSync(testPath)) continue;

        const content = fs.readFileSync(testPath, 'utf8');
        const recentLines = content.split('\n').slice(-20).join('\n');

        if (TRAE_OUTPUT_PATTERNS.testPassed.test(recentLines)) {
          return { hasResult: true, passed: true, result: '测试通过' };
        }
        if (TRAE_OUTPUT_PATTERNS.testFailed.test(recentLines)) {
          return { hasResult: true, passed: false, result: '测试失败' };
        }
      } catch {
        // 跳过
      }
    }

    return { hasResult: false };
  }

  /**
   * 获取最近的 git 变更
   */
  _getRecentGitChanges() {
    return new Promise((resolve) => {
      execFile('git', ['diff', '--stat', 'HEAD'], { cwd: this.watchDir, timeout: 5000 }, (err, stdout) => {
        if (err || !stdout) {
          resolve({ hasChanges: false, addedLines: 0, removedLines: 0, changedFiles: 0 });
          return;
        }

        let addedLines = 0;
        let removedLines = 0;
        const statLines = stdout.trim().split('\n');
        const changedFiles = statLines.filter(l => l.includes('|')).length;

        for (const line of statLines) {
          const insertMatch = line.match(/\+\s*(\d+)/);
          const deleteMatch = line.match(/-\s*(\d+)/);
          if (insertMatch) addedLines += parseInt(insertMatch[1], 10);
          if (deleteMatch) removedLines += parseInt(deleteMatch[1], 10);
        }

        resolve({
          hasChanges: addedLines > 0 || removedLines > 0,
          addedLines,
          removedLines,
          changedFiles
        });
      });
    });
  }

  /**
   * 发布状态变更事件
   */
  _emitStatus(status) {
    const statusKey = `${status.isTraeRunning}:${status.activity}:${status.hasBuildError}`;
    if (this.lastStatus && `${this.lastStatus.isTraeRunning}:${this.lastStatus.activity}:${this.lastStatus.hasBuildError}` === statusKey) {
      return;
    }

    const event = {
      type: 'trae_status',
      ...status,
      petReaction: this._suggestPetReaction(status)
    };

    if (this.bus && typeof this.bus.publish === 'function') {
      this.bus.publish('monitor.trae.status', event);

      // 也发到 hooks 事件
      try {
        this.bus.publish('hooks.state_updated', {
          session_id: 'trae_monitor',
          state: mapToUnifiedState(status.activity, 'trae'),
          data: {
            tool_name: 'trae',
            summary: this._getSummary(status),
            status
          }
        });
      } catch {
        // ignore
      }
    }
  }

  /**
   * 根据 Trae 状态建议桌宠反应
   */
  _suggestPetReaction(status) {
    if (!status.isTraeRunning) {
      return status.activity === 'file_changes'
        ? { emotion: 'happy', action: 'nod', message: '文件更新了' }
        : { emotion: 'sleepy', action: 'sleep', message: 'Trae 没在跑' };
    }

    switch (status.activity) {
      case 'compiling':
        return { emotion: 'focused', action: 'watch', message: '正在编译...' };
      case 'build_success':
        return { emotion: 'happy', action: 'celebrate', message: '编译成功！✨' };
      case 'build_error':
        return { emotion: 'worried', action: 'concern', message: `编译出错了: ${status.buildError?.substring(0, 40) || ''}` };
      case 'editing':
        return { emotion: 'curious', action: 'tilt_head', message: '正在编辑代码' };
      case 'test_passed':
        return { emotion: 'excited', action: 'celebrate', message: '测试全部通过！🎉' };
      case 'test_failed':
        return { emotion: 'worried', action: 'concern', message: '测试有失败' };
      default:
        return { emotion: 'neutral', action: 'idle', message: '' };
    }
  }

  /**
   * 获取状态摘要
   */
  _getSummary(status) {
    if (!status.isTraeRunning) return 'Trae 未运行';
    switch (status.activity) {
      case 'compiling': return '正在编译';
      case 'build_success': return '编译成功';
      case 'build_error': return `编译错误: ${status.buildError?.substring(0, 50) || ''}`;
      case 'editing': return `编辑了 ${status.recentChanges} 个文件`;
      case 'test_passed': return '测试通过';
      case 'test_failed': return '测试失败';
      case 'file_changes': return `${status.recentChanges} 个文件变更`;
      default: return 'Trae 运行中';
    }
  }

  /**
   * 获取当前状态
   */
  getStatus() {
    return this.lastStatus || {
      isTraeRunning: false,
      activity: 'idle',
      recentChanges: 0,
      hasBuildError: false,
      buildError: '',
      hasTestResult: false,
      testResult: '',
      detectSignal: 'none',
      timestamp: 0
    };
  }
}

module.exports = { TraeMonitor };
