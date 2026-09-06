const { execSync } = require('child_process')
const path = require('path')

const targets = [
  ['audio-pipelines-transcribe', 'test:run'],
  ['better-ws', 'test:run'],
  ['cap-vite', 'test'],
  ['ccc', 'test'],
  ['kitsune-overseer', 'test'],
  ['kitsune-screenshot', 'test:run'],
  ['pipelines-audio', 'test:run'],
  ['plugin-sdk', 'test:run'],
  ['plugin-sdk-tamagotchi', 'test:run'],
  ['stage-ui', 'test:run'],
  ['vishot-runner-browser', 'test:run'],
  ['vishot-runtime', 'test:run'],
  ['computer-use-mcp', 'test'],
  ['minecraft', 'test'],
]

const results = []
for (const [dir, script] of targets) {
  const cwd = path.join('packages', dir)
  const abs = path.resolve(cwd)
  if (!require('fs').existsSync(abs)) continue
  const started = Date.now()
  try {
    const out = execSync(`pnpm ${script}`, { cwd: abs, timeout: 300000, stdio: ['ignore', 'pipe', 'pipe'] }).toString()
    const testsLine = out.split('\n').filter(l => /Test Files|Tests  |Test Files/i.test(l)).slice(-3).join(' | ')
    results.push({ dir, ok: true, ms: Date.now() - started, note: testsLine.trim().slice(0, 120) || 'no summary' })
  } catch (e) {
    const detail = String(e.stdout || '') + String(e.stderr || '')
    const errLine = detail.split('\n').filter(l => /Error|FAIL|failed|No test files|ELIFECYCLE/i.test(l)).slice(-2).join(' | ').trim().slice(0, 160)
    results.push({ dir, ok: false, ms: Date.now() - started, note: errLine || 'unknown failure' })
  }
}

console.log('\n===== TEST RUN RESULTS =====')
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.dir.padEnd(30)} ${String(r.ms / 1000).slice(0, 5)}s  ${r.note}`)
}