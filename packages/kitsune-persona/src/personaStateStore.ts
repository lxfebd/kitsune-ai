import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { PersonaSessionState } from './types'

/** 会话状态存储 */
export class PersonaStateStore {
  private stateBySession = new Map<string, PersonaSessionState>()
  private filePath: string
  private loaded = false

  constructor(options?: { filePath?: string }) {
    this.filePath = options?.filePath
      || process.env.PERSONA_STATE_STORE_PATH
      || require('path').join(process.cwd(), 'data', 'persona-state.json')
  }

  /** 从磁盘加载持久化状态 */
  async init(): Promise<void> {
    if (this.loaded) return
    try {
      await mkdir(dirname(this.filePath), { recursive: true })
      const raw = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [key, value] of Object.entries(parsed)) {
          if (value && typeof value === 'object') {
            this.stateBySession.set(key, value as PersonaSessionState)
          }
        }
      }
    }
    catch {
      // 文件缺失或损坏时从空状态开始
    }
    this.loaded = true
  }

  get(sessionId: string): PersonaSessionState | null {
    return this.stateBySession.get(String(sessionId)) ?? null
  }

  set(sessionId: string, patch: Partial<PersonaSessionState> = {}): PersonaSessionState {
    const key = String(sessionId)
    const current = this.stateBySession.get(key) ?? {}
    const next: PersonaSessionState = {
      ...current,
      ...patch,
      updated_at: new Date().toISOString(),
    }
    this.stateBySession.set(key, next)
    this.persist()
    return next
  }

  clear(sessionId: string): void {
    this.stateBySession.delete(String(sessionId))
    this.persist()
  }

  private persist(): void {
    const data = Object.fromEntries(this.stateBySession)
    const tempPath = `${this.filePath}.tmp-${process.pid}-${Date.now()}`
    writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8')
      .then(() => rename(tempPath, this.filePath))
      .catch(err => console.error('[PersonaStateStore] persist failed:', err?.message || err))
  }
}
