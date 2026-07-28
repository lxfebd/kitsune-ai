/**
 * RiskController — 自主任务风控控制器
 *
 * 职责：
 * - 管理三种风控模式（strict / normal / autonomous）
 * - 评估每个工具调用是否需要用户确认
 * - 协调用户确认流程
 * - 记录审计日志
 *
 * 模式说明：
 * - strict:     任何工具调用都需用户确认
 * - normal:     读操作自动执行；写/shell/网络/浏览器操作需确认
 * - autonomous: 全部自动执行，只记录审计日志
 */

const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { RISK_MODE, TOOL_CATEGORY } = require('./autonomousTypes');

const RISK_MODE_KEY = 'pet:autonomous:riskMode';
const DEFAULT_MODE = RISK_MODE.NORMAL;

class RiskController extends EventEmitter {
  /**
   * @param {Object} opts
   * @param {import('../../config/configManager').ConfigManager} [opts.configManager]
   * @param {string} [opts.userDir] 审计日志目录，默认从 configManager 取
   * @param {Console|Object} [opts.logger]
   */
  constructor({ configManager, userDir, logger = console } = {}) {
    super();
    this.configManager = configManager;
    this.logger = logger;
    this.userDir = userDir || (configManager ? configManager.userDir : path.join(process.cwd(), '.trae'));
    this.auditFile = path.join(this.userDir, 'autonomous-audit.jsonl');
    this._pending = new Map();
    this._ensureAuditDir();
  }

  _ensureAuditDir() {
    try { fs.mkdirSync(path.dirname(this.auditFile), { recursive: true }); } catch {}
  }

  /** @returns {Promise<'strict'|'normal'|'autonomous'>} */
  async getMode() {
    if (this.configManager) {
      const mode = this.configManager.get(RISK_MODE_KEY);
      if (Object.values(RISK_MODE).includes(mode)) return mode;
    }
    return DEFAULT_MODE;
  }

  /**
   * 设置风控模式
   * @param {'strict'|'normal'|'autonomous'} mode
   */
  async setMode(mode) {
    if (!Object.values(RISK_MODE).includes(mode)) {
      throw new Error(`Invalid risk mode: ${mode}`);
    }
    if (this.configManager) {
      await this.configManager.set(RISK_MODE_KEY, mode, { source: 'riskController' });
    }
    this.emit('modeChanged', mode);
  }

  /**
   * 评估一次工具调用是否需要确认
   * @param {import('./autonomousTypes').ToolCategory} category
   * @param {string} tool 工具名（用于日志/审计）
   * @param {Object} [params]
   * @returns {Promise<import('./autonomousTypes').RiskAssessment>}
   */
  async assess(category, tool, params = {}) {
    const mode = await this.getMode();
    if (mode === RISK_MODE.AUTONOMOUS) {
      return { needsConfirm: false, category, level: 'low', reason: 'autonomous mode: auto-approve all' };
    }
    if (mode === RISK_MODE.STRICT) {
      return { needsConfirm: true, category, level: 'high', reason: 'strict mode: every tool needs confirmation' };
    }
    // normal 模式：读操作自动，其余需确认
    if ([TOOL_CATEGORY.WRITE, TOOL_CATEGORY.SHELL, TOOL_CATEGORY.NETWORK, TOOL_CATEGORY.BROWSER].includes(category)) {
      return { needsConfirm: true, category, level: 'high', reason: `${category} tool requires confirmation in normal mode` };
    }
    return { needsConfirm: false, category, level: 'low', reason: 'read tool auto-approved in normal mode' };
  }

  /**
   * 执行工具调用，按需拦截确认
   * @param {import('./autonomousTypes').ToolExecutionRequest} request
   * @param {() => Promise<any>} executor 实际执行工具调用的函数
   * @returns {Promise<{ approved: boolean, auto: boolean, result: any }>}
   */
  async executeWithConfirmation(request, executor) {
    const { taskId, stepId, tool, params, category } = request;
    const assessment = await this.assess(category, tool, params);
    const mode = await this.getMode();

    if (!assessment.needsConfirm) {
      const result = await executor();
      await this._writeAudit({ taskId, stepId, tool, params, category, approved: true, mode, reason: assessment.reason });
      return { approved: true, auto: true, result };
    }

    const id = `${taskId}:${stepId}:${Date.now()}`;
    /** @type {{ request: any, executor: Function, resolve: Function, reject: Function, assessment: any, mode: string }} */
    const pending = { request, executor, resolve: null, reject: null, assessment, mode };
    const promise = new Promise((resolve, reject) => {
      pending.resolve = resolve;
      pending.reject = reject;
    });

    this._pending.set(id, pending);
    this.emit('confirmationRequired', { id, taskId, stepId, tool, params, category, assessment });
    this.logger.info?.(`[RiskController] confirmation required: ${id} (${tool})`);

    return promise.then((result) => ({ approved: true, auto: false, result }));
  }

  /**
   * 用户响应确认请求
   * @param {string} id
   * @param {boolean} approved
   * @returns {boolean} 是否成功处理
   */
  async confirm(id, approved) {
    const pending = this._pending.get(id);
    if (!pending) return false;
    this._pending.delete(id);
    const { taskId, stepId, tool, params, category } = pending.request;

    if (approved) {
      await this._writeAudit({ taskId, stepId, tool, params, category, approved: true, mode: pending.mode, reason: 'user confirmed' });
      pending.executor().then(pending.resolve).catch(pending.reject);
    } else {
      await this._writeAudit({ taskId, stepId, tool, params, category, approved: false, mode: pending.mode, reason: 'user denied' });
      const err = new Error(`User denied ${tool} operation`);
      pending.reject(err);
    }
    return true;
  }

  /**
   * 取消某个任务下所有待确认请求
   * @param {string} taskId
   */
  cancelPending(taskId) {
    for (const [id, pending] of this._pending) {
      if (pending.request.taskId === taskId) {
        this._pending.delete(id);
        pending.reject(new Error(`Task ${taskId} cancelled`));
      }
    }
  }

  /** @returns {Array<{id:string, taskId:string, stepId:string, tool:string, category:string, assessment:any}>} */
  getPendingConfirmations() {
    return Array.from(this._pending.entries()).map(([id, p]) => ({
      id,
      taskId: p.request.taskId,
      stepId: p.request.stepId,
      tool: p.request.tool,
      category: p.request.category,
      assessment: p.assessment,
    }));
  }

  async _writeAudit(record) {
    const entry = { ...record, timestamp: Date.now(), ts: new Date().toISOString() };
    try {
      await fsp.appendFile(this.auditFile, JSON.stringify(entry) + '\n');
    } catch (err) {
      this.logger.error?.('[RiskController] audit log failed:', err.message);
    }
  }
}

module.exports = { RiskController };
