import type { ServerChannelQrPayload } from '@kitsune/stage-shared/server-channel-qr'

import { errorMessageFrom } from '@moeru/std'
import { Client, createTextProtocolConnector, WebSocketEventSource } from '@kitsune/server-sdk'

import { getHostWebSocketConnector } from './websocket-bridge'

export async function probeServerChannelQrPayload(payload: ServerChannelQrPayload) {
  if (!payload.urls.some(url => getHostWebSocketConnector(url))) {
    throw new Error('Kitsune host websocket bridge is unavailable')
  }

  const errors: string[] = []

  for (const url of payload.urls) {
    const connector = getHostWebSocketConnector(url)
    if (!connector) {
      throw new Error('Kitsune host websocket bridge is unavailable')
    }

    const client = new Client({
      autoConnect: false,
      autoReconnect: false,
      connectTimeoutMs: 2_000,
      name: WebSocketEventSource.StageWeb,
      token: payload.authToken,
      url,
      connector: createTextProtocolConnector(connector),
    })

    try {
      await client.connect({ timeout: 2_500 })
      client.close()
      return url
    }
    catch (error) {
      client.close()
      errors.push(`${url}: ${errorMessageFrom(error) ?? 'Unknown websocket probe error'}`)
    }
  }

  throw new Error(`No candidate server channel URL was reachable. ${errors.join('; ')}`)
}
