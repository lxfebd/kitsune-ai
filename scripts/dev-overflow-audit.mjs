// 溢出检测：对每个设置路由，检查页面内是否存在「内容超高且容器不可滚动」的元素
// 用法: node scripts/dev-overflow-audit.mjs [route,...]
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const routes = process.argv.slice(2)
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const port = 9334
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
  let id = 0
  const pending = new Map()
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
  const send = (method, params = {}) => new Promise((resolve) => { const mid = ++id; pending.set(mid, resolve); ws.send(JSON.stringify({ id: mid, method, params })) })

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 820, deviceScaleFactor: 1, mobile: false })

  for (const route of routes) {
    await send('Page.navigate', { url: `http://localhost:5173/#/settings/${route}` })
    await sleep(3500)
    const expr = `(() => {
      const out = { route: location.hash, viewport: [innerWidth, innerHeight], issues: [], scrollers: [] }
      // 找页面上所有真实滚动容器（overflow auto/scroll 且可滚）
      document.querySelectorAll('*').forEach(el => {
        const cs = getComputedStyle(el)
        const oy = cs.overflowY
        if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 2) {
          out.scrollers.push({ tag: el.tagName.toLowerCase(), cls: (el.className||'').toString().slice(0,80), sh: el.scrollHeight, ch: el.clientHeight })
        }
        // 内容超高但不可滚（hidden/visible/无 overflow 设置）且尺寸合理 → 溢出嫌疑
        if (el.scrollHeight > el.clientHeight + 8 && el.clientHeight > 0) {
          const o = [cs.overflowY, cs.overflowX].join(' ')
          if (!/auto|scroll/.test(cs.overflowY)) {
            out.issues.push({ tag: el.tagName.toLowerCase(), cls: (el.className||'').toString().slice(0,90), sh: el.scrollHeight, ch: el.clientHeight, oy: cs.overflowY, text: (el.textContent||'').slice(0,30) })
          }
        }
      })
      out.issues = out.issues.slice(0, 6)
      return out
    })()`
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true })
    const v = r.result?.result?.value
    const scroll = v.scrollers.filter(s => !/main/i.test(s.cls)).slice(0,5)
    console.log(`\n== /settings/${route} ==`)
    if (v.scrollers.length) console.log(`  可滚动容器 ${v.scrollers.length} 个` + (scroll.length ? `（main 之外的 ${scroll.map(s=>s.cls||s.tag).join(', ')}）` : ''))
    else console.log('  ✗ 没有任何可滚动容器')
    if (v.issues.length) { console.log('  ⚠ 溢出嫌疑:'); v.issues.forEach(i => console.log(`    - <${i.tag}> ${i.cls||''} sh=${i.sh} ch=${i.ch} oy=${i.oy} "${i.text}"`)) }
    else console.log('  ✓ 无内容超高不可滚的元素')
  }
  ws.close()
} finally {
  proc.kill()
}
