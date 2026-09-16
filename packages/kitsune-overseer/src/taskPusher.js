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
const fs = require('node:fs');
const path = require('node:path');

// 预定义工具配置 — 内置白名单（运行时可通过 registerTool 扩展）
const TOOL_ALLOWLIST = {
  claude: {
    name: 'Claude Code',
    binary: 'claude',
    // 允许的命令模板（参数由用户提供）
    templates: [
      { key: 'prompt', label: '发送指令', args: ['--print'], inputParam: '-p', maxLen: 2000 },
      // P3 试点：结构化 stdout（JSON Lines）——result 解析时可拿到逐条 tool_use / 错误信号，
      // 不再靠人读文本判断成败。claude -p --output-format json 输出 JSON Lines：
      //   {"type":"system","subtype":"init",...}
      //   {"type":"assistant","message":{...}} / {"type":"result","subtype":"success"|"error_max_turns"|...}
      { key: 'prompt-json', label: '发送指令(结构化)', args: ['--print', '--output-format', 'json'], inputParam: '-p', maxLen: 2000, structured: true },
      { key: 'diff', label: '请求 diff 审查', args: ['--diff', '--print'], inputParam: null, maxLen: 0 },
      { key: 'commit', label: '生成 commit', args: ['--commit', '--print'], inputParam: null, maxLen: 0 },
    ],
    timeoutMs: 60_000,
    riskLevel: 'medium',
  },
  opencode: {
    name: 'Opencode',
    binary: 'opencode',
    templates: [
      { key: 'prompt', label: '发送指令', args: ['--print'], inputParam: null, maxLen: 2000 },
      { key: 'full-auto', label: '全自动模式', args: ['--full-auto'], inputParam: null, maxLen: 0 },
    ],
    timeoutMs: 120_000,
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
 * 检测输入中的危险内容（内容策略兜底）。
 *
 * NOTICE: TaskPusher 统一走 spawn(binary, args) 数组传参（非 shell 模式），
 * shell 元字符（;|&`$(){} 等）作为参数内容传给 AI CLI 是安全的，无法构成注入，
 * 因此不再拦截这些字符（此前会把含代码片段/模板字符串的合法 prompt 误判为注入，
 * 导致自动修复指令被 INJECTION_DETECTED 拒绝）。
 * 此处仅保留高置信危险项：
 *   - 空字节（spawn 无法接收，属非法输入）
 *   - 明确的敏感目录路径（.git/.svn/.hg/.env 作为完整路径段，避免误伤 .gitignore 等）
 */
function detectInjection(str) {
  const dangerous = [
    /\x00/,                                     // 空字节
    /(?:^|[/\\])\.(?:git|svn|hg|env)(?:[/\\]|$)/i, // 敏感目录（完整路径段）
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
    // P2：运行时注册的工具配置（yaml/编排层注入），查找时优先于内置白名单
    this._extraTools = new Map();
  }

  /**
   * P2：运行时注册一个工具到命令注册表。
   *
   * 让 yaml/编排层可以在启动时把"带 CLI 控制协议"的工具（如 gemini-cli、
   * qwen-code）注册进 TaskPusher，获得与内置工具一致的 pushTask / autoFix 能力，
   * 不必改包源码。注册配置与 TOOL_ALLOWLIST 同构：
   *   { name, binary, templates: [{key,label,args,inputParam,maxLen,custom?}], timeoutMs, riskLevel }
   * 重复注册同一 binary > 1 次会告警，但以最新一次为准。
   *
   * @param {string} key - 工具标识（对应 execute event 的 source / task.provider）
   * @param {Object} cfg - 工具配置，结构同 TOOL_ALLOWLIST[key]
   * @returns {boolean} true=注册成功，false=配置非法被拒绝
   */
  registerTool(key, cfg) {
    if (!key || !cfg || typeof cfg !== 'object') {
      console.warn(`[TaskPusher] registerTool 拒绝: 非法参数 key=${key}`);
      return false;
    }
    if (!cfg.binary || !Array.isArray(cfg.templates) || cfg.templates.length === 0) {
      console.warn(`[TaskPusher] registerTool 拒绝: ${key} 缺少 binary 或 templates`);
      return false;
    }
    // 模板规范化：补默认字段，校验 key 唯一
    const templates = cfg.templates.map((t, i) => {
      if (!t || !t.key) return null;
      return {
        key: t.key,
        label: t.label || t.key,
        args: Array.isArray(t.args) ? t.args : [],
        inputParam: t.inputParam ?? null,
        maxLen: typeof t.maxLen === 'number' ? t.maxLen : 2000,
        custom: t.custom === true,
      };
    });
    if (templates.some(t => !t)) {
      console.warn(`[TaskPusher] registerTool 拒绝: ${key} 的模板缺少 key`);
      return false;
    }
    const normalized = {
      name: cfg.name || key,
      binary: cfg.binary,
      templates,
      timeoutMs: typeof cfg.timeoutMs === 'number' && cfg.timeoutMs > 0 ? cfg.timeoutMs : 60_000,
      riskLevel: ['low', 'medium', 'high'].includes(cfg.riskLevel) ? cfg.riskLevel : 'medium',
      custom: cfg.custom === true,
      // 工具级环境变量（如 dsh 的 DSH_HOME）— spawn 时合并进 process.env，
      // 支持「安装即启用」型工具：binary 在 PATH 即可探活可用，env 指向它的 home 目录
      env: cfg.env && typeof cfg.env === 'object' ? { ...cfg.env } : undefined,
    };
    if (this._extraTools.has(key)) {
      console.warn(`[TaskPusher] registerTool 覆盖已注册工具: ${key}`);
    }
    this._extraTools.set(key, normalized);
    this._binaryCache = null; // 有新的二进制，失效 PATH 探测缓存
    return true;
  }

  /**
   * 列出运行时已注册的工具 key（供编排层查询/校验）
   */
  getRegisteredTools() {
    return [...this._extraTools.keys()];
  }

  /**
   * 查找工具配置：运行时注册表优先，其次内置白名单。
   * @private
   */
  _resolveTool(key) {
    return this._extraTools.get(key) || TOOL_ALLOWLIST[key] || null;
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
   * 获取可用工具列表（含二进制可用性探测）。
   *
   * 返回 { key, name, templates, riskLevel, available, binary }
   * available=false 表示该工具的 CLI 二进制不在 PATH 中（如 trae/cursor 无 CLI，
   * 或 claude/codex/aider 未安装），调用方应跳过自动修复。
   * 列表 = 内置白名单 + 运行时注册的工具。
   */
  getAvailableTools() {
    const availability = this.probeToolAvailability()
    const all = { ...TOOL_ALLOWLIST, ...Object.fromEntries(this._extraTools) }
    return Object.entries(all).map(([key, cfg]) => ({
      key,
      name: cfg.name,
      templates: cfg.templates.map(t => ({ key: t.key, label: t.label })),
      riskLevel: cfg.riskLevel,
      available: Boolean(availability[key]),
      binary: cfg.binary,
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
   * @param {Record<string,string>} [options.env] - 本次调用额外的环境变量（合并进进程 env）
   */
  async pushTask({ tool, templateKey, input = '', cwd = process.cwd(), userPermission = 'medium', env } = {}) {
    // 1. 工具白名单检查（内置 + 运行时注册）
    const toolConfig = this._resolveTool(tool);
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
    //    环境变量 = 进程 env + 工具级 env（registerTool 的 cfg.env，如 dsh 的 DSH_HOME）+ 调用级 env
    const toolEnv = toolConfig.env || {};
    const mergedEnv = { ...process.env, ...toolEnv, ...env };
    const result = await this.spawnCommand(toolConfig.binary, args, cwd, toolConfig.timeoutMs, mergedEnv);

    // P3 试点：结构化模板（claude --output-format=json）——解析 stdout JSON Lines，
    // 把逐条错误信号回填到 result，执行层无需人读文本即可判断成败/失败原因。
    if (template.structured && result.output) {
      this._augmentStructuredResult(result);
    }

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
   * 返回工具配置（内置 + 运行时注册），供执行层查询 binary/timeoutMs/riskLevel
   */
  getToolConfig(tool) {
    return this._resolveTool(tool);
  }

  /**
   * 公开的输入净化方法，供执行层净化 IDE 任务的 code/command
   */
  sanitizeInput(raw, maxLength = 500) {
    return sanitizeInput(raw, maxLength);
  }

  /**
   * 解析可执行文件的完整路径（Windows 专用）。
   *
   * 裸 `spawn('dsh', args)` 在 Windows 上无法解析 PATH 里的 `.cmd/.bat`（Node 非 shell
   * spawn 只认 exe），而 npm 全局安装的 CLI（如 `npm i -g @deepseek-ai/dsh`）生成的正
   * 是 `dsh.cmd` → 会 ENOENT 失败。这里沿发现链探测出完整可执行路径：
   *   1. binary 本身是绝对路径（config 可显式写安装位置）→ 直接存在性检查
   *   2. PATH + 用户级 PATH（注册表 HKCU\Environment，进程 PATH 是启动快照合并）
   *   3. npm 全局 bin（`npm prefix -g/bin` 动态查询）— 跨机器通用：任何电脑
   *      `npm i -g` 装的 CLI 都会出现在这里，无需用户改 PATH 也无需写死绝对路径
   * 找到 `.exe` / 无扩展名文件 → 直接可 spawn；`.cmd` / `.bat` → cmd.exe 包装。
   * 找不到时返回 null，由调用方回退为裸 spawn（Linux 与非 PATH 场景兼容）。
   * @private
   */
  _resolveBinary(binary) {
    if (process.platform !== 'win32') return { command: binary, argsPrefix: [] };
    // 1. 绝对路径 binary（config cli.binary 直接写安装位置）：按字面存在性检查
    if (path.isAbsolute(binary)) {
      const r = this._tryResolve(binary);
      if (r) return r;
      return null;
    }
    // 2. PATH（进程 + 用户级注册表）
    for (const dir of this._candidatePathDirs()) {
      if (!dir) continue;
      for (const ext of ['.exe', '.cmd', '.bat']) {
        const r = this._tryResolve(path.join(dir, binary + ext));
        if (r) return r;
      }
    }
    // 3. npm 全局 bin — 跨机器自动发现「安装即启用」的 CLI：
    //    npm prefix -g 输出全局 node_modules 父目录，bin 在其下；避免写死每台机器的绝对路径。
    for (const dir of this._npmGlobalBinCandidates()) {
      for (const ext of ['.cmd', '.exe', '.bat']) {
        const r = this._tryResolve(path.join(dir, binary + ext));
        if (r) return r;
      }
    }
    return null;
  }

  /**
   * npm 全局 bin 候选目录 = `npm prefix -g` 的全局目录本身（Windows npm 把 .cmd
   * shim 直接放这里）+ 其 bin 子目录（非 Windows 惯例）。缓存查询结果，避免
   * 每次 resolve/probe 都触发子进程。发现失败时返回空数组。
   * @private
   */
  _npmGlobalBinCandidates() {
    if (this._npmBinCache) return this._npmBinCache;
    const out = [];
    try {
      const { execFileSync } = require('node:child_process');
      // Windows 上 npm 是 npm.cmd：非 shell spawn 无法直接执行（同 .cmd 坑），
      // 借 cmd.exe 包装；非 Windows 直接跑 npm（PATH 里的 node bin）。
      const isWin = process.platform === 'win32';
      const prefix = isWin
        ? execFileSync('cmd.exe', ['/d', '/s', '/c', 'npm prefix -g'], { encoding: 'utf-8', windowsHide: true, timeout: 5000 }).trim()
        : execFileSync('npm', ['prefix', '-g'], { encoding: 'utf-8', timeout: 5000 }).trim();
      if (prefix) {
        // Windows: npm i -g 的 shim(.cmd/.exe) 直接落在 <prefix> 根；Unix 惯例是 <prefix>/bin
        const roots = [prefix, path.join(prefix, 'bin')];
        for (const r of roots) {
          try {
            if (fs.existsSync(r) && fs.statSync(r).isDirectory() && !out.includes(r)) out.push(r);
          } catch { /* 忽略不可读目录 */ }
        }
      }
    } catch { /* npm 不可用 — 忽略 */ }
    this._npmBinCache = out;
    return out;
  }

  /**
   * 对单个候选路径做存在性检查 + 返回可 spawn 形态。
   * 命中 `.exe` / 无扩展名文件 → 直接 spawn；
   * 命中 `.cmd/.bat` 且是 **node shim**（内容形如 `node "<abs>\bin.js" %*`，npm/pnpm
   * 生成的现代 CLI 入口）→ 解析成 `spawn(node, [script, ...args])` 数组传参直调。
   *   原因：cmd.exe 的 `/c` 会做二次命令行解析，把带中文/引号/反斜杠的任务文本
   *   （如 dsh 派活 prompt）拆坏——dsh 建了 session 却收不到完整任务、空转退出。
   *   直调 node 走 spawn 数组传参（无 shell 层），参数原样到达，无注入面。
   * 其余 `.cmd/.bat`（普通批处理）→ 借 cmd.exe 包装（args 仍数组传参）。
   * 不存在返回 null。
   * @private
   */
  _tryResolve(fullPath) {
    try {
      if (!fs.existsSync(fullPath)) return null;
      const ext = path.extname(fullPath).toLowerCase();
      if (ext !== '.cmd' && ext !== '.bat')
        return { command: fullPath, argsPrefix: [] };
      const nodeShim = this._nodeShimTarget(fullPath);
      if (nodeShim)
        return { command: nodeShim.command, argsPrefix: nodeShim.argsPrefix };
      return { command: 'cmd.exe', argsPrefix: ['/d', '/s', '/c', fullPath] };
    } catch { return null; }
  }

/**
   * 尝试把 `.cmd/.bat` 解析成 node shim 直调形态：读取批处理内容，匹配
   * `node  "…bin.js" %*` 或 `"…node.exe" "…bin.js" %*`（npm/pnpm 生成的 shim
   * 固定模式，路径常用 `%~dp0` 指代批处理自身目录）。命中返回
   * `{ command: <node 可执行>, argsPrefix: [script] }`；非 node shim / 读取失败 /
   * 无匹配返回 null（调用方安全回退 cmd.exe 包装）。
   * @private
   */
  _nodeShimTarget(batchPath) {
    try {
      const content = fs.readFileSync(batchPath, 'utf8');
      const m = content.match(/^\s*(?:(?:"([^"]+node(?:\.exe)?)"|node)\s+)?(?:"([^"]+)"|(\S+))\s+%\*\s*$/im);
      if (!m)
        return null;
      // m[2]/m[3] = 脚本入口（bin.js）；m[1] = shim 里的 node 可执行（可能带 %~dp0）
      const script = m[2] || m[3];
      if (!script)
        return null;
      const scriptAbs = this._expandBatchVar(script, batchPath);
      if (!path.isAbsolute(scriptAbs))
        return null;
      let nodeExe = m[1] ? this._expandBatchVar(m[1], batchPath) : '';
      if (nodeExe && !fs.existsSync(nodeExe))
        nodeExe = '';
      return { command: nodeExe || 'node', argsPrefix: [scriptAbs] };
    } catch { return null; }
  }

  /**
   * 展开批处理变量 `%~dp0`（= 批处理文件所在目录，带尾反斜杠）为真实绝对路径。
   * 无 `%~dp0` 时原样返回。
   * @private
   */
  _expandBatchVar(p, batchPath) {
    if (!p.includes('%~dp0'))
      return p;
    const dir = path.dirname(batchPath);
    return p.replace(/%~dp0\\?/g, `${dir}${path.sep}`).replace(/%~dp0/g, dir);
  }

  /**
   * Windows 候选 PATH 目录集合 = 进程 PATH + 用户级 PATH（注册表 HKCU\Environment）。
   * 进程 PATH 是启动时快照 — 用户后装工具（如 `npm i -g dsh` 写入用户 PATH）不会被
   * 启动早于安装的常驻进程看到；合并用户级 PATH 让「安装即启用」无需重启应用。
   * 非 Windows / 读取失败时回退为进程 PATH。
   * @private
   */
  _candidatePathDirs() {
    const dirs = (process.env.PATH || '').split(path.delimiter);
    if (process.platform !== 'win32') return dirs;
    try {
      const { execFileSync } = require('node:child_process');
      // reg query HKCU\Environment /v Path — 用户级 PATH（npm -g 装包写这里）
      const raw = execFileSync('reg', ['query', 'HKCU\\Environment', '/v', 'Path'], {
        encoding: 'utf-8',
        windowsHide: true,
        timeout: 5000,
      });
      const line = raw.split(/\r?\n/).find(l => /^\s*Path\s+REG_(EXPAND_)?SZ\s+(.+)$/i.test(l));
      const value = line ? line.replace(/^\s*Path\s+REG_(EXPAND_)?SZ\s+/i, '').trim() : '';
      if (value) {
        for (const d of value.split(path.delimiter)) {
          const t = d.trim();
          if (t && !dirs.includes(t))
            dirs.push(t);
        }
      }
    } catch { /* 注册表读取失败忽略 — 退回进程 PATH */ }
    return dirs;
  }

  /**
   * 使用 spawn 执行命令（非 shell 模式，防注入）
   * @param {string} binary - 可执行文件
   * @param {string[]} args - 参数数组
   * @param {string} cwd - 工作目录
   * @param {number} timeoutMs - 超时（毫秒）
   * @param {Record<string,string>} [env] - 环境变量；缺省时继承 process.env
   */
  spawnCommand(binary, args, cwd, timeoutMs, env) {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let sigkillTimer = null;

      // Windows：沿 PATH 解析出可执行文件完整路径（.cmd/.bat 用 cmd.exe 包装），
      // 让「npm i -g dsh → PATH 出现 dsh.cmd → 探活 available + spawn 成功」的
      // 安装即启用闭环成立；非 Windows 或解析失败回退为裸 spawn。
      const resolved = this._resolveBinary(binary);
      const command = resolved ? resolved.command : binary;
      const argsPrefix = resolved ? resolved.argsPrefix : [];
      const spawnArgs = [...argsPrefix, ...args];

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        // SIGTERM 后 5s 仍存活则 SIGKILL 强杀
        sigkillTimer = setTimeout(() => {
          child.kill('SIGKILL');
        }, 5000);
      }, timeoutMs);

      const child = spawn(command, spawnArgs, {
        cwd,
        env: env || process.env,
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
            // exitCode 固定 124（GNU timeout 的默认退出码），让上游识别为「超时」而非「退出码非 0: undefined」
            exitCode: 124,
            output: stdout.substring(0, 10000),
            stderr: stderr.substring(0, 2000),
            partialOutput: stdout.substring(0, 3000),
          });
          return;
        }

        resolve({
          ok: code === 0 || code === null,
          output: stdout.substring(0, 10000),
          stderr: stderr.substring(0, 2000),
          exitCode: code,
          // 非零退出码带 stderr 尾巴，排队/诊断时能直接看到失败原因（如 dsh 缺模型报错）
          error: code !== 0 && code !== null
            ? `进程退出码: ${code}` + (stderr.trim() ? ` — ${stderr.trim().slice(0, 300)}` : '')
            : undefined,
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

  /**
   * P3 试点：解析 claude --output-format=json 的 stdout（JSON Lines），
   * 提取任务结果信号，回填到 result：
   *   - result.subtype === 'success'            → ok=true
   *   - result.subtype === 'error_*' / exit      → ok=false + errorMessage（优先 result 的 error 字段）
   *   - assistant message 里的 tool_use 有 error？逐条记录 result.toolResults
   * 解析失败（非 JSON / 截断）静默跳过，不触发额外错误路径。
   */
  _augmentStructuredResult(result) {
    const messages = [];
    let finalSubtype = null;
    let finalError = null;
    for (const line of result.output.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let entry;
      try {
        entry = JSON.parse(trimmed);
      } catch { continue; }
      if (entry.type === 'result') {
        finalSubtype = entry.subtype ?? null;
        if (entry.result && typeof entry.result === 'object') {
          finalError = entry.result.error || entry.result.errorMessage || finalError;
        }
        if (entry.subtype && entry.subtype !== 'success') {
          finalError = finalError || entry.subtype;
        }
      } else if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
        for (const c of entry.message.content) {
          if (c.type === 'tool_use') {
            messages.push({ type: 'tool_use', name: c.name, id: c.id, input: c.input });
          }
        }
      }
    }
    result.structured = {
      parsed: finalSubtype !== null || messages.length > 0,
      subtype: finalSubtype,
      error: finalError,
      toolUses: messages,
    };
    if (finalSubtype && finalSubtype !== 'success') {
      result.ok = false;
      result.error = result.error || `任务未成功: ${finalError || finalSubtype}`;
    }
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

  /**
   * 探测各工具二进制是否在 PATH 中可用。
   *
   * ── 修复笔记 ──
   * trae/cursor/windsurf 是 GUI IDE，没有 CLI 二进制，spawn('trae') 必然失败。
   * claude/codex/aider 需要用户手动安装（npm install / pip install）。
   * 此方法在 startup 时扫描 PATH 目录，标记不可用的工具，使自动修复可跳过它们。
   *
   * 返回 { toolKey: boolean } 对象，例如 { claude: true, codex: false, trae: false }。
   * 结果会缓存到 this._binaryCache，避免频繁磁盘扫描。
   */
  probeToolAvailability() {
    if (this._binaryCache) return this._binaryCache

    const cache = {}
    // 发现目录 = PATH（进程+用户级） + npm 全局 bin。跨机器通用：只要 `npm i -g` 装了
    // CLI（dsh 等），无需用户改 PATH 或写死绝对路径，探活即可命中。
    const discoveryDirs = [...this._candidatePathDirs(), ...this._npmGlobalBinCandidates()]
    const isWin = process.platform === 'win32'
    // Windows 上可执行文件扩展名
    const exts = isWin ? ['', '.exe', '.cmd', '.bat'] : ['']
    // 探测对象 = 内置白名单 + 运行时注册的工具
    const all = { ...TOOL_ALLOWLIST, ...Object.fromEntries(this._extraTools) }

    for (const [key, cfg] of Object.entries(all)) {
      const binary = cfg.binary
      let found = false

      // 绝对路径 binary（config cli.binary 直接写安装位置）：只做存在性检查
      if (path.isAbsolute(binary)) {
        found = this._tryResolve(binary) !== null
      } else {
        for (const dir of discoveryDirs) {
          if (!dir) continue
          for (const ext of exts) {
            try {
              const fullPath = path.join(dir, binary + ext)
              if (fs.existsSync(fullPath)) {
                // 非 Windows 上检查可执行位
                if (!isWin) {
                  try {
                    const stat = fs.statSync(fullPath)
                    if (!(stat.mode & 0o111)) continue
                  } catch { continue }
                }
                found = true
                break
              }
            } catch { /* 继续 */ }
          }
          if (found) break
        }
      }

      cache[key] = found
    }

    this._binaryCache = cache
    return cache
  }
}

module.exports = { TaskPusher, TOOL_ALLOWLIST };
