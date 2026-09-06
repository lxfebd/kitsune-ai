import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

import type { PersonaConfig } from './types'

const DEFAULT_CONFIG: PersonaConfig = {
  version: 1,
  defaults: {
    profile: 'default',
    mode: 'hybrid',
    injectEnabled: true,
    maxContextChars: 3000,
    sharedAcrossSessions: true,
  },
  source: {
    preferredRoot: '.',
    allowWorkspaceOverride: false,
  },
  modes: {
    rational: { style: 'concise, structured, technical' },
    idol: { style: 'warm, expressive, encouraging' },
    hybrid: { style: 'balanced rational(60) poetic(40)' },
    strict: { style: 'minimal emotion, high precision' },
  },
  writeback: {
    enabled: true,
    explicitOnly: false,
    minSignals: 3,
  },
}

function normalizeConfig(raw: unknown): PersonaConfig {
  if (!raw || typeof raw !== 'object') throw new Error('persona.yaml root must be object')
  const root = raw as Record<string, unknown>
  if (root.version !== 1) throw new Error('persona.yaml version must be 1')

  const defaults = (root.defaults || {}) as Record<string, unknown>
  const source = (root.source || {}) as Record<string, unknown>

  return {
    version: 1,
    defaults: {
      profile: String(defaults.profile || 'default'),
      mode: String(defaults.mode || 'hybrid') as PersonaConfig['defaults']['mode'],
      injectEnabled: defaults.injectEnabled !== false,
      maxContextChars: Math.max(256, Number(defaults.maxContextChars) || 1500),
      sharedAcrossSessions: defaults.sharedAcrossSessions !== false,
    },
    source: {
      preferredRoot: String(source.preferredRoot || '.'),
      allowWorkspaceOverride: source.allowWorkspaceOverride === true,
    },
    modes: (root.modes || {}) as Record<string, { style: string }>,
    writeback: {
      enabled: (root.writeback as Record<string, unknown>)?.enabled !== false,
      explicitOnly: (root.writeback as Record<string, unknown>)?.explicitOnly === true,
      minSignals: Math.max(1, Number((root.writeback as Record<string, unknown>)?.minSignals) || 3),
    },
  }
}

/** 人格配置存储 */
export class PersonaConfigStore {
  private configPath: string

  constructor(options?: { configPath?: string }) {
    this.configPath = options?.configPath
      || process.env.PERSONA_CONFIG_PATH
      || join(process.cwd(), 'config', 'persona.yaml')
    this.ensureExistsSync()
  }

  private ensureExistsSync(): void {
    if (existsSync(this.configPath)) return
    mkdirSync(dirname(this.configPath), { recursive: true })
    writeFileSync(this.configPath, YAML.stringify(DEFAULT_CONFIG), 'utf8')
  }

  private async ensureExistsAsync(): Promise<void> {
    try {
      await access(this.configPath)
    }
    catch {
      await mkdir(dirname(this.configPath), { recursive: true })
      await writeFile(this.configPath, YAML.stringify(DEFAULT_CONFIG), 'utf8')
    }
  }

  async load(): Promise<PersonaConfig> {
    await this.ensureExistsAsync()
    const raw = await readFile(this.configPath, 'utf8')
    return normalizeConfig(YAML.parse(raw))
  }

  async loadRawYaml(): Promise<string> {
    await this.ensureExistsAsync()
    return readFile(this.configPath, 'utf8')
  }

  async saveRawYaml(rawYaml: string): Promise<void> {
    const parsed = YAML.parse(rawYaml)
    normalizeConfig(parsed)
    await writeFile(this.configPath, rawYaml, 'utf8')
  }
}

// YAML 解析（lazy import）
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

export { normalizeConfig, DEFAULT_CONFIG }
