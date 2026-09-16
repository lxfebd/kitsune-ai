// CDP 截图工具：起 headless Edge → 打开 URL → 等渲染 → 截图
// 用法: node scripts/dev-shot.mjs <url> <out.png> [w] [h] [waitMs]
const [url, out] = [process.argv[2], process.argv[3]]
const w = Number(process.argv[4] || 1100)
const h = Number(process.argv[5] || 820)
const waitMs = Number(process.argv[6] || 4000)

import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const port = 9333
const userData = mkdtempSync(join(tmpdir(), 'edge-cdp-'))
const args = [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--disable-background-networking', '--mute-audio',
  `--user-data-dir=${userData}`, `--remote-debugging-port=${port}`,
  `--window-size=${w},${h}`, 'about:blank',
]
const proc = spawn(edge, args, { stdio: 'ignore' })

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
async function getJson(path) {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}${path}`)
      if (res.ok) return await res.json()
    } catch { /* retry */ }
    await sleep(300)
  }
  throw new Error('CDP 端口未就绪')
}

try {
  const tabs = await getJson('/json/list')
  const page = tabs.find(t => t.type === 'page') || tabs[0]
  if (!page) throw new Error('没有可用 page target')

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
  let id = 0
  const pending = new Map()
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
  }
  const send = (method, params = {}) => new Promise((resolve) => {
    const mid = ++id
    pending.set(mid, resolve)
    ws.send(JSON.stringify({ id: mid, method, params }))
  })

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url })
  await sleep(waitMs)
  // 额外等一次 rAF 稳定
  await send('Runtime.evaluate', { expression: 'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))', awaitPromise: true, returnByValue: true }).catch(() => {})
  await sleep(800)
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  writeFileSync(out, Buffer.from(shot.result.data, 'base64'))
  console.log(`OK ${out} ${(shot.result.data.length / 1024).toFixed(0)}KB`)
  ws.close()
} finally {
  proc.kill()
}
