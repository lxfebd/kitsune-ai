/**
 * 主动任务推送器
 * 通过子进程调用 AI 编程工具的 CLI 发送任务指令
 *
 * 安全设计：
 * 1. 白名单机制：只允许预定义的工具和命令模板
 * 2. 输入净化：所有用户输入经过严格校验和截断
 * 3. 超时控制：每个命令有独立超时，防止挂起
 * 4. 沙箱执行：通过 spawn（非 exec）避免 shell 注入
 * 5. 权限分级：不同工具需要不同的权限级别
 */

const { spawn } = require('node:child_process');
const path = require('node:path');

// 预定义工具配置 — 白名单，不可运行时修改
const TOOL_ALLOWLIST = {
  claude: {
    name: 'Claude Code',
    binary: 'claude',
    // 允许的命令模板（参数由用户提供）
    templates: [
      { key: 'prompt', label: '发送指令', args: ['--print', '--no-input'], inputParam: '-p', maxLen: 2000 },
      { key: 'diff', label: '请求 diff 审查', args: ['--diff', '--no-input'], inputParam: null, maxLen: 0 },
      { key: 'commit', label: '生成 commit', args: ['--commit', '--no-input'], inputParam: null, maxLen: 0 },
    ],
    timeoutMs: 60_000,
    riskLevel: 'medium',
  },
  codex: {
    name: 'OpenAI Codex',
    binary: 'codex',
    templates: [
      { key: 'prompt', label: '发送指令', args: ['--quiet'], inputParam: null, maxLen: 2000 },
      { key: 'full-auto', label: '全自动模式', args: ['--full-auto'], inputParam: null, maxLen: 0 },
    ],
    timeoutMs: 120_000,
    riskLevel: 'high',
  },
  // ── VS Code 系工具（Trae/Cursor/Windsurf 都基于 VS Code）──
  trae: {
    name: 'Trae',
    binary: 'trae',
    templates: [
      { key: 'prompt', label: '发送指令', args: ['--goto'], inputParam: null, maxLen: 2000, custom: true },
      { key: 'diff', label: '文件对比', args: ['--diff'], inputParam: null, maxLen: 0 },
      { key: 'open', label: '打开文件', args: [], inputParam: null, maxLen: 500 },
    ],
    timeoutMs: 30_000,
    riskLevel: 'medium',
  },
  cursor: {
    name: 'Cursor',
    binary: 'cursor',
    templates: [
      { key: 'prompt', label: '发送指令', args: ['--goto'], inputParam: null, maxLen: 2000, custom: true },
      { key: 'diff', label: '文件对比', args: ['--diff'], inputParam: null, maxLen: 0 },
      { key: 'open', label: '打开文件', args: [], inputParam: null, maxLen: 500 },
    ],
    timeoutMs: 30_000,
    riskLevel: 'medium',
  },
  windsurf: {
    name: 'Windsurf',
    binary: 'windsurf',
    templates: [
      { key: 'prompt', label: '发送指令', args: ['--goto'], inputParam: null, maxLen: 2000, custom: true },
      { key: 'diff', label: '文件对比', args: ['--diff'], inputParam: null, maxLen: 0 },
      { key: 'open', label: '打开文件', args: [], inputParam: null, maxLen: 500 },
    ],
    timeoutMs: 30_000,
    riskLevel: 'medium',
  },
  // ── Aider（AI 编程助手，支持 CLI 交互）──
  aider: {
    name: 'Aider',
    binary: 'aider',
    templates: [
      { key: 'prompt', label: '发送指令', args: ['--message'], inputParam: null, maxLen: 2000 },
      { key: 'auto', label: '自动模式', args: ['--yes-always'], inputParam: null, maxLen: 0 },
    ],
    timeoutMs: 120_000,
    riskLevel: 'high',
  },
};

// 风险等级对应的最低权限要求
const RISK_PERMISSIONS = {
  low: 'low',
  medium: 'medium',
  high: 'high',
};

/**
 * 校验并净化用户输入
 */
function sanitizeInput(raw, maxLength = 500) {
  if (typeof raw !== 'string') return '';
  // 移除控制字符（保留换行和制表符）
  const cleaned = raw.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
  // 截断到最大长度
  return cleaned.substring(0, maxLength);
}

/**
 * 检测命令注入特征
 */
function detectInjection(str) {
  const dangerous = [
    /[;|&`$(){}]/,           // shell 元字符
    /\$\{/,                   // 变量展开
    /\/\.\./,                 // 路径遍历
    /\x00/,                   // 空字节
    /(?:^|\/)\.(?:git|svn|hg|env)/i,  // 敏感文件访问
  ];
  return dangerous.some(re => re.test(str));
}

class TaskPusher {
  constructor({ bus, permissionChecker } = {}) {
    this.bus = bus;
    this.permissionChecker = permissionChecker;
    this.history = [];
    this.maxHistory = 100;
    this._activeChildren = new Set();
    this._exitHandlerRegistered = false;
    this._registerExitHooks();
  }

  /**
   * 注册进程退出钩子 — 父进程退出时强杀所有子进程，防止僵尸进程残留
   *
   * NOTICE:
   * process.on('exit') 内不能做异步操作，所以直接发 SIGKILL。
   * process.on('SIGTERM'/'SIGINT') 内可以异步，走 killAll() 的 SIGTERM→5s→SIGKILL 流程。
   */
  _registerExitHooks() {
    if (this._exitHandlerRegistered) return;
    this._exitHandlerRegistered = true;

    const forceKill = () => {
      for (const child of this._activeChildren) {
        try { child.kill('SIGTERM'); } catch { /* 进程可能已退出 */ }
        // 立即安排 SIGKILL（exit 事件内无法 setTimeout，直接发）
        try { child.kill('SIGKILL'); } catch { /* 进程可能已退出 */ }
      }
      this._activeChildren.clear();
    };

    // exit 事件内不能异步，直接 SIGKILL
    process.on('exit', forceKill);

    // SIGTERM/SIGINT 信号可异步，走完整清理流程
    const gracefulShutdown = () => {
      this.killAll();
    };
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  }

  /**
   * 获取可用工具列表
   */
  getAvailableTools() {
    return Object.entries(TOOL_ALLOWLIST).map(([key, cfg]) => ({
      key,
      name: cfg.name,
      templates: cfg.templates.map(t => ({ key: t.key, label: t.label })),
      riskLevel: cfg.riskLevel,
    }));
  }

  /**
   * 推送任务到指定工具
   *
   * @param {Object} options
   * @param {string} options.tool - 工具标识 (claude/codex)
   * @param {string} options.templateKey - 命令模板 key
   * @param {string} [options.input] - 用户输入内容
   * @param {string} [options.cwd] - 工作目录
   * @param {string} [options.userPermission] - 用户当前权限级别
   */
  async pushTask({ tool, templateKey, input = '', cwd = process.cwd(), userPermission = 'medium' }) {
    // 1. 工具白名单检查
    const toolConfig = TOOL_ALLOWLIST[tool];
    if (!toolConfig) {
      return { ok: false, error: `不支持的工具: ${tool}`, code: 'UNKNOWN_TOOL' };
    }

    // 2. 模板白名单检查
    const template = toolConfig.templates.find(t => t.key === templateKey);
    if (!template) {
      return { ok: false, error: `不支持的命令: ${templateKey}`, code: 'UNKNOWN_TEMPLATE' };
    }

    // 3. 权限校验
    const requiredPerm = RISK_PERMISSIONS[toolConfig.riskLevel] || 'high';
    const permOrder = { low: 1, medium: 2, high: 3 };
    if ((permOrder[userPermission] || 0) < (permOrder[requiredPerm] || 3)) {
      return { ok: false, error: `权限不足: 需要 ${requiredPerm} 级别`, code: 'PERMISSION_DENIED' };
    }

    // 4. 输入净化与安全检测
    const sanitizedInput = sanitizeInput(input, template.maxLen);
    if (input && sanitizedInput !== input) {
      console.warn(`[TaskPusher] 输入被净化: 原始长度=${input.length}, 净化后=${sanitizedInput.length}`);
    }

    if (detectInjection(sanitizedInput)) {
      // 记录安全事件
      this._recordEvent('SECURITY_ALERT', { tool, templateKey, input: sanitizedInput });
      return { ok: false, error: '检测到不安全的输入内容', code: 'INJECTION_DETECTED' };
    }

    // 5. 构建命令参数
    const args = [...(template.args || [])];
    if (template.inputParam && sanitizedInput) {
      args.push(template.inputParam, sanitizedInput);
    } else if (sanitizedInput && template.key === 'prompt') {
      // claude 的 -p 参数需要特殊处理
      args.push(sanitizedInput);
    }

    // 6. 执行命令（使用 spawn 避免 shell 注入）
    const result = await this.spawnCommand(toolConfig.binary, args, cwd, toolConfig.timeoutMs);

    // 7. 记录历史
    this._recordHistory({ tool, templateKey, input: sanitizedInput, ...result });

    // 8. 发布事件
    if (this.bus) {
      this.bus.publish('overseer.task_pushed', {
        tool,
        template: templateKey,
        success: result.ok,
        timestamp: Date.now(),
      });
    }

    return result;
  }

  /**
   * 返回工具白名单配置，供执行层查询 binary/timeoutMs/riskLevel
   */
  getToolConfig(tool) {
    return TOOL_ALLOWLIST[tool] || null;
  }

  /**
   * 公开的输入净化方法，供执行层净化 IDE 任务的 code/command
   */
  sanitizeInput(raw, maxLength = 500) {
    return sanitizeInput(raw, maxLength);
  }

  /**
   * 使用 spawn 执行命令（非 shell 模式，防注入）
   */
  spawnCommand(binary, args, cwd, timeoutMs) {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let sigkillTimer = null;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        // SIGTERM 后 5s 仍存活则 SIGKILL 强杀
        sigkillTimer = setTimeout(() => {
          child.kill('SIGKILL');
        }, 5000);
      }, timeoutMs);

      const child = spawn(binary, args, {
        cwd,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      child.stdout.on('data', (data) => { stdout += data.toString(); });
      child.stderr.on('data', (data) => { stderr += data.toString(); });

      this._activeChildren.add(child);
      const cleanup = () => { this._activeChildren.delete(child); };
      child.on('close', cleanup);
      child.on('error', cleanup);

      child.on('close', (code) => {
        clearTimeout(timer);
        if (sigkillTimer) clearTimeout(sigkillTimer);

        if (timedOut) {
          resolve({
            ok: false,
            error: `命令超时 (${timeoutMs / 1000}s)`,
            code: 'TIMEOUT',
            partialOutput: stdout.substring(0, 3000),
          });
          return;
        }

        resolve({
          ok: code === 0 || code === null,
          output: stdout.substring(0, 10000),
          stderr: stderr.substring(0, 2000),
          exitCode: code,
          error: code !== 0 && code !== null ? `进程退出码: ${code}` : undefined,
        });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        if (sigkillTimer) clearTimeout(sigkillTimer);
        resolve({
          ok: false,
          error: `无法启动 ${binary}: ${err.message}`,
          code: 'SPAWN_ERROR',
        });
      });
    });
  }

  _recordHistory(entry) {
    this.history.push({
      ...entry,
      timestamp: Date.now(),
    });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  _recordEvent(type, data) {
    if (this.bus) {
      this.bus.publish('task_pusher.event', { type, data, timestamp: Date.now() });
    }
  }

  getHistory(limit = 20) {
    return this.history.slice(-limit).reverse();
  }

  /**
   * 强制终止当前活跃的子进程
   */
  killAll() {
    for (const child of this._activeChildren) {
      child.kill('SIGTERM');
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* 进程可能已退出 */ }
      }, 5000);
    }
    this._activeChildren.clear();
  }
}

module.exports = { TaskPusher, TOOL_ALLOWLIST };
