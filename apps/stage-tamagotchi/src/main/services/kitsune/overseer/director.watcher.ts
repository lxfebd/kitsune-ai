/**
 * 总监模式目录监听 — 对 .kitsune/plans/plans/ 下的新计划自动评审。
 *
 * 外部 AI 工具把计划写为 <plans>/plans/<id>.json（PLAN 文件）后：
 *   1. 本模块用 fs.watch 监听该目录（低频、可靠性优先，watch 失败退化为轮询）
 *   2. 新出现的 .json → 调 director 的 reviewNewPlanFile
 *     - IR 校验失败 / 已评审过（verdict 已存在）→ 跳过
 *     - 通过 → 调 LLM 生成 review markdown + verdict JSON
 *   3. 评审结论落盘后，外部工具（或人）可读 verdict 决定放行或修订
 *
 * 注意：fs.watch 在部分平台对"重命名/新文件"可能不触发 change，
 * 因此同时做轻量轮询兜底（re-scan 新文件集合）。
 */

import { existsSync, readdirSync, statSync, watch, type FSWatcher } from 'node:fs'
import { join } from 'node:path'

import { useLogg } from '@guiiai/logg'
import { PLANS_DIR, reviewNewPlanFile } from './director'

const log = useLogg('director-watcher').useGlobalConfig()

const RESCAN_INTERVAL_MS = 15_000

export interface DirectorWatcher {
  start(): void
  stop(): void
}

export function createDirectorWatcher(): DirectorWatcher {
  let watcher: FSWatcher | null = null
  let rescanTimer: NodeJS.Timeout | null = null
  let isRunning = false

  // 已见过的文件集合（mtime 快照），避免重复评审
  const seen = new Map<string, number>()

  function scanOnce(): void {
    try {
      if (!existsSync(PLANS_DIR)) return
      const files = readdirSync(PLANS_DIR).filter((f) => f.endsWith('.json'))
      for (const f of files) {
        const full = join(PLANS_DIR, f)
        try {
          const mtime = statSync(full).mtimeMs
          if (seen.has(full) && seen.get(full) === mtime)
            continue // 已看过的相同文件，跳过
          // 首次见（或 mtime 变化）→ 评审；之后记录快照
          seen.set(full, mtime)
          reviewNewPlanFile(full).then((r) => {
            if (!r.ok && !r.skipped)
              log.warn('plan review failed', { file: full, error: r.error })
            else if (r.skipped)
              log.debug('plan already reviewed, skip', { file: full })
          })
        } catch {
          /* 单文件 stat/校验失败不阻塞整个目录 */
        }
      }
    } catch {
      /* 目录不可读则跳过本轮 */
    }
  }

  function start(): void {
    if (isRunning) return
    isRunning = true
    log.log('director watcher started', { dir: PLANS_DIR })

    if (existsSync(PLANS_DIR)) {
      try {
        watcher = watch(PLANS_DIR, (_eventType, filename) => {
          if (!filename || !String(filename).endsWith('.json'))
            return
          scanOnce()
        })
        watcher.on('error', (err) => {
          log.warn('fs.watch error, falling back to polling', { error: err.message })
          try { watcher?.close() } catch {}
          watcher = null
        })
      } catch {
        watcher = null
      }
    }

    // 轻量轮询兜底：fs.watch 丢事件 / 目录初始扫描
    rescanTimer = setInterval(() => {
      if (!isRunning) return
      scanOnce()
    }, RESCAN_INTERVAL_MS)
    scanOnce()
  }

  function stop(): void {
    isRunning = false
    try { watcher?.close() } catch {}
    watcher = null
    if (rescanTimer) { clearInterval(rescanTimer); rescanTimer = null }
    log.log('director watcher stopped')
  }

  return { start, stop }
}