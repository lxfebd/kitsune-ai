/**
 * 监工数据持久化层
 * 负责监控历史、审查统计、建议追踪的本地文件存储与查询
 *
 * 存储位置：.agentpet/overseer-data/
 * ├── monitor-snapshots.jsonl  — 监控状态快照（每分钟一条）
 * ├── review-stats.json        — 审查统计数据
* └── suggestion-tracker.json  — 建议生命周期追踪
 */

const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(process.cwd(), '.trae', 'overseer-data');
const SNAPSHOTS_FILE = path.join(DATA_DIR, 'monitor-snapshots.jsonl');
const REVIEW_STATS_FILE = path.join(DATA_DIR, 'review-stats.json');
const SUGGESTION_TRACKER_FILE = path.join(DATA_DIR, 'suggestion-tracker.json');

// 配置常量
const MAX_SNAPSHOTS = 1440;          // 24小时 × 60分钟
const SNAPSHOT_INTERVAL_MS = 60_000; // 每分钟一次快照
const MAX_SUGGESTION_TRACKS = 1000;

class MonitorStore {
  constructor() {
    this._ensureDir();
    this._lastSnapshotTime = 0;
    this._reviewStats = this._loadReviewStats();
    this._suggestionTracker = this._loadSuggestionTracker();
  }

  _ensureDir() {
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
  }

  //  监控快照（时间序列）

  /**
   * 记录一次监控状态快照（节流：每分钟最多1次）
   */
  recordSnapshot(statusData) {
    const now = Date.now();
    if (now - this._lastSnapshotTime < SNAPSHOT_INTERVAL_MS) return false;

    const snapshot = {
      t: now,
      ts: new Date(now).toISOString(),
      enabled: statusData.enabled,
      isRunning: statusData.isRunning,
      claude_code: { isRunning: statusData.claude_code?.isRunning, activity: statusData.claude_code?.activity },
      trae: { isRunning: statusData.trae?.isRunning, activity: statusData.trae?.activity },
      cursor: statusData.cursor ? { isRunning: statusData.cursor.isRunning, activity: statusData.cursor.activity } : null,
      windsurf: statusData.windsurf ? { isRunning: statusData.windsurf.isRunning, activity: statusData.windsurf.activity } : null,
      lobster: statusData.lobster ? { isRunning: statusData.lobster.isRunning, activity: statusData.lobster.activity } : null,
    };

    try {
      fs.appendFileSync(SNAPSHOTS_FILE, JSON.stringify(snapshot) + '\n');
      this._lastSnapshotTime = now;
      this._trimSnapshots();
      return true;
    } catch (err) {
      console.error('[MonitorStore] 写入快照失败:', err.message);
      return false;
    }
  }

  /**
   * 查询历史快照
   * @param {Object} opts
   * @param {number} opts.limit - 返回条数
   * @param {number} opts.sinceMs - 起始时间戳
   * @param {string} opts.tool - 过滤工具名
   */
  querySnapshots({ limit = 60, sinceMs, tool } = {}) {
    try {
      if (!fs.existsSync(SNAPSHOTS_FILE)) return [];
      const lines = fs.readFileSync(SNAPSHOTS_FILE, 'utf8').trim().split('\n').filter(Boolean);
      let data = lines.map(l => { try { return JSON.parse(l); } catch { return null; }}).filter(Boolean);

      if (sinceMs) data = data.filter(s => s.t >= sinceMs);
      if (tool && tool !== 'claude_code' && tool !== 'trae') {
        data = data.filter(s => s[tool]?.isRunning);
      }

      return data.slice(-limit);
    } catch { return []; }
  }

  /**
   * 获取工具在线时长统计（最近 N 条快照）
   */
  getUptimeStats(snapshotCount = 60) {
    const snaps = this.querySnapshots({ limit: snapshotCount });
    if (snaps.length === 0) return {};

    const tools = ['claude_code', 'trae', 'cursor', 'windsurf', 'lobster'];
    const result = {};
    for (const t of tools) {
      const running = snaps.filter(s => s[t]?.isRunning).length;
      result[t] = {
        total: snaps.length,
        running,
        uptimePercent: Math.round((running / snaps.length) * 100),
        lastActivity: snaps.slice(-1)[0]?.[t]?.activity || 'idle',
      };
    }
    return result;
  }

  _trimSnapshots() {
    try {
      if (!fs.existsSync(SNAPSHOTS_FILE)) return;
      const lines = fs.readFileSync(SNAPSHOTS_FILE, 'utf8').trim().split('\n').filter(Boolean);
      if (lines.length <= MAX_SNAPSHOTS) return;
      const trimmed = lines.slice(lines.length - MAX_SNAPSHOTS);
      fs.writeFileSync(SNAPSHOTS_FILE, trimmed.join('\n') + '\n');
    } catch {}
  }

  //  审查统计

  _loadReviewStats() {
    try {
      if (fs.existsSync(REVIEW_STATS_FILE)) {
        return JSON.parse(fs.readFileSync(REVIEW_STATS_FILE, 'utf8'));
      }
    } catch {}
    return { totalReviews: 0, passed: 0, failed: 0, byTool: {}, lastReviewAt: null };
  }

  /**
   * 记录一次代码审查结果
   */
  recordReview(reviewData) {
    this._reviewStats.totalReviews++;
    if (reviewData.passed) {
      this._reviewStats.passed++;
    } else {
      this._reviewStats.failed++;
    }
    const tool = reviewData.toolName || 'unknown';
    if (!this._reviewStats.byTool[tool]) this._reviewStats.byTool[tool] = { total: 0, passed: 0 };
    this._reviewStats.byTool[tool].total++;
    if (reviewData.passed) this._reviewStats.byTool[tool].passed++;
    this._reviewStats.lastReviewAt = new Date().toISOString();
    this._saveReviewStats();
  }

  getReviewStats() {
    return { ...this._reviewStats };
  }

  _saveReviewStats() {
    try { fs.writeFileSync(REVIEW_STATS_FILE, JSON.stringify(this._reviewStats, null, 2)); } catch {}
  }

  //  建议追踪

  _loadSuggestionTracker() {
    try {
      if (fs.existsSync(SUGGESTION_TRACKER_FILE)) {
        return JSON.parse(fs.readFileSync(SUGGESTION_TRACKER_FILE, 'utf8'));
      }
    } catch {}
    return { totalCreated: 0, totalDismissed: 0, totalPushed: 0, bySeverity: {}, byType: {} };
  }

  /**
   * 追踪建议事件
   */
  trackSuggestion(event, suggestion) {
    switch (event) {
      case 'created':
        this._suggestionTracker.totalCreated++;
        break;
      case 'dismissed':
        this._suggestionTracker.totalDismissed++;
        break;
      case 'pushed':
        this._suggestionTracker.totalPushed++;
        break;
    }
    // 按严重度统计
    const sev = suggestion?.severity || 'info';
    this._suggestionTracker.bySeverity[sev] = (this._suggestionTracker.bySeverity[sev] || 0) + 1;
    // 按类型统计
    const type = suggestion?.type || 'manual';
    this._suggestionTracker.byType[type] = (this._suggestionTracker.byType[type] || 0) + 1;
    this._saveSuggestionTracker();
  }

  getSuggestionStats() {
    return { ...this._suggestionTracker };
  }

  _saveSuggestionTracker() {
    try { fs.writeFileSync(SUGGESTION_TRACKER_FILE, JSON.stringify(this._suggestionTracker, null, 2)); } catch {}
  }

  //  清理与维护

  /**
   * 清理过期数据（建议每天调用一次）
   */
  cleanup(maxAgeDays = 7) {
    const cutoff = Date.now() - maxAgeDays * 86400000;
    try {
      // 清理旧快照
      if (fs.existsSync(SNAPSHOTS_FILE)) {
        const lines = fs.readFileSync(SNAPSHOTS_FILE, 'utf8').trim().split('\n').filter(Boolean);
        const kept = lines.filter(l => { try { return JSON.parse(l).t >= cutoff; } catch { return false; }});
        fs.writeFileSync(SNAPSHOTS_FILE, kept.join('\n') + (kept.length ? '\n' : ''));
      }
    } catch (err) {
      console.error('[MonitorStore] 清理失败:', err.message);
    }
  }

  /**
   * 获取存储概览（用于系统状态页）
   */
  getStorageInfo() {
    let snapshotSize = 0, reviewSize = 0, trackerSize = 0;
    let snapshotCount = 0;
    try {
      if (fs.existsSync(SNAPSHOTS_FILE)) {
        const stat = fs.statSync(SNAPSHOTS_FILE);
        snapshotSize = stat.size;
        snapshotCount = fs.readFileSync(SNAPSHOTS_FILE, 'utf8').trim().split('\n').filter(Boolean).length;
      }
      if (fs.existsSync(REVIEW_STATS_FILE)) reviewSize = fs.statSync(REVIEW_STATS_FILE).size;
      if (fs.existsSync(SUGGESTION_TRACKER_FILE)) trackerSize = fs.statSync(SUGGESTION_TRACKER_FILE).size;
    } catch {}

    return {
      dir: DATA_DIR,
      snapshots: { file: 'monitor-snapshots.jsonl', size: snapshotSize, count: snapshotCount },
      reviews: { file: 'review-stats.json', size: reviewSize },
      suggestions: { file: 'suggestion-tracker.json', size: trackerSize },
      totalBytes: snapshotSize + reviewSize + trackerSize,
    };
  }
}

module.exports = { MonitorStore };
