/**
 * C1: 代码审查引擎
 * 监听 EventBus 的 hooks.state_updated 和 watcher.code_changed 事件
 * 当外部 AI 工具完成 tool_use 或 complete 事件，或检测到代码变更时，自动获取 git diff 并调用 LLM 审查
 * 
 * 路径配置（基于真实目录结构）：
 * - 实际目录: g:\agentpet\pet-agent\
 * - __dirname: g:\agentpet\pet-agent\src\core\runtime\overseer\
 * - 向上5级 + .agentpet/suggestions = g:\agentpet\.agentpet\suggestions\
 * - 向上5级 + config/ai-review-rules.yaml = g:\agentpet\pet-agent\config\ai-review-rules.yaml
 */

const { execFile } = require('child_process');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('path');
const crypto = require('node:crypto');
const YAML = require('yaml');

// 修正路径：向上5级到 pet-agent/，然后 .agentpet/suggestions
const SUGGESTIONS_DIR = path.resolve(__dirname, '../../../../.agentpet/suggestions');
// 修正路径：向上5级到 pet-agent/，然后 config/ai-review-rules.yaml
const RULES_FILE = path.resolve(__dirname, '../../../../config/ai-review-rules.yaml');

/**
 * 加载 AI 审查规则
 */
function loadReviewRules() {
  try {
    if (!fs.existsSync(RULES_FILE)) return [];
    const raw = fs.readFileSync(RULES_FILE, 'utf8');
    const parsed = YAML.parse(raw);
    return Array.isArray(parsed?.rules) ? parsed.rules : [];
  } catch {
    return [];
  }
}

/**
 * 向数组尾部追加元素，超过 maxSize 时 FIFO 淘汰旧元素 (LL-037)
 */
function boundedPush(arr, item, maxSize = 1000) {
  arr.push(item);
  if (arr.length > maxSize) arr.splice(0, arr.length - maxSize);
}

class CodeReviewer {
  constructor({ bus, llmManager }) {
    this.bus = bus;
    this.llmManager = llmManager;
    this.reviewQueue = [];
    this.isProcessing = false;
    this.maxConcurrent = 2;
    this.activeReviews = 0;

    // diff 内容去重：防止对同一个 diff 短时间内重复审查
    // key: diff 内容的 hash, value: 上次审查完成的时间戳
    this._diffDedupMap = new Map();
    this._diffDedupTtlMs = 30 * 1000; // 30 秒内相同 diff 不重复审查

    // 确保 suggestions 目录存在
    if (!fs.existsSync(SUGGESTIONS_DIR)) {
      fs.mkdirSync(SUGGESTIONS_DIR, { recursive: true });
    }

    this.init();
  }

  init() {
    // 监听 hooks.state_updated 事件（外部 AI hook 触发 / TraeMonitor 触发）
    this.bus.subscribe('hooks.state_updated', (payload) => {
      this.handleStateUpdate(payload);
    });

    // 监听 watcher.code_changed 事件（CodeWatcher 检测到 git diff 变更）
    this.bus.subscribe('watcher.code_changed', (payload) => {
      this.handleCodeChange(payload);
    });

    // 监听 git.status_changed 事件（GitStatusMonitor 检测到变更）
    this.bus.subscribe('git.status_changed', (payload) => {
      this.handleGitStatusChange(payload);
    });

    console.log('[CodeReviewer] 已启动，监听 hooks.state_updated / watcher.code_changed / git.status_changed 事件');
  }

  async handleStateUpdate(payload) {
    const { session_id, state, data } = payload;

    // 外部 AI 工具的精确状态（Claude Code 等 hook 触发）
    const isExactToolState = state === 'tool_use' || state === 'complete';

    // 使用统一状态枚举匹配（替代旧的硬编码列表）
    // 旧格式兼容：editing/compiling/build_success 等也放行
    const REVIEWABLE_STATES = new Set([
      'completed', 'error', 'stopped', 'code_changed', 'building', 'testing',
      // 旧版兼容（后端已不发送，但外部 hook 可能还会用）
      'editing', 'build_success', 'build_error', 'compiling',
      'test_passed', 'test_failed', 'file_changes'
    ]);
    const isActivityState = REVIEWABLE_STATES.has(state);

    if (!isExactToolState && !isActivityState) {
      return;
    }

    // 避免重复处理同一 session（对 activity 状态用更短的去重窗口）
    const dedupKey = `${session_id}:${state}:${data?.tool_name || 'activity'}`;
    if (this.reviewQueue.some(r => r.key === dedupKey)) {
      return;
    }

    console.log(`[CodeReviewer] 收到审查请求(${isExactToolState ? 'hook' : 'activity'}): ${state} | ${data?.tool_name || data?.summary || 'N/A'}`);

    boundedPush(this.reviewQueue, {
      key: dedupKey,
      session_id,
      state,
      data,
      timestamp: Date.now(),
      source: isExactToolState ? 'hook' : 'activity'
    }, 1000);

    this.processQueue();
  }

  /**
   * 处理 Git 状态变更事件（由 GitStatusMonitor 发布）
   * 当有实际文件变更时自动触发代码审查
   */
  async handleGitStatusChange(payload) {
    // 兼容 GitStatusMonitor 发送的 { snapshot, delta } 格式
    const { snapshot, delta, files_changed, staged, has_uncommitted } = payload || {};
    let changedFiles = [];
    if (files_changed || staged) {
      // 旧格式：直接使用 files_changed + staged
      changedFiles = [...(files_changed || []), ...(staged || [])];
    } else if (delta) {
      // 新格式（GitStatusMonitor）：从 delta 中提取文件列表
      changedFiles = [
        ...(delta.newFiles || []),
        ...(delta.newModified || []),
        ...(delta.newDeleted || []),
      ];
    }
    const hasChanges = changedFiles.length > 0 || !!has_uncommitted || (snapshot?.changed === true);
    if (!hasChanges) {
      return;
    }

    // 防抖：30秒内不重复审查同一批文件
    const now = Date.now();
    const recentGitReview = this.reviewQueue.find(r => r.source === 'git_change' && (now - r.timestamp) < 30000);
    if (recentGitReview) return;

    console.log(`[CodeReviewer] 收到 git 变更事件: ${changedFiles.length} 个文件变更`);

    boundedPush(this.reviewQueue, {
      key: `git_change:${Date.now()}`,
      session_id: 'git_monitor',
      state: 'code_change',
      data: { tool_name: 'git_monitor', files: changedFiles },
      timestamp: Date.now(),
      source: 'git_change'
    }, 1000);

    this.processQueue();
  }

  /**
   * 处理代码变更事件（由 CodeWatcher 发布）
   */
  async handleCodeChange(payload) {
    const { files, patch } = payload;
    if (!files || files.length === 0) {
      return;
    }

    // 使用时间戳作为唯一 key，避免重复审查
    const reviewKey = `code_change:${Date.now()}`;
    if (this.reviewQueue.some(r => r.key === reviewKey)) {
      return;
    }

    console.log(`[CodeReviewer] 收到审查请求(code_change): ${files.length} 个文件变更`);

    boundedPush(this.reviewQueue, {
      key: reviewKey,
      session_id: 'code_watcher',
      state: 'code_change',
      data: { tool_name: 'code_watcher', files, patch },
      timestamp: Date.now(),
      source: 'code_change'
    }, 1000);

    this.processQueue();
  }

  async processQueue() {
    if (this.isProcessing || this.activeReviews >= this.maxConcurrent) {
      return;
    }

    this.isProcessing = true;

    while (this.reviewQueue.length > 0 && this.activeReviews < this.maxConcurrent) {
      const review = this.reviewQueue.shift();
      this.activeReviews++;

      try {
        await this.performReview(review);
      } catch (err) {
        console.error(`[CodeReviewer] 审查失败:`, err.message);
      } finally {
        this.activeReviews--;
      }
    }

    this.isProcessing = false;
  }

  async performReview(review) {
    const { session_id, state, data, source } = review;

    // 优先使用 payload 中的 patch（来自 CodeWatcher），否则获取 git diff
    let diff = data?.patch || '';
    if (!diff || diff.trim().length === 0) {
      diff = await this.getGitDiff();
    }
    
    if (!diff || diff.trim().length === 0) {
      console.log('[CodeReviewer] 无代码变更，跳过审查');
      return;
    }

    // diff 内容去重：相同 diff 在 TTL 内不重复审查
    const diffHash = crypto.createHash('md5').update(diff).digest('hex');
    const now = Date.now();
    const lastReviewTime = this._diffDedupMap.get(diffHash);
    if (lastReviewTime && (now - lastReviewTime) < this._diffDedupTtlMs) {
      console.log(`[CodeReviewer] 相同 diff 已在 ${Math.round((now - lastReviewTime) / 1000)}s 前审查过，跳过`);
      return;
    }

    // 1) LLM 审查（含本地规则降级）
    let reviewResult;
    try {
      reviewResult = await this.callLlmForReview(diff, data);
    } catch (err) {
      console.log('[CodeReviewer] LLM 不可用，降级到本地规则审查');
      reviewResult = this.localReview(diff, data);
    }

    // 2) 风险等级评估（severity + issue 维度 → risk_level / priority）
    const risk = this.assessRiskLevel(reviewResult);
    reviewResult.risk_level = risk.risk_level;
    reviewResult.priority = risk.priority;

    // 3) 低风险文档更新 → 静默记录，不打扰用户（也不发送气泡）
    if (risk.risk_level === 'low' && !risk.hasCodeIssues) {
      console.log('[CodeReviewer] 低风险文档更新，静默记录，跳过气泡和通知');
      await this.writeSuggestion(session_id, reviewResult, data, { silent: true });
      this.bus.publish('overseer.review_completed', {
        session_id,
        review_id: reviewResult.id,
        summary: reviewResult.summary,
        source: source || 'hook',
        priority: reviewResult.priority,
        risk_level: reviewResult.risk_level
      });
      return;
    }

    // 4) 生成动作类型（给前端 UI 使用）
    const filesChanged = (data?.files || []).slice(0, 20);
    const actionType = this.generateActionType(reviewResult, risk, filesChanged);

    // 5) 写入建议文件（带 priority / action_type 元数据）
    await this.writeSuggestion(session_id, reviewResult, data, {
      action_type: actionType,
      files_changed: filesChanged,
      patch_preview: diff.substring(0, 1500)
    });

    // 6) 发布审查完成事件（给 Live2DBridge 和前端 UI）
    // 情绪映射已统一到 emotion-mapping.json 配置，不再硬编码
    this.bus.publish('overseer.review_completed', {
      session_id,
      review_id: reviewResult.id,
      summary: reviewResult.summary,
      source: source || 'hook',
      priority: reviewResult.priority,
      risk_level: reviewResult.risk_level,
      severity: reviewResult.severity,
      action_type: actionType,
      files_changed: filesChanged,
      issues_count: (reviewResult.issues || []).length,
      overall_score: reviewResult.overall_score,
      issues: (reviewResult.issues || []).slice(0, 3).map(i => ({
        dimension: i.dimension,
        description: i.description
      })),
      timestamp: Date.now()
    });

    // 8) 高/中风险：额外 system.notification 通知
    if (reviewResult.issues && reviewResult.issues.length > 0 &&
        (risk.risk_level === 'high' || risk.risk_level === 'medium')) {
      this.bus.publish('system.notification', {
        title: 'Code Review Issues Found',
        body: reviewResult.summary || `${reviewResult.issues.length} issue(s) detected`,
        silent: risk.risk_level === 'medium',
        priority: risk.risk_level
      });
    }

    console.log(`[CodeReviewer] 审查完成: ${reviewResult.id} risk=${risk.risk_level} priority=${risk.priority}`);

    // 记录 diff hash，防止短时间内重复审查相同内容
    this._diffDedupMap.set(diffHash, Date.now());
    // 清理过期的 hash 条目（防止内存泄漏）
    if (this._diffDedupMap.size > 100) {
      const cutoff = Date.now() - this._diffDedupTtlMs;
      for (const [key, ts] of this._diffDedupMap) {
        if (ts < cutoff) this._diffDedupMap.delete(key);
      }
    }
  }

  /**
   * 评估风险等级（综合 severity + issues 维度）
   */
  assessRiskLevel(reviewResult) {
    const severity = (reviewResult.severity || 'info').toLowerCase();
    const issues = reviewResult.issues || [];
    const hasSecurity = issues.some(i => i.dimension === 'security');
    const hasBug = issues.some(i => i.dimension === 'bug');
    const hasCodeIssues = issues.some(i =>
      i.dimension === 'quality' || i.dimension === 'bug' || i.dimension === 'security' || i.dimension === 'performance'
    );

    let risk_level = 'low';
    let priority = 'normal';

    if (severity === 'high' || hasSecurity) {
      risk_level = 'high';
      priority = 'urgent';
    } else if (severity === 'medium' || hasBug || issues.length >= 2) {
      risk_level = 'medium';
      priority = 'high';
    } else if (severity === 'info' || issues.length === 0) {
      risk_level = 'low';
      priority = 'normal';
    }

    return { risk_level, priority, hasCodeIssues };
  }

  /**
   * 推断此建议支持的交互动作类型
   */
  generateActionType(reviewResult, risk, fileList) {
    const issues = reviewResult.issues || [];
    const hasFix = issues.some(i => i.suggestion && i.suggestion.length > 0);
    const hasCodeHint = issues.some(i => i.line_hint && i.line_hint.length > 0);
    const hasFiles = Array.isArray(fileList) && fileList.length > 0;

    const actions = ['view_summary'];
    if (hasFix) actions.push('apply_suggestion');
    if (hasCodeHint || hasFiles) actions.push('show_code');
    if (risk.risk_level !== 'low') actions.push('dismiss_with_reason');
    return actions;
  }

  async getGitDiff() {
    return new Promise((resolve, reject) => {
      // 获取暂存区和工作区的 diff
      execFile('git', ['diff', 'HEAD'], { cwd: process.cwd() }, (err, stdout, stderr) => {
        if (err) {
          // 如果没有 git 仓库或没有变更，返回空（静默，避免刷屏）
          resolve('');
          return;
        }
        resolve(stdout);
      });
    });
  }

  async callLlmForReview(diff, hookData) {
    const prompt = `你是一个代码审查专家。请审查以下代码变更，并给出审查意见。

## 代码变更 (git diff)
\`\`\`diff
${diff.substring(0, 8000)}  // 限制长度避免 token 超限
\`\`\`

## 触发信息
- 工具: ${hookData?.tool_name || 'unknown'}
- 摘要: ${hookData?.summary || 'N/A'}

## 审查维度
1. 代码质量（可读性、复杂度、命名规范）
2. 潜在 bug（逻辑错误、边界条件、空指针）
3. 安全风险（注入、敏感信息泄露、权限问题）
4. LL-DB 规则合规性（端口、路径、Live2D、ReAct 循环等）

## 输出格式
请用 JSON 格式输出审查结果：
{
  "id": "review-${Date.now()}",
  "summary": "一句话总结",
  "severity": "high|medium|low|info",
  "issues": [
    {
      "dimension": "quality|bug|security|rule_compliance",
      "description": "问题描述",
      "suggestion": "修复建议",
      "line_hint": "相关行号或代码片段"
    }
  ],
  "overall_score": 0-100,
  "rule_violations": ["R-001", "R-002"]
}`;

    // llmManager 不可用时直接抛出，让 performReview 走降级路径
    if (!this.llmManager) {
      throw new Error('llmManager 未初始化');
    }

    try {
      const reasoner = await this.llmManager.getReasoner();
      const response = await reasoner.decide({
        messages: [
          { role: 'system', content: '你是一个代码审查专家。请用中文回答，输出 JSON 格式的审查结果。' },
          { role: 'user', content: prompt }
        ]
      });

      // decide() 返回 { type, output, assistantMessage }
      const rawOutput = response?.output || response?.assistantMessage?.content || '';

      // 尝试解析 JSON
      let result;
      try {
        // 提取 JSON 部分
        const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        } else {
          result = {
            id: `review-${Date.now()}`,
            summary: rawOutput.substring(0, 200),
            severity: 'info',
            issues: [],
            overall_score: 50,
            rule_violations: []
          };
        }
      } catch (parseErr) {
        result = {
          id: `review-${Date.now()}`,
          summary: rawOutput.substring(0, 200),
          severity: 'info',
          issues: [],
          overall_score: 50,
          rule_violations: []
        };
      }

      return result;
    } catch (err) {
      console.error('[CodeReviewer] LLM 调用失败:', err.message);
      throw err;
    }
  }

  /**
   * 本地规则审查（LLM 不可用时的降级方案）
   * 从 rules/ai-review-rules.yaml 加载规则，匹配 diff 中的新增行
   */
  localReview(diff, hookData) {
    const issues = [];
    const diffLines = diff.split('\n');
    const addedLines = diffLines.filter(l => l.startsWith('+') && !l.startsWith('+++'));

    // 加载 YAML 规则库
    const rules = loadReviewRules();
    const matchedRuleIds = [];

    // 内置基础规则（兜底，当 YAML 文件不可用时）
    const builtinPatterns = [
      { id: 'BUILTIN-001', pattern: /console\.log/, dimension: 'quality', description: '生产代码中残留 console.log', suggestion: '移除 console.log 或替换为正式日志工具' },
      { id: 'BUILTIN-002', pattern: /\b(password|secret|api_key|token)\s*[:=]\s*['"][^'"]+['"]/i, dimension: 'security', description: '疑似硬编码密钥或密码', suggestion: '使用环境变量或配置文件管理敏感信息' },
      { id: 'BUILTIN-003', pattern: /catch\s*\([^)]*\)\s*\{\s*\}/, dimension: 'bug', description: '空的 catch 块，异常被静默吞掉', suggestion: '至少添加错误日志或合理的异常处理' },
    ];

    // 应用 YAML 规则
    for (const rule of rules) {
      if (!rule.pattern) continue;
      try {
        const re = new RegExp(rule.pattern, 'i');
        for (const line of addedLines) {
          if (re.test(line)) {
            const dimMap = { '伪实现': 'quality', '安全': 'security', '性能': 'performance', '可维护性': 'quality' };
            issues.push({
              dimension: dimMap[rule.category] || 'quality',
              description: `[${rule.id}] ${rule.name}: ${rule.trigger || ''}`.trim(),
              suggestion: rule.fix || '',
              line_hint: line.trim(),
              rule_id: rule.id
            });
            matchedRuleIds.push(rule.id);
            break; // 每条规则只报告一次
          }
        }
      } catch { /* 正则编译失败跳过 */ }
    }

    // 应用内置基础规则（仅在 YAML 规则未覆盖时）
    for (const bp of builtinPatterns) {
      const alreadyCovered = rules.some(r => r.id && bp.id.replace('BUILTIN-', 'FAKE-') === r.id);
      if (alreadyCovered) continue;
      for (const line of addedLines) {
        if (bp.pattern.test(line)) {
          issues.push({
            dimension: bp.dimension,
            description: bp.description,
            suggestion: bp.suggestion,
            line_hint: line.trim()
          });
          break;
        }
      }
    }

    // 未处理的 Promise（.then 无 .catch）
    const thenRe = /\.then\s*\(/;
    const catchRe = /\.catch\s*\(/;
    const diffText = addedLines.join('\n');
    const thenCount = (diffText.match(thenRe) || []).length;
    const catchCount = (diffText.match(catchRe) || []).length;
    if (thenCount > 0 && catchCount < thenCount) {
      issues.push({
        dimension: 'bug',
        description: `检测到 ${thenCount} 处 .then 但仅 ${catchCount} 处 .catch，Promise 异常可能未处理`,
        suggestion: '为每个 .then 添加 .catch 或使用 async/await + try/catch',
        line_hint: ''
      });
    }

    // 重复 require/import
    const importRe = /(?:require\(|import\s+.*from\s+)(['"])([^'"]+)\1/;
    const importMap = new Map();
    addedLines.forEach((line) => {
      const m = line.match(importRe);
      if (m) {
        const mod = m[2];
        importMap.set(mod, (importMap.get(mod) || 0) + 1);
      }
    });
    for (const [mod, count] of importMap) {
      if (count > 1) {
        issues.push({
          dimension: 'quality',
          description: `模块 ${mod} 被重复引入 ${count} 次`,
          suggestion: '合并引入语句，避免重复 import/require',
          line_hint: mod
        });
      }
    }

    // 大文件变更（超过 500 行）
    if (addedLines.length > 500) {
      issues.push({
        dimension: 'quality',
        description: `单次变更 ${addedLines.length} 行，变更量过大`,
        suggestion: '拆分为更小的原子提交，便于审查和回滚',
        line_hint: `+${addedLines.length} lines`
      });
    }

    // 计算评分：无问题 100，每个 issue 扣分
    const deductions = issues.reduce((sum, issue) => {
      if (issue.dimension === 'security') return sum + 15;
      if (issue.dimension === 'bug') return sum + 10;
      return sum + 5;
    }, 0);
    const overallScore = Math.max(0, 100 - deductions);

    // 确定严重度
    let severity = 'low';
    if (issues.some(i => i.dimension === 'security')) severity = 'high';
    else if (issues.some(i => i.dimension === 'bug')) severity = 'medium';

    return {
      id: `local-${Date.now()}`,
      summary: issues.length > 0
        ? `本地规则审查发现 ${issues.length} 个问题 (YAML规则: ${matchedRuleIds.length})`
        : '本地规则审查通过，未发现常见问题',
      severity,
      issues,
      overall_score: overallScore,
      rule_violations: matchedRuleIds,
      review_type: 'local'
    };
  }

  async writeSuggestion(sessionId, reviewResult, hookData, extra = {}) {
    const fileName = `review-${reviewResult.id}.json`;
    const filePath = path.join(SUGGESTIONS_DIR, fileName);

    const suggestion = {
      ...reviewResult,
      session_id: sessionId,
      hook_data: hookData,
      created_at: new Date().toISOString(),
      file_path: filePath,
      // 新增元数据：
      risk_level: reviewResult.risk_level,
      priority: reviewResult.priority,
      emotion: extra.emotion,
      action_type: extra.action_type,
      files_changed: extra.files_changed,
      patch_preview: extra.patch_preview,
      silent: extra.silent === true
    };

    await fsp.writeFile(filePath, JSON.stringify(suggestion, null, 2), 'utf-8');
    console.log(`[CodeReviewer] 建议已写入: ${filePath} priority=${suggestion.priority}`);
  }

  // 获取所有审查建议
  async getAllSuggestions() {
    let files;
    try {
      files = (await fsp.readdir(SUGGESTIONS_DIR)).filter(f => f.endsWith('.json'));
    } catch {
      return [];
    }
    const results = [];
    for (const f of files) {
      try {
        const content = await fsp.readFile(path.join(SUGGESTIONS_DIR, f), 'utf-8');
        results.push(JSON.parse(content));
      } catch {
        // skip unreadable files
      }
    }
    return results;
  }

  // 获取指定 session 的审查建议
  async getSuggestionsBySession(sessionId) {
    const all = await this.getAllSuggestions();
    return all.filter(s => s.session_id === sessionId);
  }
}

module.exports = { CodeReviewer };
