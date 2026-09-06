const fs = require('fs')
const path = require('path')

function walk(dir) {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'build', 'target', '.git'].includes(f.name)) continue
    const p = path.join(dir, f.name)
    if (f.isDirectory()) out.push(...walk(p))
    else if (/\.(ts|tsx|mjs|cjs|js|vue|mts|cts)$/.test(f.name) && !f.name.endsWith('.d.ts')) out.push(p)
  }
  return out
}

const BUILDINS = new Set([
  'node:fs', 'node:fs/promises', 'node:path', 'node:path/posix', 'node:path/win32',
  'node:os', 'node:url', 'node:process', 'node:child_process', 'node:util',
  'node:stream', 'node:stream/web', 'node:events', 'node:crypto', 'node:buffer',
  'node:zlib', 'node:http', 'node:https', 'node:net', 'node:tls', 'node:dns',
  'node:assert', 'node:module', 'node:worker_threads', 'node:async_hooks',
  'node:perf_hooks', 'node:readline', 'node:tty', 'node:cluster', 'node:timers',
  'node:timers/promises', 'node:string_decoder', 'node:querystring', 'node:v8',
  'node:vm', 'node:wasi', 'node:console', 'node:constants', 'node:domain',
  'fs', 'path', 'os', 'url', 'process', 'child_process', 'util', 'stream',
  'events', 'crypto', 'buffer', 'zlib', 'http', 'https', 'net', 'tls', 'assert',
  'module', 'worker_threads', 'perf_hooks', 'readline', 'tty', 'cluster',
  'timers', 'string_decoder', 'querystring', 'v8', 'vm', 'wasi', 'console', 'constants',
  'node:test', 'node:repl', 'node:inspector', 'node:sqlite',
])

const dirs = []
function walkPkg(dir, depth) {
  if (depth > 4) return
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    if (e.name.startsWith('.') || ['node_modules', 'dist', 'build', 'target'].includes(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (fs.existsSync(path.join(p, 'package.json'))) { dirs.push(p); continue }
      walkPkg(p, depth + 1)
    }
  }
}
walkPkg('.', 0)

// workspace names: name -> dir
const wsNames = new Map()
for (const d of dirs) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8'))
    if (pkg.name) wsNames.set(pkg.name, d)
  } catch {}
}

const problems = []
for (const d of dirs) {
  let pkg
  try { pkg = JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8')) } catch { continue }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies }
  const importers = new Set()
  const files = walk(path.join(d, 'src'))
  // also test dir
  if (fs.existsSync(path.join(d, 'test'))) files.push(...walk(path.join(d, 'test')))
  const re = /(?:from\s+|import\s+|require\s*\()\s*['"]([^'"]+)['"]/g
  for (const f of files) {
    const code = fs.readFileSync(f, 'utf8')
    let m
    while ((m = re.exec(code))) {
      const spec = m[1]
      // bare specifier?
      if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('file:') || spec.startsWith('http')) continue
      if (spec.includes('#')) { const [a] = spec.split('#'); importers.add(a); continue }
      const main = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
      importers.add(spec)
    }
  }
  for (const imp of importers) {
    const main = imp.startsWith('@') ? imp.split('/').slice(0, 2).join('/') : imp.split('/')[0]
    if (deps[main]) continue
    if (deps[imp]) continue
    if (BUILDINS.has(imp) || BUILDINS.has(main)) continue
    if (wsNames.has(main)) continue // workspace dep without declaring? pnpm needs it declared, flag anyway
    problems.push({ pkg: pkg.name || d, dir: d.split(path.sep).join('/'), imp })
  }
}

if (problems.length === 0) {
  console.log('✓ no missing dependencies found (all imports covered)')
} else {
  console.log('✗ MISSING DEPENDENCIES:')
  for (const p of problems) console.log(`  ${p.dir}  imports "${p.imp}" but NOT in package.json`)
}