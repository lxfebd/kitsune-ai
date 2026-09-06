import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { dirname } from 'node:path'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

import type { PersonaProfile } from './types'

const DEFAULT_PROFILE: PersonaProfile = {
  version: 1,
  profile: 'default',
  personality: '',
  style: '',
  addressing: {
    default_user_title: '主人',
    custom_name: '',
    use_custom_first: true,
  },
  guidance: {
    prompt_if_missing_name: true,
    remind_cooldown_hours: 24,
  },
}

function normalizeProfile(raw: unknown): PersonaProfile {
  const root = (!raw || typeof raw !== 'object' || Array.isArray(raw)) ? {} : raw as Record<string, unknown>
  const addressing = (root.addressing || {}) as Record<string, unknown>
  const guidance = (root.guidance || {}) as Record<string, unknown>

  return {
    version: 1,
    profile: String(root.profile || DEFAULT_PROFILE.profile),
    personality: String(root.personality || ''),
    style: String(root.style || ''),
    addressing: {
      default_user_title: String(addressing.default_user_title || DEFAULT_PROFILE.addressing.default_user_title),
      custom_name: String(addressing.custom_name || ''),
      use_custom_first: addressing.use_custom_first !== false,
    },
    guidance: {
      prompt_if_missing_name: guidance.prompt_if_missing_name !== false,
      remind_cooldown_hours: Math.max(1, Number(guidance.remind_cooldown_hours) || 24),
    },
  }
}

/** 人格档案存储 */
export class PersonaProfileStore {
  private profilePath: string

  constructor(options?: { profilePath?: string }) {
    this.profilePath = options?.profilePath
      || process.env.PERSONA_PROFILE_PATH
      || require('path').join(process.cwd(), 'persona', 'profile.yaml')
    this.ensureExistsSync()
  }

  private ensureExistsSync(): void {
    if (existsSync(this.profilePath)) return
    mkdirSync(dirname(this.profilePath), { recursive: true })
    writeFileSync(this.profilePath, YAML.stringify(DEFAULT_PROFILE), 'utf8')
  }

  private async ensureExistsAsync(): Promise<void> {
    try {
      await access(this.profilePath)
    }
    catch {
      await mkdir(dirname(this.profilePath), { recursive: true })
      await writeFile(this.profilePath, YAML.stringify(DEFAULT_PROFILE), 'utf8')
    }
  }

  async load(): Promise<PersonaProfile> {
    await this.ensureExistsAsync()
    const raw = await readFile(this.profilePath, 'utf8')
    return normalizeProfile(YAML.parse(raw))
  }

  async save(patch: Partial<PersonaProfile> = {}): Promise<PersonaProfile> {
    const current = await this.load()
    const merged = {
      ...current,
      ...patch,
      addressing: { ...current.addressing, ...patch.addressing },
      guidance: { ...current.guidance, ...patch.guidance },
    }
    const normalized = normalizeProfile(merged)
    await writeFile(this.profilePath, YAML.stringify(normalized), 'utf8')
    return normalized
  }
}

let _yaml: any
const YAML = {
  parse(raw: string): any {
    if (!_yaml) _yaml = require('yaml')
    return _yaml.parse(raw)
  },
  stringify(obj: any): string {
    if (!_yaml) _yaml = require('yaml')
    return _yaml.stringify(obj)
  },
}

export { normalizeProfile, DEFAULT_PROFILE }
