import type { Character, CharacterFilter } from './types'

/**
 * 角色注册中心
 *
 * 管理所有已注册角色的增删查改，支持按条件过滤和活跃角色切换。
 *
 * Use when: 需要集中管理多个角色定义、查询可用角色、切换当前活跃角色。
 * Expects: 角色定义对象（至少包含 id 和 name）。
 * Returns: CharacterRegistry 实例，提供注册/查询/切换等操作。
 */
export interface CharacterRegistry {
  /** 注册角色 */
  register(character: Character): void
  /** 注销角色 */
  unregister(id: string): boolean
  /** 获取角色（不存在返回 undefined） */
  get(id: string): Character | undefined
  /** 列出所有角色 */
  list(): readonly Character[]
  /** 按条件过滤角色 */
  filter(filter: CharacterFilter): Character[]
  /** 角色是否存在 */
  has(id: string): boolean
  /** 更新角色（合并字段） */
  update(id: string, patch: Partial<Omit<Character, 'id'>>): Character | undefined
  /** 设置当前活跃角色 */
  setActive(id: string): boolean
  /** 获取当前活跃角色 */
  getActive(): Character | undefined
  /** 获取当前活跃角色 ID */
  getActiveId(): string | undefined
  /** 角色总数 */
  readonly size: number
}

export function createCharacterRegistry(): CharacterRegistry {
  const characters = new Map<string, Character>()
  let activeId: string | undefined

  function register(character: Character): void {
    if (!character.id) throw new Error('Character must have an id')
    if (!character.name) throw new Error('Character must have a name')
    characters.set(character.id, { ...character })
  }

  function unregister(id: string): boolean {
    if (activeId === id) activeId = undefined
    return characters.delete(id)
  }

  function get(id: string): Character | undefined {
    const c = characters.get(id)
    return c ? { ...c } : undefined
  }

  function list(): readonly Character[] {
    return Object.freeze([...characters.values()].map(c => ({ ...c })))
  }

  function filter(filter: CharacterFilter): Character[] {
    let results = [...characters.values()]

    if (filter.tags?.length) {
      results = results.filter(c =>
        filter.tags!.some(tag => c.metadata?.tags?.includes(tag))
      )
    }

    if (filter.engine) {
      results = results.filter(c => c.model?.engine === filter.engine)
    }

    if (filter.enabled !== undefined) {
      results = results.filter(c => (c.enabled ?? true) === filter.enabled)
    }

    if (filter.query) {
      const q = filter.query.toLowerCase()
      results = results.filter(c =>
        c.name.toLowerCase().includes(q)
        || c.metadata?.description?.toLowerCase().includes(q)
      )
    }

    return results.map(c => ({ ...c }))
  }

  function has(id: string): boolean {
    return characters.has(id)
  }

  function update(id: string, patch: Partial<Omit<Character, 'id'>>): Character | undefined {
    const existing = characters.get(id)
    if (!existing) return undefined
    const updated = { ...existing, ...patch, id }
    characters.set(id, updated)
    return { ...updated }
  }

  function setActive(id: string): boolean {
    if (!characters.has(id)) return false
    activeId = id
    return true
  }

  function getActive(): Character | undefined {
    if (!activeId) return undefined
    return get(activeId)
  }

  function getActiveId(): string | undefined {
    return activeId
  }

  return {
    register,
    unregister,
    get,
    list,
    filter,
    has,
    update,
    setActive,
    getActive,
    getActiveId,
    get size() { return characters.size },
  }
}
