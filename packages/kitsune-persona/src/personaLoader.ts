import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import type { PersonaConfig, PersonaContent } from './types'

/** 人格内容加载器 */
export class PersonaLoader {
  private workspaceDir: string
  private cache: PersonaContent | null = null

  constructor(options?: { workspaceDir?: string }) {
    this.workspaceDir = options?.workspaceDir ?? process.cwd()
  }

  async load(config: PersonaConfig): Promise<PersonaContent> {
    const root = resolve(this.workspaceDir, config.source.preferredRoot)

    const soulPath = join(root, 'SOUL.md')
    const identityPath = join(root, 'IDENTITY.md')
    const userPath = join(root, 'USER.md')
    const runtimePath = join(root, 'RUNTIME_PERSONA.md')

    try {
      const [soul, identity, user, runtime] = await Promise.all([
        this.readMdSafe(soulPath),
        this.readMdSafe(identityPath),
        this.readMdSafe(userPath),
        this.readMdSafe(runtimePath),
      ])

      const result: PersonaContent = { soul, identity, user, runtime, paths: { soulPath, identityPath, userPath, runtimePath } }
      this.cache = result
      return result
    }
    catch {
      return this.cache ?? { soul: '', identity: '', user: '', runtime: '', paths: { soulPath, identityPath, userPath, runtimePath } }
    }
  }

  private async readMdSafe(filePath: string): Promise<string> {
    try {
      return await readFile(filePath, 'utf-8')
    }
    catch {
      return ''
    }
  }
}
