import { exec } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

/**
 * 代码风格分析结果。
 *
 * @param commitStyle commit 消息风格
 * @param indentStyle 缩进风格
 * @param namingStyle 命名风格（从项目文件名推断）
 * @param summary 人类可读的风格摘要，直接注入 planGenerator 的 prompt
 */
export interface CodeStyleProfile {
  commitStyle: 'conventional' | 'freeform' | 'prefixed'
  indentStyle: 'tab' | 'space' | 'unknown'
  namingStyle: 'camelCase' | 'snake_case' | 'kebab-case' | 'unknown'
  summary: string
}

// 模块级缓存，避免每次 generatePlan 都执行 git 命令
let cachedProfile: CodeStyleProfile | null = null
const CACHE_TTL = 5 * 60 * 1000 // 5 分钟
let cachedAt = 0

/**
 * 分析项目的代码风格特征。
 *
 * 分析方法：
 * 1. 读取最近 20 条 git commit 消息，检测 conventional commit 前缀（feat:/fix: 等）
 * 2. 读取 .editorconfig 检测缩进风格
 * 3. 从 src/ 目录的文件名推断命名风格
 *
 * 结果带 5 分钟缓存，避免频繁执行 git 命令。
 */
export async function analyzeCodeStyle(projectRoot: string): Promise<CodeStyleProfile> {
  // 缓存命中
  if (cachedProfile && Date.now() - cachedAt < CACHE_TTL) {
    return cachedProfile
  }

  const [commitStyle, indentStyle, namingStyle] = await Promise.all([
    detectCommitStyle(projectRoot),
    detectIndentStyle(projectRoot),
    detectNamingStyle(projectRoot),
  ])

  const summary = [
    `Commit 风格: ${commitStyle}`,
    `缩进风格: ${indentStyle}`,
    `命名风格: ${namingStyle}`,
  ].join('; ')

  const profile: CodeStyleProfile = {
    commitStyle,
    indentStyle,
    namingStyle,
    summary,
  }

  cachedProfile = profile
  cachedAt = Date.now()

  return profile
}

/** 清除缓存（测试用） */
export function clearCodeStyleCache(): void {
  cachedProfile = null
  cachedAt = 0
}

/** 检测 git commit 消息风格 */
async function detectCommitStyle(projectRoot: string): Promise<'conventional' | 'freeform' | 'prefixed'> {
  try {
    const { stdout } = await execAsync('git log --oneline -20', { cwd: projectRoot })
    const lines = stdout.trim().split('\n').filter(Boolean)
    if (lines.length === 0) return 'freeform'

    // conventional commit: feat:/fix:/chore:/docs:/refactor: 等
    const conventionalCount = lines.filter(line =>
      /^\w+\s+(feat|fix|chore|docs|refactor|style|test|perf|build|ci|revert)\(?.*\)?:/.test(line),
    ).length

    // 带 prefix 但非 conventional: [模块] xxx / (模块) xxx
    const prefixedCount = lines.filter(line =>
      /^\w+\s+[[(]/.test(line),
    ).length

    if (conventionalCount >= lines.length * 0.5) return 'conventional'
    if (prefixedCount >= lines.length * 0.5) return 'prefixed'
    return 'freeform'
  }
  catch {
    return 'freeform'
  }
}

/** 检测缩进风格 — 读 .editorconfig */
async function detectIndentStyle(projectRoot: string): Promise<'tab' | 'space' | 'unknown'> {
  try {
    const content = await readFile(join(projectRoot, '.editorconfig'), 'utf8')
    if (/indent_style\s*=\s*tab/i.test(content)) return 'tab'
    if (/indent_style\s*=\s*space/i.test(content)) return 'space'
    return 'unknown'
  }
  catch {
    // .editorconfig 不存在时尝试 eslint.config.js
    try {
      const eslintContent = await readFile(join(projectRoot, 'eslint.config.js'), 'utf8')
      if (/indent.*tab|useTabs.*true/i.test(eslintContent)) return 'tab'
      if (/indent.*\d|useTabs.*false/i.test(eslintContent)) return 'space'
      return 'unknown'
    }
    catch {
      return 'unknown'
    }
  }
}

/** 检测命名风格 — 从 src/ 目录文件名推断 */
async function detectNamingStyle(projectRoot: string): Promise<'camelCase' | 'snake_case' | 'kebab-case' | 'unknown'> {
  try {
    const { stdout } = await execAsync(
      'ls -1 src/ 2>/dev/null || dir /b src\\ 2>nul',
      { cwd: projectRoot },
    )
    const files = stdout.trim().split('\n').filter(Boolean)
    if (files.length === 0) return 'unknown'

    let camel = 0; let snake = 0; let kebab = 0
    for (const f of files) {
      if (/^[a-z][a-zA-Z0-9]*\.(ts|js|vue)$/.test(f)) camel++
      if (/^[a-z][a-z0-9]*_[a-z0-9_]*\.(ts|js|vue)$/.test(f)) snake++
      if (/^[a-z][a-z0-9]*-[a-z0-9-]*\.(ts|js|vue)$/.test(f)) kebab++
    }

    if (camel > snake && camel > kebab) return 'camelCase'
    if (snake > camel && snake > kebab) return 'snake_case'
    if (kebab > camel && kebab > snake) return 'kebab-case'
    return 'unknown'
  }
  catch {
    return 'unknown'
  }
}