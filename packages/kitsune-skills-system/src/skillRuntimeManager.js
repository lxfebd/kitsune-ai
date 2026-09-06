const { SkillConfigStore } = require('./skillConfigStore');
const { loadSkills, resolveSkillRoots } = require('./skillLoader');
const { filterEligibleSkills } = require('./skillEligibility');
const { SkillSelector } = require('./skillSelector');
const { clipSkillsForPrompt } = require('./skillPromptBudgeter');
const { getRuntimePaths } = require('./runtimePaths');
const { SkillWatcher } = require('./skillWatcher');
const { SkillSnapshotStore } = require('./skillSnapshotStore');
const { SkillTelemetry } = require('./skillTelemetry');

function extractExplicitSkillsFromInput(input, skills) {
  const raw = String(input || '');
  if (!raw.trim()) return [];

  const lower = raw.toLowerCase();
  const byName = new Map((skills || []).map((s) => [String(s.name || '').toLowerCase(), s.name]));
  const explicit = new Set();

  const markerRegex = /\$([a-zA-Z0-9._-]+)/g;
  let match = markerRegex.exec(raw);
  while (match) {
    const token = String(match[1] || '').toLowerCase();
    const skillName = byName.get(token);
    if (skillName) explicit.add(skillName);
    match = markerRegex.exec(raw);
  }

  const mentionRegex = /(?:使用|用|invoke|use)\s+([a-zA-Z0-9._-]+)/gi;
  match = mentionRegex.exec(raw);
  while (match) {
    const token = String(match[1] || '').toLowerCase();
    const skillName = byName.get(token);
    if (skillName) explicit.add(skillName);
    match = mentionRegex.exec(raw);
  }

  for (const [normalizedName, originalName] of byName.entries()) {
    if (normalizedName && lower.includes(normalizedName)) {
      explicit.add(originalName);
    }
  }

  return Array.from(explicit);
}

function isSkillDiscoveryQuery(input) {
  const text = String(input || '').trim().toLowerCase();
  if (!text) return false;
  return /(?:\bskills?\b|available\s+skills?|你有什么技能|有哪些技能|有什么技能|你会什么|能力列表|可用技能)/i.test(text);
}

class SkillRuntimeManager {
  constructor({ workspaceDir, configStore, selector, snapshotStore, telemetry } = {}) {
    this.workspaceDir = workspaceDir || process.cwd();
    this.configStore = configStore || new SkillConfigStore();
    this.selector = selector || new SkillSelector();
    this.snapshotStore = snapshotStore || new SkillSnapshotStore();

    // 同步读取默认配置（避免启动时序问题）
    const cfg = this._loadSync();
    const runtimePaths = getRuntimePaths({
      envKey: cfg.home.envKey,
      defaultPath: cfg.home.defaultPath
    });

    this.telemetry = telemetry || new SkillTelemetry({ logsDir: runtimePaths.logsDir });
    this.watcher = null;

    if (cfg.load.watch) {
      const roots = resolveSkillRoots({ workspaceDir: this.workspaceDir, config: cfg }).map((r) => r.dir);
      this.watcher = new SkillWatcher({
        roots,
        debounceMs: cfg.load.watchDebounceMs,
        onChange: ({ changedPath, reason }) => {
          const bumped = this.snapshotStore.bump(reason);
          this.telemetry.write({ event: 'skills.bump', changedPath, ...bumped });
        }
      });
      this.watcher.start();
    }
  }

  /**
   * 同步加载配置（启动时使用，避免异步时序问题）
   */
  _loadSync() {
    const fs = require('node:fs');
    const YAML = require('yaml');
    const path = require('node:path');

    try {
      const raw = fs.readFileSync(this.configStore.configPath, 'utf8');
      const parsed = YAML.parse(raw);
      // 简化版 normalize，只取必需字段
      return {
        version: parsed.version || 1,
        home: {
          envKey: parsed.home?.envKey || 'YACHIYO_HOME',
          defaultPath: parsed.home?.defaultPath || '~/yachiyo'
        },
        load: {
          workspace: parsed.load?.workspace !== false,
          global: parsed.load?.global !== false,
          extraDirs: (parsed.load?.extraDirs || []).map((v) => String(v).trim()).filter(Boolean),
          watch: parsed.load?.watch !== false,
          watchDebounceMs: Math.max(0, Number(parsed.load?.watchDebounceMs) || 250)
        },
        limits: parsed.limits || {},
        trigger: parsed.trigger || {},
        entries: parsed.entries || {}
      };
    } catch {
      // 配置文件不存在时返回默认值
      return {
        version: 1,
        home: { envKey: 'YACHIYO_HOME', defaultPath: '~/yachiyo' },
        load: { workspace: true, global: true, extraDirs: [], watch: true, watchDebounceMs: 250 },
        limits: {},
        trigger: {},
        entries: {}
      };
    }
  }

  stop() {
    this.watcher?.stop();
  }

  /**
   * 列出所有已加载的技能（供 API 使用）
   * 返回技能列表，包含启用状态
   */
  async listAllSkills() {
    const config = await this.configStore.load();
    const loaded = await loadSkills({ workspaceDir: this.workspaceDir, config });
    const entries = config.entries || {};

    return loaded.map((skill) => {
      const entry = entries[skill.name] || {};
      return {
        id: skill.name,
        name: skill.name,
        description: skill.description || '',
        category: skill.frontmatter?.category || '',
        keywords: skill.keywords || [],
        aliases: skill.aliases || [],
        source: skill.source || 'unknown',
        enabled: entry.enabled !== false,
        triggerMode: entry.triggerMode || null
      };
    });
  }

  async buildTurnContext({ sessionId = 'default', input }) {
    const config = await this.configStore.load();
    const cached = this.snapshotStore.get(sessionId);
    if (cached && cached.version === this.snapshotStore.getVersion() && cached.input === input) {
      return cached;
    }

    const loaded = await loadSkills({ workspaceDir: this.workspaceDir, config });
    const { accepted, dropped } = filterEligibleSkills({ skills: loaded, config });
    const explicitSkills = extractExplicitSkillsFromInput(input, accepted);
    const discoveryMode = isSkillDiscoveryQuery(input);
    const selectedResult = this.selector.select({
      skills: accepted,
      input,
      triggerConfig: {
        ...config.trigger,
        entries: config.entries,
        rules: config.trigger?.rules || {},
        explicitSkills
      }
    });

    const promptResult = clipSkillsForPrompt(
      discoveryMode ? accepted : selectedResult.selected,
      config.limits || {}
    );

    const context = {
      prompt: promptResult.prompt,
      selected: promptResult.selected.map((s) => s.name),
      dropped: discoveryMode ? dropped : [...dropped, ...selectedResult.dropped],
      clippedBy: promptResult.clippedBy,
      input
    };

    this.snapshotStore.set(sessionId, context);
    this.telemetry.write({
      event: 'skills.turn',
      sessionId,
      selected: context.selected,
      droppedCount: context.dropped.length,
      clippedBy: context.clippedBy
    });

    return context;
  }
}

module.exports = { SkillRuntimeManager };
