// Batch build audit: run each workspace package's "build" script (or closest
// equivalent) and report PASS/FAIL. Some builds are app-level (vite/electron
// bundle) and take minutes — those get a generous timeout and are reported
// but not treated as infra failures.
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const TIMEOUT = 420_000
const BUILD_KEYWORDS = ['build', 'bundle', 'compile', 'tsc', 'dist']

function walkPkg(dir, depth) {
  if (depth > 4) return []
  const out = []
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return [] }
  for (const e of entries) {
    if (e.name.startsWith('.') || ['node_modules', 'dist', 'build', 'target', 'coverage'].includes(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walkPkg(p, depth + 1))
    else if (e.name === 'package.json' && dir !== root) out.push(dir)
  }
  return out
}

function pickScript(pkg) {
  const s = pkg.scripts || {}
  const keys = Object.keys(s)
  // Exact/preferred order
  for (const k of ['build', 'build:web', 'compile', 'bundle', 'build:main']) if (s[k]) return k
  // Closest containing 'build'
  const fuzzy = keys.find((k) => /build/.test(k))
  if (fuzzy) return fuzzy
  return null
}

const pkgs = [...new Set(walkPkg(root, 0))]
const results = []
const failures = []
for (const dir of pkgs.sort()) {
  let pkg
  try { pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) } catch { continue }
  const script = pickScript(pkg)
  const rel = path.relative(root, dir)
  if (!script) {
    results.push({ rel, script: '(none)', ok: true, skipped: true })
    continue
  }
  const t0 = Date.now()
  try {
    execSync(`pnpm --dir "${dir}" run ${script}`, {
      stdio: 'pipe',
      timeout: TIMEOUT,
      env: { ...process.env, CI: 'true' },
    })
    results.push({ rel, script, ok: true, ms: Date.now() - t0 })
  } catch (e) {
    const out = (e.stdout || '').toString() + (e.stderr || '').toString()
    const lines = out.split(/\r?\n/).filter((l) => /error|Error|✗|failed|ERROR/i.test(l)).slice(0, 8)
    results.push({ rel, script, ok: false, ms: Date.now() - t0, lines })
    failures.push({ rel, script, lines })
  }
}

const fmt = (ms) => `${(ms / 1000).toFixed(1)}s`
for (const r of results) {
  if (r.skipped) { console.log(`SKIP ${r.rel.padEnd(46)} (no build script)`) ; continue }
  const tag = r.ok ? 'PASS' : 'FAIL'
  const t = r.ms ? `  ${fmt(r.ms)}` : ''
  console.log(`${tag.padEnd(4)} ${r.rel.padEnd(46)} ${r.script.padEnd(18)}${t}`)
  if (!r.ok) for (const l of r.lines) console.log(`       | ${l}`)
}
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} build scripts passed, ${failures.length} FAILED`)
