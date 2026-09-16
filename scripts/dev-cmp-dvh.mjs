// 对比 dev server(5173) 与 build 产物 下 h-100dvh / h-screen 的实际生效情况
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const port = 9339
const u = mkdtempSync(join(tmpdir(), 'edge-cdp-'))
const proc = spawn(edge, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--disable-background-networking', '--mute-audio',
  `--user-data-dir=${u}`, `--remote-debugging-port=${port}`,
  '--window-size=1100,820', 'about:blank',
], { stdio: 'ignore' })
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function gj(path) { for (let i = 0; i < 30; i++) { try { const r = await fetch(`http://127.0.0.1:${port}${path}`); if (r.ok) return await r.json() } catch { } await sleep(300) } throw new Error('no cdp') }

const url = process.argv[2]
try {
  const tabs = await gj('/json/list'); const page = tabs.find(t => t.type === 'page') || tabs[0]
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
  let id = 0; const pend = new Map()
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } }
  const send = (method, params = {}) => new Promise(r => { const mid = ++id; pend.set(mid, r); ws.send(JSON.stringify({ id: mid, method, params })) })
  await send('Page.enable'); await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 820, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url })
  await sleep(4500)
  const expr = `(() => {
    // 找根网格：display=grid 且带 h-screen 或 h-100dvh
    const roots = [...document.querySelectorAll('div')].filter(d => getComputedStyle(d).display === 'grid' && /overflow-hidden/.test(d.className || ''))
    const info = (el) => { if (!el) return null; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return { cls: el.className.slice(0, 40), rectH: Math.round(r.height), sh: el.scrollHeight, h: cs.height } }
    const grid = roots.find(r => Math.round(r.getBoundingClientRect().height) >= 800) || roots[0]
    const main = document.querySelector('main')
    // 检查 dvh/vh 的实际像素值（1dvh 应该 = 视口高 = 820）
    let dvh = null, vh = null
    try { const t = document.createElement('div'); t.style.height = '100dvh'; t.style.position = 'absolute'; t.style.top = '-9999px'; document.body.appendChild(t); dvh = t.getBoundingClientRect().height; t.remove() } catch { dvh = 'ERR' }
    try { const t = document.createElement('div'); t.style.height = '100vh'; t.style.position = 'absolute'; t.style.top = '-9999px'; document.body.appendChild(t); vh = t.getBoundingClientRect().height; t.remove() } catch { vh = 'ERR' }
    return { url: location.href.slice(0, 60), grid: info(grid), main: info(main), pxPerDvh: dvh ? (dvh / 100).toFixed(2) : null, pxPerVh: vh ? (vh / 100).toFixed(2) : null }
  })()`
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true })
  console.log(JSON.stringify(r.result?.result?.value, null, 1))
  ws.close()
} finally { proc.kill() }