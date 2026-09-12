import type { Server } from '@kitsune/server-runtime/server'

import { createContext } from '@moeru/eventa'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ConnectorTaskResult } from '../../../../shared/eventa'
import {
  electronConnectorChanged,
  electronConnectorList,
  electronConnectorSendTask,
  electronConnectorStatus,
  electronConnectorTaskResult,
} from '../../../../shared/eventa'
import { createConnectorService } from './index'

// defineInvokeHandler 在运行时触碰 electron IPC，这里替换为记录型 stub；
// 其余 @moeru/eventa 导出保持真实（shared/eventa 的契约对象依赖它们）。
const defineInvokeHandlerMock = vi.hoisted(() => vi.fn())

vi.mock('@moeru/eventa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@moeru/eventa')>()
  return {
    ...actual,
    defineInvokeHandler: defineInvokeHandlerMock,
  }
})

vi.mock('@guiiai/logg', () => ({
  useLogg: vi.fn(() => {
    const log = vi.fn()
    return {
      useGlobalConfig: () => ({
        log,
        withFields: () => ({ log }),
      }),
    }
  }),
}))

// ---- serverChannel 夹具 ----

function createServerFake() {
  const sendToPeer = vi.fn((_peer: string, _raw: string) => true)
  const onMessage = vi.fn((_handler: (peerId: string, text: string) => void) => vi.fn())
  const onPeerClose = vi.fn((_handler: (peerId: string) => void) => vi.fn())

  const server = {
    onMessage,
    onPeerClose,
    sendToPeer,
    listPeerIds: vi.fn(() => []),
  } as unknown as Server

  return { server, sendToPeer, onMessage, onPeerClose, messageHandler: (peerId: string, text: string) => { onMessage.mock.calls.at(-1)?.[0](peerId, text) } }
}

// 用真实的 eventa context，捕获服务 emit 的事件。
// 服务签名要求 electron 适配器的 context；核心 createContext() 运行时行为一致，转型即可。
type ConnectorContext = Parameters<typeof createConnectorService>[0]['context']

function createHarness(): ConnectorContext {
  return createContext() as unknown as ConnectorContext
}

describe('createConnectorService', () => {
  let context: ConnectorContext
  let serverFake: ReturnType<typeof createServerFake>
  let service: ReturnType<typeof createConnectorService>
  let changedEvents: unknown[]

  // invoke handler 按 sendEvent.id 收集：call = [context, eventa, handler]
  function handlers(): Map<string, Function> {
    const map = new Map<string, Function>()
    for (const call of defineInvokeHandlerMock.mock.calls) {
      const eventa = call[1] as { sendEvent?: { id: string }, id?: string }
      map.set(eventa.sendEvent?.id ?? eventa.id!, call[2] as Function)
    }
    return map
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    context = createHarness()
    serverFake = createServerFake()
    changedEvents = []
    context.on(electronConnectorChanged, (payload) => {
      changedEvents.push(payload)
    })
    service = createConnectorService({ context, serverChannel: serverFake.server })
  })

  afterEach(() => {
    service.dispose()
  })

  it('registers list/status/send-task invoke handlers', () => {
    expect(defineInvokeHandlerMock).toHaveBeenCalledTimes(3)
    expect(handlers().size).toBe(3)
    expect(handlers().has(electronConnectorList.sendEvent.id)).toBe(true)
    expect(handlers().has(electronConnectorStatus.sendEvent.id)).toBe(true)
    expect(handlers().has(electronConnectorSendTask.sendEvent.id)).toBe(true)
  })

  it('subscribes to channel-server messages and peer close', () => {
    expect(serverFake.onMessage).toHaveBeenCalledTimes(1)
    expect(serverFake.onPeerClose).toHaveBeenCalledTimes(1)
  })

  describe('extension:announce', () => {
    it('registers a connector with type detection from id', () => {
      serverFake.messageHandler('peer-1', JSON.stringify({
        type: 'extension:announce',
        data: { identity: { id: 'com.trae.editor' } },
      }))

      const list = service.listConnectors()
      expect(list).toHaveLength(1)
      expect(list[0]).toMatchObject({ id: 'com.trae.editor', name: 'com.trae.editor', type: 'trae', peerId: 'peer-1' })
      expect(changedEvents).toHaveLength(1)
    })

    it('detects vscode from name containing code', () => {
      serverFake.messageHandler('peer-1', JSON.stringify({
        type: 'extension:announce',
        data: { identity: { id: 'vscode.editor' } },
      }))
      expect(service.listConnectors()[0]!.type).toBe('vscode')
    })

    it('falls back to unknown when nothing matches', () => {
      serverFake.messageHandler('peer-1', JSON.stringify({
        type: 'extension:announce',
        data: { identity: { id: 'some.custom.plugin' } },
      }))
      expect(service.listConnectors()[0]!.type).toBe('unknown')
    })

    it('ignores malformed announce (no identity.id)', () => {
      serverFake.messageHandler('peer-1', JSON.stringify({ type: 'extension:announce', data: {} }))
      expect(service.listConnectors()).toHaveLength(0)
    })
  })

  describe('extension:module:announce', () => {
    it('registers with module name as display name', () => {
      serverFake.messageHandler('peer-1', JSON.stringify({
        type: 'extension:module:announce',
        data: { identity: { extension: { id: 'idea.ultimate' } }, name: 'IntelliJ IDEA' },
      }))

      const list = service.listConnectors()
      expect(list).toHaveLength(1)
      expect(list[0]).toMatchObject({ id: 'idea.ultimate', name: 'IntelliJ IDEA', type: 'idea', peerId: 'peer-1' })
    })
  })

  describe('context:update', () => {
    it('sets lastContext on all connectors of the peer', () => {
      serverFake.messageHandler('peer-1', JSON.stringify({
        type: 'extension:announce',
        data: { identity: { id: 'vscode.editor' } },
      }))
      serverFake.messageHandler('peer-1', JSON.stringify({
        type: 'context:update',
        data: { file: '/src/main.ts', selection: 'foo' },
      }))

      const connector = service.getStatus('vscode.editor')!
      expect(connector.lastContext).toEqual({ file: '/src/main.ts', selection: 'foo' })
      expect(connector.lastContextAt).toBeTypeOf('number')
    })
  })

  describe('task:result', () => {
    it('broadcasts result to subscribers as electronConnectorTaskResult', () => {
      const emitted: unknown[][] = []
      const off = context.on(electronConnectorTaskResult, (payload) => emitted.push([payload]))

      serverFake.messageHandler('peer-1', JSON.stringify({
        type: 'task:result',
        data: { taskId: 'task-1', success: true },
      }))

      expect(emitted).toHaveLength(1)
      const received = emitted[0]![0] as { body: ConnectorTaskResult }
      expect(received.body).toEqual({ taskId: 'task-1', success: true })
      off()
    })

    it('ignores task result without taskId', () => {
      const emitted: unknown[][] = []
      const off = context.on(electronConnectorTaskResult, payload => emitted.push([payload]))
      serverFake.messageHandler('peer-1', JSON.stringify({ type: 'task:result', data: { success: false } }))
      expect(emitted).toHaveLength(0)
      off()
    })
  })

  it('ignores non-JSON or non-business messages', () => {
    serverFake.messageHandler('peer-1', 'not json at all')
    serverFake.messageHandler('peer-1', JSON.stringify({ type: 'heartbeat' }))
    expect(service.listConnectors()).toHaveLength(0)
    expect(changedEvents).toHaveLength(0)
  })

  describe('peer close', () => {
    it('removes all connectors registered on the closed peer', () => {
      serverFake.messageHandler('peer-1', JSON.stringify({
        type: 'extension:announce',
        data: { identity: { id: 'vscode.editor' } },
      }))
      serverFake.messageHandler('peer-2', JSON.stringify({
        type: 'extension:announce',
        data: { identity: { id: 'idea.ultimate' } },
      }))
      expect(service.listConnectors()).toHaveLength(2)

      serverFake.onPeerClose.mock.calls.at(-1)?.[0]('peer-1')
      expect(service.listConnectors()).toHaveLength(1)
      expect(service.listConnectors()[0]!.id).toBe('idea.ultimate')
      expect(changedEvents).toHaveLength(3) // 2 register + 1 removal
    })
  })

  describe('sendTask invoke', () => {
    it('returns error when connector is not found', async () => {
      const handler = handlers().get(electronConnectorSendTask.sendEvent.id)!
      const res = await handler({ id: 'missing', task: { type: 'x' } }, undefined)
      expect(res).toEqual({ ok: false, error: 'Connector not found: missing' })
      expect(serverFake.sendToPeer).not.toHaveBeenCalled()
    })

    it('sends a task:execute message to the connector peer', async () => {
      serverFake.messageHandler('peer-1', JSON.stringify({
        type: 'extension:announce',
        data: { identity: { id: 'vscode.editor' } },
      }))
      const handler = handlers().get(electronConnectorSendTask.sendEvent.id)!
      const res = await handler({ id: 'vscode.editor', task: { type: 'web:fetch', payload: { url: 'https://example.com' } } }, undefined)

      expect(res).toEqual({ ok: true })
      expect(serverFake.sendToPeer).toHaveBeenCalledTimes(1)
      const [peerId, raw] = serverFake.sendToPeer.mock.calls[0]!
      expect(peerId).toBe('peer-1')

      const message = JSON.parse(raw as string) as Record<string, unknown>
      expect(message.type).toBe('task:execute')
      expect(message.data).toEqual({ type: 'web:fetch', payload: { url: 'https://example.com' } })
      const metadata = message.metadata as { source: { id: string }, event: { id: string } }
      expect(metadata.source.id).toBe('kitsune:stage-tamagotchi')
      expect(metadata.event.id).toBeTypeOf('string')
    })

    it('reports peer disconnected when sendToPeer fails', async () => {
      serverFake.messageHandler('peer-1', JSON.stringify({
        type: 'extension:announce',
        data: { identity: { id: 'vscode.editor' } },
      }))
      serverFake.sendToPeer.mockReturnValue(false as never)
      const handler = handlers().get(electronConnectorSendTask.sendEvent.id)!
      const res = await handler({ id: 'vscode.editor', task: { type: 'x' } }, undefined)
      expect(res).toEqual({ ok: false, error: 'Peer disconnected' })
    })
  })

  describe('re-announce', () => {
    it('updates peer association when the same connector id announces from a new peer', () => {
      serverFake.messageHandler('peer-1', JSON.stringify({
        type: 'extension:announce',
        data: { identity: { id: 'vscode.editor' } },
      }))
      serverFake.messageHandler('peer-2', JSON.stringify({
        type: 'extension:announce',
        data: { identity: { id: 'vscode.editor' } },
      }))

      const connector = service.getStatus('vscode.editor')!
      expect(connector.peerId).toBe('peer-2')
      expect(service.listConnectors()).toHaveLength(1)

      // 关闭 peer-1 不再影响已迁移的 connector
      serverFake.onPeerClose.mock.calls.at(-1)?.[0]('peer-1')
      expect(service.listConnectors()).toHaveLength(1)
    })
  })

  describe('dispose', () => {
    it('unsubscribes channel-server handlers and clears registry', () => {
      const unsubMessage = serverFake.onMessage.mock.results[0]!.value
      const unsubPeerClose = serverFake.onPeerClose.mock.results[0]!.value
      serverFake.messageHandler('peer-1', JSON.stringify({
        type: 'extension:announce',
        data: { identity: { id: 'vscode.editor' } },
      }))
      expect(service.listConnectors()).toHaveLength(1)

      service.dispose()
      expect(unsubMessage).toHaveBeenCalledTimes(1)
      expect(unsubPeerClose).toHaveBeenCalledTimes(1)
      expect(service.listConnectors()).toHaveLength(0)
    })
  })
})