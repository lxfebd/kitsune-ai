/**
 * dsh 会话可见性 — 扫 DSH_HOME 下全部会话并提取真实工作记录摘要。
 *
 * 背景：dsh（DeepSeek Harness）headless 派活时每收一次指令就在
 * DSH_HOME/sessions/<project>/session-<uuid>/ 落一个会话目录，但用户看不到这些
 * 会话，「dsh 上没有新建任务 / 看不到 dsh 在工作」。
 *
 * ── dsh 的真实落盘结构（本模块依据实测结论）──
 * 1. sessions/<project>/session-<uuid>/session.v3.jsonl.zstd — 事件流日志壳：
 *    实测 headless 一次问答后该文件通常只有 1 行 header（type: session），消息
 *    事件并不写进这里；因此不能用它判断「有没有过工作」。
 * 2. storages/session_projcache/sessions/<uuid>.json — 会话投影缓存：每个会话
 *    都有记录的 rows（title/titleInput/tokenUsage/plan/goal…）与 identity
 *    （createdAt/cwd），实测 95/96 会话在这里留下了真实工作痕迹（标题、token
 *    用量、事件 seq>0）。这才是「dsh 干没干活」的可靠证据源。
 *
 * 本模块把两个源合并：projcache 记录为主（title/createdAt/cwd/messageCount），
 * jsonl 壳做降级补充（某些旧版会话只有 jsonl）。messageCount > 1（projcache
 * seq 有业务事件）=> content=true。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

import type { DshSessionSummary } from '../../../../shared/eventa'

/** 预览截断长度 — 面板展示最近消息的一小段即可 */
const PREVIEW_MAX = 200

function stripProject(dir: string): string {
  // sessions 下目录名形如 --J-xiangm_transfer-pet--，去掉首尾 '--' 还原项目路径
  return dir.replace(/^--/, '').replace(/--$/, '')
}

/** projcache 记录的 rows 里可用的业务字段（缺省时逐层兜底） */
interface ProjCacheRecord {
  identity?: { createdAt?: number, cwd?: string }
  rows?: Record<string, {
    seq?: number
    val?: unknown
  }>
}

/** 解包 projcache 的 rows 下某 key 的 val（JSON 结构不可靠时安全返回 undefined） */
function rowVal(record: ProjCacheRecord, key: string): unknown {
  return record.rows?.[key]?.val
}

/** 从 projcache 记录读取会话摘要；文件缺失/损坏返回 null */
export function summarizeProjCache(file: string): Omit<DshSessionSummary, 'project'> | null {
  try {
    const st = statSync(file)
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { version?: number, record?: ProjCacheRecord }
    const record = raw.record
    if (!record)
      return null

    const createdAt = record.identity?.createdAt ?? Math.floor(st.mtimeMs)
    const cwd = record.identity?.cwd

    // title：rows.title.val（字符串）；降级取 titleInput.first.text（首条用户指令）
    let title: unknown = rowVal(record, 'title')
    if (typeof title !== 'string' || !title.trim()) {
      const input = rowVal(record, 'titleInput') as { first?: { text?: string } } | undefined
      title = typeof input?.first?.text === 'string' ? input.first.text : undefined
    }
    const titleText = typeof title === 'string' ? title.trim() : ''

    // messageCount：rows 里业务事件的最大 seq（title/titleInput 都会产生 seq>8 的
    // 事件；只有空壳会话（从未真正对话）才为 0）
    let maxSeq = 0
    for (const v of Object.values(record.rows ?? {})) {
      if (typeof v?.seq === 'number' && v.seq > maxSeq)
        maxSeq = v.seq
    }

    return {
      id: '',
      createdAt,
      cwd,
      title: titleText,
      messageCount: maxSeq,
      lastPreview: titleText.slice(0, PREVIEW_MAX),
      content: maxSeq > 0,
      modifiedAt: st.mtimeMs,
      sizeBytes: st.size,
      source: 'projcache',
    }
  }
  catch {
    return null
  }
}

/** 解压单个 jsonl 会话壳并提取摘要（降级源）；解压失败/损坏返回 null */
export function summarizeSessionFile(file: string): Omit<DshSessionSummary, 'project'> | null {
  try {
    const st = statSync(file)
    const out = zstdDecompressSync(readFileSync(file))
    const text = out.toString('utf8')
    const lines = text.split('\n').filter(l => l.trim())
    let createdAt = 0
    let cwd: string | undefined
    // 首行 header（type: session）带 id/createdAt/cwd；缺 header 时按内容行计数
    let isHeader = false
    try {
      const header = JSON.parse(lines[0] ?? '{}') as { type?: string, createdAt?: number, cwd?: string }
      if (header.type === 'session') {
        isHeader = true
        createdAt = header.createdAt ?? Math.floor(st.mtimeMs)
        cwd = header.cwd
      }
    }
    catch {
      // header 解析失败不影响摘要
    }
    return {
      id: '',
      createdAt,
      cwd,
      messageCount: lines.length - (isHeader ? 1 : 0),
      content: lines.length > (isHeader ? 1 : 0),
      modifiedAt: st.mtimeMs,
      sizeBytes: st.size,
      source: 'jsonl',
    }
  }
  catch {
    return null
  }
}

/**
 * 扫描 DSH_HOME 下全部会话，按 modifiedAt 降序。
 *
 * 对每个会话目录（sessions/<project>/session-<uuid>/）：
 * 1. 优先读 projcache 投影（真实工作记录源）— 命中则用它的 title/seq
 * 2. 未命中时降级解压 jsonl 壳（老版本 dsh 无 projcache）
 * 会话目录本身无任何可读文件（既无 projcache 也无 jsonl）→ 跳过。
 */
export function scanDshSessions(dshHome: string): { sessions: DshSessionSummary[], root: string } {
  const root = join(dshHome, 'sessions')
  const projCacheRoot = join(dshHome, 'storages', 'session_projcache', 'sessions')
  const sessions: DshSessionSummary[] = []
  const projectDirs = safeReaddir(root)
  for (const projectDir of projectDirs) {
    const dir = join(root, projectDir)
    if (!isDir(dir))
      continue
    for (const sessionId of safeReaddir(dir)) {
      const sessionDir = join(dir, sessionId)
      if (!isDir(sessionDir))
        continue
      // 1. projcache 真实记录（主源）
      const proj = summarizeProjCache(join(projCacheRoot, `${sessionId}.json`))
      if (proj) {
        sessions.push({ ...proj, id: sessionId, project: stripProject(projectDir) })
        continue
      }
      // 2. jsonl 事件壳（降级源：v1/v2 旧格式只写 jsonl）
      for (const f of safeReaddir(sessionDir)) {
        if (!f.endsWith('.zstd'))
          continue
        const summary = summarizeSessionFile(join(sessionDir, f))
        if (summary) {
          sessions.push({ ...summary, id: sessionId, project: stripProject(projectDir) })
          break
        }
      }
    }
  }
  sessions.sort((a, b) => b.modifiedAt - a.modifiedAt)
  return { sessions, root }
}

/** 安全读目录：不存在/不可读返回空数组 */
function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir)
  }
  catch {
    return []
  }
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory()
  }
  catch {
    return false
  }
}

/** projcache 文件存在性辅助（导出供测试断言路径逻辑） */
export function projCacheFileExists(dshHome: string, sessionId: string): boolean {
  return existsSync(join(dshHome, 'storages', 'session_projcache', 'sessions', `${sessionId}.json`))
}