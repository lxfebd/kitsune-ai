// 精确检查单个路由的布局容器几何（grid 根 / main / aside）
// 用法: node scripts/dev-inspect2.mjs <route>
const route = process.argv[2] || 'team'
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const port = 9338
const userData = mkdtempSync(join(tmpdir(), 'edge-cdp-'))
const proc = spawn(edge, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--disable-background-networking', '--mute-audio',
  `--user-data-dir=${userData}`, `--remote-debugging-port=${port}`,
  '--window-size=1100,820', 'about:blank',
], { stdio: 'ignore' })
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
async function getJson(path) {
  for (let i = 0; i < 30; i++) {
    try { const res = await fetch(`http://127.0.0.1:${port}${path}`); if (res.ok) return await res.json() } catch { }
    await sleep(300)
  }
  throw new Error('CDP 端口未就绪')
}
try {
  const tabs = await getJson('/json/list')
  const page = tabs.find(t => t.type === 'page') || tabs[0]
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
  let id = 0; const pending = new Map()
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
  const send = (method, params = {}) => new Promise((resolve) => { const mid = ++id; pending.set(mid, resolve); ws.send(JSON.stringify({ id: mid, method, params })) })
  await send('Page.enable'); await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 820, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: `http://localhost:5173/#/settings/${route}` })
  await sleep(4500)
  const expr = `(() => {
    const info = (el) => {
      if (!el) return null
      const cs = getComputedStyle(el); const r = el.getBoundingClientRect()
      return { tag: el.tagName.toLowerCase(), cls: (el.className||'').toString().slice(0,55),
        rectH: Math.round(r.height), sh: el.scrollHeight, ch: el.clientHeight,
        oy: cs.overflowY, h: cs.height, rectTop: Math.round(r.top) }
    }
    // 找网格根：带 gridTemplateColumns 的行内样式 或 grid 类
    let grid = null
    for (const d of document.querySelectorAll('div')) {
      const cs = getComputedStyle(d)
      if (cs.display === 'grid' && Math.round(d.getBoundingClientRect().height) === 820) { grid = d; break }
      if (d.style.gridTemplateColumns) { grid = d; break }
    }
    const main = document.querySelector('main')
    const aside = document.querySelector('aside')
    return { route: location.hash, viewport: [innerWidth, innerHeight], grid: info(grid), main: info(main), aside: info(aside) }
  })()`
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true })
  console.log(JSON.stringify(r.result?.result?.value, null, 1))
  ws.close()
} finally { proc.kill() }