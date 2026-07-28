const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { getRuntimePaths } = require('./runtimePaths');
const { parseFrontmatter } = require('./frontmatter');

async function listSkillDirs(rootDir, maxCandidates = 300) {
  if (!rootDir) return [];
  try {
    await fsp.access(rootDir);
  } catch {
    return [];
  }
  const entries = await fsp.readdir(rootDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .slice(0, Math.max(1, maxCandidates))
    .map((e) => path.join(rootDir, e.name));
}

async function readSkillFromDir(dirPath, source, maxSkillFileBytes = 262144) {
  const skillPath = path.join(dirPath, 'SKILL.md');
  try {
    const st = await fsp.stat(skillPath);
    if (st.size > maxSkillFileBytes) return null;
  } catch {
    return null;
  }

  const raw = await fsp.readFile(skillPath, 'utf8');
  const fm = parseFrontmatter(raw);
  const name = String(fm.name || path.basename(dirPath)).trim();
  const description = String(fm.description || '').trim();
  const keywords = String(fm.keywords || fm.trigger_keywords || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  const aliases = String(fm.aliases || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  return {
    name,
    description,
    keywords,
    aliases,
    source,
    filePath: skillPath,
    baseDir: dirPath,
    frontmatter: fm
  };
}

function resolveSkillRoots({ workspaceDir, config }) {
  const roots = [];
  const runtimePaths = getRuntimePaths({
    envKey: config.home.envKey,
    defaultPath: config.home.defaultPath
  });

  for (const extra of config.load.extraDirs || []) {
    roots.push({ dir: path.resolve(extra), source: 'extra' });
  }

  if (config.load.global) {
    roots.push({ dir: runtimePaths.skillsDir, source: 'yachiyo-global' });
  }

  if (config.load.workspace !== false && workspaceDir) {
    roots.push({ dir: path.resolve(workspaceDir, 'skills'), source: 'workspace' });
  }

  return roots;
}

async function loadSkills({ workspaceDir, config }) {
  const roots = resolveSkillRoots({ workspaceDir, config });
  const limits = config.limits || {};
  const maxCandidatesPerRoot = Number(limits.maxCandidatesPerRoot || 300);
  const maxSkillsLoadedPerSource = Number(limits.maxSkillsLoadedPerSource || 200);
  const maxSkillFileBytes = Number(limits.maxSkillFileBytes || 262144);

  const merged = new Map();
  for (const root of roots) {
    const dirs = await listSkillDirs(root.dir, maxCandidatesPerRoot);
    let loadedCount = 0;
    for (const dirPath of dirs) {
      if (loadedCount >= maxSkillsLoadedPerSource) break;
      try {
        const skill = await readSkillFromDir(dirPath, root.source, maxSkillFileBytes);
        if (!skill) continue;
        merged.set(skill.name, skill);
        loadedCount += 1;
      } catch {
        // skip malformed skills
      }
    }
  }

  return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = {
  parseFrontmatter,
  listSkillDirs,
  readSkillFromDir,
  resolveSkillRoots,
  loadSkills
};
