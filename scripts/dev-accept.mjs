// 收敛后验收：路由重定向 / 侧栏收敛 / 双渲染消除
// 用法: node scripts/dev-accept.mjs
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const port = 9345
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
const cases = [
  { name: '旧深链 /settings/executor → pipeline', url: `${BASE}/#/settings/executor`, expectHash: /#\/settings\/pipeline/ },
  { name: '旧深链 /settings/overseer → pipeline', url: `${BASE}/#/settings/overseer`, expectHash: /#\/settings\/pipeline/ },
  { name: '旧深链 /settings/account → /settings', url: `${BASE}/#/settings/account`, expectHash: /#\/settings($|[?#])/ },
]
try {
  const tabs = await gj('/json/list'); const page = tabs.find(t => t.type === 'page') || tabs[0]
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
  let id = 0; const pend = new Map()
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } }
  const send = (method, params = {}) => new Promise(r => { const mid = ++id; pend.set(mid, r); ws.send(JSON.stringify({ id: mid, method, params })) })
  await send('Page.enable'); await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 820, deviceScaleFactor: 1, mobile: false })

  console.log('== 路由重定向 ==')
  for (const c of cases) {
    await send('Page.navigate', { url: c.url })
    await sleep(3000)
    const r = await send('Runtime.evaluate', { expression: 'location.hash', returnByValue: true })
    const hash = r.result?.result?.value
    console.log(`${c.expectHash.test(hash) ? '✓' : '✗'} ${c.name} → ${hash}`)
  }

  await send('Page.navigate', { url: `${BASE}/#/settings/pipeline` })
  await sleep(3500)
  const sidebar = await send('Runtime.evaluate', {
    expression: `(() => {
      const aside = document.querySelector('aside')
      const links = [...aside.querySelectorAll('a')].map(a => a.textContent.trim()).filter(Boolean)
      return { links }
    })()`, returnByValue: true,
  })
  const links = sidebar.result?.result?.value?.links || []
  console.log('\n== 侧栏导航项 ==')
  console.log(links.map(l => ` · ${l}`).join('\n'))
  const runGroup = links.filter(l => /流水线|总监评审|我的 AI 团队|自主执行|监工/.test(l))
  console.log(`\nrun 组相关项(${runGroup.length}): ${runGroup.join(' / ')} ${runGroup.length === 3 ? '✓ 已收敛为3项' : '✗ 未收敛'}`)
  const hasDupe = links.filter(l => l === 'Kitsune 卡片').length
  console.log(`侧栏 'Kitsune 卡片' 出现次数: ${hasDupe} ${hasDupe === 0 ? '✓' : '✗ 仍有'}`)

  await send('Page.navigate', { url: `${BASE}/#/settings/connectors` })
  await sleep(3500)
  const conn = await send('Runtime.evaluate', {
    expression: `(() => {
      const body = document.body.innerText
      const count = (s) => body.split(s).length - 1
      return { ideTitle: count('IDE 连接器'), agentTitle: count('Agent API 适配') }
    })()`, returnByValue: true,
  })
  const connV = conn.result?.result?.value
  console.log(`\n== connectors 页双渲染 ==\n'IDE 连接器' 出现 ${connV.ideTitle} 次 ${connV.ideTitle <= 1 ? '✓' : '✗ 仍双渲染'}\n'Agent API 适配' 出现 ${connV.agentTitle} 次 ${connV.agentTitle <= 1 ? '✓' : '✗'}`)

  await send('Page.navigate', { url: `${BASE}/#/settings/health` })
  await sleep(3500)
  const hlth = await send('Runtime.evaluate', {
    expression: `(() => {
      const body = document.body.innerText
      const count = (s) => body.split(s).length - 1
      return { title: count('健康检查') }
    })()`, returnByValue: true,
  })
  const hV = hlth.result?.result?.value
  console.log(`\n== health 页双渲染 ==\n'健康检查' 出现 ${hV.title} 次（含布局 H1，≤2 即正常）`)

  await send('Page.navigate', { url: `${BASE}/#/settings/connectors` })
  await sleep(3000)
  const overflow = await send('Runtime.evaluate', {
    expression: `(() => {
      const issues = []
      document.querySelectorAll('main *').forEach(el => {
        const cs = getComputedStyle(el)
        if (el.scrollHeight > el.clientHeight + 8 && el.clientHeight > 0 && !/auto|scroll/.test(cs.overflowY))
          issues.push(el.className.toString().slice(0, 60))
      })
      return { count: issues.length, sample: issues.slice(0, 4) }
    })()`, returnByValue: true,
  })
  console.log(`\n== connectors 溢出检查 ==\n超高不可滚元素: ${overflow.result?.result?.value?.count || 0} ${(overflow.result?.result?.value?.count || 0) === 0 ? '✓' : '✗'}`)

  ws.close()
} finally { proc.kill() }