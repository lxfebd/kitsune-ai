/**
 * 运行时插件管理器 — TTS / ASR 等大体积模型引擎的按需下载与安装。
 *
 * 背景：GPT-SoVITS（含内置 Python 运行时约 4.9GB）与 sherpa-onnx ASR 模型被直接打包
 * 会让主安装包异常庞大。这里把它们改成"运行时插件"：打包脚本将插件目录打成多个 <2GB
 * 的 zip 分卷并生成一份 manifest，作为 GitHub Release 资产托管；应用在首次使用对应功能时
 * 自动下载、校验并解压到 userData/runtime-plugins/<id>/，之后 `resolvePluginRoot(id)`
 * 返回该目录供 TTS / ASR 解析模型路径。
 *
 * 布局：
 *   <userData>/runtime-plugins/<id>/.plugin.json   ← 安装标记（id/version/installedAt）
 *   <userData>/runtime-plugins/<id>/…              ← 解压后的插件内容
 *
 * GitHub Release 单资产上限 2GB，因此一个插件拆成多个分卷；manifest 记录每卷的
 * 大小与 sha512，下载后逐卷校验，任一失败即整包失败并回滚，不做半安装状态。
 */
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'

import { app } from 'electron'
import { useLogg } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'

const log = useLogg('runtime-plugins').useGlobalConfig()

/** 运行时插件唯一标识。 */
export type RuntimePluginId = 'tts-gptsovits' | 'asr-sherpa'

/** 单个分卷信息。 */
export interface RuntimePluginPart {
  /** 分卷文件名，如 `gpt-sovits.0001.zip`，用于拼接 Release 下载 URL。 */
  name: string
  /** 字节数。 */
  size: number
  /** 分卷内容 sha512（hex）。 */
  sha512: string
}

/** 一个运行时插件的最新发布描述。 */
export interface RuntimePluginManifest {
  id: RuntimePluginId
  /** 语义化版本；与安装标记比对以决定是否需要重装。 */
  version: string
  /** 解压后插件根目录名（分卷内各子树会合并进该目录）。 */
  installDir: string
  parts: RuntimePluginPart[]
}

/**
 * 所有运行时插件共享的 GitHub Release 发布源。
 *
 * 打包脚本会把各插件分卷与 `<id>.manifest.json` 上传到这个 tag 对应的 Release。
 * 新增分卷时，需同步更新打包脚本这里对齐的版本与 installDir。
 */
export const RUNTIME_PLUGIN_SOURCE = {
  owner: 'lxfebd',
  repo: 'kitsune-ai',
  tag: 'runtime-plugins-v0.10.3',
} as const

/** 每个插件在发布源里的 tag 与解压后的根目录名。 */
const PLUGIN_SOURCE_META: Record<RuntimePluginId, { tag: string, installDir: string }> = {
  'tts-gptsovits': { tag: RUNTIME_PLUGIN_SOURCE.tag, installDir: 'gpt-sovits' },
  'asr-sherpa': { tag: RUNTIME_PLUGIN_SOURCE.tag, installDir: 'sherpa-onnx' },
}

/** 每个插件的最新已知版本；与打包脚本产物对齐，用于判断是否已装最新。 */
export const RUNTIME_PLUGIN_VERSIONS: Record<RuntimePluginId, string> = {
  'tts-gptsovits': '1.0.0',
  'asr-sherpa': '1.0.0',
}

const MARKER_FILE = '.plugin.json'

/** 安装标记内容。 */
interface InstallMarker {
  id: RuntimePluginId
  version: string
  installedAt: string
}

function pluginRootDir(): string {
  return join(app.getPath('userData'), 'runtime-plugins')
}

function pluginInstallDir(id: RuntimePluginId): string {
  return join(pluginRootDir(), id)
}

/** 拼接 Release 资产下载 URL。GitHub 资产地址格式固定，无需走 API。 */
function assetUrl(tag: string, assetName: string): string {
  return `https://github.com/${RUNTIME_PLUGIN_SOURCE.owner}/${RUNTIME_PLUGIN_SOURCE.repo}/releases/download/${tag}/${assetName}`
}

/**
 * 检查插件是否已安装且版本匹配。
 *
 * @param id - 插件 ID
 * @param version - 期望版本；不传或为空则只要求任意已安装（存在安装标记）
 * @returns 是否已安装（且版本匹配）
 */
export function isPluginInstalled(id: RuntimePluginId, version?: string): boolean {
  // 开发期开关：本地已放置模型时可用该环境变量跳过插件判断，避免误触下载。
  if (!app.isPackaged && process.env.KITSUNE_SKIP_RUNTIME_PLUGIN !== undefined) {
    return true
  }
  const markerPath = join(pluginInstallDir(id), MARKER_FILE)
  if (!existsSync(markerPath)) return false
  try {
    const marker = JSON.parse(readFileSync(markerPath, 'utf-8')) as InstallMarker
    if (marker.id !== id) return false
    return !version || marker.version === version
  }
  catch {
    return false
  }
}

/**
 * 返回已安装插件的根目录；未安装或标记损坏返回 null。
 */
export function resolvePluginRoot(id: RuntimePluginId): string | null {
  const dir = pluginInstallDir(id)
  return isPluginInstalled(id) ? dir : null
}

// ---------------------------------------------------------------------------
// 远程安装
// ---------------------------------------------------------------------------

/**
 * 下载单个分卷到目标文件。
 *
 * @param tag - 分卷所处 Release tag；所有插件分卷都部署在共享发布源 tag 下
 */
async function downloadPart(part: RuntimePluginPart, target: string, tag: string): Promise<void> {
  const url = assetUrl(tag, part.name)
  log.log(`[runtime-plugin] 下载分卷 ${part.name} (${(part.size / 1024 / 1024).toFixed(1)}MB) <- ${url}`)
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) {
    throw new Error(`下载分卷 ${part.name} 失败: HTTP ${res.status}`)
  }

  const reader = res.body.getReader()
  const writer = createWriteStream(target)
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!writer.write(value)) {
        await new Promise<void>((resolve) => writer.once('drain', resolve))
      }
    }
    await new Promise<void>((resolve, reject) => {
      writer.close((err) => (err ? reject(err) : resolve()))
    })
  }
  catch (error) {
    writer.destroy()
    throw error
  }

  const size = (await import('node:fs')).statSync(target).size
  if (size !== part.size) {
    throw new Error(`分卷 ${part.name} 大小不符: 期望 ${part.size} 字节，实际 ${size} 字节`)
  }
}

/** 计算文件 sha512（hex）。用流式 pipeline 喂给 hash，避免大文件挤爆内存。 */
async function sha512Hex(filePath: string): Promise<string> {
  const hash = createHash('sha512')
  await pipeline(
    createReadStream(filePath),
    hash,
  )
  return hash.digest('hex')
}

/**
 * 抗路径穿越的安全分卷解压：把单个 zip 分卷解压到 tmpDir。
 * 沿用 TTS 声线包导入的既有安全范式（yauzl + 目标不在 tmpDir 内的条目直接跳过）。
 */
async function extractPart(partZip: string, tmpDir: string): Promise<void> {
  const { default: yauzl } = await import('yauzl')
  await new Promise<void>((resolve, reject) => {
    yauzl.open(partZip, { lazyEntries: true }, (err: unknown, zipfile: any) => {
      if (err) return reject(err)
      zipfile.readEntry()
      zipfile.on('entry', (entry: any) => {
        const targetPath = join(tmpDir, entry.fileName)
        if (targetPath !== tmpDir && !targetPath.startsWith(tmpDir + '\\') && !targetPath.startsWith(tmpDir + '/')) {
          log.warn(`[runtime-plugin] 跳过越界条目: ${entry.fileName}`)
          zipfile.readEntry()
          return
        }
        if (entry.fileName.endsWith('/')) {
          mkdirSync(targetPath, { recursive: true })
          zipfile.readEntry()
          return
        }
        mkdirSync(join(targetPath, '..'), { recursive: true })
        zipfile.openReadStream(entry, (err2: unknown, readStream: any) => {
          if (err2) return reject(err2)
          const writeStream = createWriteStream(targetPath)
          readStream.on('error', (e: unknown) => reject(e))
          writeStream.on('error', (e: unknown) => reject(e))
          readStream.pipe(writeStream)
          writeStream.on('close', () => zipfile.readEntry())
        })
      })
      zipfile.on('end', () => resolve())
      zipfile.on('error', (e: unknown) => reject(e))
    })
  })
}

/**
 * 把分卷解压产物里以 installDir 为名的子目录提升到 tmpDir 顶层，
 * 保证插件根目录 = tmpDir 本身（与 resolvePluginRoot 返回一致）。
 * 若插件根就在 tmpDir 顶层则无需处理。
 */
async function flattenExtractedRoot(tmpDir: string, installDir: string): Promise<void> {
  const srcRoot = join(tmpDir, installDir)
  if (!existsSync(srcRoot)) return
  for (const entry of await readdir(srcRoot)) {
    const from = join(srcRoot, entry)
    const to = join(tmpDir, entry)
    await rm(to, { recursive: true, force: true })
    await rename(from, to)
  }
  await rm(srcRoot, { recursive: true, force: true })
}

/** 读取插件 manifest（从 Release 资产下载）。 */
async function fetchManifest(id: RuntimePluginId): Promise<RuntimePluginManifest> {
  const tag = PLUGIN_SOURCE_META[id].tag
  const url = assetUrl(tag, `${id}.manifest.json`)
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) {
    throw new Error(`获取插件清单失败: HTTP ${res.status} (${url})`)
  }
  const manifest = (await res.json()) as RuntimePluginManifest
  if (manifest.id !== id || !Array.isArray(manifest.parts) || manifest.parts.length === 0) {
    throw new Error(`插件清单格式无效: ${id}`)
  }
  return manifest
}

export interface RuntimePluginProgress {
  id: RuntimePluginId
  phase: 'download' | 'verify' | 'extract' | 'done' | 'error'
  /** 总体进度 0..1（下载阶段按全部分卷的总字节分摊）。 */
  overall: number
  /** 当前动作描述，如 "下载分卷 2/3"、"校验 sha512"。 */
  detail: string
  error?: string
}

/**
 * 下载并安装运行时插件。
 *
 * 流程：拉取 manifest → 依次下载分卷（上报进度）→ 逐卷校验 sha512 → 解压到临时目录 →
 * 写入安装标记 → 原子替换到目标目录。任一分卷下载/校验失败都会清理临时目录并抛错，
 * 不留半安装状态。
 *
 * @param id - 插件 ID
 * @param onProgress - 进度回调
 * @returns 安装后的插件根目录
 */
export async function installRuntimePlugin(
  id: RuntimePluginId,
  onProgress?: (p: RuntimePluginProgress) => void,
): Promise<string> {
  const dir = pluginInstallDir(id)
  const tmpDir = join(pluginRootDir(), `${id}.tmp-${Date.now()}`)

  const report = (p: Omit<RuntimePluginProgress, 'id'>): void => onProgress?.({ id, ...p })

  report({ phase: 'download', overall: 0, detail: '获取插件清单' })
  await mkdir(tmpDir, { recursive: true })

  try {
    const manifest = await fetchManifest(id)
    const totalBytes = manifest.parts.reduce((sum, p) => sum + p.size, 0)
    let downloadedBytes = 0

    // 逐分卷下载 + 校验
    for (let i = 0; i < manifest.parts.length; i += 1) {
      const part = manifest.parts[i]!
      const partLocal = join(tmpDir, `${id}.${i.toString().padStart(4, '0')}.zip`)
      report({ phase: 'download', overall: 0, detail: `下载分卷 ${i + 1}/${manifest.parts.length}` })
      await downloadPart(part, partLocal, PLUGIN_SOURCE_META[id].tag)

      report({ phase: 'verify', overall: 0, detail: `校验分卷 ${i + 1}/${manifest.parts.length} (sha512)` })
      if (await sha512Hex(partLocal) !== part.sha512) {
        throw new Error(`分卷 ${part.name} 校验失败: sha512 不匹配`)
      }

      downloadedBytes += part.size
      report({ phase: 'download', overall: downloadedBytes / totalBytes, detail: `已完成 ${downloadedBytes}/${totalBytes} 字节` })
    }

    // 解压
    report({ phase: 'extract', overall: 0.9, detail: '解压插件' })
    for (let i = 0; i < manifest.parts.length; i += 1) {
      const partLocal = join(tmpDir, `${id}.${i.toString().padStart(4, '0')}.zip`)
      await extractPart(partLocal, tmpDir)
      await rm(partLocal, { force: true })
    }
    await flattenExtractedRoot(tmpDir, manifest.installDir)

    // 写入安装标记
    const marker: InstallMarker = {
      id,
      version: manifest.version,
      installedAt: new Date().toISOString(),
    }
    await writeFile(join(tmpDir, MARKER_FILE), JSON.stringify(marker, null, 2), 'utf-8')

    // 原子替换：先删旧目录，再把临时目录改名到目标。
    await rm(dir, { recursive: true, force: true })
    await rename(tmpDir, dir)

    report({ phase: 'done', overall: 1, detail: '安装完成' })
    log.log(`[runtime-plugin] ${id}@${manifest.version} 安装完成 -> ${dir}`)
    return dir
  }
  catch (error) {
    report({ phase: 'error', overall: 0, detail: '安装失败', error: errorMessageFrom(error) })
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}