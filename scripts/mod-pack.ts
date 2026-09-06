/**
 * Mod 打包工具。
 *
 * 将 VRM 模型、动画、配置等资源打包为 `.kitsune-mod` 分发包。
 * 移植自 Mate-Engine 的 MEModHandler / MEModelExporter 打包逻辑。
 *
 * 用法：
 *   npx tsx scripts/mod-pack.ts <mod-directory> [--output <output-path>]
 *
 * Mod 目录结构：
 *   mod-directory/
 *     mod.json          -- 清单文件（必需）
 *     model.vrm         -- VRM 模型文件（可选）
 *     animations/       -- 动画文件目录（可选）
 *     textures/         -- 纹理文件目录（可选）
 *     sounds/           -- 音效文件目录（可选）
 *     preview.png       -- 预览图（可选）
 *
 * @see Mate-Engine/Assets/MATE ENGINE - Scripts/Settings/MEModHandler.cs
 */

import { createWriteStream, existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

import archiver from 'archiver'

// ========== Mod 清单 Schema ==========

export interface ModManifest {
  /** Mod 格式版本。 */
  formatVersion: '1.0'
  /** Mod 唯一标识符（反向域名风格）。 */
  id: string
  /** 显示名称。 */
  name: string
  /** 版本号（semver）。 */
  version: string
  /** 作者。 */
  author: string
  /** 描述。 */
  description?: string
  /** 预览图路径（相对于 mod 目录）。 */
  preview?: string
  /** Mod 类型。 */
  type: 'model' | 'animation' | 'voice-pack' | 'theme' | 'bundle'
  /** 最低宿主版本要求。 */
  minHostVersion?: string
  /** 资源清单。 */
  assets: {
    /** VRM 模型文件列表。 */
    models?: string[]
    /** 动画文件列表（.vrma / .bvh）。 */
    animations?: string[]
    /** 纹理文件列表。 */
    textures?: string[]
    /** 音效文件列表。 */
    sounds?: string[]
    /** 其他资源。 */
    extras?: string[]
  }
  /** 自定义元数据。 */
  metadata?: Record<string, unknown>
}

// ========== 打包逻辑 ==========

const ASSET_EXTENSIONS: Record<string, keyof ModManifest['assets']> = {
  '.vrm': 'models',
  '.vrma': 'animations',
  '.bvh': 'animations',
  '.png': 'textures',
  '.jpg': 'textures',
  '.jpeg': 'textures',
  '.webp': 'textures',
  '.wav': 'sounds',
  '.mp3': 'sounds',
  '.ogg': 'sounds',
}

/**
 * 验证 mod.json 清单文件。
 */
function validateManifest(manifest: unknown): manifest is ModManifest {
  if (!manifest || typeof manifest !== 'object') {
    console.error('错误: mod.json 不是有效的 JSON 对象')
    return false
  }

  const m = manifest as Record<string, unknown>

  if (m.formatVersion !== '1.0') {
    console.error(`错误: formatVersion 必须为 "1.0"，当前为 "${m.formatVersion}"`)
    return false
  }

  if (!m.id || typeof m.id !== 'string') {
    console.error('错误: 缺少 id 字段')
    return false
  }

  if (!m.name || typeof m.name !== 'string') {
    console.error('错误: 缺少 name 字段')
    return false
  }

  if (!m.version || typeof m.version !== 'string') {
    console.error('错误: 缺少 version 字段')
    return false
  }

  if (!m.author || typeof m.author !== 'string') {
    console.error('错误: 缺少 author 字段')
    return false
  }

  const validTypes = ['model', 'animation', 'voice-pack', 'theme', 'bundle']
  if (m.type && !validTypes.includes(m.type as string)) {
    console.error(`错误: type 必须为 ${validTypes.join(', ')} 之一`)
    return false
  }

  return true
}

/**
 * 扫描目录中的资源文件并自动填充 manifest.assets。
 */
function scanAssets(modDir: string, manifest: ModManifest): void {
  if (!manifest.assets) {
    manifest.assets = {}
  }

  function scanDir(dir: string, prefix: string = '') {
    if (!existsSync(dir)) return

    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name

      if (entry.isDirectory()) {
        scanDir(join(dir, entry.name), relPath)
        continue
      }

      const ext = entry.name.substring(entry.name.lastIndexOf('.')).toLowerCase()
      const assetType = ASSET_EXTENSIONS[ext]
      if (!assetType) continue

      if (!manifest.assets[assetType]) {
        manifest.assets[assetType] = []
      }
      if (!manifest.assets[assetType]!.includes(relPath)) {
        manifest.assets[assetType]!.push(relPath)
      }
    }
  }

  scanDir(modDir)
}

/**
 * 打包 Mod 目录为 .kitsune-mod 文件。
 */
async function packMod(modDir: string, outputPath?: string): Promise<string> {
  modDir = resolve(modDir)

  if (!existsSync(modDir)) {
    throw new Error(`Mod 目录不存在: ${modDir}`)
  }

  const manifestPath = join(modDir, 'mod.json')
  if (!existsSync(manifestPath)) {
    throw new Error(`缺少 mod.json 清单文件: ${manifestPath}`)
  }

  const manifestRaw = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  if (!validateManifest(manifestRaw)) {
    throw new Error('mod.json 验证失败')
  }

  const manifest = manifestRaw as ModManifest

  // 自动扫描并填充资源列表
  scanAssets(modDir, manifest)

  // 输出路径
  const output = outputPath ?? join(modDir, '..', `${manifest.id}-${manifest.version}.kitsune-mod`)

  return new Promise<string>((resolve_, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } })
    const stream = createWriteStream(output)

    stream.on('close', () => {
      const sizeKB = (archive.pointer() / 1024).toFixed(1)
      console.log(`打包完成: ${output} (${sizeKB} KB)`)
      console.log(`  ID: ${manifest.id}`)
      console.log(`  名称: ${manifest.name}`)
      console.log(`  版本: ${manifest.version}`)
      console.log(`  类型: ${manifest.type ?? 'bundle'}`)

      const assetCounts = Object.entries(manifest.assets)
        .filter(([, v]) => v && v.length > 0)
        .map(([k, v]) => `${k}: ${v!.length}`)
      if (assetCounts.length > 0) {
        console.log(`  资源: ${assetCounts.join(', ')}`)
      }

      resolve_(output)
    })

    stream.on('error', reject)
    archive.on('error', reject)

    archive.pipe(stream)

    // 写入更新后的 manifest（包含自动扫描的资源列表）
    archive.append(JSON.stringify(manifest, null, 2), { name: 'mod.json' })

    // 添加所有文件（排除 mod.json，已单独写入）
    archive.glob('**/*', {
      cwd: modDir,
      ignore: ['mod.json', '*.kitsune-mod'],
      dot: true,
    })

    archive.finalize()
  })
}

// ========== CLI 入口 ==========

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Mod 打包工具 — 将 Mod 目录打包为 .kitsune-mod 分发包

用法:
  npx tsx scripts/mod-pack.ts <mod-directory> [--output <output-path>]

Mod 目录结构:
  mod-directory/
    mod.json          -- 清单文件（必需）
    model.vrm         -- VRM 模型（可选）
    animations/       -- 动画文件（可选）
    textures/         -- 纹理文件（可选）
    sounds/           -- 音效文件（可选）
    preview.png       -- 预览图（可选）

mod.json 格式:
  {
    "formatVersion": "1.0",
    "id": "com.example.my-mod",
    "name": "My Mod",
    "version": "1.0.0",
    "author": "Author Name",
    "type": "model",
    "description": "A custom VRM model mod"
  }
`)
    process.exit(0)
  }

  const modDir = resolve(args[0])
  const outputIdx = args.indexOf('--output')
  const outputPath = outputIdx !== -1 ? resolve(args[outputIdx + 1]) : undefined

  try {
    await packMod(modDir, outputPath)
  }
  catch (error) {
    console.error(`打包失败: ${error}`)
    process.exit(1)
  }
}

main()
