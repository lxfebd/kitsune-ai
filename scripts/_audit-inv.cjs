const fs = require('fs')
const path = require('path')

function walk(dir, depth) {
  if (depth > 4) return []
  const out = []
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return [] }
  for (const e of entries) {
    if (e.name.startsWith('.') || ['node_modules', 'dist', 'build', 'target', '.git', '.mellos', '.mimosa'].includes(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (fs.existsSync(path.join(p, 'package.json'))) { out.push(p); continue }
      out.push(...walk(p, depth + 1))
    }
  }
  return out
}

const dirs = walk('.', 0)
const rows = []

function scanFiles(root) {
  const src = []
  const test = []
  if (!fs.existsSync(root)) return { src, test }
  for (const f of fs.readdirSync(root, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'build', 'target'].includes(f.name)) continue
    const p = path.join(root, f.name)
    if (f.isDirectory()) {
      const sub = scanFiles(p)
      src.push(...sub.src); test.push(...sub.test)
    } else if (/\.(ts|tsx|js|mjs|cjs|vue)$/.test(f.name)) {
      if (/\.(test|spec)\./.test(f.name)) test.push(p)
      else if (!f.name.endsWith('.d.ts')) src.push(p)
    }
  }
  return { src, test }
}

for (const d of dirs) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8'))
    const { src, test } = scanFiles(path.join(d, 'src'))
    const scripts = Object.keys(pkg.scripts || {})
    rows.push({
      dir: d.split(path.sep).join('/'),
      name: pkg.name || '(unnamed)',
      src: src.length,
      test: test.length,
      scripts: scripts.join(','),
      hasTsconfig: fs.existsSync(path.join(d, 'tsconfig.json')),
      hasVitest: fs.existsSync(path.join(d, 'vitest.config.ts')),
      hasBuild: scripts.includes('build'),
    })
  } catch {}
}

rows.sort((a, b) => a.dir.localeCompare(b.dir))
console.log('dir'.padEnd(54), 'src test tsconfig vitest build scripts')
for (const r of rows) {
  console.log(
    r.dir.padEnd(54),
    String(r.src).padEnd(4),
    String(r.test).padEnd(4),
    r.hasTsconfig ? 'Y' : 'N', '     ',
    r.hasVitest ? 'Y' : 'N', '     ',
    r.hasBuild ? 'Y' : 'N', '  ',
    r.scripts
  )
}