#!/usr/bin/env node
/**
 * 将 cargo release 构建产物复制为 index.node（napi-rs 约定文件名）。
 * 产物路径：<repo>/target/release/bm25_native.dll|.so|.dylib
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const targetDir = join(pkgRoot, '..', '..', 'target', 'release')
const candidates = ['bm25_native.dll', 'libbm25_native.so', 'libbm25_native.dylib']
const src = candidates.map(name => join(targetDir, name)).find(existsSync)

if (!src) {
  console.error(`[bm25-native] 未找到编译产物（${candidates.join(', ')}）。请先运行 pnpm -F @kitsune/bm25-native build`)
  process.exit(1)
}

const dest = join(pkgRoot, 'index.node')
mkdirSync(dirname(dest), { recursive: true })
copyFileSync(src, dest)
console.log(`[bm25-native] ${src} → ${dest}`)
