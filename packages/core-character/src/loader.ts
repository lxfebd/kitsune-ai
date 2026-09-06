import { readFile, readdir, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'

import type { Character, CharacterSource } from './types'

/**
 * 角色加载器
 *
 * 从文件系统加载角色定义。支持两种格式：
 * - 单文件：JSON 格式的角色定义文件
 * - 目录：包含 character.json + SOUL.md + IDENTITY.md 的角色目录
 *
 * Use when: 需要从磁盘批量加载角色配置。
 * Expects: 文件/目录路径。
 * Returns: 加载成功的角色数组。
 */
export interface CharacterLoader {
  /** 从指定来源加载角色 */
  load(source: CharacterSource): Promise<Character[]>
  /** 批量加载多个来源 */
  loadAll(sources: CharacterSource[]): Promise<Character[]>
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  }
  catch {
    return false
  }
}

async function loadCharacterFile(filePath: string): Promise<Character> {
  const raw = await readFile(filePath, 'utf-8')
  const data = JSON.parse(raw)
  if (!data.id || !data.name) {
    throw new Error(`Character file must have "id" and "name": ${filePath}`)
  }
  return data as Character
}

async function loadCharacterDirectory(dirPath: string): Promise<Character> {
  const jsonPath = join(dirPath, 'character.json')
  if (!await fileExists(jsonPath)) {
    throw new Error(`Character directory must contain character.json: ${dirPath}`)
  }

  const character = await loadCharacterFile(jsonPath)

  // 加载 SOUL.md（如果存在且角色未内联 soul）
  if (!character.soul) {
    const soulPath = join(dirPath, 'SOUL.md')
    if (await fileExists(soulPath)) {
      character.soul = await readFile(soulPath, 'utf-8')
    }
  }

  // 加载 IDENTITY.md（如果存在且角色未内联 identity）
  if (!character.identity) {
    const identityPath = join(dirPath, 'IDENTITY.md')
    if (await fileExists(identityPath)) {
      character.identity = await readFile(identityPath, 'utf-8')
    }
  }

  return character
}

async function loadDirectoryListing(dirPath: string): Promise<Character[]> {
  const entries = await readdir(dirPath, { withFileTypes: true })
  const characters: Character[] = []

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subDir = join(dirPath, entry.name)
      const jsonPath = join(subDir, 'character.json')
      if (await fileExists(jsonPath)) {
        try {
          characters.push(await loadCharacterDirectory(subDir))
        }
        catch (err) {
          console.warn(`[CharacterLoader] Failed to load "${entry.name}":`, (err as Error).message)
        }
      }
    }
    else if (entry.isFile() && extname(entry.name) === '.json') {
      try {
        characters.push(await loadCharacterFile(join(dirPath, entry.name)))
      }
      catch (err) {
        console.warn(`[CharacterLoader] Failed to load "${entry.name}":`, (err as Error).message)
      }
    }
  }

  return characters
}

export function createCharacterLoader(): CharacterLoader {
  async function load(source: CharacterSource): Promise<Character[]> {
    switch (source.type) {
      case 'inline':
        if (!source.character) return []
        return [source.character]

      case 'file':
        if (!source.path) return []
        return [await loadCharacterFile(source.path)]

      case 'directory':
        if (!source.path) return []
        return loadDirectoryListing(source.path)
    }
  }

  async function loadAll(sources: CharacterSource[]): Promise<Character[]> {
    const results = await Promise.allSettled(
      sources.map(source => load(source))
    )

    const characters: Character[] = []
    for (const result of results) {
      if (result.status === 'fulfilled') {
        characters.push(...result.value)
      }
    }
    return characters
  }

  return { load, loadAll }
}
