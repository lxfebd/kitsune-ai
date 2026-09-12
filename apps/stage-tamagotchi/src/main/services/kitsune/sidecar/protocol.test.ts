import { describe, expect, it } from 'vitest'

import { createFrameReader, createFrameWriter, type BinaryFrame, type JsonMessage } from './protocol'
import { Writable } from 'node:stream'

function makeCollector() {
  const jsons: JsonMessage[] = []
  const binaries: BinaryFrame[] = []
  const errors: unknown[] = []
  const reader = createFrameReader({
    onJson: m => jsons.push(m),
    onBinary: f => binaries.push(f),
    onError: e => errors.push(e),
  })
  return { reader, jsons, binaries, errors }
}

/** 构造一个等价的 Buffer 写入器，用于捕获 writer 的输出字节。 */
function makeSink() {
  const chunks: Buffer[] = []
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.from(chunk))
      cb()
    },
  })
  return { stream, chunks }
}

describe('createFrameReader', () => {
  it('解析单个 JSON 消息', () => {
    const { reader, jsons, errors } = makeCollector()
    const payload = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: '1', result: 'ok' }), 'utf-8')
    reader.feed(Buffer.concat([Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`, 'ascii'), payload]))
    expect(jsons).toHaveLength(1)
    expect(jsons[0]).toMatchObject({ id: '1', result: 'ok' })
    expect(errors).toHaveLength(0)
  })

  it('跨 chunk 边界累积解析（头部与 body 分开到达）', () => {
    const { reader, jsons } = makeCollector()
    const payload = Buffer.from(JSON.stringify({ jsonrpc: '2.0', method: 'ping' }), 'utf-8')
    const full = Buffer.concat([Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`, 'ascii'), payload])
    // 逐字节喂入，模拟最恶劣的分片
    for (const byte of full)
      reader.feed(Buffer.from([byte]))
    expect(jsons).toHaveLength(1)
    expect(jsons[0]).toMatchObject({ method: 'ping' })
  })

  it('一个 chunk 内解析多条连续消息', () => {
    const { reader, jsons } = makeCollector()
    const p1 = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 'a' }), 'utf-8')
    const p2 = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 'b' }), 'utf-8')
    reader.feed(Buffer.concat([
      Buffer.from(`Content-Length: ${p1.length}\r\n\r\n`, 'ascii'), p1,
      Buffer.from(`Content-Length: ${p2.length}\r\n\r\n`, 'ascii'), p2,
    ]))
    expect(jsons.map(m => m.id)).toEqual(['a', 'b'])
  })

  it('解析二进制音频帧并还原数据', () => {
    const { reader, binaries } = makeCollector()
    const data = new Uint8Array([1, 2, 3, 255, 0])
    const header = Buffer.alloc(5)
    header[0] = 0x1F
    header.writeUInt32LE(data.length, 1)
    reader.feed(Buffer.concat([header, Buffer.from(data)]))
    expect(binaries).toHaveLength(1)
    expect(binaries[0].endOfStream).toBe(false)
    expect([...binaries[0].data]).toEqual([...data])
  })

  it('length=0 的二进制帧是 end-of-stream 标记', () => {
    const { reader, binaries } = makeCollector()
    const header = Buffer.alloc(5)
    header[0] = 0x1F
    header.writeUInt32LE(0, 1)
    reader.feed(header)
    expect(binaries).toHaveLength(1)
    expect(binaries[0].endOfStream).toBe(true)
    expect(binaries[0].data).toHaveLength(0)
  })

  it('JSON 与二进制帧交错时按字节正确分帧', () => {
    const { reader, jsons, binaries } = makeCollector()
    const p1 = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: '1' }), 'utf-8')
    const audio = new Uint8Array([9, 8, 7])
    const binHeader = Buffer.alloc(5)
    binHeader[0] = 0x1F
    binHeader.writeUInt32LE(audio.length, 1)
    const eosHeader = Buffer.alloc(5)
    eosHeader[0] = 0x1F
    eosHeader.writeUInt32LE(0, 1)
    reader.feed(Buffer.concat([
      Buffer.from(`Content-Length: ${p1.length}\r\n\r\n`, 'ascii'), p1,
      binHeader, Buffer.from(audio),
      eosHeader,
    ]))
    expect(jsons.map(m => m.id)).toEqual(['1'])
    expect(binaries.map(b => b.endOfStream)).toEqual([false, true])
    expect([...binaries[0].data]).toEqual([...audio])
  })

  it('无效 JSON body 触发 onError 并复位状态机', () => {
    const { reader, jsons, errors } = makeCollector()
    // body 长度与预留字节精确对齐，确保解析失败后无残留字节
    reader.feed(Buffer.from('Content-Length: 6\r\n\r\n', 'ascii'))
    reader.feed(Buffer.from('{{{{{{', 'utf-8'))
    expect(errors).toHaveLength(1)
    // 状态机复位后还能继续解析后续正常消息
    const p2 = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: '2' }), 'utf-8')
    reader.feed(Buffer.concat([Buffer.from(`Content-Length: ${p2.length}\r\n\r\n`, 'ascii'), p2]))
    expect(jsons.map(m => m.id)).toEqual(['2'])
    expect(errors).toHaveLength(1)
  })

  it('非法 Content-Length 头触发 onError', () => {
    const { reader, jsons, errors } = makeCollector()
    reader.feed(Buffer.from('Content-Length: abc\r\n\r\n{', 'ascii'))
    expect(errors).toHaveLength(1)
    expect(jsons).toHaveLength(0)
  })

  it('多个头部字段时只取 Content-Length', () => {
    const { reader, jsons } = makeCollector()
    const payload = Buffer.from(JSON.stringify({ jsonrpc: '2.0', method: 'x' }), 'utf-8')
    reader.feed(Buffer.concat([
      Buffer.from(`Content-Type: application/json\r\nContent-Length: ${payload.length}\r\n\r\n`, 'ascii'),
      payload,
    ]))
    expect(jsons).toHaveLength(1)
  })
})

describe('createFrameWriter', () => {
  it('writeJson 产出 Content-Length 头 + body', async () => {
    const { stream, chunks } = makeSink()
    const writer = createFrameWriter(stream)
    await writer.writeJson({ jsonrpc: '2.0', id: 1, method: 'test' })
    const all = Buffer.concat(chunks)
    const text = all.toString('utf-8')
    expect(text).toMatch(/^Content-Length: \d+\r\n\r\n/)
    const body = text.slice(text.indexOf('\r\n\r\n') + 4)
    expect(JSON.parse(body)).toMatchObject({ jsonrpc: '2.0', id: 1, method: 'test' })
  })

  it('writeBinary 产出 magic + LE 长度 + body', async () => {
    const { stream, chunks } = makeSink()
    const writer = createFrameWriter(stream)
    await writer.writeBinary(new Uint8Array([1, 2, 3, 4]))
    const all = Buffer.concat(chunks)
    expect(all[0]).toBe(0x1F)
    expect(all.readUInt32LE(1)).toBe(4)
    expect([...all.subarray(5)]).toEqual([1, 2, 3, 4])
  })

  it('writeEndOfStream 产出 length=0 的二进制帧', async () => {
    const { stream, chunks } = makeSink()
    const writer = createFrameWriter(stream)
    await writer.writeEndOfStream()
    const all = Buffer.concat(chunks)
    expect(all[0]).toBe(0x1F)
    expect(all.readUInt32LE(1)).toBe(0)
    expect(all).toHaveLength(5)
  })

  it('writeJson 与 writeBinary 交错时头部与 body 不被撕裂', async () => {
    const { stream, chunks } = makeSink()
    const writer = createFrameWriter(stream)
    await Promise.all([
      writer.writeJson({ jsonrpc: '2.0', id: 'x' }),
      writer.writeBinary(new Uint8Array([5, 6, 7, 8])),
      writer.writeEndOfStream(),
    ])
    const all = Buffer.concat(chunks)
    // 重建解析验证帧完整性：写入器自身输出应能被 reader 无损解析
    const { reader, jsons, binaries } = makeCollector()
    reader.feed(all)
    expect(jsons.map(m => m.id)).toEqual(['x'])
    expect(binaries.map(b => b.endOfStream)).toEqual([false, true])
    expect([...binaries[0].data]).toEqual([5, 6, 7, 8])
  })
})
