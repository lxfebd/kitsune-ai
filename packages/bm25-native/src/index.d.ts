/** 原生 BM25 索引实例的接口（与 napi-rs 生成的类型保持一致） */
export interface NativeBM25Index {
  add(id: string, text: string): void
  remove(id: string): boolean
  search(query: string, topK?: number): BM25Result[]
  size(): number
}

export interface BM25Result {
  id: string
  score: number
}

/** 原生模块导出（可能为 null，见 index.js 的回退加载） */
export interface NativeBM25Module {
  BM25Index: new (k1?: number, b?: number) => NativeBM25Index
}

/** 与 store 的 createBM25Index 同构的工厂签名 */
export interface BM25IndexLike {
  add(id: string, text: string): void
  remove(id: string): boolean
  search(query: string, topK?: number): BM25Result[]
  size(): number
}

export function createBM25Index(options?: { k1?: number, b?: number }): BM25IndexLike
