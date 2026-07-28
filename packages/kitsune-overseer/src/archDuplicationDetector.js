/**
 * 架构级重复检测器
 *
 * 纯静态分析，零 LLM 成本。通过提取模块"结构指纹"检测模块间的架构级重复。
 *
 * 检测维度（全部基于正则提取，不调用 LLM）：
 * 1. 方法签名重叠 — 两个模块实现了相似的方法名（_onEvent, _resetHourIfNeeded 等）
 * 2. 事件订阅重叠 — 两个模块订阅了相同的 bus 事件（supervisor.reaction 等）
 * 3. 依赖注入重叠 — 两个模块依赖了相同的外部服务（bus, taskPusher 等）
 * 4. 配置模式重叠 — 两个模块定义了相似的配置项（cooldownMs, maxActionsPerHour 等）
 *
 * 触发方式：
 * - 事件驱动：监听 watcher.code_changed，仅分析变更文件
 * - 增量分析：维护指纹缓存，避免重复解析
 *
 * 与 ProjectImprover._scanDuplicatedCode 的区别：
 * - 后者只检测同名函数（"processEvent" 出现在两个文件中）
 * - 本模块检测的是架构模式级别的重复（两个模块实现相同流程但用不同函数名）
 */

const fs = require('node:fs');
const path = require('node:path');

// 配置

const CONFIG = {
  // 相似度阈值（0-1，综合 4 个维度的加权平均）
  similarityThreshold: 0.5,
  // 最少重叠方法数（防止小文件误报）
  minOverlap: 3,
  // 忽略的目录
  ignoreDirs: [
    'node_modules', '.git', 'dist', 'build', '.trae', 'coverage',
    'test', 'tests', '__mocks__', 'vendor', 'venv',
    'references', '_archive', '__pycache__',
  ],
  // 忽略的文件
  ignoreExts: ['.json', '.lock', '.min.js', '.min.css', '.map', '.d.ts'],
  // 重叠结果的冷却期：同一对文件 10 分钟内不重复报告
  cooldownMs: 10 * 60_000,
  // 最大缓存指纹数
  maxCacheSize: 200,
};

// 提取规则

// 从 bus.subscribe('xxx', callback) 中提取事件名
const RE_BUS_SUBSCRIBE = /bus\.subscribe\(\s*['"`]([^'"`]+)['"`]/g;
// 从 class 内提取方法名
const RE_METHOD_DEF = /^\s*(?:async\s+)?(\w+)\s*\(/gm;
// 从 constructor 参数中提取依赖名
const RE_CONSTRUCTOR_DEP = /(\w+)\s*[=:]/g;
// 从配置对象中提取配置键名
const RE_CONFIG_KEY = /(\w+)\s*:\s*(?:\d+|['"`].*['"`]|\[)/g;

// 构造函数模式
const RE_CLASS_DEF = /class\s+(\w+)/;
const RE_CONSTRUCTOR = /constructor\s*\(/;

class ArchDuplicationDetector {
  constructor({ bus, projectDir, logger = console } = {}) {
    this.bus = bus;
    this.projectDir = projectDir || process.cwd();
    this.logger = logger;

    // 指纹缓存: Map<filePath, ModuleFingerprint>
    this.cache = new Map();
    // 报告冷却: Map<"fileA:fileB", timestamp>
    this.cooldownMap = new Map();
    // 最近检测结果
    this.recentResults = [];
    // 订阅的定时清理句柄
    this._cleanupTimer = null;
  }

  /**
   * 启动事件驱动检测
   * 监听 watcher.code_changed，仅在文件变更时分析
   */
  start() {
    if (!this.bus || typeof this.bus.subscribe !== 'function') {
      this.logger.warn?.('[ArchDuplicationDetector] 无可用事件总线，跳过事件驱动');
      return;
    }

    this.bus.subscribe('watcher.code_changed', (event) => {
      const files = event?.files || event?.data?.files || [];
      if (files.length > 0) {
        this._onFilesChanged(files);
      }
    });

    // 启动后预热缓存（扫描所有模块，但不报告结果）
    this._warmupCache();

    // 定期清理过期冷却记录
    this._cleanupTimer = setInterval(() => {
      this._cleanupCooldowns();
    }, 5 * 60_000);

    this.logger.log?.('[ArchDuplicationDetector] 已启动（事件驱动模式）');
  }

  stop() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
  }

  // 事件处理

  /**
   * 文件变更时触发增量分析
   * 只分析变更的文件 vs 缓存中的所有指纹
   */
  _onFilesChanged(changedFiles) {
    for (const file of changedFiles) {
      const fullPath = path.isAbsolute(file) ? file : path.resolve(this.projectDir, file);
      const ext = path.extname(fullPath);
      if (!ext.match(/\.(js|ts)$/)) continue;
      if (this._isIgnored(fullPath)) continue;

      // 重新提取该文件的指纹
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const fingerprint = this._extractFingerprint(content, fullPath);
        this.cache.set(fullPath, fingerprint);
      } catch {
        // 文件可能已删除
        this.cache.delete(fullPath);
        continue;
      }

      // 与缓存中所有其他指纹比较
      this._compareAll(fullPath);
    }
  }

  /**
   * 预热缓存 — 扫描项目目录，建立初始指纹库（不报告结果）
   */
  _warmupCache() {
    this._scanDir(this.projectDir, 0);
    this.logger.log?.(`[ArchDuplicationDetector] 缓存预热完成: ${this.cache.size} 个模块`);
  }

  _scanDir(dir, depth) {
    if (depth > 4) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (this._isIgnored(path.join(dir, entry.name))) continue;
          this._scanDir(path.join(dir, entry.name), depth + 1);
        } else if (entry.isFile() && entry.name.match(/\.(js|ts)$/)) {
          const filePath = path.join(dir, entry.name);
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            this.cache.set(filePath, this._extractFingerprint(content, filePath));
          } catch {}
        }
      }
    } catch {}
  }

  // 指纹提取

  /**
   * 从源码中提取模块结构指纹
   * 纯正则分析，零 LLM 成本
   */
  _extractFingerprint(content, filePath) {
    // 1. 方法名集合（class 内的方法定义）
    const methods = new Set();
    const classSections = this._extractClassSections(content);
    for (const section of classSections) {
      const matches = section.matchAll(RE_METHOD_DEF);
      for (const m of matches) {
        const name = m[1];
        // 只保留看起来像方法的（以 _ 开头或 camelCase）
        if (name.startsWith('_') || (name[0] === name[0].toLowerCase() && name.length > 2)) {
          methods.add(name);
        }
      }
    }

    // 2. 事件订阅集合
    const eventSubscriptions = new Set();
    const subMatches = content.matchAll(RE_BUS_SUBSCRIBE);
    for (const m of subMatches) {
      eventSubscriptions.add(m[1]);
    }

    // 3. 依赖注入集合（constructor 参数中的 key: value 模式）
    const dependencies = new Set();
    const constructorMatch = content.match(/constructor\s*\(\s*\{([^}]*)\}/);
    if (constructorMatch) {
      const deps = constructorMatch[1].matchAll(RE_CONSTRUCTOR_DEP);
      for (const d of deps) {
        const name = d[1].trim();
        if (name.length > 2) dependencies.add(name);
      }
    }

    // 4. 配置模式集合（类内或模块顶层的 CONFIG 对象键名）
    const configKeys = new Set();
    const configMatch = content.match(/(?:CONFIG|config|SCAN_CONFIG|RISK_LEVELS)\s*=\s*\{([\s\S]*?)\n\s*\}/);
    if (configMatch) {
      const keys = configMatch[1].matchAll(RE_CONFIG_KEY);
      for (const k of keys) {
        configKeys.add(k[1]);
      }
    }

    return {
      file: path.relative(this.projectDir, filePath),
      methods,
      eventSubscriptions,
      dependencies,
      configKeys,
      lineCount: content.split('\n').length,
    };
  }

  /**
   * 提取 class 定义段（方法定义所在的区域）
   */
  _extractClassSections(content) {
    const sections = [];
    const classMatches = content.matchAll(/class\s+\w+[^{]*\{([\s\S]*?)\n\}/g);
    for (const m of classMatches) {
      sections.push(m[1]);
    }
    // 如果没有 class，用整个文件（处理无 class 的模块）
    if (sections.length === 0) {
      sections.push(content);
    }
    return sections;
  }

  // 比较与报告

  /**
   * 将指定文件的指纹与缓存中所有其他指纹比较
   */
  _compareAll(targetPath) {
    const targetFp = this.cache.get(targetPath);
    if (!targetFp) return;

    const results = [];

    for (const [otherPath, otherFp] of this.cache) {
      if (otherPath === targetPath) continue;
      if (otherFp.lineCount < 100) continue; // 太短的文件跳过

      const similarity = this._calculateSimilarity(targetFp, otherFp);
      if (similarity.score >= CONFIG.similarityThreshold) {
        // 冷却期检查
        const pairKey = [targetPath, otherPath].sort().join(':');
        const lastReport = this.cooldownMap.get(pairKey) || 0;
        if (Date.now() - lastReport < CONFIG.cooldownMs) continue;
        this.cooldownMap.set(pairKey, Date.now());

        results.push({
          type: 'architectural_duplication',
          file: targetFp.file,
          file2: otherFp.file,
          similarity: similarity.score,
          overlappingMethods: [...similarity.overlapMethods],
          overlappingEvents: [...similarity.overlapEvents],
          overlappingDeps: [...similarity.overlapDeps],
          description: `架构级重复: 与 ${otherFp.file} 有 ${Math.round(similarity.score * 100)}% 结构相似度`,
          suggestion: this._generateSuggestion(targetFp, otherFp, similarity),
          impact: similarity.score >= 0.7 ? 2 : 1,
          cost: similarity.score >= 0.7 ? 2 : 1,
        });
      }
    }

    if (results.length > 0) {
      this.logger.log?.(
        `[ArchDuplicationDetector] 发现 ${results.length} 对架构重复:`,
        results.map(r => `${r.file} <-> ${r.file2} (${Math.round(r.similarity * 100)}%)`)
      );

      // 存储最近结果
      this.recentResults.push(...results);
      if (this.recentResults.length > 20) {
        this.recentResults = this.recentResults.slice(-20);
      }

      // 发布事件（供 UnifiedSmartRouter 等模块消费）
      if (this.bus && typeof this.bus.publish === 'function') {
        for (const result of results) {
          try {
            this.bus.publish('arch_duplication.detected', {
              source: 'arch_duplication_detector',
              emotion: 'error',
              activity: 'architectural_duplication',
              action: 'duplication_detected',
              message: result.description,
              data: result,
            });
          } catch {}
        }
      }
    }

    return results;
  }

  /**
   * 计算两个模块的结构相似度（加权 Jaccard 系数）
   *
   * 权重分配：
   * - 方法重叠: 0.4（核心指标，最能反映架构重复）
   * - 事件订阅重叠: 0.3（相同事件 = 相同职责范围）
   * - 依赖重叠: 0.2（相同依赖 = 相同能力需求）
   * - 配置重叠: 0.1（辅助指标）
   */
  _calculateSimilarity(fp1, fp2) {
    const overlapMethods = this._jaccard(fp1.methods, fp2.methods);
    const overlapEvents = this._jaccard(fp1.eventSubscriptions, fp2.eventSubscriptions);
    const overlapDeps = this._jaccard(fp1.dependencies, fp2.dependencies);
    const overlapConfig = this._jaccard(fp1.configKeys, fp2.configKeys);

    const score =
      overlapMethods.ratio * 0.4 +
      overlapEvents.ratio * 0.3 +
      overlapDeps.ratio * 0.2 +
      overlapConfig.ratio * 0.1;

    // 硬性门槛：至少 3 个重叠方法（防止小文件误报）
    if (overlapMethods.count < CONFIG.minOverlap) {
      return { score: 0, overlapMethods: new Set(), overlapEvents: new Set(), overlapDeps: new Set() };
    }

    return {
      score,
      overlapMethods: overlapMethods.intersect,
      overlapEvents: overlapEvents.intersect,
      overlapDeps: overlapDeps.intersect,
    };
  }

  /**
   * 集合的 Jaccard 相似度 + 交集
   */
  _jaccard(setA, setB) {
    const intersect = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);

    if (union.size === 0) {
      return { ratio: 0, count: 0, intersect: new Set() };
    }

    return {
      ratio: intersect.size / union.size,
      count: intersect.size,
      intersect,
    };
  }

  /**
   * 生成具体的重构建议
   */
  _generateSuggestion(fp1, fp2, similarity) {
    const shared = [...similarity.overlapMethods].filter(m => m.startsWith('_')).slice(0, 5);
    const events = [...similarity.overlapEvents];

    const parts = [
      `两个模块共享 ${similarity.overlapMethods.size} 个方法签名`,
    ];

    if (events.length > 0) {
      parts.push(`${events.length} 个相同的事件订阅(${events.slice(0, 3).join(', ')})`);
    }

    if (similarity.overlapDeps.size > 0) {
      parts.push(`${similarity.overlapDeps.size} 个相同依赖`);
    }

    if (shared.length > 0) {
      parts.push(`公共方法包括: ${shared.join(', ')}`);
    }

    return `考虑提取公共基类或合并模块。${parts.join('，')}。`;
  }

  // 工具方法

  _isIgnored(filePath) {
    const parts = filePath.split(/[/\\]/);
    return parts.some(p => CONFIG.ignoreDirs.includes(p));
  }

  _cleanupCooldowns() {
    const now = Date.now();
    for (const [key, timestamp] of this.cooldownMap) {
      if (now - timestamp > CONFIG.cooldownMs * 2) {
        this.cooldownMap.delete(key);
      }
    }
    // 同时清理过大的缓存
    if (this.cache.size > CONFIG.maxCacheSize) {
      const entries = [...this.cache.keys()];
      for (let i = 0; i < entries.length - CONFIG.maxCacheSize; i++) {
        this.cache.delete(entries[i]);
      }
    }
  }

  /**
   * 获取状态（供 API 查询）
   */
  getStatus() {
    return {
      cacheSize: this.cache.size,
      cooldownPairs: this.cooldownMap.size,
    };
  }

  /**
   * 获取最近的检测结果（供 API 查询）
   */
  getRecentResults(limit = 10) {
    return this.recentResults.slice(-limit).reverse();
  }
}

module.exports = { ArchDuplicationDetector };
