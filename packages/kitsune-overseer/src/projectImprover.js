/**
 * 项目改进模块
 * 类似 Trae 的"重构洞察"功能，主动发现技术债务并生成改进计划
 *
 * 核心能力：
 * 1. 技术债务扫描（代码异味、超长文件、深层嵌套等）
 * 2. 改进计划生成（优先级排序、影响分析）
 * 3. 任务调度执行（低风险自动、高风险需确认）
 *
 * 参考 Trae 的 4 Agent 流水线架构：
 * - refactor_scoper: 分析代码范围
 * - refactor_finder: 发现重构问题
 * - refactor_planner: 生成重构方案
 * - refactor_incrementer: 增量分析
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

// 扫描配置
const SCAN_CONFIG = {
  // 超长文件阈值
  longFileThreshold: 300,
  // 深层嵌套阈值（缩进层级）
  deepNestingThreshold: 4,
  // 最大扫描深度
  maxDepth: 4,
  // 每个文件最多记录的 TODO 数量
  maxTodosPerFile: 5,
  // 每次扫描最多发现的问题数量
  maxFindingsPerScan: 50,
  // 忽略的目录
  ignoreDirs: [
    'node_modules', '.git', 'dist', 'build', '.trae', 'coverage',
    'test', 'tests', '__tests__', 'spec', '__mocks__',
    '.vscode', '.idea', '.cache', '.temp', '.tmp',
    'vendor', 'venv', '.venv', 'env', 'site-packages',
    '__pycache__', '.tox', '.mypy_cache',
  ],
  // 忽略的文件扩展名
  ignoreExts: ['.json', '.lock', '.min.js', '.min.css', '.map', '.d.ts'],
  // TODO/FIXME/HACK 标记正则
  todoRegex: /\b(TODO|FIXME|HACK|XXX|WORKAROUND)\b/gi,
};

class ProjectImprover {
  constructor({ bus, taskStore, taskPusher, llmManager, proactiveNotifier, logger = console }) {
    this.bus = bus;
    this.taskStore = taskStore;
    this.taskPusher = taskPusher;
    this.llmManager = llmManager;
    this.proactiveNotifier = proactiveNotifier;
    this.logger = logger;

    this.enabled = false;
    this.scanning = false;
    this._scanTimer = null;
  }

  /**
   * 启动自动扫描
   * @param {number} intervalMs - 扫描间隔（默认30分钟）
   */
  start(intervalMs = 30 * 60 * 1000) {
    if (this._scanTimer) return;
    this.enabled = true;

    // 首次扫描延迟5分钟（等应用稳定）
    setTimeout(() => {
      if (this.enabled) {
        this.scanProject();
      }
    }, 5 * 60 * 1000);

    // 定期扫描
    this._scanTimer = setInterval(() => {
      if (this.enabled && !this.scanning) {
        this.scanProject();
      }
    }, intervalMs);

    this.logger.log?.(`[ProjectImprover] 已启动，扫描间隔: ${intervalMs / 1000 / 60} 分钟`);
  }

  /**
   * 停止自动扫描
   */
  stop() {
    this.enabled = false;
    if (this._scanTimer) {
      clearInterval(this._scanTimer);
      this._scanTimer = null;
    }
  }

  /**
   * 扫描项目
   * @param {string} projectDir - 项目目录（默认当前目录）
   * @returns {Array} 发现的问题列表
   */
  async scanProject(projectDir = process.cwd()) {
    if (this.scanning) return [];
    this.scanning = true;

    this.logger.log?.(`[ProjectImprover] 开始扫描项目: ${projectDir}`);

    try {
      const findings = [];

      // 1. 扫描超长文件
      findings.push(...this._scanLongFiles(projectDir));

      // 2. 扫描深层嵌套
      findings.push(...this._scanDeepNesting(projectDir));

      // 3. 扫描 TODO/FIXME 标记
      findings.push(...this._scanTodoMarkers(projectDir));

      // 4. 扫描重复代码（简单实现）
      findings.push(...this._scanDuplicatedCode(projectDir));

      // 5. LLM 增强分析（可选）
      if (this.llmManager && findings.length > 0) {
        const enhanced = await this._enhanceWithLLM(findings);
        if (enhanced) {
          findings.push(...enhanced);
        }
      }

      // 6. 生成改进计划
      const plan = this._generatePlan(findings);

      // 7. 保存到 TaskStore
      if (this.taskStore) {
        for (const task of plan.tasks) {
          await this.taskStore.addImprovementTask(task);
        }
        // 更新扫描时间
        this.taskStore._improvementPlan.lastScan = Date.now();
        await this.taskStore._saveImprovementPlan();
      }

      this.logger.log?.(`[ProjectImprover] 扫描完成，发现 ${findings.length} 个问题`);

      // 8. 通知用户（如果有高优先级问题）
      const highPriority = plan.tasks.filter(t => t.priority === 'urgent' || t.priority === 'high');
      if (highPriority.length > 0 && this.proactiveNotifier) {
        this.proactiveNotifier._pushMessage({
          level: 'notify',
          icon: '',
          title: '项目改进发现',
          content: `发现 ${highPriority.length} 个需要关注的问题`,
          source: 'project_improver',
          timestamp: Date.now(),
          type: 'improvement_found',
          data: { count: highPriority.length, tasks: highPriority.slice(0, 3) },
        });
      }

      return plan.tasks;
    } catch (err) {
      this.logger.error?.(`[ProjectImprover] 扫描失败:`, err.message);
      return [];
    } finally {
      this.scanning = false;
    }
  }

  /**
   * 获取改进计划
   */
  getImprovementPlan() {
    if (!this.taskStore) return { tasks: [], stats: {} };
    return {
      tasks: this.taskStore._improvementPlan.tasks,
      stats: this.taskStore.getImprovementStats(),
    };
  }

  /**
   * 执行下一个改进任务
   */
  async executeNextTask(confirmed = false) {
    if (!this.taskStore) return null;

    const task = this.taskStore.getNextImprovementTask();
    if (!task) return null;

    if (task.risk === 'high' && !confirmed) {
      // 通知用户需要确认
      if (this.proactiveNotifier) {
        this.proactiveNotifier._pushMessage({
          level: 'alert',
          icon: '',
          title: '需要确认',
          content: `高风险改进任务需要确认: ${task.description}`,
          source: 'project_improver',
          timestamp: Date.now(),
          type: 'confirmation_required',
          data: { task },
        });
      }
      return { queued: true, task };
    }

    // 执行任务
    await this.taskStore.updateImprovementTask(task.id, { status: 'in_progress' });

    let result;
    if (this.taskPusher) {
      const prompt = this._buildTaskPrompt(task);
      result = await this.taskPusher.pushTask({
        tool: 'claude',
        templateKey: 'prompt',
        input: prompt,
      });
    } else {
      result = { ok: false, error: 'taskPusher not available' };
    }

    await this.taskStore.updateImprovementTask(task.id, {
      status: result?.ok ? 'completed' : 'failed',
      result,
    });

    return result;
  }

  /**
   * 忽略一个改进任务
   */
  async ignoreTask(taskId) {
    if (!this.taskStore) return;
    await this.taskStore.updateImprovementTask(taskId, { status: 'ignored' });
  }

  /**
   * 执行指定的改进任务
   */
  async executeTask(taskId, confirmed = false) {
    if (!this.taskStore) return { ok: false, error: 'taskStore not available' };

    const task = this.taskStore._improvementPlan.tasks.find(t => t.id === taskId);
    if (!task) return { ok: false, error: 'Task not found' };

    if (task.status !== 'pending') return { ok: false, error: 'Task is not pending' };

    if (task.risk === 'high' && !confirmed) {
      // 通知用户需要确认
      if (this.proactiveNotifier) {
        this.proactiveNotifier._pushMessage({
          level: 'alert',
          icon: '',
          title: '需要确认',
          content: `高风险改进任务需要确认: ${task.description}`,
          source: 'project_improver',
          timestamp: Date.now(),
          type: 'confirmation_required',
          data: { task },
        });
      }
      return { ok: false, requiresConfirmation: true, task };
    }

    // 执行任务
    await this.taskStore.updateImprovementTask(taskId, { status: 'in_progress' });

    let result;
    if (this.taskPusher) {
      const prompt = this._buildTaskPrompt(task);
      result = await this.taskPusher.pushTask({
        tool: 'claude',
        templateKey: 'prompt',
        input: prompt,
      });
    } else {
      result = { ok: false, error: 'taskPusher not available' };
    }

    await this.taskStore.updateImprovementTask(taskId, {
      status: result?.ok ? 'completed' : 'failed',
      result,
    });

    return result;
  }

  // 扫描方法

  /**
   * 扫描超长文件
   */
  _scanLongFiles(dir, findings = [], depth = 0) {
    if (depth > SCAN_CONFIG.maxDepth) return findings;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (findings.length >= SCAN_CONFIG.maxFindingsPerScan) break;

        if (entry.isDirectory()) {
          if (SCAN_CONFIG.ignoreDirs.includes(entry.name)) continue;
          this._scanLongFiles(path.join(dir, entry.name), findings, depth + 1);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (SCAN_CONFIG.ignoreExts.includes(ext)) continue;
          if (!ext.match(/\.(js|ts|tsx|jsx|py|java|go|rs|cpp|c|h)$/)) continue;

          const filePath = path.join(dir, entry.name);
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lineCount = content.split('\n').length;

            if (lineCount > SCAN_CONFIG.longFileThreshold) {
              findings.push({
                type: 'long_file',
                file: path.relative(process.cwd(), filePath),
                lineCount,
                threshold: SCAN_CONFIG.longFileThreshold,
                description: `文件过长: ${lineCount} 行`,
                suggestion: `考虑拆分为多个模块`,
                impact: lineCount > 500 ? 2 : 1,
                cost: 1,
              });
            }
          } catch {}
        }
      }
    } catch {}

    return findings;
  }

  /**
   * 扫描深层嵌套
   */
  _scanDeepNesting(dir, findings = [], depth = 0) {
    if (depth > SCAN_CONFIG.maxDepth) return findings;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (findings.length >= SCAN_CONFIG.maxFindingsPerScan) break;

        if (entry.isDirectory()) {
          if (SCAN_CONFIG.ignoreDirs.includes(entry.name)) continue;
          this._scanDeepNesting(path.join(dir, entry.name), findings, depth + 1);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (!ext.match(/\.(js|ts|tsx|jsx|py)$/)) continue;

          const filePath = path.join(dir, entry.name);
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            let maxIndent = 0;
            let maxIndentLine = 0;

            lines.forEach((line, i) => {
              const indent = line.match(/^\s*/)[0].length;
              const indentLevel = Math.floor(indent / 2);  // 假设2空格缩进
              if (indentLevel > maxIndent) {
                maxIndent = indentLevel;
                maxIndentLine = i + 1;
              }
            });

            if (maxIndent > SCAN_CONFIG.deepNestingThreshold) {
              findings.push({
                type: 'deep_nesting',
                file: path.relative(process.cwd(), filePath),
                line: maxIndentLine,
                depth: maxIndent,
                threshold: SCAN_CONFIG.deepNestingThreshold,
                description: `深层嵌套: ${maxIndent} 层 (第 ${maxIndentLine} 行)`,
                suggestion: `考虑提取函数或使用 early return`,
                impact: maxIndent > 6 ? 2 : 1,
                cost: 1,
              });
            }
          } catch {}
        }
      }
    } catch {}

    return findings;
  }

  /**
   * 扫描 TODO/FIXME 标记
   */
  _scanTodoMarkers(dir, findings = [], depth = 0) {
    if (depth > SCAN_CONFIG.maxDepth) return findings;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (findings.length >= SCAN_CONFIG.maxFindingsPerScan) break;

        if (entry.isDirectory()) {
          if (SCAN_CONFIG.ignoreDirs.includes(entry.name)) continue;
          this._scanTodoMarkers(path.join(dir, entry.name), findings, depth + 1);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (!ext.match(/\.(js|ts|tsx|jsx|py|java|go|rs|cpp|c|h|md)$/)) continue;

          const filePath = path.join(dir, entry.name);
          let todosInFile = 0;
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');

            for (let i = 0; i < lines.length; i++) {
              if (todosInFile >= SCAN_CONFIG.maxTodosPerFile) break;

              const matches = lines[i].match(SCAN_CONFIG.todoRegex);
              if (matches) {
                for (const match of matches) {
                  if (todosInFile >= SCAN_CONFIG.maxTodosPerFile) break;
                  findings.push({
                    type: 'todo_marker',
                    file: path.relative(process.cwd(), filePath),
                    line: i + 1,
                    marker: match.toUpperCase(),
                    description: `${match}: ${lines[i].trim().substring(0, 100)}`,
                    suggestion: `清理或转换为正式任务`,
                    impact: match.toUpperCase() === 'FIXME' ? 2 : 1,
                    cost: 0,
                  });
                  todosInFile++;
                }
              }
            }
          } catch {}
        }
      }
    } catch {}

    return findings;
  }

  /**
   * 扫描重复代码（简单实现：查找重复的函数定义）
   */
  _scanDuplicatedCode(dir, findings = [], depth = 0) {
    if (depth > 3) return findings;

    // 简单实现：只扫描当前目录的 JS/TS 文件
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const funcMap = new Map();

      for (const entry of entries) {
        if (entry.isFile() && entry.name.match(/\.(js|ts)$/)) {
          const filePath = path.join(dir, entry.name);
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            // 查找函数定义
            const funcMatches = content.matchAll(/(?:function|const|let|var)\s+(\w+)\s*[(=]/g);
            for (const match of funcMatches) {
              const funcName = match[1];
              if (funcMap.has(funcName)) {
                const existing = funcMap.get(funcName);
                // 跳过常见的短名称
                if (funcName.length > 5 && !['index', 'main', 'init', 'setup'].includes(funcName)) {
                  findings.push({
                    type: 'duplicated_code',
                    file: path.relative(process.cwd(), filePath),
                    description: `函数名重复: ${funcName}`,
                    suggestion: `重命名或提取公共模块`,
                    impact: 1,
                    cost: 1,
                  });
                }
              } else {
                funcMap.set(funcName, filePath);
              }
            }
          } catch {}
        }
      }
    } catch {}

    return findings;
  }

  /**
   * LLM 增强分析
   */
  async _enhanceWithLLM(findings) {
    if (!this.llmManager || findings.length === 0) return null;

    try {
      const summary = findings.slice(0, 10).map(f =>
        `- [${f.type}] ${f.file}:${f.line || ''} ${f.description}`
      ).join('\n');

      const prompt = `分析以下代码问题，给出优先级排序和改进建议：

${summary}

请返回 JSON 数组，每个元素包含：
{
  "type": "问题类型",
  "file": "文件路径",
  "priority": "urgent|high|normal|low",
  "enhanced_suggestion": "改进建议"
}`;

      const reasoner = await this.llmManager.getReasoner();
      const response = await reasoner.reason(prompt);

      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (err) {
      this.logger.error?.(`[ProjectImprover] LLM 增强失败:`, err.message);
    }

    return null;
  }

  /**
   * 生成改进计划
   */
  _generatePlan(findings) {
    const tasks = findings.map(f => ({
      type: f.type,
      file: f.file,
      line: f.line,
      description: f.description,
      suggestion: f.suggestion || f.enhanced_suggestion,
      impact: f.impact || 0,
      cost: f.cost || 0,
      risk: f.impact >= 2 ? 'high' : f.impact >= 1 ? 'medium' : 'low',
      priority: this._calculatePriority(f),
    }));

    // 按优先级排序
    const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
    tasks.sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2));

    return { tasks, generatedAt: Date.now() };
  }

  _calculatePriority(finding) {
    // 基于影响程度和成本计算优先级
    const score = (finding.impact || 0) * 2 - (finding.cost || 0);

    if (score >= 3) return 'urgent';
    if (score >= 2) return 'high';
    if (score >= 1) return 'normal';
    return 'low';
  }

  /**
   * 构建任务执行 prompt
   */
  _buildTaskPrompt(task) {
    const lines = [
      `## 改进任务`,
      `- 类型: ${task.type}`,
      `- 文件: ${task.file}`,
    ];

    if (task.line) {
      lines.push(`- 行号: ${task.line}`);
    }

    lines.push(`- 问题: ${task.description}`);
    lines.push(`- 建议: ${task.suggestion}`);
    lines.push(`\n请执行此改进任务。`);

    return lines.join('\n');
  }
}

module.exports = { ProjectImprover };
