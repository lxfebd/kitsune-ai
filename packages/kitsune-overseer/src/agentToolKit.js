/**
 * AgentToolKit — 面向自主任务的工具集合
 *
 * 职责：
 * - 封装文件、搜索、shell、网络、LLM 等底层操作
 * - 每个工具标注风险类别，供 RiskController 决策
 * - 执行路径限制在项目 baseDir 内，防止越界访问
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { exec } = require('node:child_process');
const { promisify } = require('node:util');
const https = require('node:https');
const http = require('node:http');
const { URL } = require('node:url');

const execAsync = promisify(exec);

const DEFAULT_SHELL_TIMEOUT = 30_000;
const MAX_FILE_SIZE = 1024 * 1024; // 1MB
const MAX_HTTP_BODY = 1024 * 1024; // 1MB

/** shell 危险命令黑名单（简单关键字匹配） */
const SHELL_BLACKLIST = [
  'rm -rf /', 'rm -rf /*', 'format ', 'mkfs', ':(){ :|:& };:',
  'del /f /s /q c:\\', 'rd /s /q c:\\',
];

class AgentToolKit {
  /**
   * @param {Object} opts
   * @param {string} [opts.baseDir] 文件操作基准目录，默认 process.cwd()
   * @param {any} [opts.llmManager] llm_ask 使用
   * @param {Console|Object} [opts.logger]
   */
  constructor({ baseDir, llmManager, logger = console } = {}) {
    this.baseDir = baseDir ? path.resolve(baseDir) : process.cwd();
    this.llmManager = llmManager;
    this.logger = logger;
    this._tools = this._buildTools();
  }

  _resolvePath(inputPath) {
    const resolved = path.resolve(this.baseDir, inputPath);
    if (!resolved.startsWith(this.baseDir)) {
      throw new Error(`Path outside base directory: ${inputPath}`);
    }
    return resolved;
  }

  _buildTools() {
    return {
      fs_read: { category: 'read', execute: this._fsRead.bind(this) },
      fs_write: { category: 'write', execute: this._fsWrite.bind(this) },
      fs_list: { category: 'read', execute: this._fsList.bind(this) },
      search_code: { category: 'read', execute: this._searchCode.bind(this) },
      llm_ask: { category: 'read', execute: this._llmAsk.bind(this) },
      shell_exec: { category: 'shell', execute: this._shellExec.bind(this) },
      test_run: { category: 'shell', execute: this._testRun.bind(this) },
      browser_open: { category: 'network', execute: this._browserOpen.bind(this) },
    };
  }

  listTools() {
    return Object.keys(this._tools);
  }

  getCategory(name) {
    return this._tools[name]?.category;
  }

  /**
   * 执行工具
   * @param {string} name 工具名
   * @param {Object} params 参数
   * @returns {Promise<any>}
   */
  async execute(name, params) {
    const tool = this._tools[name];
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    return tool.execute(params);
  }

  async _fsRead({ path: inputPath }) {
    const target = this._resolvePath(inputPath);
    const stat = await fsp.stat(target);
    if (!stat.isFile()) throw new Error(`Not a file: ${inputPath}`);
    if (stat.size > MAX_FILE_SIZE) throw new Error(`File too large: ${inputPath}`);
    const content = await fsp.readFile(target, 'utf-8');
    return { path: inputPath, content, size: stat.size };
  }

  async _fsWrite({ path: inputPath, content }) {
    const target = this._resolvePath(inputPath);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, content, 'utf-8');
    return { path: inputPath, written: Buffer.byteLength(content, 'utf-8') };
  }

  async _fsList({ path: inputPath = '.' }) {
    const target = this._resolvePath(inputPath);
    const entries = await fsp.readdir(target, { withFileTypes: true });
    return {
      path: inputPath,
      entries: entries.map(e => ({ name: e.name, type: e.isDirectory() ? 'dir' : 'file' })),
    };
  }

  async _searchCode({ query, path: inputPath = '.' }) {
    const target = this._resolvePath(inputPath);
    const results = [];
    const stack = [target];
    while (stack.length && results.length < 50) {
      const dir = stack.pop();
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') stack.push(full);
          continue;
        }
        if (!entry.isFile() || entry.name.startsWith('.')) continue;
        try {
          const content = await fsp.readFile(full, 'utf-8');
          if (content.includes(query)) {
            const lines = content.split('\n');
            const matches = [];
            lines.forEach((line, idx) => {
              if (line.includes(query)) matches.push({ line: idx + 1, text: line.trim() });
            });
            if (matches.length) results.push({ path: path.relative(this.baseDir, full), matches });
          }
        } catch {}
      }
    }
    return { query, path: inputPath, count: results.length, results };
  }

  async _llmAsk({ prompt }) {
    if (!this.llmManager) throw new Error('llmManager not available for llm_ask');
    const reasoner = await this.llmManager.getReasoner();
    const response = await reasoner.decide({
      messages: [
        { role: 'system', content: '你是桌宠的自主任务执行助手，用中文简洁回答。' },
        { role: 'user', content: prompt }
      ]
    });
    return {
      answer: response?.output || response?.assistantMessage?.content || '',
    };
  }

  _validateShell(command) {
    const lower = command.toLowerCase();
    for (const bad of SHELL_BLACKLIST) {
      if (lower.includes(bad.toLowerCase())) throw new Error(`Dangerous command blocked: ${bad}`);
    }
  }

  async _shellExec({ command, timeout = DEFAULT_SHELL_TIMEOUT, cwd }) {
    this._validateShell(command);
    const execCwd = cwd ? this._resolvePath(cwd) : this.baseDir;
    const { stdout, stderr } = await execAsync(command, { cwd: execCwd, timeout });
    return { command, stdout: stdout.slice(0, 50_000), stderr: stderr.slice(0, 10_000) };
  }

  async _testRun({ command, timeout = DEFAULT_SHELL_TIMEOUT, cwd }) {
    return this._shellExec({ command, timeout, cwd });
  }

  _fetchUrl(url) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const client = parsed.protocol === 'https:' ? https : http;
      const req = client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(this._fetchUrl(res.headers.location));
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        let data = '';
        res.on('data', chunk => {
          data += chunk;
          if (data.length > MAX_HTTP_BODY) {
            req.destroy();
            reject(new Error('Response too large'));
          }
        });
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.setTimeout(15_000, () => { req.destroy(); reject(new Error('Request timeout')); });
    });
  }

  async _browserOpen({ url }) {
    const html = await this._fetchUrl(url);
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100_000);
    return { url, length: text.length, text };
  }
}

module.exports = { AgentToolKit };
