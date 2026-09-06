import type { H3CrossWsApp, H3CrossWsResponse } from '@kitsune/better-ws/server/h3'

import type { AppOptions, SetupAppResult } from '..'

import { isIP } from 'node:net'
import { networkInterfaces } from 'node:os'

import { useLogg } from '@guiiai/logg'
import { merge } from '@moeru/std'
import { createH3CrossWsPlugin } from '@kitsune/better-ws/server/h3'
import { serve } from 'h3'

import { normalizeLoggerConfig, setupApp } from '..'

export interface ServerOptions extends AppOptions {
  port?: number
  hostname?: string
  tlsConfig?: {
    cert?: string
    key?: string
    passphrase?: string
  } | null
}

interface ServerInstance {
  close: (closeActiveConnections?: boolean) => Promise<void>
}

export interface Server {
  getConnectionHost: () => string[]
  start: () => Promise<void>
  stop: () => Promise<void>
  restart: () => Promise<void>
  updateConfig: (newOptions: ServerOptions) => void
  /** Subscribes to peer open events; returns an unsubscribe function. */
  onPeerOpen: (handler: (peerId: string) => void) => () => void
  /** Subscribes to peer close events; returns an unsubscribe function. */
  onPeerClose: (handler: (peerId: string) => void) => () => void
  /** Subscribes to incoming text messages; returns an unsubscribe function. */
  onMessage: (handler: (peerId: string, text: string) => void) => () => void
  /** Sends a text message to a specific peer; returns false if the peer is gone. */
  sendToPeer: (peerId: string, message: string) => boolean
  /** Lists all currently connected peer ids. */
  listPeerIds: () => string[]
}

function isAddressInUseError(error: unknown) {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
}

/**
 * Collects local IP addresses that can be used to reach the server from the LAN.
 *
 * Use when:
 * - Building connection hints for `0.0.0.0` listeners
 * - Showing reachable addresses in logs or UI
 *
 * Expects:
 * - Virtual interfaces should be ignored to reduce noisy or misleading addresses
 *
 * Returns:
 * - A de-duplicated list of valid IP addresses discovered from the host network interfaces
 */
export function getLocalIPs(): string[] {
  const interfaces = networkInterfaces()
  const addresses = new Set<string>()

  const VIRTUAL_INTERFACE_PREFIXES = [
    'vboxnet',
    'vmnet',
    'docker',
    'br-',
    'veth',
    'utun',
    'wg',
    'tap',
    'tun',
  ]
  const isVirtualInterface = (name: string) =>
    VIRTUAL_INTERFACE_PREFIXES.some(prefix => name.startsWith(prefix))

  for (const [name, entries] of Object.entries(interfaces)) {
    if (!entries)
      continue
    if (isVirtualInterface(name))
      continue

    for (const entry of entries) {
      const rawAddress = entry.address
      if (!rawAddress)
        continue

      const address = rawAddress.includes('%') ? rawAddress.split('%')[0] : rawAddress
      if (isIP(address))
        addresses.add(address)
    }
  }

  return [...addresses]
}

/**
 * Creates the websocket server controller for the AIRI runtime.
 *
 * Use when:
 * - Starting, stopping, or restarting the standalone runtime server
 * - Updating bind options between restarts
 *
 * Expects:
 * - The returned controller to manage a single active server instance at a time
 *
 * Returns:
 * - Lifecycle helpers for starting, stopping, restarting, and updating server options
 */
export function createServer(opts?: ServerOptions): Server {
  let options = merge<ServerOptions>({ port: 6121, hostname: '127.0.0.1' }, opts)

  const { appLogFormat, appLogLevel } = normalizeLoggerConfig(options)
  const log = useLogg('@kitsune/server-runtime/server').withLogLevelString(appLogLevel).withFormat(appLogFormat)
  let serverInstance: ServerInstance | null = null
  let startTask: Promise<void> | null = null

  // Host integrations (e.g. connector manager) subscribe via onPeerOpen/onPeerClose/onMessage.
  // Handlers survive across start/stop cycles so subscriptions made before the server starts
  // — or while it is restarting — are re-attached to each new wsServer instance.
  const peerOpenHandlers = new Set<(peerId: string) => void>()
  const peerCloseHandlers = new Set<(peerId: string) => void>()
  const messageHandlers = new Set<(peerId: string, text: string) => void>()
  let activeApp: SetupAppResult | null = null
  let activeUnsubscribers: Array<() => void> = []

  function detachPeerObservers() {
    for (const unsub of activeUnsubscribers)
      unsub()
    activeUnsubscribers = []
    activeApp = null
  }

  function attachPeerObservers(app: SetupAppResult) {
    detachPeerObservers()
    activeApp = app
    activeUnsubscribers.push(
      app.onPeerOpen(peerId => peerOpenHandlers.forEach(h => h(peerId))),
      app.onPeerClose(peerId => peerCloseHandlers.forEach(h => h(peerId))),
      app.onMessage((peerId, text) => messageHandlers.forEach(h => h(peerId, text))),
    )
  }

  log.withFields({ hasTlsConfig: !!options?.tlsConfig }).log('creating server channel')

  async function closeServer(closeActiveConnections = false) {
    if (!serverInstance || typeof serverInstance.close !== 'function') {
      return
    }

    try {
      if (closeActiveConnections) {
        log.log('closing existing server instance')
      }
      await serverInstance.close(closeActiveConnections)
      if (closeActiveConnections) {
        log.log('existing server instance closed')
      }
    }
    catch (error) {
      const nodejsError = error as NodeJS.ErrnoException
      if ('code' in nodejsError && nodejsError.code === 'ERR_SERVER_NOT_RUNNING') {
        return
      }

      log.withError(error).error('Error closing WebSocket server')
    }
    finally {
      serverInstance = null
      detachPeerObservers()
    }
  }

  async function start() {
    if (serverInstance) {
      return
    }
    if (startTask) {
      return startTask
    }

    startTask = (async () => {
      const secureEnabled = options?.tlsConfig != null
      const h3App = setupApp(options)
      const crossWsApp = {
        fetch: async request => await h3App.app.fetch(request) as H3CrossWsResponse,
      } satisfies H3CrossWsApp

      const port = options.port
      const hostname = options.hostname

      const instance = serve(h3App.app, {
        plugins: [createH3CrossWsPlugin(crossWsApp)],
        port,
        hostname,
        tls: options?.tlsConfig || undefined,
        reusePort: true,
        silent: true,
        manual: true,
        gracefulShutdown: {
          forceTimeout: 0.5,
          gracefulTimeout: 0.5,
        },
      })

      try {
        serverInstance = {
          close: async (closeActiveConnections = false) => {
            h3App.dispose()
            log.log('closing server instance')
            await instance.close(closeActiveConnections)
            log.log('server instance closed')
          },
        }

        attachPeerObservers(h3App)
        await instance.serve()

        const protocol = secureEnabled ? 'wss' : 'ws'
        if (hostname === '0.0.0.0') {
          const ips = getLocalIPs().filter(ip => ip !== '127.0.0.1' && ip !== '::1')
          const targets = ips.length > 0 ? ips.join(', ') : 'localhost'
          log.log(`@kitsune/server-runtime started on ${protocol}://0.0.0.0:${port} (reachable via: ${targets})`)
        }
        else {
          log.log(`@kitsune/server-runtime started on ${protocol}://${hostname}:${port}`)
        }
      }
      catch (error) {
        serverInstance = null
        h3App.dispose()
        await instance.close(true).catch(() => {})
        if (isAddressInUseError(error)) {
          log.withError(error).warn('WebSocket server port already in use, assuming an existing listener is available')
          return
        }
        log.withError(error).error('failed to start WebSocket server')
        throw error
      }
    })().finally(() => {
      startTask = null
    })

    return startTask
  }
  async function stop() {
    await closeServer(true)
  }

  async function restart() {
    log.log('restarting server channel', { options })
    await closeServer(true)
    await start()
  }

  function updateConfig(newOptions: ServerOptions) {
    options = merge<ServerOptions>(options, newOptions)
  }

  return {
    getConnectionHost: () => {
      if (options.hostname && options.hostname !== '0.0.0.0' && options.hostname !== '::') {
        return [options.hostname]
      }

      return getLocalIPs()
    },
    start,
    stop,
    restart,
    updateConfig,
    onPeerOpen: (handler) => {
      peerOpenHandlers.add(handler)
      return () => peerOpenHandlers.delete(handler)
    },
    onPeerClose: (handler) => {
      peerCloseHandlers.add(handler)
      return () => peerCloseHandlers.delete(handler)
    },
    onMessage: (handler) => {
      messageHandlers.add(handler)
      return () => messageHandlers.delete(handler)
    },
    sendToPeer: (peerId, message) => activeApp?.sendToPeer(peerId, message) ?? false,
    listPeerIds: () => activeApp?.listPeerIds() ?? [],
  }
}
