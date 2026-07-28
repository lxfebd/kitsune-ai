/**
 * BM25 检索索引 — 纯 TypeScript 实现，无外部依赖。
 *
 * 用于记忆库的关键词检索，替代原有的字符串 includes 匹配。
 * 支持中文分词（按字符切分 + 英文按空格/标点切分）。
 */

interface BM25Doc {
  id: string
  tokens: string[]
}

interface BM25Options {
  k1?: number
  b?: number
}

export interface BM25Result {
  id: string
  score: number
}

/** 简单中英文分词：英文按空格/标点，中文按字符 */
function tokenize(text: string): string[] {
  const tokens: string[] = []
  const lower = text.toLowerCase()
  const enWords = lower.match(/[a-z]+/g) ?? []
  tokens.push(...enWords)
  const cnChars = lower.match(/[\u4e00-\u9fa5]/g) ?? []
  tokens.push(...cnChars)
  return tokens
}

export function createBM25Index(options: BM25Options = {}) {
  const k1 = options.k1 ?? 1.5
  const b = options.b ?? 0.75
  const docs: Map<string, BM25Doc> = new Map()
  const df: Map<string, number> = new Map()
  const docLen: Map<string, number> = new Map()
  let avgDocLen = 0

  function add(id: string, text: string): void {
    const tokens = tokenize(text)
    docs.set(id, { id, tokens })
    docLen.set(id, tokens.length)
    avgDocLen = [...docLen.values()].reduce((a, b) => a + b, 0) / Math.max(docLen.size, 1)
    const uniqueTokens = new Set(tokens)
    for (const t of uniqueTokens)
      df.set(t, (df.get(t) ?? 0) + 1)
  }

  function remove(id: string): void {
    const doc = docs.get(id)
    if (!doc)
      return
    const uniqueTokens = new Set(doc.tokens)
    for (const t of uniqueTokens) {
      const count = (df.get(t) ?? 0) - 1
      if (count <= 0)
        df.delete(t)
      else
        df.set(t, count)
    }
    docs.delete(id)
    docLen.delete(id)
    avgDocLen = [...docLen.values()].reduce((a, b) => a + b, 0) / Math.max(docLen.size, 1)
  }

  function search(query: string, topK = 10): BM25Result[] {
    const queryTokens = tokenize(query)
    const N = docs.size
    const scores: BM25Result[] = []

    for (const [id, doc] of docs) {
      let score = 0
      const docLenVal = docLen.get(id) ?? avgDocLen
      for (const qt of queryTokens) {
        const tf = doc.tokens.filter(t => t === qt).length
        if (tf === 0)
          continue
        const dfVal = df.get(qt) ?? 0
        const idf = Math.log(1 + (N - dfVal + 0.5) / (dfVal + 0.5))
        const tfNorm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLenVal / Math.max(avgDocLen, 1))))
        score += idf * tfNorm
      }
      if (score > 0)
        scores.push({ id, score })
    }

    return scores.sort((a, b) => b.score - a.score).slice(0, topK)
  }

  function size(): number {
    return docs.size
  }

  return { add, remove, search, size }
}