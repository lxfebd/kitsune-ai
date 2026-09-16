import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { Server } from '@kitsune/server-runtime/server'
import type { ConnectorInfo, ConnectorTask, ConnectorType } from '../../../../shared/eventa'

import { randomUUID } from 'node:crypto'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'

import {
  electronConnectorChanged,
  electronConnectorList,
  electronConnectorSendTask,
  electronConnectorStatus,
  electronConnectorTaskResult,
} from '../../../../shared/eventa'
import type { ConnectorTaskResult } from '../../../../shared/eventa'

import { getFileLogger } from '../logger'

type MainContext = ReturnType<typeof createContext>['context']

const HOST_SOURCE_ID = 'kitsune:stage-tamagotchi'

function detectType(id: string, name: string): ConnectorType {
  const text = `${id} ${name}`.toLowerCase()
  if (text.includes('trae'))
    return 'trae'
  if (text.includes('vscode') || text.includes('code'))
    return 'vscode'
  if (text.includes('idea') || text.includes('intellij'))
    return 'idea'
  return 'unknown'
}

function tryParseEvent(text: string): { type: string, data: any } | null {
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string')
      return parsed
  }
  catch {
    // 非 JSON 或 superjson 包装格式 — 连接器管理只关心业务事件，
    // 心跳和控制帧在这里无需处理
  }
  return null
}

function buildTaskExecuteMessage(task: ConnectorTask, taskId: string): string {
  return JSON.stringify({
    type: 'task:execute',
    data: {
      // NOTICE: taskId 必须注入到 data 顶层 — 插件端 executeTask 从 payload.taskId 解构
      // 回执 task:result.taskId 回传同一值，主进程 taskRunner 靠它匹配回执。
      // 之前漏掉该字段，导致插件回执 taskId 为空、IDE 任务永远超时。
      taskId,
      // NOTICE: 动作参数必须平铺到 data 顶层 — vscode-kitsune / intellij-kitsune 的
      // executeTask / parseTaskExecute 都从 payload.path / payload.code / payload.command
      // 读取（不认嵌套 payload 子对象）。之前包成 { payload: {...} } 导致参数全丢。
      ...task.payload,
      // 权威字段：type 与 taskId 必须落在 data 顶层且不被 payload 同名键覆盖，
      // 否则插件会把 taskId 当动作参数、或 payload.type 覆盖任务动作。
      type: task.type,
    },
    metadata: {
      source: { id: HOST_SOURCE_ID },
      event: { id: randomUUID() },
    },
  })
}

export interface ConnectorService {
  listConnectors: () => ConnectorInfo[]
  getStatus: (id: string) => ConnectorInfo | null
  // taskId: 本次注入到 task:execute 的收据 key — 插件回执 task:result.taskId 回传同一值。
  // executor 用它在 taskRunner 里匹配回执，务必读该字段而非自行生成。
  sendTask: (id: string, task: ConnectorTask) => { ok: boolean, error?: string, taskId?: string }
  dispose: () => void
}

export function createConnectorService(params: { context: MainContext, serverChannel: Server }): ConnectorService {
  const { context, serverChannel } = params
  const log = useLogg('main/connectors').useGlobalConfig()

  const connectors = new Map<string, ConnectorInfo>()
  // peerId → 该 peer 上注册的 connectorId 集合；peer 断开时一次性清理
  const connectorsByPeer = new Map<string, Set<string>>()

  function snapshotList(): ConnectorInfo[] {
    return [...connectors.values()]
  }

  function emitChanged() {
    context.emit(electronConnectorChanged, snapshotList())
  }

  function registerConnector(peerId: string, id: string, name: string, type: ConnectorType) {
    const existing = connectors.get(id)
    if (existing) {
      // 同一连接器重连或重新 announce — 更新 peer 关联
      if (existing.peerId !== peerId) {
        const oldSet = connectorsByPeer.get(existing.peerId)
        oldSet?.delete(id)
      }
      existing.peerId = peerId
      existing.name = name || existing.name
      existing.type = type
      return
    }

    const connector: ConnectorInfo = {
      id,
      type,
      name,
      peerId,
      connectedAt: Date.now(),
      lastContext: null,
      lastContextAt: null,
    }
    connectors.set(id, connector)

    let set = connectorsByPeer.get(peerId)
    if (!set) {
      set = new Set()
      connectorsByPeer.set(peerId, set)
    }
    set.add(id)

    log.withFields({ connectorId: id, peerId, type }).log('connector registered')
    emitChanged()
  }

  function updateContext(peerId: string, contextData: unknown) {
    const set = connectorsByPeer.get(peerId)
    if (!set || set.size === 0)
      return
    const now = Date.now()
    for (const id of set) {
      const connector = connectors.get(id)
      if (connector) {
        connector.lastContext = contextData
        connector.lastContextAt = now
      }
    }
  }

  function removePeerConnectors(peerId: string) {
    const set = connectorsByPeer.get(peerId)
    if (!set || set.size === 0)
      return
    for (const id of set)
      connectors.delete(id)
    connectorsByPeer.delete(peerId)
    log.withFields({ peerId, count: set.size }).log('peer closed, removed connectors')
    emitChanged()
  }

  const fileLogger = getFileLogger()

  function handleMessage(peerId: string, text: string) {
    const event = tryParseEvent(text)
    if (!event)
      return

    // extension:announce — 连接器注册自身扩展身份
    if (event.type === 'extension:announce') {
      const identity = event.data?.identity
      if (identity && typeof identity.id === 'string') {
        const name = String(identity.id)
        registerConnector(peerId, identity.id, name, detectType(identity.id, name))
        fileLogger.debug('[connectors] event', { eventId: 'extension:announce', node: identity.id, action: 'register', result: 'announced' })
      }
      return
    }

    // extension:module:announce — 连接器注册模块（更具体的来源标识）
    if (event.type === 'extension:module:announce') {
      const identity = event.data?.identity
      const moduleName = typeof event.data?.name === 'string' ? event.data.name : ''
      if (identity?.extension?.id) {
        registerConnector(peerId, identity.extension.id, moduleName || identity.extension.id, detectType(identity.extension.id, moduleName))
        fileLogger.debug('[connectors] event', { eventId: 'extension:module:announce', node: identity.extension.id, action: 'register_module', result: 'announced' })
      }
      return
    }

    // context:update — IDE 连接器推送编辑器上下文
    if (event.type === 'context:update') {
      updateContext(peerId, event.data)
      fileLogger.debug('[connectors] event', { eventId: 'context:update', node: peerId, action: 'context_update', result: 'updated' })
      return
    }

    // task:result — IDE 执行完任务回传结果，广播给订阅者（执行层用）
    if (event.type === 'task:result') {
      const result = event.data as ConnectorTaskResult
      if (result?.taskId) {
        context.emit(electronConnectorTaskResult, result)
        fileLogger.debug('[connectors] event', { eventId: 'task:result', node: result.taskId, action: 'task_result', result: result.success })
      }
      return
    }
  }

  // 订阅 channel-server 的 WebSocket peer 生命周期与消息流
  const unsubMessage = serverChannel.onMessage((peerId, text) => handleMessage(peerId, text))
  const unsubPeerClose = serverChannel.onPeerClose(peerId => removePeerConnectors(peerId))

  // IPC 处理器
  defineInvokeHandler(context, electronConnectorList, async () => snapshotList())

  defineInvokeHandler(context, electronConnectorStatus, async (req) => {
    return connectors.get(req?.id ?? '') ?? null
  })

  defineInvokeHandler(context, electronConnectorSendTask, async (req) => {
    const connector = connectors.get(req?.id ?? '')
    if (!connector)
      return { ok: false, error: `Connector not found: ${req?.id ?? ''}` }

    // 调用方未提供 taskId 时生成（供回执匹配；executor 侧会用自己的 task.id 覆盖）
    const taskId = (req?.task?.payload as Record<string, unknown> | undefined)?.taskId as string | undefined
      ?? randomUUID()
    const sent = serverChannel.sendToPeer(connector.peerId, buildTaskExecuteMessage(req.task, taskId))
    if (!sent)
      return { ok: false, error: 'Peer disconnected' }

    log.withFields({ connectorId: connector.id, peerId: connector.peerId, taskType: req.task.type, taskId }).log('task sent')
    return { ok: true, taskId }
  })

  log.log('connector service started')

  return {
    listConnectors: snapshotList,
    getStatus: (id) => connectors.get(id) ?? null,
    sendTask: (id, task) => {
      const connector = connectors.get(id)
      if (!connector)
        return { ok: false, error: `Connector not found: ${id}` }
      // 生成 taskId（调用方可通过 task.payload.taskId 显式指定），但绝不会把该字段
      // 塞回 payload 平铺给插件 — buildTaskExecuteMessage 负责把 taskId 落到 data 顶层。
      const taskId = (task.payload as Record<string, unknown> | undefined)?.taskId as string | undefined ?? randomUUID()
      const sent = serverChannel.sendToPeer(connector.peerId, buildTaskExecuteMessage(task, taskId))
      return sent ? { ok: true, taskId } : { ok: false, error: 'Peer disconnected' }
    },
    dispose: () => {
      unsubMessage()
      unsubPeerClose()
      connectors.clear()
      connectorsByPeer.clear()
    },
  }
}
