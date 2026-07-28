import { createServer } from 'node:http'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { app, ipcMain } from 'electron'

/**
 * Lightweight HTTP server that serves built-in Live2D model zip files
 * directly from disk. Used in dev mode because electron-vite does NOT
 * call configureServer for renderer plugins, and Vite's public/ serving
 * corrupts large binary files.
 *
 * The renderer fetches from http://127.0.0.1:{port}/live2d/models/{fileName}.
 */

const ALLOWED_FILES = ['hiyori_pro_zh.zip', 'hiyori_free_zh.zip']

// In electron-vite dev mode, app.getAppPath() = apps/stage-tamagotchi.
// Models live at monorepo root: packages/stage-ui/src/assets/live2d/models/.
// So we need to go up 2 levels from app.getAppPath().
const RELATIVE_TO_MODELS = join('packages', 'stage-ui', 'src', 'assets', 'live2d', 'models')

function getModelDir(): string {
  const appPath = app.getAppPath()

  const candidates = [
    // Dev: app.getAppPath() = apps/stage-tamagotchi → up 2 to monorepo root
    join(appPath, '..', '..', RELATIVE_TO_MODELS),
    // Dev fallback: cwd-based
    join(process.cwd(), '..', '..', RELATIVE_TO_MODELS),
    // Production: models copied next to the app by live2dModelsPlugin
    join(appPath, 'live2d', 'models'),
  ]

  for (const dir of candidates) {
    if (existsSync(join(dir, 'hiyori_pro_zh.zip'))) {
      return dir
    }
  }

  console.error(`[live2d-file-server] Could not find model dir! Tried:`)
  for (const dir of candidates) {
    console.error(`  - ${dir}`)
  }
  return candidates[0]
}

/**
 * Register an IPC handler so the renderer can fetch Live2D model files
 * directly via Electron IPC, bypassing the HTTP file server entirely.
 * This avoids Chromium's net::ERR_FAILED on large localhost HTTP responses.
 *
 * The handler also triggers {@link ensureLive2dFileServer} on the first model
 * request so the HTTP server starts on-demand instead of at app startup (R8).
 */
export function registerLive2dModelIpc(): void {
  ipcMain.handle('live2d:read-model', async (_event, fileName: string) => {
    // Start the HTTP file server on-demand: the renderer's first Live2D model
    // request is the earliest point the server is actually needed. Fire-and-
    // forget because this IPC reads files directly and does not depend on the
    // HTTP server, which only serves the OPFS fetch fallback path.
    ensureLive2dFileServer().catch(err => console.error('[live2d-file-server] Failed to start:', err))

    if (!ALLOWED_FILES.includes(fileName)) {
      throw new Error(`File not allowed: ${fileName}`)
    }
    const modelDir = getModelDir()
    const filePath = join(modelDir, fileName)
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`)
    }
    return readFileSync(filePath).buffer
  })
}

export const LIVE2D_SERVER_PORT = 19527

export function startLive2dFileServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const srv = createServer((req, res) => {
      // CORS headers on every response
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', '*')

      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      const url = req.url ?? ''
      if (!url.startsWith('/live2d/models/')) {
        res.writeHead(404)
        res.end()
        return
      }

      const fileName = url.slice('/live2d/models/'.length).split('?')[0]
      if (!ALLOWED_FILES.includes(fileName)) {
        res.writeHead(404)
        res.end()
        return
      }

      const modelDir = getModelDir()
      const filePath = join(modelDir, fileName)

      if (!existsSync(filePath)) {
        res.writeHead(404)
        res.end()
        return
      }

      const stat = statSync(filePath)
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Length': stat.size,
        'Cache-Control': 'no-cache',
      })
      createReadStream(filePath).pipe(res)
    })

    srv.listen(LIVE2D_SERVER_PORT, '127.0.0.1', () => {
      console.log(`[live2d-file-server] Listening on http://127.0.0.1:${LIVE2D_SERVER_PORT}`)
      console.log(`[live2d-file-server] Model dir: ${getModelDir()}`)
      resolve()
    })

    srv.on('error', reject)
  })
}

// On-demand startup state for the HTTP file server (R8). Holds the in-flight
// start promise so concurrent callers coalesce onto a single listen() attempt;
// null means "not started yet". On failure the promise is cleared so a later
// request can retry.
let live2dFileServerStarting: Promise<void> | null = null

/**
 * Starts the Live2D HTTP file server at most once. Subsequent calls return the
 * same in-flight (or resolved) promise without re-listening. The server is
 * triggered by the renderer's first Live2D model request instead of at app
 * startup, so dev-mode sessions that never load a model never bind the port.
 */
export function ensureLive2dFileServer(): Promise<void> {
  if (!live2dFileServerStarting) {
    live2dFileServerStarting = startLive2dFileServer().catch((err) => {
      // Allow a later request to retry after a transient bind failure.
      live2dFileServerStarting = null
      throw err
    })
  }
  return live2dFileServerStarting
}
