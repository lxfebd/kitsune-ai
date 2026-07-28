/**
 * AutonomousTaskStore — 自主任务状态持久化
 *
 * 职责：
 * - 保存任务元数据、计划、执行状态、日志
 * - 支持应用重启后恢复未完成任务
 * - 提供按状态/分页查询
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const STORE_FILE = 'autonomous-tasks.json';

class AutonomousTaskStore {
  /**
   * @param {Object} opts
   * @param {string} [opts.userDir] 存储目录
   * @param {Console|Object} [opts.logger]
   */
  constructor({ userDir, logger = console } = {}) {
    this.userDir = userDir || path.join(process.cwd(), '.trae');
    this.file = path.join(this.userDir, STORE_FILE);
    this.logger = logger;
    this._cache = new Map();
    this._loaded = false;
  }

  _ensureDir() {
    try { fs.mkdirSync(this.userDir, { recursive: true }); } catch {}
  }

  async _load() {
    if (this._loaded) return;
    this._ensureDir();
    try {
      if (fs.existsSync(this.file)) {
        const raw = await fsp.readFile(this.file, 'utf-8');
        const tasks = JSON.parse(raw);
        if (Array.isArray(tasks)) {
          for (const task of tasks) this._cache.set(task.id, task);
        }
      }
    } catch (err) {
      this.logger.error?.('[AutonomousTaskStore] load failed:', err.message);
    }
    this._loaded = true;
  }

  async _save() {
    const tasks = Array.from(this._cache.values());
    await fsp.writeFile(this.file, JSON.stringify(tasks, null, 2), 'utf-8');
  }

  /**
   * 创建任务
   * @param {import('./autonomousTypes').AutonomousTask} task
   */
  async create(task) {
    await this._load();
    this._cache.set(task.id, task);
    await this._save();
    return task;
  }

  /**
   * 更新任务
   * @param {string} id
   * @param {Partial<import('./autonomousTypes').AutonomousTask>|((task: import('./autonomousTypes').AutonomousTask) => import('./autonomousTypes').AutonomousTask)} updater
   */
  async update(id, updater) {
    await this._load();
    const task = this._cache.get(id);
    if (!task) return null;
    const updated = typeof updater === 'function' ? updater(task) : { ...task, ...updater, id };
    this._cache.set(id, updated);
    await this._save();
    return updated;
  }

  /**
   * 获取单个任务
   * @param {string} id
   */
  async get(id) {
    await this._load();
    return this._cache.get(id) || null;
  }

  /**
   * 查询任务列表
   * @param {Object} opts
   * @param {string} [opts.status]
   * @param {number} [opts.limit]
   * @param {number} [opts.offset]
   */
  async list({ status, limit = 50, offset = 0 } = {}) {
    await this._load();
    let tasks = Array.from(this._cache.values()).sort((a, b) => b.createdAt - a.createdAt);
    if (status) tasks = tasks.filter(t => t.status === status);
    return tasks.slice(offset, offset + limit);
  }

  /**
   * 删除任务
   * @param {string} id
   */
  async delete(id) {
    await this._load();
    const ok = this._cache.delete(id);
    if (ok) await this._save();
    return ok;
  }
}

module.exports = { AutonomousTaskStore };
