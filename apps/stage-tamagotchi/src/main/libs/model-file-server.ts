/**
 * Local model file server for @huggingface/transformers ONNX models.
 *
 * Serves pre-downloaded model files from the local filesystem via HTTP,
 * bypassing CORS restrictions that prevent the renderer from fetching
 * directly from hf-mirror.com (the renderer's file:// origin has null
 * origin, which most CDNs reject).
 *
 * The Worker sets `env.remoteHost = 'http://localhost:MODEL_SERVER_PORT'`
 * so @huggingface/transformers fetches from this server instead of the CDN.
 *
 * Model files must be pre-downloaded via scripts/download-whisper-model.ps1
 * into the resources/models/ directory.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createReadStream } from 'node:fs'
import { statSync, existsSync, readdirSync } from 'node:fs'
import { join, extname } from 'node:path'
import { app } from 'electron'

export const MODEL_SERVER_PORT = 19528

const MIME_TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.onnx': 'application/octet-stream',
  '.onnx_data': 'application/octet-stream',
  '.bin': 'application/octet-stream',
  '.txt': 'text/plain',
  '.model': 'application/octet-stream',
}

// NOTICE: Models directory resolution follows the same pattern as
// live2d-file-server.ts. In dev mode, app.getAppPath() points to the
// monorepo root's apps/stage-tamagotchi; in production it points to
// the packaged app's resources/app.
function getModelsDir(): string {
  const appPath = app.getAppPath()
  const candidates = [
    // Dev: monorepo root -> resources/models
    join(appPath, '..', '..', 'resources', 'models'),
    // Dev fallback: cwd-based
    join(process.cwd(), '..', '..', 'resources', 'models'),
    // Production: bundled with the app
    join(appPath, 'resources', 'models'),
    // Production fallback: next to the app
    join(appPath, 'models'),
  ]

  for (const dir of candidates) {
    if (existsSync(dir)) {
      return dir
    }
  }
  return candidates[0]
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // CORS headers — same pattern as live2d-file-server.ts
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', '*')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url ?? '/', `http://localhost:${MODEL_SERVER_PORT}`)
  // @huggingface/transformers requests: /{model_id}/resolve/main/{file}
  // Local files are at: resources/models/{model_id}/{file}
  // Strip /resolve/main/ to map to filesystem.
  const requestPath = decodeURIComponent(url.pathname).replace(/\/resolve\/main\//, '/')

  // Security: reject path traversal
  if (requestPath.includes('..')) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  const filePath = join(getModelsDir(), requestPath)

  // 本地未命中时，代理转发到 HF 镜像，保证 transformers.js 请求（如
  // onnx-community/silero-vad、whisper）总能拿到模型，无需用户预下载。
  // 流式转发，保持 Range / Content-Length / Content-Type。
  if (!existsSync(filePath)) {
    const upstream = `https://hf-mirror.com${url.pathname}`
    try {
      const proxyRes = await fetch(upstream, {
        headers: req.headers.range ? { Range: req.headers.range } : undefined,
        signal: AbortSignal.timeout(60_000),
      })
      if (!proxyRes.ok || !proxyRes.body) {
        res.writeHead(proxyRes.status)
        res.end()
        return
      }
      const reader = proxyRes.body.getReader()
      // 流式转发到客户端
      res.writeHead(proxyRes.status, {
        'Content-Type': proxyRes.headers.get('content-type') ?? 'application/octet-stream',
        'Content-Length': proxyRes.headers.get('content-length') ?? undefined,
        'Accept-Ranges': 'bytes',
        'Content-Range': proxyRes.headers.get('content-range') ?? undefined,
        'Cache-Control': 'public, max-age=86400',
      })
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          res.write(Buffer.from(value))
        }
      }
      finally {
        reader.releaseLock?.()
      }
      res.end()
      return
    }
    catch {
      res.writeHead(404)
      res.end('Not found')
      return
    }
  }

  const stat = statSync(filePath)
  if (!stat.isFile()) {
    res.writeHead(404)
    res.end('Not found')
    return
  }

  const ext = extname(filePath).toLowerCase()
  const contentType = MIME_TYPES[ext] || 'application/octet-stream'

  // Support Range requests (needed for large ONNX files)
  const range = req.headers.range
  if (range) {
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-')
    const start = Number(startStr)
    const end = endStr ? Number(endStr) : stat.size - 1
    const chunkSize = end - start + 1

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
    })

    createReadStream(filePath, { start, end }).pipe(res)
  }
  else {
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
    })

    createReadStream(filePath).pipe(res)
  }
}

let server: ReturnType<typeof createServer> | null = null

/**
 * Start the local model file server.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function startModelFileServer(): Promise<void> {
  if (server)
    return Promise.resolve()

  return new Promise((resolve, reject) => {
    server = createServer(handleRequest)
    server.on('error', reject)
    server.listen(MODEL_SERVER_PORT, '127.0.0.1', () => {
      console.log(`[model-file-server] Listening on http://127.0.0.1:${MODEL_SERVER_PORT}`)
      console.log(`[model-file-server] Models directory: ${getModelsDir()}`)
      resolve()
    })
  })
}

/**
 * Stop the model file server.
 */
export function stopModelFileServer(): Promise<void> {
  if (!server)
    return Promise.resolve()

  return new Promise((resolve) => {
    server!.close(() => {
      server = null
      resolve()
    })
  })
}

/**
 * Check if any model files exist in the models directory.
 */
export function hasLocalModels(): boolean {
  const dir = getModelsDir()
  if (!existsSync(dir))
    return false

  try {
    const entries = readdirSync(dir, { recursive: true })
    return entries.some(e => typeof e === 'string' && (e.endsWith('.onnx') || e.endsWith('.json')))
  }
  catch {
    return false
  }
}
