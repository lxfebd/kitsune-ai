/**
 * 纯 JS 回退实现 —— 与 store 原引用实现保持完全一致（含 O(n) avgDocLen 重算，
 * 仅作 .node 缺失时的兜底；正常情况走原生路径）。
 */

/** 简单中英文分词：英文按空格/标点，中文按字符 */
function tokenize(text) {
  const tokens = []
  const lower = text.toLowerCase()
  const enWords = lower.match(/[a-z]+/g) ?? []
  tokens.push(...enWords)
  const cnChars = lower.match(/[\u4e00-\u9fa5]/g) ?? []
  tokens.push(...cnChars)
  return tokens
}

export function createBM25Index(options = {}) {
  const k1 = options.k1 ?? 1.5
  const b = options.b ?? 0.75
  const docs = new Map()
  const df = new Map()
  const docLen = new Map()
  let avgDocLen = 0

  function add(id, text) {
    const tokens = tokenize(text)
    docs.set(id, { id, tokens })
    docLen.set(id, tokens.length)
    avgDocLen = [...docLen.values()].reduce((a, b) => a + b, 0) / Math.max(docLen.size, 1)
    const uniqueTokens = new Set(tokens)
    for (const t of uniqueTokens)
      df.set(t, (df.get(t) ?? 0) + 1)
  }

  function remove(id) {
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

  function search(query, topK = 10) {
    const queryTokens = tokenize(query)
    const N = docs.size
    const scores = []

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

  function size() {
    return docs.size
  }

  return { add, remove, search, size }
}
