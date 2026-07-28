/**
 * 任务持久化存储层
 * 负责执行历史、任务队列、改进计划的本地文件存储与查询
 *
 * 存储位置：.agentpet/overseer-data/
 * ├── action-history.jsonl    — 执行历史（每条一行，最多2000条）
 * ├── task-queue.json         — 待执行任务队列（支持重启恢复）
 * └── improvement-plan.json   — 项目改进计划
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const DATA_DIR = path.join(process.cwd(), '.trae', 'overseer-data');
const ACTION_HISTORY_FILE = path.join(DATA_DIR, 'action-history.jsonl');
const TASK_QUEUE_FILE = path.join(DATA_DIR, 'task-queue.json');
const IMPROVEMENT_PLAN_FILE = path.join(DATA_DIR, 'improvement-plan.json');

// 配置常量
const MAX_ACTION_HISTORY = 2000;  // 约7天（每天约300条）
const MAX_TASK_QUEUE = 100;

class TaskStore {
  constructor({ logger = console } = {}) {
    this.logger = logger;
    this._ensureDir();
    this._taskQueue = this._loadTaskQueue();
    this._improvementPlan = this._loadImprovementPlan();
  }

  _ensureDir() {
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
  }

  //  执行历史（时间序列）

  /**
   * 记录一次动作执行
   */
  async recordAction(record) {
    const entry = {
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      ts: new Date().toISOString(),
      action: record.action,
      source: record.source,
      risk: record.risk,
      result: record.result,
      files_changed: record.files_changed || [],  // 文件修改记录
      event: record.event ? {
        source: record.event.source,
        activity: record.event.activity,
        message: record.event.message?.substring(0, 200),
      } : null,
    };

    try {
      await fsp.appendFile(ACTION_HISTORY_FILE, JSON.stringify(entry) + '\n');
      this._trimActionHistory();
      return entry;
    } catch (err) {
      this.logger.error?.('[TaskStore] 写入执行历史失败:', err.message);
      return null;
    }
  }

  /**
   * 查询执行历史
   */
  async queryActionHistory({ limit = 50, sinceMs, action, source, risk } = {}) {
    try {
      if (!fs.existsSync(ACTION_HISTORY_FILE)) return [];
      const content = await fsp.readFile(ACTION_HISTORY_FILE, 'utf8');
      let entries = content.trim().split('\n').filter(Boolean)
        .map(l => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean);

      if (sinceMs) entries = entries.filter(e => e.timestamp >= sinceMs);
      if (action) entries = entries.filter(e => e.action === action);
      if (source) entries = entries.filter(e => e.source === source);
      if (risk) entries = entries.filter(e => e.risk === risk);

      return entries.slice(-limit).reverse();
    } catch { return []; }
  }

  /**
   * 获取最近失败的任务（用于 retry_last）
   */
  async getLastFailedTask(source) {
    const history = await this.queryActionHistory({ limit: 20, source, risk: 'medium' });
    return history.find(e => e.result?.ok === false) || null;
  }

  /**
   * 裁剪执行历史，保留最近 MAX_ACTION_HISTORY 条
   */
  async _trimActionHistory() {
    try {
      if (!fs.existsSync(ACTION_HISTORY_FILE)) return;
      const content = await fsp.readFile(ACTION_HISTORY_FILE, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      if (lines.length <= MAX_ACTION_HISTORY) return;

      const trimmed = lines.slice(-MAX_ACTION_HISTORY);
      await fsp.writeFile(ACTION_HISTORY_FILE, trimmed.join('\n') + '\n');
    } catch {}
  }

  //  任务队列（支持重启恢复）

  /**
   * 添加任务到队列
   */
  async enqueueTask(task) {
    const entry = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
      status: 'pending',  // pending | running | completed | failed
      ...task,
    };

    this._taskQueue.push(entry);
    if (this._taskQueue.length > MAX_TASK_QUEUE) {
      this._taskQueue.shift();
    }
    await this._saveTaskQueue();
    return entry;
  }

  /**
   * 获取下一个待执行任务
   */
  async dequeueTask() {
    const task = this._taskQueue.find(t => t.status === 'pending');
    if (task) {
      task.status = 'running';
      task.startedAt = Date.now();
      await this._saveTaskQueue();
    }
    return task || null;
  }

  /**
   * 更新任务状态
   */
  async updateTaskStatus(taskId, status, result = null) {
    const task = this._taskQueue.find(t => t.id === taskId);
    if (task) {
      task.status = status;
      task.completedAt = Date.now();
      task.result = result;
      await this._saveTaskQueue();
    }
    return task;
  }

  /**
   * 获取队列状态
   */
  getTaskQueueStats() {
    const pending = this._taskQueue.filter(t => t.status === 'pending').length;
    const running = this._taskQueue.filter(t => t.status === 'running').length;
    const completed = this._taskQueue.filter(t => t.status === 'completed').length;
    const failed = this._taskQueue.filter(t => t.status === 'failed').length;
    return { total: this._taskQueue.length, pending, running, completed, failed };
  }

  /**
   * 清理已完成/失败的任务（保留最近50条）
   */
  async cleanupTaskQueue() {
    const keep = this._taskQueue.filter(t => t.status === 'pending' || t.status === 'running');
    const recent = this._taskQueue
      .filter(t => t.status === 'completed' || t.status === 'failed')
      .slice(-50);
    this._taskQueue = [...keep, ...recent];
    await this._saveTaskQueue();
  }

  _loadTaskQueue() {
    try {
      if (fs.existsSync(TASK_QUEUE_FILE)) {
        return JSON.parse(fs.readFileSync(TASK_QUEUE_FILE, 'utf8'));
      }
    } catch {}
    return [];
  }

  async _saveTaskQueue() {
    try {
      await fsp.writeFile(TASK_QUEUE_FILE, JSON.stringify(this._taskQueue, null, 2));
    } catch (err) {
      this.logger.error?.('[TaskStore] 保存任务队列失败:', err.message);
    }
  }

  //  项目改进计划

  /**
   * 获取改进计划
   */
  getImprovementPlan() {
    return this._improvementPlan;
  }

  /**
   * 添加改进任务到计划
   */
  async addImprovementTask(task) {
    const entry = {
      id: `imp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
      status: 'pending',  // pending | in_progress | completed | ignored
      priority: task.priority || 'normal',  // low | normal | high | urgent
      risk: task.risk || 'low',
      type: task.type,  // code_smell | long_file | deep_nesting | todo_marker | dependency
      file: task.file,
      line: task.line,
      description: task.description,
      suggestion: task.suggestion,
      impact: task.impact || 0,   // 0-2
      cost: task.cost || 0,       // 0-2
    };

    this._improvementPlan.tasks.push(entry);
    await this._saveImprovementPlan();
    return entry;
  }

  /**
   * 更新改进任务状态
   */
  async updateImprovementTask(taskId, updates) {
    const task = this._improvementPlan.tasks.find(t => t.id === taskId);
    if (task) {
      Object.assign(task, updates, { updatedAt: Date.now() });
      await this._saveImprovementPlan();
    }
    return task;
  }

  /**
   * 获取下一个待执行的改进任务
   */
  getNextImprovementTask() {
    return this._improvementPlan.tasks
      .filter(t => t.status === 'pending')
      .sort((a, b) => {
        const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
        return (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
      })[0] || null;
  }

  /**
   * 获取改进计划统计
   */
  getImprovementStats() {
    const tasks = this._improvementPlan.tasks;
    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      in_progress: tasks.filter(t => t.status === 'in_progress').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      ignored: tasks.filter(t => t.status === 'ignored').length,
      lastScan: this._improvementPlan.lastScan,
    };
  }

  _loadImprovementPlan() {
    try {
      if (fs.existsSync(IMPROVEMENT_PLAN_FILE)) {
        return JSON.parse(fs.readFileSync(IMPROVEMENT_PLAN_FILE, 'utf8'));
      }
    } catch {}
    return { tasks: [], lastScan: null, config: { scanIntervalMs: 30 * 60 * 1000 } };
  }

  async _saveImprovementPlan() {
    try {
      await fsp.writeFile(IMPROVEMENT_PLAN_FILE, JSON.stringify(this._improvementPlan, null, 2));
    } catch (err) {
      this.logger.error?.('[TaskStore] 保存改进计划失败:', err.message);
    }
  }

  //  清理与维护

  /**
   * 定期清理（建议每小时调用一次）
   */
  async compact() {
    await this._trimActionHistory();
    await this.cleanupTaskQueue();
  }
}

module.exports = { TaskStore };
