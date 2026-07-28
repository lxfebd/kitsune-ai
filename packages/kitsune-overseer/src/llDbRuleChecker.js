/**
 * C3: LL-DB 规则比对
 * 读取 ll-db/experience-db.md 中的通用规则
 * 在 hook 事件触发时，根据领域/语言自动匹配相关规则
 * 
 * 路径配置（基于真实目录结构）：
 * - 实际 LL-DB 文件: g:\agentpet\.agentpet\ll-db\experience-db.md
 * - __dirname: g:\agentpet\pet-agent\src\core\runtime\overseer\
 * - 向上6级 + .agentpet/ll-db/ = g:\agentpet\.agentpet\ll-db\
 */

const fs = require('fs');
const path = require('path');

// 修正路径：向上6级到 g:\agentpet\，然后 .agentpet/ll-db/
const LL_DB_PATH = path.resolve(__dirname, '../../../../../.agentpet/ll-db/experience-db.md');

// 规则与领域的映射
const RULE_DOMAIN_MAP = {
  'R-001': ['前端'],
  'R-002': ['前端'],
  'R-003': ['后端', '部署运维'],
  'R-004': ['AI推理'],
  'R-005': ['后端'],
  'R-006': ['部署运维'],
  'R-007': ['前端'],
  'R-008': ['后端']
};

// 规则与语言的映射
const RULE_LANGUAGE_MAP = {
  'R-001': ['TypeScript', 'JavaScript'],
  'R-002': ['JavaScript'],
  'R-003': ['Rust', 'JavaScript', 'Node.js'],
  'R-004': ['JavaScript', 'Python'],
  'R-005': ['JavaScript', 'Node.js'],
  'R-006': ['Shell'],
  'R-007': ['TypeScript', 'JavaScript'],
  'R-008': ['JavaScript', 'Node.js']
};

// Agent 与领域的映射
const AGENT_DOMAIN_MAP = {
  'claude-code': ['前端', '后端', 'AI推理'],
  'copilot': ['前端', '后端'],
  'codex': ['前端', '后端'],
  'gemini': ['前端', '后端', 'AI推理'],
  'trae': ['前端', '后端', '部署运维']
};

class LlDbRuleChecker {
  constructor({ bus }) {
    this.bus = bus;
    this.rules = [];
    this.alerts = [];

    // 限流配置：防止大量文件变更时刷屏
    this._ruleHitCooldown = new Map(); // key: `${ruleId}:${file}` → lastHitTs
    this._ruleHitCooldownMs = 120_000; // 同一规则+文件 2 分钟内不重复告警
    this._maxHitsPerBatch = 10;        // 单次 code_changed 事件最多发布 10 条

    this.init();
  }

  init() {
    // 加载规则
    this.loadRules();

    // 监听 hooks.state_updated 事件
    this.bus.subscribe('hooks.state_updated', (payload) => {
      this.handleStateUpdate(payload);
    });

    // 监听 watcher.code_changed 事件（CodeWatcher 发布的 git diff 变更事件）
    this.bus.subscribe('watcher.code_changed', (payload) => {
      this.handleCodeChange(payload);
    });

    console.log(`[LlDbRuleChecker] 已启动，加载了 ${this.rules.length} 条规则`);
  }

  loadRules() {
    if (!fs.existsSync(LL_DB_PATH)) {
      console.error('[LlDbRuleChecker] LL-DB 文件不存在:', LL_DB_PATH);
      return;
    }

    const content = fs.readFileSync(LL_DB_PATH, 'utf-8');

    // 解析通用规则表
    const ruleRegex = /\|\s*(R-\d{3})\s*\|\s*(.+?)\s*\|\s*(LL-\d{4}-\d{3})\s*\|/g;
    let match;

    while ((match = ruleRegex.exec(content)) !== null) {
      const ruleId = match[1];
      const ruleContent = match[2].trim();
      const source = match[3].trim();

      this.rules.push({
        id: ruleId,
        content: ruleContent,
        source,
        domains: RULE_DOMAIN_MAP[ruleId] || [],
        languages: RULE_LANGUAGE_MAP[ruleId] || []
      });
    }

    // 也解析 LL 记录中的规避检查
    const llRecordRegex = /###\s*(LL-\d{4}-\d{3})\s*\n([\s\S]*?)(?=###\s*LL-|\n---|\n##)/g;
    while ((match = llRecordRegex.exec(content)) !== null) {
      const llId = match[1];
      const body = match[2];

      // 提取规避检查
      const checkMatch = body.match(/\*\*规避检查\*\*:\s*[""](.+?)[""]/);
      if (checkMatch) {
        // 检查是否已有关联规则
        const hasRule = this.rules.some(r => r.source === llId);
        if (!hasRule) {
          this.rules.push({
            id: `derived-${llId}`,
            content: checkMatch[1],
            source: llId,
            domains: [],
            languages: [],
            isDerived: true
          });
        }
      }
    }
  }

  handleStateUpdate(payload) {
    const { session_id, state, data } = payload;

    // 只处理 tool_use 和 complete 事件
    if (state !== 'tool_use' && state !== 'complete') {
      return;
    }

    // 根据 agent 和工具名推断领域
    const agent = data?.agent || 'unknown';
    const toolName = data?.tool_name || '';
    const inferredDomain = this.inferDomain(agent, toolName);

    // 匹配相关规则
    const matchedRules = this.matchRules(inferredDomain, toolName);

    if (matchedRules.length > 0) {
      // 发布告警事件
      const alert = {
        id: `alert-${Date.now()}`,
        session_id,
        state,
        agent,
        tool_name: toolName,
        matched_rules: matchedRules.map(r => ({
          id: r.id,
          content: r.content,
          source: r.source
        })),
        timestamp: Date.now()
      };

      this.alerts.push(alert);

      // 发布到 EventBus
      this.bus.publish('overseer.alert', alert);

      // Notify user when rules are violated
      this.bus.publish('system.notification', {
        title: 'LL-DB Rule Violation',
        body: `${matchedRules.length} rule(s) matched: ${matchedRules.map(r => r.id).join(', ')}`,
        silent: false
      });

      console.log(`[LlDbRuleChecker] 命中 ${matchedRules.length} 条规则: ${matchedRules.map(r => r.id).join(', ')}`);
    }
  }

  handleCodeChange(payload) {
    const { files, patch } = payload;

    if (!files || files.length === 0) {
      return;
    }

    let publishedCount = 0;
    let skippedCount = 0;
    const now = Date.now();

    for (const file of files) {
      // 单批次上限，防止刷屏
      if (publishedCount >= this._maxHitsPerBatch) {
        skippedCount++;
        continue;
      }

      const domain = this.inferDomainFromPath(file);
      const language = this.inferLanguageFromPath(file);

      // 基于 LL-DB 规则匹配
      const matchedRules = this.matchRules(domain, language);
      for (const rule of matchedRules) {
        if (publishedCount >= this._maxHitsPerBatch) { skippedCount++; continue; }
        const hitKey = `${rule.id}:${file}`;
        const lastHit = this._ruleHitCooldown.get(hitKey);
        if (lastHit && (now - lastHit) < this._ruleHitCooldownMs) {
          skippedCount++;
          continue;
        }
        this._ruleHitCooldown.set(hitKey, now);
        this.bus.publish('overseer.rule_hit', {
          ruleId: rule.id,
          ruleContent: rule.content,
          domain,
          language,
          severity: rule.isDerived ? 'warning' : 'critical',
          file,
          context: `规则 ${rule.id} 命中：${rule.content}`,
          timestamp: now
        });
        publishedCount++;
      }

      // 基于 diff 内容做正则模式匹配
      if (patch) {
        const patternHits = this.matchPatternsInPatch(patch);
        for (const hit of patternHits) {
          if (publishedCount >= this._maxHitsPerBatch) { skippedCount++; continue; }
          const hitKey = `${hit.ruleId}:${file}`;
          const lastHit = this._ruleHitCooldown.get(hitKey);
          if (lastHit && (now - lastHit) < this._ruleHitCooldownMs) {
            skippedCount++;
            continue;
          }
          this._ruleHitCooldown.set(hitKey, now);
          this.bus.publish('overseer.rule_hit', {
            ruleId: hit.ruleId,
            ruleContent: hit.ruleContent,
            domain,
            language,
            severity: hit.severity,
            file,
            context: hit.context,
            timestamp: now
          });
          publishedCount++;
        }
      }
    }

    // 定期清理过期的冷却记录（保留最近 5 分钟）
    this._cleanupCooldownCache(now);

    if (skippedCount > 0) {
      console.log(`[LlDbRuleChecker] code_changed: 发布 ${publishedCount} 条，跳过 ${skippedCount} 条（限流/冷却）`);
    } else {
      console.log(`[LlDbRuleChecker] code_changed 处理完成，扫描 ${files.length} 个文件`);
    }
  }

  /**
   * 清理过期的冷却缓存
   */
  _cleanupCooldownCache(now) {
    const expireThreshold = now - this._ruleHitCooldownMs * 2;
    for (const [key, ts] of this._ruleHitCooldown) {
      if (ts < expireThreshold) {
        this._ruleHitCooldown.delete(key);
      }
    }
  }

  inferDomainFromPath(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    const domainMap = {
      '.vue': '前端',
      '.jsx': '前端',
      '.tsx': '前端',
      '.css': '前端',
      '.scss': '前端',
      '.less': '前端',
      '.html': '前端',
      '.py': '后端',
      '.sql': '数据库',
      '.c': '硬件',
      '.h': '硬件',
      '.cpp': '硬件',
      '.hpp': '硬件',
      '.rs': '后端',
      '.sh': '部署运维',
      '.yml': '部署运维',
      '.yaml': '部署运维',
      '.js': '前端',
      '.ts': '前端'
    };

    return domainMap[ext] || '后端';
  }

  inferLanguageFromPath(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    const languageMap = {
      '.vue': 'JavaScript',
      '.jsx': 'JavaScript',
      '.tsx': 'TypeScript',
      '.css': 'CSS',
      '.scss': 'SCSS',
      '.less': 'Less',
      '.html': 'HTML',
      '.py': 'Python',
      '.sql': 'SQL',
      '.c': 'C',
      '.h': 'C',
      '.cpp': 'C++',
      '.hpp': 'C++',
      '.rs': 'Rust',
      '.sh': 'Shell',
      '.yml': 'YAML',
      '.yaml': 'YAML',
      '.js': 'JavaScript',
      '.ts': 'TypeScript'
    };

    return languageMap[ext] || '未知';
  }

  matchPatternsInPatch(patch) {
    const patterns = [
      {
        ruleId: 'pattern-hardcoded-secret',
        ruleContent: '禁止硬编码密钥/密码/Token',
        regex: /(?:password|secret|api_key|apiKey|token)\s*[:=]\s*['"][^'"]+/i,
        severity: 'critical'
      },
      {
        ruleId: 'pattern-empty-catch',
        ruleContent: '禁止空 catch 块，必须处理异常',
        regex: /catch\s*\([^)]*\)\s*\{\s*\}/,
        severity: 'warning'
      },
      {
        ruleId: 'pattern-console-log',
        ruleContent: '禁止残留 console.log/debug/info 调试代码',
        regex: /console\.(log|debug|info)\(/,
        severity: 'warning'
      },
      {
        ruleId: 'pattern-todo-fixme',
        ruleContent: '代码中存在 TODO/FIXME/HACK/XXX 标记，需后续处理',
        regex: /\/\/\s*(TODO|FIXME|HACK|XXX)/i,
        severity: 'warning'
      }
    ];

    const hits = [];

    for (const pattern of patterns) {
      const match = pattern.regex.exec(patch);
      if (match) {
        hits.push({
          ruleId: pattern.ruleId,
          ruleContent: pattern.ruleContent,
          severity: pattern.severity,
          context: match[0]
        });
      }
    }

    return hits;
  }

  inferDomain(agent, toolName) {
    const agentDomains = AGENT_DOMAIN_MAP[agent] || ['前端', '后端'];

    // 根据工具名进一步推断
    const toolLower = toolName.toLowerCase();
    if (toolLower.includes('live2d') || toolLower.includes('pixi')) {
      return '前端';
    }
    if (toolLower.includes('react') || toolLower.includes('hook')) {
      return '后端';
    }
    if (toolLower.includes('tts') || toolLower.includes('voice')) {
      return 'AI推理';
    }

    return agentDomains[0] || '前端';
  }

  matchRules(domain, toolName) {
    return this.rules.filter(rule => {
      // 检查领域匹配
      if (rule.domains.length > 0 && !rule.domains.includes(domain)) {
        return false;
      }

      // 检查语言匹配（如果工具名暗示特定语言）
      if (rule.languages.length > 0 && toolName) {
        const toolLower = toolName.toLowerCase();
        const languageHints = {
          'rust': ['Rust'],
          'tauri': ['Rust', 'TypeScript'],
          'vue': ['TypeScript', 'JavaScript'],
          'react': ['TypeScript', 'JavaScript'],
          'electron': ['JavaScript', 'Node.js'],
          'python': ['Python']
        };

        for (const [hint, languages] of Object.entries(languageHints)) {
          if (toolLower.includes(hint)) {
            return rule.languages.some(lang => languages.includes(lang));
          }
        }
      }

      return true;
    });
  }

  getAllAlerts() {
    return this.alerts;
  }

  getAlertsBySession(sessionId) {
    return this.alerts.filter(a => a.session_id === sessionId);
  }

  getAlertsByRule(ruleId) {
    return this.alerts.filter(a =>
      a.matched_rules.some(r => r.id === ruleId)
    );
  }

  getRules() {
    return this.rules;
  }
}

module.exports = { LlDbRuleChecker };
