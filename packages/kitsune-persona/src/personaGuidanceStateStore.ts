import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { PersonaProfile } from './types'

interface GuidanceState {
  lastPromptForCustomNameAt?: number
}

async function readJsonSafe(filePath: string): Promise<GuidanceState> {
  try {
    const raw = await readFile(filePath, 'utf8')
    return JSON.parse(raw)
  }
  catch {
    return {}
  }
}

/** 引导状态存储 */
export class PersonaGuidanceStateStore {
  private statePath: string

  constructor(options?: { statePath?: string }) {
    this.statePath = options?.statePath
      || process.env.PERSONA_STATE_PATH
      || require('path').join(process.cwd(), 'persona', 'state.json')
  }

  private async ensureDir(): Promise<void> {
    await mkdir(dirname(this.statePath), { recursive: true })
  }

  async load(): Promise<GuidanceState> {
    await this.ensureDir()
    return readJsonSafe(this.statePath)
  }

  async save(next: GuidanceState): Promise<GuidanceState> {
    await this.ensureDir()
    await writeFile(this.statePath, JSON.stringify(next, null, 2), 'utf8')
    return next
  }

  async shouldPromptForCustomName(options?: { profile?: PersonaProfile; now?: number }): Promise<boolean> {
    const profile = options?.profile
    const now = options?.now ?? Date.now()

    const customName = String(profile?.addressing?.custom_name || '').trim()
    if (customName) return false
    if (!profile?.guidance?.prompt_if_missing_name) return false

    const state = await this.load()
    const last = Number(state.lastPromptForCustomNameAt || 0)
    const cooldownHours = Math.max(1, Number(profile?.guidance?.remind_cooldown_hours) || 24)
    const cooldownMs = cooldownHours * 60 * 60 * 1000

    return (now - last) >= cooldownMs
  }

  async markPrompted(options?: { now?: number }): Promise<GuidanceState> {
    const state = await this.load()
    state.lastPromptForCustomNameAt = options?.now ?? Date.now()
    await this.save(state)
    return state
  }
}
