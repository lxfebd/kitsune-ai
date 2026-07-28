/**
 * 本地模型文件服务器
 *
 * 启动一个 HTTP 服务器，将预下载的模型文件提供给 @huggingface/transformers 下载。
 * 配合 Electron 应用中的 env.remoteHost = 'http://localhost:MODEL_SERVER_PORT' 使用。
 *
 * 用法:
 *   node scripts/serve-models.mjs [--port 8976] [--dir resources/models]
 *
 * 然后在 Electron 主进程或 Worker 中设置:
 *   env.remoteHost = 'http://localhost:8976'
 *
 * 模型文件需要先通过 download-whisper-model.ps1 下载到 resources/models/ 目录。
 */

import { createServer } from 'node:http'
import { readFile, stat, readdir } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// 解析命令行参数
const args = process.argv.slice(2)
function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`)
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : defaultVal
}

const PORT = Number(getArg('port', '8976'))
const MODELS_DIR = getArg('dir', join(__dirname, '..', 'resources', 'models'))

const MIME_TYPES = {
  '.json': 'application/json',
  '.onnx': 'application/octet-stream',
  '.bin': 'application/octet-stream',
  '.txt': 'text/plain',
}

async function listFiles(dir) {
  const entries = []
  try {
    const items = await readdir(dir, { withFileTypes: true })
    for (const item of items) {
      const fullPath = join(dir, item.name)
      if (item.isDirectory()) {
        entries.push(...await listFiles(fullPath))
      } else {
        const s = await stat(fullPath)
        entries.push({ path: fullPath, size: s.size })
      }
    }
  } catch {}
  return entries
}

const server = createServer(async (req, res) => {
  // 去掉查询参数
  const urlPath = decodeURIComponent(req.url.split('?')[0])

  // 安全检查: 防止路径遍历
  if (urlPath.includes('..')) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  const filePath = join(MODELS_DIR, urlPath)

  try {
    const s = await stat(filePath)
    if (!s.isFile()) {
      res.writeHead(404)
      res.end('Not found')
      return
    }

    const ext = extname(filePath)
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'

    // 支持 Range 请求 (大文件下载)
    const range = req.headers.range
    if (range) {
      const [startStr, endStr] = range.replace(/bytes=/, '').split('-')
      const start = Number(startStr)
      const end = endStr ? Number(endStr) : s.size - 1
      const chunkSize = end - start + 1

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${s.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
      })

      const stream = (await import('node:fs')).createReadStream(filePath, { start, end })
      stream.pipe(res)
    } else {
      res.writeHead(200, {
        'Content-Length': s.size,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
      })

      const stream = (await import('node:fs')).createReadStream(filePath)
      stream.pipe(res)
    }
  } catch {
    res.writeHead(404)
    res.end('Not found')
  }
})

server.listen(PORT, () => {
  console.log(`\n  模型文件服务器已启动`)
  console.log(`  地址: http://localhost:${PORT}`)
  console.log(`  目录: ${MODELS_DIR}`)
  console.log(`\n  在 Electron Worker 中设置:`)
  console.log(`    env.remoteHost = 'http://localhost:${PORT}'`)
  console.log(`\n  按 Ctrl+C 停止\n`)
})
