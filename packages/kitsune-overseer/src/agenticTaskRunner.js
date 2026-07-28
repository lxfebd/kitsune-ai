/**
 * AgenticTaskRunner — 自主任务执行引擎
 *
 * 职责：
 * - 接收用户目标，调用 TaskPlanner 生成计划
 * - 按顺序执行步骤，通过 RiskController 进行风控确认
 * - 调用 AgentToolKit 完成文件、shell、网络、LLM 等操作
 * - 持久化任务状态，支持暂停/取消/续跑
 * - 通过 BroadcastBus 发布任务日志与状态变化
 */

const { randomUUID } = require('node:crypto');
const { TaskPlanner } = require('./taskPlanner');
const { AgentToolKit } = require('./agentToolKit');
const { RiskController } = require('./riskController');
const { AutonomousTaskStore } = require('./autonomousTaskStore');

class AgenticTaskRunner {
  /**
   * @param {Object} opts
   * @param {any} opts.llmManager
   * @param {import('../../config/configManager').ConfigManager} [opts.configManager]
   * @param {string} [opts.userDir]
   * @param {string} [opts.baseDir] 工具操作基准目录
   * @param {any} [opts.bus] BroadcastBus 实例
   * @param {Console|Object} [opts.logger]
   */
  constructor({ llmManager, configManager, userDir, baseDir, bus, logger = console } = {}) {
    this.llmManager = llmManager;
    this.bus = bus;
    this.logger = logger;
    this.planner = new TaskPlanner({ llmManager, logger });
    this.toolKit = new AgentToolKit({ baseDir, llmManager, logger });
    this.riskController = new RiskController({ configManager, userDir, logger });
    this.store = new AutonomousTaskStore({ userDir, logger });
    this._running = new Map(); // taskId -> AbortController
  }

  /**
   * 创建新任务（仅保存，不执行）
   * @param {string} goal
   * @param {Object} opts
   * @param {'strict'|'normal'|'autonomous'} [opts.riskMode]
   */
  async createTask(goal, opts = {}) {
    const riskMode = opts.riskMode || await this.riskController.getMode();
    const task = {
      id: randomUUID(),
      goal,
      status: 'pending',
      riskMode,
      plan: [],
      logs: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: null,
      result: undefined,
      error: undefined,
    };
    await this.store.create(task);
    return task;
  }

  /**
   * 开始或继续执行任务
   * @param {string} taskId
   */
  async run(taskId) {
    const task = await this.store.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (task.status === 'running') throw new Error('Task already running');

    const abortController = new AbortController();
    this._running.set(taskId, abortController);

    await this.store.update(taskId, { status: 'running', updatedAt: Date.now() });
    this._log(taskId, `开始执行任务: ${task.goal}`);

    try {
      if (task.plan.length === 0) {
        this._log(taskId, '生成执行计划...');
        const plan = await this.planner.plan(task.goal, { baseDir: this.toolKit.baseDir });
        await this.store.update(taskId, t => ({ ...t, plan, updatedAt: Date.now() }));
      }

      await this._executePlan(taskId, abortController.signal);

      const finalTask = await this.store.get(taskId);
      if (finalTask.status === 'running') {
        await this.store.update(taskId, { status: 'completed', completedAt: Date.now(), updatedAt: Date.now() });
        this._log(taskId, '任务完成');
      }
    } catch (err) {
      await this.store.update(taskId, { status: 'failed', error: err.message, completedAt: Date.now(), updatedAt: Date.now() });
      this._log(taskId, `任务失败: ${err.message}`);
    } finally {
      this._running.delete(taskId);
    }
  }

  async _executePlan(taskId, signal) {
    while (true) {
      if (signal.aborted) throw new Error('Task cancelled');

      const task = await this.store.get(taskId);
      const pendingStep = task.plan.find(s => s.status === 'pending' || s.status === 'failed');
      if (!pendingStep) break;

      await this.store.update(taskId, t => {
        const plan = [...t.plan];
        const idx = plan.findIndex(s => s.id === pendingStep.id);
        if (idx >= 0) plan[idx] = { ...plan[idx], status: 'running', startedAt: Date.now() };
        return { ...t, plan, updatedAt: Date.now() };
      });

      try {
        const result = await this._executeStep(taskId, pendingStep);
        await this.store.update(taskId, t => {
          const plan = [...t.plan];
          const idx = plan.findIndex(s => s.id === pendingStep.id);
          if (idx >= 0) plan[idx] = { ...plan[idx], status: 'completed', result, completedAt: Date.now() };
          return { ...t, plan, updatedAt: Date.now() };
        });
        this._log(taskId, `步骤完成: ${pendingStep.description}`);
      } catch (err) {
        await this.store.update(taskId, t => {
          const plan = [...t.plan];
          const idx = plan.findIndex(s => s.id === pendingStep.id);
          if (idx >= 0) plan[idx] = { ...plan[idx], status: 'failed', error: err.message, completedAt: Date.now() };
          return { ...t, plan, updatedAt: Date.now() };
        });
        this._log(taskId, `步骤失败: ${pendingStep.description} - ${err.message}`);
        throw err;
      }
    }
  }

  async _executeStep(taskId, step) {
    const category = this.toolKit.getCategory(step.tool);
    if (!category) throw new Error(`Unknown tool category for ${step.tool}`);
    const outcome = await this.riskController.executeWithConfirmation(
      { taskId, stepId: step.id, tool: step.tool, params: step.params, category },
      () => this.toolKit.execute(step.tool, step.params)
    );
    return outcome.result;
  }

  _log(taskId, message) {
    const line = `[${new Date().toISOString()}] ${message}`;
    this.logger.info?.(line);
    this.store.update(taskId, t => ({ ...t, logs: [...t.logs, line], updatedAt: Date.now() })).catch(() => {});
    if (this.bus) this.bus.publish('agentic.task.log', { taskId, message: line });
  }

  /**
   * 暂停任务（不会撤销已完成步骤）
   * @param {string} taskId
   */
  async pause(taskId) {
    const controller = this._running.get(taskId);
    if (controller) controller.abort();
    await this.store.update(taskId, { status: 'paused', updatedAt: Date.now() });
  }

  /**
   * 取消任务
   * @param {string} taskId
   */
  async cancel(taskId) {
    const controller = this._running.get(taskId);
    if (controller) controller.abort();
    await this.riskController.cancelPending(taskId);
    await this.store.update(taskId, { status: 'cancelled', completedAt: Date.now(), updatedAt: Date.now() });
  }

  async setRiskMode(mode) {
    return this.riskController.setMode(mode);
  }

  async getRiskMode() {
    return this.riskController.getMode();
  }

  getPendingConfirmations() {
    return this.riskController.getPendingConfirmations();
  }

  async confirm(id, approved) {
    return this.riskController.confirm(id, approved);
  }

  /** 启动时恢复未完成的运行中任务为 paused */
  async recover() {
    const running = await this.store.list({ status: 'running' });
    for (const task of running) {
      await this.store.update(task.id, { status: 'paused', updatedAt: Date.now() });
      this.logger.info?.(`[AgenticTaskRunner] recovered task ${task.id} to paused`);
    }
  }
}

module.exports = { AgenticTaskRunner };
