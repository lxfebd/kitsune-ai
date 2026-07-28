import type { Writable } from 'node:stream'

import { Mutex } from 'async-mutex'

// NOTICE: 0x1F (ASCII Unit Separator) 作为二进制帧 magic byte。
// Why: 需要与 LSP Content-Length JSON 头部首字节区分开。
// Root cause: LSP 协议原生只传 JSON，TTS 场景必须传裸 PCM，要扩展帧格式。
// 选择 0x1F 的理由：
//   1. Content-Length 头部起始是 'C' = 0x43，0x1F 不会与之冲突
//   2. 不在 ASCII 可打印范围 0x20-0x7E，与 JSON body 首字符 '{' 0x7B / '[' 0x5B 不冲突
//   3. 不在 UTF-8 续字节 0x80-0xBF 或首字节 0xC0-0xFF 范围，帧错位时不会误判
// Ref: docs/research/sidecar-stdin-stdout.md §5.3 Magic byte 选择理由
// Removal condition: 协议重新设计时移除，目前为帧协议核心组成部分。
export const BINARY_FRAME_MAGIC = 0x1F

const HEADER_PREFIX = 'Content-Length: '
const HEADER_TERMINATOR = '\r\n\r\n'
const HEADER_TERMINATOR_BUFFER = Buffer.from(HEADER_TERMINATOR, 'ascii')

/** JSON-RPC 2.0 消息，request/response/notification 共用此形状。 */
export interface JsonMessage {
  jsonrpc: '2.0'
  id?: string | number
  method?: string
  params?: unknown
  result?: unknown
  error?: { code: number, message: string, data?: unknown }
}

/** 二进制音频帧。endOfStream=true 时 data 为空，表示流结束标记。 */
export interface BinaryFrame {
  data: Uint8Array
  endOfStream: boolean
}

export interface FrameReaderHandlers {
  onJson: (message: JsonMessage) => void
  onBinary: (frame: BinaryFrame) => void
  onError: (error: unknown) => void
}

export interface FrameReader {
  /** 喂入 stdout 收到的 chunk，内部累积并按帧边界回调。 */
  feed: (chunk: Buffer) => void
}

type ParseState =
  | { kind: 'readFirstByte' }
  | { kind: 'readBinaryLength' }
  | { kind: 'readBinaryBody', length: number }
  | { kind: 'readHeader' }
  | { kind: 'readJsonBody', length: number }

/**
 * 创建流式帧解析器。
 *
 * 状态机：先读首字节判断帧类型，0x1F 走二进制分支，其余视为 JSON 头部起始。
 * 同一 stdout 流上 JSON 消息与二进制音频帧可任意交错，按字节区分不会混淆。
 */
export function createFrameReader(handlers: FrameReaderHandlers): FrameReader {
  // NOTICE: 用 undefined 初始化而非 Buffer.alloc(0)，避免 TypeScript 5.7+ 的
  // Buffer<ArrayBuffer> vs Buffer<ArrayBufferLike> 泛型推断冲突。
  // Root cause: Buffer.alloc(0) 返回 Buffer<ArrayBuffer>，而 stream 'data' 事件
  // 传入的 chunk 类型是 Buffer<ArrayBufferLike>，两者不可互相赋值。
  // Removal condition: 升级到统一 Buffer 泛型后可改回 Buffer.alloc(0)。
  let buffer: Buffer | undefined
  let state: ParseState = { kind: 'readFirstByte' }

  function feed(chunk: Buffer) {
    buffer = buffer && buffer.length > 0 ? Buffer.concat([buffer, chunk]) : chunk
    // 循环消费完整帧，不完整则保留剩余 buffer 等待下一次 feed
    while (consume())
      ;
  }

  function consume(): boolean {
    if (!buffer || buffer.length === 0)
      return false

    if (state.kind === 'readFirstByte') {
      const first = buffer[0]
      if (first === BINARY_FRAME_MAGIC) {
        buffer = buffer.subarray(1)
        state = { kind: 'readBinaryLength' }
        return true
      }
      // 非 magic 字节视为 JSON 头部起始（'C' = 0x43 是 Content-Length 的首字母，
      // 但用宽松判断避免 sidecar 实现细节差异导致解析失败）
      state = { kind: 'readHeader' }
      return true
    }

    if (state.kind === 'readBinaryLength') {
      if (buffer.length < 4)
        return false
      const length = buffer.readUInt32LE(0)
      buffer = buffer.subarray(4)
      if (length === 0) {
        // length=0 是 end-of-stream 标记，无 body
        handlers.onBinary({ data: new Uint8Array(0), endOfStream: true })
        state = { kind: 'readFirstByte' }
        return true
      }
      state = { kind: 'readBinaryBody', length }
      return true
    }

    if (state.kind === 'readBinaryBody') {
      if (buffer.length < state.length)
        return false
      const data = new Uint8Array(buffer.subarray(0, state.length))
      buffer = buffer.subarray(state.length)
      handlers.onBinary({ data, endOfStream: false })
      state = { kind: 'readFirstByte' }
      return true
    }

    if (state.kind === 'readHeader') {
      const terminatorIndex = buffer.indexOf(HEADER_TERMINATOR_BUFFER)
      if (terminatorIndex < 0)
        return false
      const headerText = buffer.subarray(0, terminatorIndex).toString('ascii')
      buffer = buffer.subarray(terminatorIndex + HEADER_TERMINATOR_BUFFER.length)
      const length = parseContentLength(headerText)
      if (length === undefined) {
        handlers.onError(new Error(`Invalid sidecar frame header: ${headerText}`))
        state = { kind: 'readFirstByte' }
        return true
      }
      state = { kind: 'readJsonBody', length }
      return true
    }

    if (state.kind === 'readJsonBody') {
      if (buffer.length < state.length)
        return false
      const bodyBytes = buffer.subarray(0, state.length)
      buffer = buffer.subarray(state.length)
      const parsed = safeParseJson(bodyBytes.toString('utf-8'))
      if (parsed !== undefined)
        handlers.onJson(parsed)
      else
        handlers.onError(new Error('Failed to parse sidecar JSON body'))
      state = { kind: 'readFirstByte' }
      return true
    }

    return false
  }

  return { feed }
}

function parseContentLength(headerText: string): number | undefined {
  // LSP 头部可能有多个字段，逐行查找 Content-Length
  for (const line of headerText.split('\r\n')) {
    const trimmed = line.trim()
    if (trimmed.toLowerCase().startsWith('content-length:')) {
      const value = trimmed.slice('content-length:'.length).trim()
      const length = Number.parseInt(value, 10)
      if (Number.isFinite(length) && length >= 0)
        return length
    }
  }
  return undefined
}

function safeParseJson(text: string): JsonMessage | undefined {
  try {
    return JSON.parse(text) as JsonMessage
  }
  catch {
    return undefined
  }
}

export interface FrameWriter {
  /** 写一条 JSON-RPC 消息（Content-Length 头 + body）。 */
  writeJson: (message: JsonMessage) => Promise<void>
  /** 写一帧二进制音频数据。 */
  writeBinary: (data: Uint8Array) => Promise<void>
  /** 写 end-of-stream 标记（length=0 的二进制帧）。 */
  writeEndOfStream: () => Promise<void>
}

/**
 * 创建帧写入器，内部用 Mutex 串行化写入，避免并发写把头部与 body 交错。
 *
 * 使用：把 child.stdin 传入即可。返回的方法均已处理背压（await stream.write）。
 */
export function createFrameWriter(stream: Writable): FrameWriter {
  const mutex = new Mutex()

  async function writeRaw(chunks: Buffer[]): Promise<void> {
    await mutex.runExclusive(async () => {
      for (const chunk of chunks) {
        // stream.write 返回 false 时表示内部缓冲超 highWaterMark，
        // 需等 'drain' 事件；Node.js 的 writable.write 已封装此语义，
        // 返回 Promise 在 drain 后 resolve，背压由 await 自动处理
        const ok = stream.write(chunk)
        if (!ok)
          await new Promise<void>(resolve => stream.once('drain', () => resolve()))
      }
    })
  }

  return {
    async writeJson(message: JsonMessage) {
      const payload = Buffer.from(JSON.stringify(message), 'utf-8')
      const header = Buffer.from(`${HEADER_PREFIX}${payload.length}${HEADER_TERMINATOR}`, 'ascii')
      await writeRaw([header, payload])
    },
    async writeBinary(data: Uint8Array) {
      const header = Buffer.alloc(5)
      header[0] = BINARY_FRAME_MAGIC
      header.writeUInt32LE(data.length, 1)
      await writeRaw([header, Buffer.from(data)])
    },
    async writeEndOfStream() {
      const header = Buffer.alloc(5)
      header[0] = BINARY_FRAME_MAGIC
      header.writeUInt32LE(0, 1)
      await writeRaw([header])
    },
  }
}
