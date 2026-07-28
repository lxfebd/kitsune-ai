import type { ClientConnector, ClientEvents } from '@kitsune/server-sdk'

type HostBridgeCommand
  = | { kind: 'connect', id: string, url: string }
    | { kind: 'send', id: string, data: string }
    | { kind: 'close', id: string, code?: number, reason?: string }

type HostBridgeEvent
  = | { kind: 'open', id: string }
    | { kind: 'message', id: string, data: string }
    | { kind: 'error', id: string, message: string }
    | { kind: 'close', id: string, code?: number, reason?: string }

declare global {
  interface Window {
    KitsuneHostBridge?: {
      postMessage: (payload: string) => void
    }
    webkit?: {
      messageHandlers?: {
        kitsuneHostBridge?: {
          postMessage: (payload: string) => void
        }
      }
    }
    __kitsuneHostBridge?: {
      onNativeMessage?: (payload: string) => void
    }
  }
}

const connections = new Map<string, HostBridgeConnection>()

function postBridgeMessage(command: HostBridgeCommand) {
  if (window.KitsuneHostBridge) {
    window.KitsuneHostBridge.postMessage(JSON.stringify(command))
    return
  }

  if (window.webkit?.messageHandlers?.kitsuneHostBridge) {
    window.webkit.messageHandlers.kitsuneHostBridge.postMessage(JSON.stringify(command))
    return
  }

  throw new Error('Kitsune host websocket bridge is unavailable')
}

function dispatchNativeEvent(payload: string) {
  const event = JSON.parse(payload) as HostBridgeEvent
  const connection = connections.get(event.id)
  if (!connection) {
    return
  }

  connection.handleNativeEvent(event)
}

class HostBridgeConnection {
  readonly id = crypto.randomUUID()
  private opened = false
  private settled = false

  constructor(
    private readonly url: string,
    private readonly events: ClientEvents<string>,
    private readonly resolve: () => void,
    private readonly reject: (error: Error) => void,
  ) {
    connections.set(this.id, this)

    postBridgeMessage({
      kind: 'connect',
      id: this.id,
      url: this.url,
    })
  }

  send(data: string) {
    if (!this.opened) {
      return false
    }

    postBridgeMessage({
      kind: 'send',
      id: this.id,
      data,
    })

    return true
  }

  close(code?: number, reason?: string) {
    if (this.settled && !this.opened) {
      return
    }

    postBridgeMessage({
      kind: 'close',
      id: this.id,
      code,
      reason,
    })
  }

  handleNativeEvent(event: HostBridgeEvent) {
    switch (event.kind) {
      case 'open':
        this.opened = true
        this.settled = true
        this.resolve()
        break

      case 'message':
        this.events.message(event.data)
        break

      case 'error':
        if (!this.settled) {
          this.settled = true
          connections.delete(this.id)
          this.reject(new Error(event.message))
          return
        }

        this.events.error(new Error(event.message))
        break

      case 'close':
        connections.delete(this.id)
        if (!this.settled) {
          this.settled = true
          this.reject(createCloseBeforeOpenError(event))
          return
        }

        this.opened = false
        this.events.close({ code: event.code, reason: event.reason })
        break
    }
  }
}

function createCloseBeforeOpenError(event: Extract<HostBridgeEvent, { kind: 'close' }>) {
  const reason = event.reason ? ` ${event.reason}` : ''
  const code = typeof event.code === 'number' ? ` with code ${event.code}` : ''
  return new Error(`Kitsune host websocket bridge closed before opening${code}.${reason}`)
}

export function getHostWebSocketConnector(url: string): ClientConnector<string> | undefined {
  if (!window.KitsuneHostBridge && !window.webkit?.messageHandlers?.kitsuneHostBridge) {
    return undefined
  }

  window.__kitsuneHostBridge = window.__kitsuneHostBridge ?? {}
  window.__kitsuneHostBridge.onNativeMessage = dispatchNativeEvent

  return {
    connect(events) {
      let connection: HostBridgeConnection | undefined
      const opened = new Promise<void>((resolve, reject) => {
        connection = new HostBridgeConnection(url, events, resolve, reject)
      })

      return opened.then(() => {
        const activeConnection = connection
        if (!activeConnection) {
          throw new Error('Kitsune host websocket bridge connection was not created')
        }

        return {
          send: message => activeConnection.send(message),
          close: (code?: number, reason?: string) => activeConnection.close(code, reason),
        }
      })
    },
  }
}
