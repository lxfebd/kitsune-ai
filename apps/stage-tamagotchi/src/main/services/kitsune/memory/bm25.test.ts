import { describe, expect, it } from 'vitest'

import { createBM25Index } from './bm25'

describe('createBM25Index', () => {
  it('should return empty results for empty index', () => {
    const index = createBM25Index()
    expect(index.size()).toBe(0)
    expect(index.search('anything')).toEqual([])
  })

  it('should add documents and find them by exact match', () => {
    const index = createBM25Index()
    index.add('1', '我喜欢打篮球')
    const results = index.search('篮球')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('1')
    expect(results[0].score).toBeGreaterThan(0)
  })

  it('should rank relevant docs higher', () => {
    const index = createBM25Index()
    index.add('1', '今天天气很好适合出去玩')
    index.add('2', '篮球比赛很精彩')
    index.add('3', '天气对篮球比赛影响很大')

    const results = index.search('篮球天气')
    expect(results.length).toBeGreaterThanOrEqual(1)
    // doc 3 has both "篮球" and "天气" — should rank higher
    expect(results[0].id).toBe('3')
  })

  it('should support removing documents', () => {
    const index = createBM25Index()
    index.add('1', '我喜欢打篮球')
    index.add('2', '我也喜欢打篮球')
    expect(index.size()).toBe(2)

    index.remove('1')
    expect(index.size()).toBe(1)

    const results = index.search('篮球')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('2')
  })

  it('should handle mixed Chinese and English', () => {
    const index = createBM25Index()
    index.add('1', '我喜欢 JavaScript programming')
    index.add('2', 'Python 数据分析很强大')

    const jsResults = index.search('JavaScript')
    expect(jsResults).toHaveLength(1)
    expect(jsResults[0].id).toBe('1')

    const pyResults = index.search('Python')
    expect(pyResults).toHaveLength(1)
    expect(pyResults[0].id).toBe('2')
  })

  it('should limit results with topK', () => {
    const index = createBM25Index()
    for (let i = 0; i < 10; i++)
      index.add(`doc_${i}`, `这是第${i}个关于篮球的文档`)

    const results = index.search('篮球', 5)
    expect(results.length).toBeLessThanOrEqual(5)
  })

  it('should rebuild correctly after remove and re-add', () => {
    const index = createBM25Index()
    index.add('1', 'basketball is great')
    index.add('2', 'football is fun')
    index.remove('1')
    index.add('3', 'basketball is awesome')

    const results = index.search('basketball')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('3')
  })

  it('should handle empty document text', () => {
    const index = createBM25Index()
    index.add('1', '')
    expect(index.size()).toBe(1)
    expect(index.search('anything')).toEqual([])
  })

  it('should return scores in descending order', () => {
    const index = createBM25Index()
    index.add('1', '苹果香蕉橙子')
    index.add('2', '苹果苹果香蕉')
    index.add('3', '苹果苹果苹果')

    const results = index.search('苹果')
    expect(results.length).toBeGreaterThanOrEqual(2)
    for (let i = 1; i < results.length; i++)
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score)
  })
})