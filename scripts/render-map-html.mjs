#!/usr/bin/env node
/**
 * Render the Mellos map (map.json) to a single self-contained HTML architecture
 * diagram that is readable at a glance: horizontal layer bands, groups inside a
 * band, per-node status badges, hover tooltips with verification evidence.
 *
 * Usage: node scripts/render-map-html.mjs [--out <path>] [--open]
 * Output defaults to .mellos/html/map.html next to the project map file.
 */
import fs from 'node:fs'
import path from 'node:path'

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..') // pet/
const MELLOS_DIR = path.join(REPO_ROOT, '.mellos')
const DEFAULT_OUT = path.join(MELLOS_DIR, 'html', 'map.html')

let out = DEFAULT_OUT
let open = false
let page = null
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--out') out = path.resolve(argv[++i])
  else if (argv[i] === '--open') open = true
  else if (argv[i] === '--page') page = argv[++i]
  else { console.error(`unknown flag: ${argv[i]}`); process.exit(2) }
}

// --page <slug> 渲染 .mellos/pages/<slug>.json（并行 effort 页）；否则渲染根 map.json
const mapPath = page
  ? path.join(MELLOS_DIR, 'pages', `${page}.json`)
  : path.join(MELLOS_DIR, 'map.json')
if (!fs.existsSync(mapPath)) {
  console.error(`map file not found: ${mapPath}`)
  process.exit(1)
}
const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'))
if (!Array.isArray(map.layers) || !Array.isArray(map.nodes)) {
  console.error('map.json does not look like a Mellos map (missing layers/nodes)')
  process.exit(1)
}
map.groups = map.groups ?? []
map.edges = map.edges ?? []

// ---- integrity checks ----
const idSet = new Set(map.nodes.map(n => n.id))
const groupIds = new Set(map.groups.map(g => g.id))
for (const g of map.groups || []) {
  if (!map.layers.some(l => l.id === g.layer)) throw new Error(`group ${g.id} references unknown layer ${g.layer}`)
}
for (const n of map.nodes) {
  if (!map.layers.some(l => l.id === n.layer)) throw new Error(`node ${n.id} references unknown layer ${n.layer}`)
  if (n.group && !groupIds.has(n.group)) throw new Error(`node ${n.id} references unknown group ${n.group}`)
}
for (const e of map.edges || []) {
  if (!idSet.has(e.from)) throw new Error(`edge from unknown node ${e.from}`)
  if (!idSet.has(e.to)) throw new Error(`edge to unknown node ${e.to}`)
}

// ---- palette / helpers ----
const LAYER_COLORS = ['#0d2b45', '#12395c', '#19476f', '#215683', '#29669a', '#3276b1']
const STATUS_META = {
  done:        { label: '✓ 完成', color: '#16a34a', bg: '#dcfce7', border: '#86efac' },
  'in-progress': { label: '⏳ 进行中', color: '#b45309', bg: '#fef3c7', border: '#fcd34d' },
  planned:     { label: '○ 计划', color: '#64748b', bg: '#f1f5f9', border: '#cbd5e1' },
  regressed:   { label: '✗ 回退', color: '#b91c1c', bg: '#fee2e2', border: '#fca5a5' },
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const sortedLayers = [...map.layers].sort((a, b) => a.rank - b.rank)

// ---- cards ----
function card(n) {
  const sm = STATUS_META[n.status] || STATUS_META.planned
  const g = map.groups.find(x => x.id === n.group)
  const groupTag = g ? `<span class="grouptag" style="background:${esc(g._color||'#334155')}">${esc(g.label)}</span>` : ''
  const evidence = n.evidence ? `<div class="ev">${esc(n.evidence)}</div>` : ''
  return `
  <div class="card" data-status="${esc(n.status)}" title="${esc(n.label)}">
    <div class="name">${esc(n.label.split(' · ')[0])}${groupTag}</div>
    <div class="badge" style="color:${sm.color};background:${sm.bg};border-color:${sm.border}">${sm.label}</div>
    ${evidence}
  </div>`
}

// ---- group band ----
function groupBand(g) {
  const members = map.nodes.filter(n => n.group === g.id)
  return `
  <div class="grp" data-gid="${esc(g.id)}">
    <div class="grp-title">${esc(g.label)}</div>
    <div class="grp-body">${members.map(card).join('')}</div>
  </div>`
}

// ---- layer band ----
function layerBand(layer) {
  const color = LAYER_COLORS[sortedLayers.indexOf(layer)] || '#555'
  const groups = map.groups.filter(g => g.layer === layer.id)
  const orphans = map.nodes.filter(n => n.layer === layer.id && !n.group)
  return `
  <section class="layer" style="--c:${color}">
    <h2>${esc(layer.name)} <span class="count">${map.nodes.filter(n => n.layer === layer.id).length}</span></h2>
    <div class="band">
      ${groups.map(groupBand).join('')}
      ${orphans.length ? `<div class="grp"><div class="grp-body">${orphans.map(card).join('')}</div></div>` : ''}
    </div>
  </section>`
}

// ---- legend ----
const legend = `
<div class="legend">
  <span class="lg-title">图例</span>
  ${sortedLayers.map(l => `<span class="chip" style="background:${LAYER_COLORS[sortedLayers.indexOf(l)]}">${esc(l.name)}</span>`).join('')}
  <span class="sep">·</span>
  ${Object.entries(STATUS_META).map(([k, v]) => `<span class="chip status" style="color:${v.color};background:${v.bg};border-color:${v.border}">${v.label}</span>`).join('')}
  <span class="sep">·</span>
  <span class="hint">悬停卡片查看验证证据</span>
</div>`

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(map.title || 'kitsune-ai 架构总览')}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Segoe UI", "Microsoft YaHei", system-ui, sans-serif; background: #0b1220; color: #e2e8f0; padding: 24px 32px 80px; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .sub { color: #94a3b8; font-size: 13px; margin-bottom: 18px; }
  .legend { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 28px; line-height: 1.6; }
  .lg-title { font-weight: 600; margin-right: 4px; }
  .chip { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; color: #f1f5f9; }
  .chip.status { border: 1px solid; }
  .sep { color: #475569; margin: 0 4px; }
  .hint { color: #94a3b8; font-size: 12px; }
  .layer { margin-bottom: 26px; }
  .layer h2 { display: flex; align-items: center; gap: 8px; font-size: 15px; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 2px solid var(--c); }
  .layer .count { color: var(--c); font-size: 12px; background: color-mix(in srgb, var(--c) 18%, transparent); padding: 1px 8px; border-radius: 999px; }
  .band { display: flex; flex-wrap: wrap; gap: 14px; }
  .grp { border: 1px dashed #334155; border-radius: 10px; padding: 8px; min-width: 220px; }
  .grp-title { font-size: 12px; font-weight: 600; color: #cbd5e1; margin-bottom: 8px; padding-left: 4px; letter-spacing: .03em; }
  .grp-body { display: flex; flex-wrap: wrap; gap: 8px; }
  .card { flex: 0 1 auto; display: inline-flex; flex-direction: column; gap: 4px; background: #12203a; border: 1px solid #243655; border-radius: 8px; padding: 8px 10px; min-width: 140px; max-width: 230px; position: relative; transition: transform .08s ease, border-color .08s; }
  .card:hover { transform: translateY(-2px); border-color: #3b5b9a; }
  .name { font-size: 13px; font-weight: 500; color: #f1f5f9; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .grouptag { font-size: 10px; color: #f8fafc; border-radius: 4px; padding: 0 5px; line-height: 16px; }
  .badge { display: inline-block; font-size: 11px; border: 1px solid; border-radius: 999px; padding: 0 8px; line-height: 18px; width: fit-content; }
  .ev { font-size: 11px; color: #94a3b8; line-height: 1.45; margin-top: 2px; }
  .card[data-status="in-progress"] { box-shadow: 0 0 0 2px rgba(252,211,77,.25); }
</style>
</head>
<body>
  <h1>${esc(map.title || 'kitsune-ai 架构总览')}</h1>
  <div class="sub">${map.nodes.length} 个模块 · ${map.groups.length} 个分组 · ${map.edges.length} 条依赖</div>
  ${legend}
  ${sortedLayers.map(layerBand).join('')}
</body>
</html>`

fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, html, 'utf8')
console.log(`map html written: ${out} (${(fs.statSync(out).size / 1024).toFixed(1)} KB)`)

if (open) {
  const { execSync } = await import('node:child_process')
  try { execSync(`start "" "${out}"`, { shell: 'cmd.exe' }) } catch { }
}