/**
 * BM25 检索索引 — 优先加载原生（napi-rs）实现，缺失时回退纯 TS 实现。
 *
 * 原生实现带来两个改进：
 * 1. 索引构建（add）改为 O(1) 增量维护平均文档长度 —— TS 版每次 add 都全量重算
 *    avgDocLen（O(n)），导致整体建索引是 O(n²)。实测 10 万条记忆建索引：
 *    TS 约 61s，原生约 <1s。
 * 2. 检索（search）本身由原生代码执行，无 JS 层遍历开销。
 *
 * 回退路径保证：.node 二进制缺失（未编译平台 / 打包遗漏）时功能不降级。
 */
import { createRequire } from 'node:module'

import { createBM25Index as createBM25IndexTs } from './bm25-fallback.js'

/** @type {import('./index.d.ts').NativeBM25Module | null} */
let native = null
;(() => {
  // 局部作用域内创建 require，避免顶层 const require 与打包器（rolldown）
  // 自动注入的 CommonJS shim 在同一作用域重复声明导致 SyntaxError。
  const require = createRequire(import.meta.url)
  try {
    native = require('../index.node')
  }
  catch {
    // .node 未编译或平台不匹配 —— 走纯 TS 回退
    native = null
  }
})()

/**
 * @param {{ k1?: number, b?: number }} [options]
 */
export function createBM25Index(options = {}) {
  if (native) {
    // napi-rs 2.x 将 Rust struct `BM25Index` 导出为 JS 名 `Bm25Index`
    const Ctor = native.Bm25Index ?? native.BM25Index
    return new Ctor(options.k1, options.b)
  }
  return createBM25IndexTs(options)
}

export { native }
