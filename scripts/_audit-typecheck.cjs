const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

function walkPkg(dir, depth) {
  if (depth > 4) return []
  const out = []
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return [] }
  for (const e of entries) {
    if (e.name.startsWith('.') || ['node_modules', 'dist', 'build', 'target'].includes(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (fs.existsSync(path.join(p, 'package.json'))) { out.push(p); continue }
      out.push(...walkPkg(p, depth + 1))
    }
  }
  return out
}

const dirs = walkPkg('.', 0)
const targets = []
for (const d of dirs) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8'))
    if (pkg.scripts && (pkg.scripts.typecheck || pkg.scripts['type-check'])) {
      targets.push({ dir: d, script: pkg.scripts.typecheck || pkg.scripts['type-check'] })
    }
  } catch {}
}

const results = []
for (const t of targets) {
  const started = Date.now()
  const shortName = t.dir.split(path.sep).pop()
  try {
    const out = execSync(`pnpm run typecheck`, { cwd: t.dir, timeout: 240000, stdio: ['ignore', 'pipe', 'pipe'] }).toString()
    results.push({ name: shortName, ok: true, ms: Date.now() - started, note: '' })
  } catch (e) {
    const detail = String(e.stdout || '') + String(e.stderr || '')
    const err = detail.split('\n').filter(l => /error TS|Error|FAIL/i.test(l)).slice(0, 3).join(' | ').trim().slice(0, 220)
    results.push({ name: shortName, ok: false, ms: Date.now() - started, note: err || 'failed' })
  }
}

console.log('\n===== ALL TYPECHECKS =====')
let fails = 0
for (const r of results.sort((a, b) => a.name.localeCompare(b.name))) {
  if (!r.ok) fails++
  console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name.padEnd(28)} ${(r.ms / 1000).toFixed(1).padStart(5)}s  ${r.note}`)
}
console.log(`\n${results.length - fails}/${results.length} typecheck passed, ${fails} FAILED`)