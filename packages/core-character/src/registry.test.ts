import { describe, expect, it } from 'vitest'

import { createCharacterRegistry } from './registry'

import type { Character } from './types'

function createTestCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: 'test-char',
    name: 'Test Character',
    ...overrides,
  }
}

describe('createCharacterRegistry', () => {
  it('registers and retrieves a character', () => {
    const registry = createCharacterRegistry()
    const char = createTestCharacter()
    registry.register(char)

    expect(registry.has('test-char')).toBe(true)
    expect(registry.get('test-char')?.name).toBe('Test Character')
    expect(registry.size).toBe(1)
  })

  it('throws when registering without id', () => {
    const registry = createCharacterRegistry()
    expect(() => registry.register({ id: '', name: 'No ID' })).toThrow('must have an id')
  })

  it('throws when registering without name', () => {
    const registry = createCharacterRegistry()
    expect(() => registry.register({ id: 'x', name: '' })).toThrow('must have a name')
  })

  it('unregisters a character', () => {
    const registry = createCharacterRegistry()
    registry.register(createTestCharacter())
    expect(registry.unregister('test-char')).toBe(true)
    expect(registry.has('test-char')).toBe(false)
    expect(registry.size).toBe(0)
  })

  it('returns false when unregistering non-existent character', () => {
    const registry = createCharacterRegistry()
    expect(registry.unregister('nope')).toBe(false)
  })

  it('lists all characters', () => {
    const registry = createCharacterRegistry()
    registry.register(createTestCharacter({ id: 'a', name: 'A' }))
    registry.register(createTestCharacter({ id: 'b', name: 'B' }))

    const list = registry.list()
    expect(list).toHaveLength(2)
    expect(list.map(c => c.id)).toEqual(expect.arrayContaining(['a', 'b']))
  })

  it('filters by tags', () => {
    const registry = createCharacterRegistry()
    registry.register(createTestCharacter({ id: 'a', name: 'A', metadata: { tags: ['anime'] } }))
    registry.register(createTestCharacter({ id: 'b', name: 'B', metadata: { tags: ['game'] } }))

    const result = registry.filter({ tags: ['anime'] })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('a')
  })

  it('filters by engine', () => {
    const registry = createCharacterRegistry()
    registry.register(createTestCharacter({ id: 'a', name: 'A', model: { engine: 'live2d', source: 'a.moc3' } }))
    registry.register(createTestCharacter({ id: 'b', name: 'B', model: { engine: 'spine', source: 'b.skel' } }))

    const result = registry.filter({ engine: 'live2d' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('a')
  })

  it('filters by enabled status', () => {
    const registry = createCharacterRegistry()
    registry.register(createTestCharacter({ id: 'a', name: 'A', enabled: true }))
    registry.register(createTestCharacter({ id: 'b', name: 'B', enabled: false }))

    const result = registry.filter({ enabled: false })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('b')
  })

  it('filters by query', () => {
    const registry = createCharacterRegistry()
    registry.register(createTestCharacter({ id: 'a', name: 'Alice' }))
    registry.register(createTestCharacter({ id: 'b', name: 'Bob' }))

    const result = registry.filter({ query: 'ali' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('a')
  })

  it('updates a character', () => {
    const registry = createCharacterRegistry()
    registry.register(createTestCharacter())

    const updated = registry.update('test-char', { name: 'Updated' })
    expect(updated?.name).toBe('Updated')
    expect(updated?.id).toBe('test-char')
    expect(registry.get('test-char')?.name).toBe('Updated')
  })

  it('returns undefined when updating non-existent character', () => {
    const registry = createCharacterRegistry()
    expect(registry.update('nope', { name: 'X' })).toBeUndefined()
  })

  it('manages active character', () => {
    const registry = createCharacterRegistry()
    registry.register(createTestCharacter({ id: 'a', name: 'A' }))
    registry.register(createTestCharacter({ id: 'b', name: 'B' }))

    expect(registry.getActive()).toBeUndefined()
    expect(registry.getActiveId()).toBeUndefined()

    expect(registry.setActive('a')).toBe(true)
    expect(registry.getActive()?.id).toBe('a')
    expect(registry.getActiveId()).toBe('a')

    expect(registry.setActive('b')).toBe(true)
    expect(registry.getActive()?.id).toBe('b')

    expect(registry.setActive('nope')).toBe(false)
    expect(registry.getActive()?.id).toBe('b')
  })

  it('clears active when unregistering active character', () => {
    const registry = createCharacterRegistry()
    registry.register(createTestCharacter())
    registry.setActive('test-char')
    registry.unregister('test-char')

    expect(registry.getActive()).toBeUndefined()
    expect(registry.getActiveId()).toBeUndefined()
  })

  it('returns frozen copies from list', () => {
    const registry = createCharacterRegistry()
    registry.register(createTestCharacter())

    const list = registry.list()
    list[0].name = 'Mutated'
    expect(registry.get('test-char')?.name).toBe('Test Character')
  })

  it('returns copy from get', () => {
    const registry = createCharacterRegistry()
    registry.register(createTestCharacter())

    const c = registry.get('test-char')!
    c.name = 'Mutated'
    expect(registry.get('test-char')?.name).toBe('Test Character')
  })
})
