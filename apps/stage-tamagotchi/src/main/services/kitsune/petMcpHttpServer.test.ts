/**
 * petMcpHttpServer 端到端测试
 *
 * 用官方 SDK 的 StreamableHTTPClientTransport 真连本地随机端口,覆盖:
 *  - listTools 暴露 pet_report + triggerReaction
 *  - pet_report 调用 → onPetReport 回调收到归一化数据
 *  - triggerReaction 调用 → onPetReaction 回调
 *  - 契约校验失败 → filtered/invalid-payload
 *  - petMcpBridge 透传链路（HTTP POST /pet-report）→ onPetReport
 *  - 多客户端并发各自独立会话
 *  - start/stop 幂等、端口绑定、stop 释放
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getPort } from 'get-port-please'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

import { createPetMcpHttpServer } from './petMcpHttpServer'
import type { PetMcpHttpServer } from './petMcpHttpServer'
import { createPetMcpBridge } from './petMcpBridge'

// 每个用例用唯一的随机端口。固定端口（如默认 3000）会让 undici keep-alive 连接池
// 复用上一个用例已停止 server 留下的死连接 → read ECONNRESET（单跑通过、全量跑偶发失败）。
async function uniquePort(): Promise<number> {
  return getPort({ random: true })
}

describe('petMcpHttpServer', () => {
  let server: PetMcpHttpServer | undefined
  let port = 0
  const reported: Array<Record<string, unknown>> = []
  const reacted: Array<Record<string, unknown>> = []

  const onPetReport = async (report: unknown) => {
    reported.push(report as Record<string, unknown>)
    return { status: 'queued' as const, reactionId: 'report-1' }
  }
  const onPetReaction = async (contract: unknown) => {
    reacted.push(contract as Record<string, unknown>)
    return { status: 'queued' as const, reactionId: 'react-1' }
  }

  beforeEach(async () => {
    port = await uniquePort()
    server = createPetMcpHttpServer({ onPetReport, onPetReaction, port })
    await server.start()
  })

  afterEach(async () => {
    await server?.stop()
    server = undefined
    reported.length = 0
    reacted.length = 0
  })

  async function connect(): Promise<Client> {
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`))
    const client = new Client({ name: 'pet-test', version: '0.0.1' })
    await client.connect(transport)
    return client
  }

  it('listTools 暴露 pet_report 与 triggerReaction', async () => {
    const client = await connect()
    const tools = await client.listTools()
    const names = tools.tools.map(t => t.name)
    expect(names).toContain('pet_report')
    expect(names).toContain('triggerReaction')
    await client.close()
  })

  it('pet_report 调用 → onPetReport 回调收到归一化数据', async () => {
    const client = await connect()
    const res = await client.callTool({
      name: 'pet_report',
      arguments: { source: 'zcode', activity: 'executing', tool: 'Bash', message: '跑测试' },
    })
    await client.close()

    expect(reported.length).toBe(1)
    expect(reported[0]).toMatchObject({
      source: 'zcode',
      activity: 'executing',
      tool: 'Bash',
      message: '跑测试',
    })
    // 工具返回 queued
    const text = JSON.stringify(res.content ?? [])
    expect(text).toContain('queued')
  })

  it('triggerReaction 调用 → onPetReaction 回调', async () => {
    const client = await connect()
    await client.callTool({
      name: 'triggerReaction',
      arguments: { type: 'celebrate', source: 'claude_code', summary: '测试全绿' },
    })
    await client.close()

    expect(reacted.length).toBe(1)
    expect(reacted[0]).toMatchObject({ type: 'celebrate', source: 'claude_code' })
  })

  it('契约校验失败 → filtered/invalid-payload', async () => {
    const client = await connect()
    // triggerReaction 缺 source → discriminatedUnion 拒绝
    const res = await client.callTool({
      name: 'triggerReaction',
      arguments: { type: 'celebrate', summary: 'x' },
    })
    await client.close()

    expect(res.isError).toBe(true)
    const text = JSON.stringify(res.content ?? [])
    expect(text).toContain('invalid-payload')
    expect(reacted.length).toBe(0)
  })

  it('未知工具 → filtered 且不触发回调', async () => {
    const client = await connect()
    const res = await client.callTool({ name: 'nope', arguments: {} })
    await client.close()
    expect(res.isError).toBe(true)
    expect(reported.length).toBe(0)
    expect(reacted.length).toBe(0)
  })

  it('多客户端并发各自独立会话', async () => {
    const c1 = await connect()
    const c2 = await connect()
    await Promise.all([
      c1.callTool({ name: 'pet_report', arguments: { source: 'zcode', activity: 'thinking' } }),
      c2.callTool({ name: 'pet_report', arguments: { source: 'cursor', activity: 'executing' } }),
    ])
    await c1.close()
    await c2.close()

    expect(reported.length).toBe(2)
    const sources = reported.map(r => r.source).sort()
    expect(sources).toEqual(['cursor', 'zcode'])
  })

  it('stop 幂等 + stop 后端口释放', async () => {
    await server!.stop()
    await server!.stop() // 第二遍不应抛
    // 端口释放后应能重新创建
    const server2 = createPetMcpHttpServer({ onPetReport, onPetReaction, port })
    await server2.start()
    await server2.stop()
  })
})

describe('petMcpBridge /pet-report 透传链路', () => {
  let bridge: ReturnType<typeof createPetMcpBridge> | undefined
  let port = 0
  const reportHandler = async () => {
    return { status: 'queued' as const, reactionId: 'bridge-report' }
  }

  beforeEach(async () => {
    port = await uniquePort()
    bridge = createPetMcpBridge({
      onReaction: async () => ({ status: 'queued' as const, reactionId: 'x' }),
      onPetReport: reportHandler,
      port,
    })
    bridge.start()
  })

  afterEach(async () => {
    bridge?.stop()
    bridge = undefined
  })

  it('POST /pet-report 透传到 onPetReport', async () => {
    // bridge.start() 是同步的（listen 不 await），重试直到监听完成，避免首连 ECONNREFUSED
    let res: Response | undefined
    const deadline = Date.now() + 3000
    while (Date.now() < deadline) {
      try {
        res = await fetch(`http://127.0.0.1:${port}/pet-report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'zcode', activity: 'completed', message: '搞定' }),
        })
        break
      }
      catch {
        await new Promise(r => setTimeout(r, 25))
      }
    }
    expect(res).toBeDefined()
    const body = await res!.json()
    expect(res!.status).toBe(200)
    expect(body.status).toBe('queued')
  })
})