/**
 * 运行时插件发布工具 — 把 `package-runtime-plugins.ts` 产出的分卷与清单上传到 GitHub Release。
 *
 * 关键点：GPT-SoVITS 引擎（约 6.6GB）在仓库里是 gitignored 的，CI 拉不到源码，无法在流水线里打包。
 * 因此插件资产必须「本地打包 → 本地上传」；本脚本负责第二步，用 GitHub REST API 上传资产。
 *
 * 运行时插件管理器（apps/stage-tamagotchi/src/main/services/kitsune/runtime-plugins/index.ts）
 * 会从 `RUNTIME_PLUGIN_SOURCE.tag` 对应的 Release 下载分卷；新增/更新插件时，tag 必须与那份常量一致。
 *
 * 用法：
 *   npx tsx scripts/publish-runtime-plugins.ts tts-gptsovits --tag <github-tag>
 *
 * 鉴权：优先读 `GH_TOKEN` 环境变量；未设置时从本机 git 凭据管理器拉取 github.com 的 OAuth token
 * （`git credential fill`，非交互）。避免依赖 `gh` CLI（本机未安装）。
 *
 * 幂等：若目标 Release 已存在同名资产，会先删除再上传，可安全重跑续传。
 */

import { spawnSync } from 'node:child_process'
import {
  createReadStream,
  existsSync,
  readFileSync,
  statSync,
} from 'node:fs'
import { request } from 'node:https'
import { join } from 'node:path'

const OWNER = 'lxfebd'
const REPO = 'kitsune-ai'
const API = `https://api.github.com/repos/${OWNER}/${REPO}`
// 资产上传走 uploads 域（GitHub 重定向到的真正上传主机），不能用 api 域。
const UPLOAD_API = `https://uploads.github.com/repos/${OWNER}/${REPO}`

function parseArgs(argv: string[]): { id: string, tag: string, out: string } {
  const args = argv.slice(2)
  const id = args[0] ?? ''
  let tag = ''
  let out = 'dist/runtime-plugins/release'
  for (let i = 1; i < args.length; i += 1) {
    if (args[i] === '--tag') {
      tag = args[i + 1] ?? ''
      i += 1
    }
    else if (args[i] === '--out') {
      out = args[i + 1] ?? out
      i += 1
    }
  }
  return { id, tag, out }
}

// ---------------------------------------------------------------------------
// 鉴权：GH_TOKEN 环境变量，或从 git 凭据管理器读取 github.com token
// ---------------------------------------------------------------------------

function tokenFromGitCredential(): string {
  const res = spawnSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf-8',
  })
  if (res.status !== 0)
    return ''
  const line = res.stdout.split('\n').find((l) => l.startsWith('password='))
  return line ? line.slice('password='.length).trim() : ''
}

function getToken(): string {
  const env = process.env.GH_TOKEN
  if (env && env.length > 0)
    return env
  const cred = tokenFromGitCredential()
  if (cred)
    return cred
  console.error('未找到 GitHub token：请设置 GH_TOKEN 环境变量，或先执行 `git credential approve` 保存 github.com 凭据。')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 最小 REST 客户端
// ---------------------------------------------------------------------------

interface ApiResponse {
  status: number
  json: unknown
}

/** 请求体：流式（大文件）或 JSON 对象。 */
type ApiBody =
  | { stream: NodeJS.ReadableStream, length: number }
  | { json: unknown }

/** 发起 GitHub REST 请求。大文件用流式 body，Release 元数据用 JSON body。 */
function apiRequest(
  method: string,
  path: string,
  token: string,
  body?: ApiBody,
  base: string = API,
): Promise<ApiResponse> {
  return new Promise((resolve, reject) => {
    let headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'kitsune-runtime-plugin-publisher',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }
    if (body && 'stream' in body) {
      headers = { ...headers, 'Content-Type': 'application/octet-stream', 'Content-Length': String(body.length) }
    }
    else if (body && 'json' in body) {
      headers = { ...headers, 'Content-Type': 'application/json' }
    }

    const req = request(
      base + path,
      { method, headers },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8')
          let json: unknown
          try {
            json = text ? JSON.parse(text) : null
          }
          catch {
            json = text
          }
          resolve({ status: res.statusCode ?? 0, json })
        })
      },
    )
    req.on('error', reject)
    if (body && 'stream' in body) {
      body.stream.pipe(req)
    }
    else if (body && 'json' in body) {
      req.end(JSON.stringify(body.json))
    }
    else {
      req.end()
    }
  })
}

/** 删除已存在的同名 release asset（幂等重跑用）。返回是否删除。 */
async function deleteAssetIfExists(id: number, name: string, token: string): Promise<void> {
  const res = await apiRequest('GET', `/releases/${id}/assets?per_page=100`, token)
  if (res.status !== 200)
    return
  const assets = res.json as { id: number, name: string }[]
  const hit = assets.find((a) => a.name === name)
  if (hit) {
    const del = await apiRequest('DELETE', `/releases/assets/${hit.id}`, token)
    if (del.status !== 204)
      console.warn(`  删除旧资产 ${name} 非预期: HTTP ${del.status}`)
  }
}

/** 获取或创建目标 tag 对应的 Release，返回 release id。 */
async function ensureRelease(tag: string, token: string): Promise<number> {
  const existing = await apiRequest('GET', `/releases/tags/${encodeURIComponent(tag)}`, token)
  if (existing.status === 200) {
    return (existing.json as { id: number }).id
  }
  const created = await apiRequest('POST', '/releases', token, {
    json: {
      tag_name: tag,
      name: `Runtime Plugins ${tag}`,
      body: 'TTS/ASR 运行时插件分卷。请在应用内首次使用对应功能时按需下载。',
      draft: true,
      prerelease: true,
    },
  })
  if (created.status !== 201) {
    const detail = JSON.stringify(created.json).slice(0, 400)
    throw new Error(`创建 Release 失败: HTTP ${created.status} ${detail}`)
  }
  return (created.json as { id: number }).id
}

/** 上传单个资产；失败抛错以便外层重跑。 */
async function uploadAsset(id: number, filePath: string, token: string): Promise<void> {
  const name = filePath.split(/[\\/]/).pop() as string
  const length = statSync(filePath).size

  await deleteAssetIfExists(id, name, token)

  const res = await apiRequest(
    'POST',
    `/releases/${id}/assets?name=${encodeURIComponent(name)}`,
    token,
    { stream: createReadStream(filePath), length },
    UPLOAD_API,
  )
  if (res.status !== 201) {
    const detail = JSON.stringify(res.json).slice(0, 400)
    throw new Error(`上传 ${name} 失败: HTTP ${res.status} ${detail}`)
  }
  console.log(`  ✓ ${name}  ${(length / 1024 ** 3).toFixed(2)} GiB`)
}

function main(): void {
  const { id, tag, out } = parseArgs(process.argv)
  if (!id || !tag) {
    console.error('用法: npx tsx scripts/publish-runtime-plugins.ts <id> --tag <github-tag> [--out <dir>]')
    process.exit(1)
  }

  const manifestPath = join(out, `${id}.manifest.json`)
  if (!existsSync(manifestPath)) {
    console.error(`清单不存在: ${manifestPath}（请先运行 package-runtime-plugins.ts）`)
    process.exit(1)
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { parts: { name: string }[] }
  const assets = [manifestPath, ...manifest.parts.map((p) => join(out, p.name))]
  const missing = assets.find((a) => !existsSync(a))
  if (missing) {
    console.error(`分卷不存在: ${missing}（请先运行 package-runtime-plugins.ts）`)
    process.exit(1)
  }

  const token = getToken()

  void (async () => {
    try {
      console.log(`[runtime-plugin] 确保 Release ${tag} 存在 …`)
      const releaseId = await ensureRelease(tag, token)
      console.log(`[runtime-plugin] Release ${tag} (id=${releaseId})，开始上传 ${assets.length} 个资产 …`)
      for (const asset of assets)
        await uploadAsset(releaseId, asset, token)
      console.log(`[runtime-plugin] 已上传 ${assets.length} 个资产到 ${OWNER}/${REPO}@${tag}`)
      console.log(`[runtime-plugin] 若 Release 为 draft，请在 GitHub 网页发布后再公开放行。`)
    }
    catch (error) {
      console.error(`[runtime-plugin] 上传中断: ${error instanceof Error ? error.message : String(error)}`)
      process.exitCode = 1
    }
  })()
}

main()