import type { AddressInfo } from 'node:net'

import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocketServer } from 'ws'

import { createAliyunNlsStreamResponse } from './session'

interface MockAliyunUpstream {
  url: string
  receivedTextFrames: string[]
  receivedBinaryFrames: Buffer[]
  /** Resolves when the upstream sees its connection close (client abort path). */
  connectionClosed: Promise<void>
  close: () => Promise<void>
}

async function startMockAliyunUpstream(): Promise<MockAliyunUpstream> {
  const receivedTextFrames: string[] = []
  const receivedBinaryFrames: Buffer[] = []
  const httpServer = createServer()
  const wss = new WebSocketServer({ server: httpServer })

  let notifyConnectionClosed: () => void = () => {}
  const connectionClosed = new Promise<void>((resolve) => {
    notifyConnectionClosed = resolve
  })

  wss.on('connection', (ws) => {
    ws.on('close', () => notifyConnectionClosed())
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        receivedBinaryFrames.push(Buffer.from(data as Buffer))
        return
      }

      const text = data.toString()
      receivedTextFrames.push(text)
      const parsed = JSON.parse(text) as { header?: { name?: string } }
      if (parsed.header?.name === 'StartTranscription') {
        ws.send(JSON.stringify({
          header: { name: 'TranscriptionStarted' },
          payload: { session_id: 'mock-session' },
        }))
      }
      if (parsed.header?.name === 'StopTranscription') {
        ws.send(JSON.stringify({
          header: { name: 'SentenceEnd' },
          payload: { result: 'hello airi' },
        }))
        ws.send(JSON.stringify({
          header: { name: 'TranscriptionCompleted' },
        }))
      }
    })
  })

  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', resolve)
  })

  const { port } = httpServer.address() as AddressInfo

  return {
    url: `ws://127.0.0.1:${port}`,
    receivedTextFrames,
    receivedBinaryFrames,
    connectionClosed,
    async close() {
      wss.close()
      await new Promise<void>(resolve => httpServer.close(() => resolve()))
    },
  }
}

function streamOf(chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks)
        controller.enqueue(chunk)
      controller.close()
    },
  })
}

async function readText(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let text = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break
    text += decoder.decode(value, { stream: true })
  }
  text += decoder.decode()
  return text
}

describe('createAliyunNlsStreamResponse', () => {
  let upstream: MockAliyunUpstream | undefined

  afterEach(async () => {
    await upstream?.close()
    upstream = undefined
  })

  /**
   * @example
   * createAliyunNlsStreamResponse({ audioStream, credentials })
   */
  it('bridges client audio chunks to Aliyun NLS and emits SSE transcript deltas', async () => {
    upstream = await startMockAliyunUpstream()

    const response = createAliyunNlsStreamResponse({
      audioStream: streamOf([Buffer.from([1, 2]), Buffer.from([3, 4])]),
      credentials: {
        accessKeyId: 'ak',
        accessKeySecret: 'secret',
        appKey: 'app',
        region: 'cn-shanghai',
      },
      createToken: async () => ({ token: 'mock-token', expiresAt: Date.now() + 3600_000 }),
      websocketBaseURL: upstream.url,
    })

    const body = await readText(response.body!)

    expect(body).toContain('data: {"delta":"hello airi\\n","type":"transcript.text.delta"}')
    expect(body).toContain('data: {"delta":"","type":"transcript.text.done"}')
    expect(upstream.receivedBinaryFrames).toEqual([
      Buffer.from([1, 2]),
      Buffer.from([3, 4]),
    ])

    const startFrame = JSON.parse(upstream.receivedTextFrames[0]) as {
      header: { appkey: string, name: string }
      payload: { format: string, sample_rate: number, enable_intermediate_result: boolean }
    }
    expect(startFrame.header.appkey).toBe('app')
    expect(startFrame.header.name).toBe('StartTranscription')
    expect(startFrame.payload.format).toBe('pcm')
    expect(startFrame.payload.sample_rate).toBe(16000)
    expect(startFrame.payload.enable_intermediate_result).toBe(true)

    const stopFrame = JSON.parse(upstream.receivedTextFrames.at(-1)!) as { header: { name: string } }
    expect(stopFrame.header.name).toBe('StopTranscription')
  })

  it('closes the upstream Aliyun websocket when the client cancels the SSE stream', async () => {
    upstream = await startMockAliyunUpstream()

    // An infinite audio stream keeps the session alive until we cancel.
    const infiniteStream = new ReadableStream<Uint8Array>({
      // No pull: the stream simply never produces chunks and never ends, so the
      // session stays connected until the client cancels the response body.
      pull() {
        return new Promise<void>(() => {})
      },
    })

    const response = createAliyunNlsStreamResponse({
      audioStream: infiniteStream,
      credentials: {
        accessKeyId: 'ak',
        accessKeySecret: 'secret',
        appKey: 'app',
        region: 'cn-shanghai',
      },
      createToken: async () => ({ token: 'mock-token', expiresAt: Date.now() + 3600_000 }),
      websocketBaseURL: upstream.url,
    })

    // Wait for the upstream to be connected (handshake + StartTranscription)
    // before cancelling, so the close is exercised on an established socket.
    await vi.waitFor(() => {
      expect(upstream!.receivedTextFrames.some(f => f.includes('StartTranscription'))).toBe(true)
    })

    // Reading the stream then cancelling simulates a client disconnect before
    // the upstream finishes. Regression: `cancel()` used to be a no-op, so the
    // upstream WS was never closed and the connection (and billing) leaked.
    const reader = response.body!.getReader()
    await reader.cancel()

    await expect(upstream.connectionClosed).resolves.toBeUndefined()
  })
})
