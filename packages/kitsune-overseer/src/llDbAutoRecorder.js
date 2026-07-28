/**
 * LL-DB 自动入库模块
 *
 * 职责：
 * 1. 监听 EventBus 的 error 事件和 overseer 告警
 * 2. 自动提取错误信息，生成 LL-DB 记录
 * 3. 写入 ll-db/experience-db.md
 *
 * 集成方式：
 *   const { LlDbAutoRecorder } = require('./llDbAutoRecorder');
 *   const recorder = new LlDbAutoRecorder({ bus, projectDir });
 *   recorder.start();
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

class LlDbAutoRecorder {
  constructor({
    bus,
    projectDir = process.cwd(),
    llDbPath = '',
    logger = console,
  }) {
    this.bus = bus;
    this.projectDir = projectDir;
    this.llDbPath = llDbPath || path.join(projectDir, 'll-db', 'experience-db.md');
    this.logger = logger;
    this._subscriptions = [];
    // 节流：同一 ruleId 最短记录间隔 60s，防止反馈循环
    this._lastRecordTime = {};
    this._throttleMs = 60000;
  }

  start() {
    if (this.bus) {
      // 监听 AI 工具 error 事件
      this._subscriptions.push(
        this.bus.subscribe('hooks.state_updated', (payload) => {
          if (payload?.state === 'error') {
            this._recordFromHookError(payload);
          }
        })
      );

      // 监听 overseer 告警
      this._subscriptions.push(
        this.bus.subscribe('overseer.rule_hit', (payload) => {
          this._recordFromRuleHit(payload);
        })
      );
    }

    this.logger.log('[LlDbAutoRecorder] 启动，LL-DB 路径:', this.llDbPath);
  }

  stop() {
    for (const unsub of this._subscriptions) {
      if (typeof unsub === 'function') unsub();
    }
    this._subscriptions = [];
    this.logger.log('[LlDbAutoRecorder] 已停止');
  }

  /**
   * 从 hook error 事件自动入库（带节流）
   */
  async _recordFromHookError(payload) {
    const agent = payload?.data?.agent || 'unknown';
    const now = Date.now();
    const lastTime = this._lastRecordTime[`error:${agent}`] || 0;
    if (now - lastTime < this._throttleMs) return;
    this._lastRecordTime[`error:${agent}`] = now;

    const summary = payload?.data?.summary || '未知错误';
    const toolName = payload?.data?.tool_name || '';

    const record = {
      领域: this._inferDomain(toolName, summary),
      语言: this._inferLanguage(toolName, summary),
      严重度: '🟡严重',
      触发场景: `${agent} 执行 ${toolName} 时出错`,
      错误现象: summary,
      根因分析: `待人工复核：${agent} 在 ${toolName} 操作中触发错误`,
      解决方案: `步骤1: 检查 ${agent} 的 ${toolName} 操作日志 / 步骤2: 确认错误是否可复现 / 步骤3: 根据具体错误信息修复`,
      规避检查: `${agent} 执行 ${toolName} 时需检查错误处理`,
      关联任务: `${agent}-error-${Date.now()}`,
    };

    await this._writeRecord(record);
  }

  /**
   * 从规则命中事件自动入库（带节流，防止反馈循环）
   */
  async _recordFromRuleHit(payload) {
    const ruleId = payload?.ruleId || 'unknown';
    const now = Date.now();
    const lastTime = this._lastRecordTime[ruleId] || 0;

    // 同一规则 60s 内不重复记录
    if (now - lastTime < this._throttleMs) {
      return;
    }
    this._lastRecordTime[ruleId] = now;

    const record = {
      领域: payload.domain || '未分类',
      语言: payload.language || '未分类',
      严重度: payload.severity === 'critical' ? '🔴致命' : '🟡严重',
      触发场景: `违反规则 ${payload.ruleId}`,
      错误现象: `规则 ${payload.ruleId} 被违反: ${payload.ruleContent}`,
      根因分析: `开发过程中未遵守 LL-DB 规则 ${payload.ruleId}`,
      解决方案: `步骤1: 按 ${payload.ruleContent} 修正代码 / 步骤2: 添加自动化检查 / 步骤3: 更新 CI 流程`,
      规避检查: payload.ruleContent,
      关联任务: `rule-violation-${payload.ruleId}`,
    };

    await this._writeRecord(record);
  }

  /**
   * 手动写入一条记录（供 API 调用）
   */
  async manualRecord(record) {
    const required = ['领域', '语言', '严重度', '触发场景', '错误现象', '根因分析', '解决方案', '规避检查'];
    const missing = required.filter(f => !record[f]);
    if (missing.length > 0) {
      this.logger.error?.(`[LlDbAutoRecorder] 缺少必填字段: ${missing.join(', ')}`);
      return false;
    }
    await this._writeRecord(record);
    return true;
  }

  /**
   * 写入 LL-DB 文件
   */
  async _writeRecord(record) {
    try {
      await fsp.access(this.llDbPath);
    } catch {
      this.logger.error?.(`[LlDbAutoRecorder] LL-DB 文件不存在: ${this.llDbPath}`);
      return;
    }

    const content = await fsp.readFile(this.llDbPath, 'utf8');
    const nextId = this._getNextId(content);
    const now = new Date().toISOString().slice(0, 10);

    const entry = `
---

### ${nextId}

- **LL-ID**: ${nextId}
- **领域**: ${record['领域']}
- **语言**: ${record['语言']}
- **框架**: ${record['框架'] || '无'}
- **严重度**: ${record['严重度']}
- **触发场景**: "${record['触发场景']}"
- **错误现象**: "${record['错误现象']}"
- **根因分析**: "${record['根因分析']}"
- **解决方案**:
  - 步骤1: ${typeof record['解决方案'] === 'object' ? (record['解决方案']['步骤1'] || '无') : (record['解决方案'] || '无')}
  - 步骤2: ${typeof record['解决方案'] === 'object' ? (record['解决方案']['步骤2'] || '无') : '无'}
  - 步骤3: ${typeof record['解决方案'] === 'object' ? (record['解决方案']['步骤3'] || '无') : '无'}
- **规避检查**: "${record['规避检查']}"
- **关联任务**: ${record['关联任务'] || '无'}
- **记录时间**: ${now}
- **状态**: 待复核
`;

    // 在"重要提示"之前插入
    const marker = '\n> **重要提示**';
    let newContent;
    if (content.includes(marker)) {
      newContent = content.replace(marker, entry + marker);
    } else {
      newContent = content + entry;
    }

    try {
      await fsp.writeFile(this.llDbPath, newContent, 'utf8');
      this.logger.log(`[LlDbAutoRecorder] ✅ 已自动入库: ${nextId} - ${record['触发场景']}`);
    } catch (err) {
      this.logger.error?.(`[LlDbAutoRecorder] 写入失败:`, err.message);
    }
  }

  /**
   * 获取下一个可用 ID
   */
  _getNextId(content) {
    const records = [];
    const regex = /### (LL-\d{4}-\d{3})/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      records.push(match[1]);
    }

    let maxNum = 0;
    for (const id of records) {
      const m = id.match(/LL-\d{4}-(\d{3})/);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    }

    const year = new Date().getFullYear();
    return `LL-${year}-${String(maxNum + 1).padStart(3, '0')}`;
  }

  /**
   * 推断领域
   */
  _inferDomain(toolName, summary) {
    const s = (toolName + ' ' + summary).toLowerCase();
    if (/\.vue|\.tsx|\.jsx|css|style|layout|component|render/.test(s)) return '前端';
    if (/\.rs|cargo|tauri|rust/.test(s)) return '后端';
    if (/\.sql|database|query|migration/.test(s)) return '数据库';
    if (/serial|i2c|spi|hardware|embedded|mcu/.test(s)) return '硬件';
    if (/model|inference|llm|tts|asr|embedding/.test(s)) return 'AI推理';
    if (/docker|nginx|deploy|ci|cd|build|pack/.test(s)) return '部署运维';
    return '后端';
  }

  /**
   * 推断语言
   */
  _inferLanguage(toolName, summary) {
    const s = (toolName + ' ' + summary).toLowerCase();
    if (/\.ts|typescript|\.vue/.test(s)) return 'TypeScript';
    if (/\.rs|rust|cargo/.test(s)) return 'Rust';
    if (/\.py|python/.test(s)) return 'Python';
    if (/\.go|golang/.test(s)) return 'Go';
    if (/\.java/.test(s)) return 'Java';
    return 'JavaScript';
  }
}

module.exports = { LlDbAutoRecorder };
