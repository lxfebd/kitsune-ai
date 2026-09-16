// 收敛验收探针：抓 hash / body 文本 / 完整异常文本，定位页面为何没挂载
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const port = 9347
const u = mkdtempSync(join(tmpdir(), 'edge-cdp-'))
const proc = spawn(edge, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--disable-background-networking', '--mute-audio',
  `--user-data-dir=${u}`, `--remote-debugging-port=${port}`,
  '--window-size=1100,820', 'about:blank',
], { stdio: 'ignore' })
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function gj(path) { for (let i = 0; i < 30; i++) { try { const r = await fetch(`http://127.0.0.1:${port}${path}`); if (r.ok) return await r.json() } catch { } await sleep(300) } throw new Error('no cdp') }

const BASE = 'http://localhost:5173'
try {
  const tabs = await gj('/json/list'); const page = tabs.find(t => t.type === 'page') || tabs[0]
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
  let id = 0; const pend = new Map()
  const errors = []
  ws.onmessage = e => {
    const m = JSON.parse(e.data)
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails
      const desc = d.exception?.description || d.text || '(no description)'
      errors.push({ where: d.url?.slice(-60), line: d.lineNumber, text: String(desc).slice(0, 300) })
    }
  }
  const send = (method, params = {}) => new Promise(r => { const mid = ++id; pend.set(mid, r); ws.send(JSON.stringify({ id: mid, method, params })) })
  await send('Page.enable'); await send('Runtime.enable')

  for (const url of [`${BASE}/#/settings/pipeline`, `${BASE}/#/settings/executor`, `${BASE}/#/settings/health`, `${BASE}/#/settings/connectors`]) {
    errors.length = 0
    await send('Page.navigate', { url })
    await sleep(4500)
    const st = await send('Runtime.evaluate', {
      expression: `({ hash: location.hash, appChildren: document.getElementById('app')?.children.length ?? -1, textLen: document.body.innerText.length, sample: document.body.innerText.slice(0, 60) })`,
      returnByValue: true,
    })
    const v = st.result?.result?.value ?? st.result?.value
    console.log(`\n=== ${url.replace(BASE + '/', '')} ===`)
    console.log('  hash      :', v?.hash)
    console.log('  app 子节点:', v?.appChildren, ' body 文本长度:', v?.textLen)
    console.log('  文本片段  :', JSON.stringify(v?.sample ?? ''))
    if (errors.length) {
      console.log('  !! 运行时异常:')
      errors.slice(0, 2).forEach(e => console.log(`     [${e.where}:${e.line}] ${e.text}`))
    } else {
      console.log('  运行时异常 : (无)')
    }
  }
  ws.close()
} finally { proc.kill() }