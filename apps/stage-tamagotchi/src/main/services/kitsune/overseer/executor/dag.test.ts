import { describe, expect, it } from 'vitest'
import { buildDagLevels } from './dag'
import type { Task } from './planGenerator'

function makeTask(id: string, dependsOn?: string[]): Task {
  return { id, type: 'cli', title: `task-${id}`, provider: 'claude', prompt: '', cwd: '/', critical: false, dependsOn } as Task
}

describe('buildDagLevels', () => {
  it('returns empty for empty tasks', () => {
    expect(buildDagLevels([]).levels).toEqual([])
  })

  it('all tasks without dependsOn in level 0', () => {
    const { levels } = buildDagLevels([makeTask('a'), makeTask('b'), makeTask('c')])
    expect(levels).toHaveLength(1)
    expect(levels[0].tasks).toHaveLength(3)
  })

  it('linear dependency produces sequential levels', () => {
    const { levels } = buildDagLevels([makeTask('a'), makeTask('b', ['a']), makeTask('c', ['b'])])
    expect(levels).toHaveLength(3)
    expect(levels[0].tasks[0].id).toBe('a')
    expect(levels[1].tasks[0].id).toBe('b')
    expect(levels[2].tasks[0].id).toBe('c')
  })

  it('diamond dependency: b and c in same level', () => {
    const { levels } = buildDagLevels([makeTask('a'), makeTask('b', ['a']), makeTask('c', ['a']), makeTask('d', ['b', 'c'])])
    expect(levels).toHaveLength(3)
    expect(levels[0].tasks).toHaveLength(1) // a
    expect(levels[1].tasks).toHaveLength(2) // b, c
    expect(levels[2].tasks).toHaveLength(1) // d
  })

  it('detects circular dependency', () => {
    const { error } = buildDagLevels([makeTask('a', ['b']), makeTask('b', ['a'])])
    expect(error).toContain('环')
  })

  it('detects missing dependency target', () => {
    const { error } = buildDagLevels([makeTask('a', ['nonexistent'])])
    expect(error).toContain('不存在')
  })

  it('handles complex multi-level DAG', () => {
    const { levels } = buildDagLevels([
      makeTask('a'), makeTask('b'),              // level 0
      makeTask('c', ['a', 'b']), makeTask('d', ['a']), // level 1
      makeTask('e', ['c']),                      // level 2
    ])
    expect(levels).toHaveLength(3)
    expect(levels[0].tasks).toHaveLength(2) // a, b
    expect(levels[1].tasks).toHaveLength(2) // c, d
    expect(levels[2].tasks).toHaveLength(1) // e
  })

  it('preserves all tasks in levels', () => {
    const tasks = [makeTask('a'), makeTask('b', ['a']), makeTask('c', ['a'])]
    const { levels } = buildDagLevels(tasks)
    const all = levels.flatMap(l => l.tasks)
    expect(all).toHaveLength(3)
  })
})