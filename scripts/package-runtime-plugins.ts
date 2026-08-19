/**
 * 运行时插件打包工具 — 把大体积引擎目录切成多个 <2GB 的 zip 分卷并生成 manifest。
 *
 * 背景：GPT-SoVITS（约 6.4GB，含内置 Python runtime `runtime/python.exe`）不再打进主安装包，
 * 而是打成多个分卷上传到 GitHub Release，由运行时插件管理器在首次使用时按需下载、校验、解压。
 * GitHub Release 单资产上限 2GB，因此把一个插件目录按「文件累计体积」切分进多个独立 zip。
 *
 * 分卷是相互独立、可各自解压的 zip，每个分卷只含插件树的一部分条目；运行时插件管理器会把
 * 所有分卷解压进同一目录以合并成完整树。
 *
 * 压缩：插件内容（模型权重、onnx、Python 依赖）几乎不可压缩，故各分卷用 STORE（no compression）
 * 方式本地写出，速度远快于 deflate 且省 CPU，也不需要 zip 库依赖。每个分卷 <2GB，偏移量越过不了
 * 4GB，无需 zip64。规避了 Windows 系统 bsdtar 对深层/特殊字符路径的 `Can't convert a path to a
 * wchar_t` 失败（引擎含 3 万+ 文件、runtime site-packages 深层目录）。
 *
 * 用法：
 *   npx tsx scripts/package-runtime-plugins.ts tts-gptsovits [--source <dir>] [--out <dir>] [--version <ver>]
 *
 * 产物（写入 --out，默认为 `dist/runtime-plugins/release/`）：
 *   <installDir>.0001.zip         第 1 卷
 *   <installDir>.0002.zip         第 2 卷
 *   …
 *   <id>.manifest.json            清单（id / version / installDir / parts[]，含每卷 size + sha512）
 *
 * 上传前请把清单与各分卷上传到 RUNTIME_PLUGIN_SOURCE.tag 对应的 GitHub Release（见
 * apps/stage-tamagotchi/src/main/services/kitsune/runtime-plugins/index.ts）。
 */

import { createHash } from 'node:crypto'
import {
  closeSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, relative, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'

/** 单分卷大小上限（字节）。GitHub 单资产上限为 2GB，留出余量避免边界问题。 */
const MAX_PART_BYTES = 1_500_000_000

type RuntimePluginId = 'tts-gptsovits' | 'asr-sherpa'

interface PluginDef {
  id: RuntimePluginId
  /** 解压后插件根目录名；与 runtime-plugins 的 PLUGIN_SOURCE_META 对齐。 */
  installDir: string
  /** 默认源目录（可被 --source 覆盖）。 */
  defaultSource: string
  /** 默认插件版本（可被 --version 覆盖）。 */
  defaultVersion: string
}

const PLUGIN_DEFS: Record<string, PluginDef> = {
  'tts-gptsovits': {
    id: 'tts-gptsovits',
    installDir: 'gpt-sovits',
    defaultSource: join('apps', 'stage-tamagotchi', 'resources', 'gpt-sovits'),
    defaultVersion: '1.0.0',
  },
}

/** 目录收集时跳过的开发/运行时产物目录。 */
const SKIPPED_DIR_NAMES = new Set(['__pycache__'])

function parseArgs(argv: string[]): { id: string, source?: string, out?: string, version?: string } {
  const args = argv.slice(2)
  const result: { id: string, source?: string, out?: string, version?: string } = { id: args[0] ?? '' }
  for (let i = 1; i < args.length; i += 1) {
    const a = args[i]
    const next = (): string | undefined => args[i + 1]
    if (a === '--source') {
      result.source = next()
      i += 1
    }
    else if (a === '--out') {
      result.out = next()
      i += 1
    }
    else if (a === '--version') {
      result.version = next()
      i += 1
    }
  }
  return result
}

/** 递归收集源目录下的普通文件（绝对路径 + 相对源根目录的路径 + 大小）。 */
function collectFiles(root: string): { abs: string, rel: string, size: number }[] {
  const files: { abs: string, rel: string, size: number }[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIPPED_DIR_NAMES.has(entry.name))
        continue
      const abs = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(abs)
        continue
      }
      if (entry.isFile()) {
        files.push({ abs, rel: relative(root, abs).split(sep).join('/'), size: statSync(abs).size })
      }
    }
  }
  walk(root)
  return files.sort((a, b) => a.rel.localeCompare(b.rel))
}

/**
 * 把文件列表按「累计体积 ≤ MAX_PART_BYTES」切成多批。
 * 单个文件本身就超过上限时放进自己的一批；超过 2GB 则抛错（无法托管）。
 */
function splitIntoParts(files: { size: number }[]): number[][] {
  const parts: number[][] = []
  let current: number[] = []
  let currentSize = 0
  for (let i = 0; i < files.length; i += 1) {
    const size = files[i]!.size
    if (size > 2_000_000_000) {
      throw new Error(`文件 ${files[i]!.rel} 单文件 ${size} 字节超过 GitHub 单资产 2GB 上限，无法分卷上传`)
    }
    if (size + currentSize > MAX_PART_BYTES && current.length > 0) {
      parts.push(current)
      current = []
      currentSize = 0
    }
    current.push(i)
    currentSize += size
  }
  if (current.length > 0)
    parts.push(current)
  return parts
}

// ---------------------------------------------------------------------------
// STORE（无压缩）zip 多分卷写入器
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1)
      c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

/** 计算文件 crc32（STORE 模式需要真实值写进 local header）。 */
async function fileCrc32(abs: string): Promise<number> {
  const hash = { value: 0xffffffff }
  const chunk = Buffer.alloc(1 << 20)
  const fd = openSync(abs, 'r')
  try {
    let read = 0
    while ((read = readSync(fd, chunk, 0, chunk.length, null)) > 0) {
      for (let i = 0; i < read; i += 1)
        hash.value = CRC_TABLE[(hash.value ^ chunk[i]!) & 0xff]! ^ (hash.value >>> 8)
    }
  }
  finally {
    closeSync(fd)
  }
  return (hash.value ^ 0xffffffff) >>> 0
}

/** 把文件 mtime 转成 DOS 时间/日期（zip local header 字段）。 */
function dosDateTime(ms: number): { time: number, date: number } {
  const d = new Date(ms)
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time, date }
}

interface CentralEntry {
  localOff: number
  name: Buffer
  crc: number
  size: number
  time: number
  date: number
}

/** 把一个批次的文件写成一个独立 STORE zip 分卷。 */
async function writeStoreZipPart(
  partZip: string,
  batch: number[],
  files: { abs: string, rel: string, size: number }[],
): Promise<void> {
  const ws = createWriteStream(partZip)
  const central: CentralEntry[] = []
  let offset = 0

  await pipeline(
    (async function* () {
      // 生成器逐文件写出：先算 crc（读一遍），再写 local header + 文件数据（读第二遍）。
      for (const idx of batch) {
        const file = files[idx]!
        const nameBuf = Buffer.from(file.rel, 'utf-8')
        const crc = await fileCrc32(file.abs)
        const { time, date } = dosDateTime(statSync(file.abs).mtimeMs)
        const localOff = offset

        const header = Buffer.alloc(30)
        header.writeUInt32LE(0x04034b50, 0) // local file header sig
        header.writeUInt16LE(20, 4) // version needed
        header.writeUInt16LE(0, 6) // flags
        header.writeUInt16LE(0, 8) // method: store
        header.writeUInt16LE(time, 10)
        header.writeUInt16LE(date, 12)
        header.writeUInt32LE(crc, 14)
        header.writeUInt32LE(file.size, 18) // compressed size = size
        header.writeUInt32LE(file.size, 22) // uncompressed size
        header.writeUInt16LE(nameBuf.length, 26)
        header.writeUInt16LE(0, 28) // extra len

        yield header
        yield nameBuf
        for await (const chunk of createReadStream(file.abs))
          yield chunk as Buffer

        central.push({ localOff, name: nameBuf, crc, size: file.size, time, date })
        offset += 30 + nameBuf.length + file.size
      }

      // 中央目录
      const cdStart = offset
      let cdSize = 0
      for (const e of central) {
        const entry = Buffer.alloc(46)
        entry.writeUInt32LE(0x02014b50, 0) // central dir header sig
        entry.writeUInt16LE(20, 4) // version made by
        entry.writeUInt16LE(20, 6) // version needed
        entry.writeUInt16LE(0, 8) // flags
        entry.writeUInt16LE(0, 10) // method
        entry.writeUInt16LE(e.time, 12)
        entry.writeUInt16LE(e.date, 14)
        entry.writeUInt32LE(e.crc, 16)
        entry.writeUInt32LE(e.size, 20)
        entry.writeUInt32LE(e.size, 24)
        entry.writeUInt16LE(e.name.length, 28)
        entry.writeUInt16LE(0, 30) // extra len
        entry.writeUInt16LE(0, 32) // comment len
        entry.writeUInt16LE(0, 34) // disk number
        entry.writeUInt16LE(0, 36) // internal attrs
        entry.writeUInt32LE(((0o100644 << 16) >>> 0), 38) // external attrs (file)
        entry.writeUInt32LE(e.localOff, 42)
        yield entry
        yield e.name
        cdSize += 46 + e.name.length
      }

      // end of central directory
      const eocd = Buffer.alloc(22)
      eocd.writeUInt32LE(0x06054b50, 0)
      eocd.writeUInt16LE(0, 4) // disk
      eocd.writeUInt16LE(0, 6) // cd disk
      eocd.writeUInt16LE(central.length, 8)
      eocd.writeUInt16LE(central.length, 10)
      eocd.writeUInt32LE(cdSize, 12)
      eocd.writeUInt32LE(cdStart, 16)
      eocd.writeUInt16LE(0, 20) // comment len
      yield eocd
    })(),
    ws,
  )
}

function sha512Hex(filePath: string): string {
  const hash = createHash('sha512')
  const chunk = Buffer.alloc(1 << 20)
  const fd = openSync(filePath, 'r')
  try {
    let read = 0
    while ((read = readSync(fd, chunk, 0, chunk.length, null)) > 0)
      hash.update(chunk.subarray(0, read))
  }
  finally {
    closeSync(fd)
  }
  return hash.digest('hex')
}

async function main(): Promise<void> {
  const { id, source, out, version } = parseArgs(process.argv)
  const def = PLUGIN_DEFS[id]
  if (!def) {
    console.error(`用法: npx tsx scripts/package-runtime-plugins.ts <id> [--source <dir>] [--out <dir>] [--version <ver>]`)
    console.error(`支持的插件 id: ${Object.keys(PLUGIN_DEFS).join(', ')}`)
    process.exit(1)
  }

  const sourceRoot = source ?? def.defaultSource
  if (!existsSync(sourceRoot)) {
    console.error(`源目录不存在: ${sourceRoot}`)
    process.exit(1)
  }

  const outDir = out ?? 'dist/runtime-plugins/release'
  mkdirSync(outDir, { recursive: true })

  const pluginVersion = version ?? def.defaultVersion
  console.log(`[runtime-plugin] 收集 ${sourceRoot} …`)
  const files = collectFiles(sourceRoot)
  const totalBytes = files.reduce((s, f) => s + f.size, 0)
  console.log(`[runtime-plugin] 共 ${files.length} 个文件，${(totalBytes / 1024 ** 3).toFixed(2)} GiB`)

  const indexBatches = splitIntoParts(files)
  console.log(`[runtime-plugin] 切分为 ${indexBatches.length} 卷（每卷 ≤ ${(MAX_PART_BYTES / 1024 ** 3).toFixed(2)} GiB）`)

  const parts: { name: string, size: number, sha512: string }[] = []
  for (let i = 0; i < indexBatches.length; i += 1) {
    const partName = `${def.installDir}.${String(i + 1).padStart(4, '0')}.zip`
    const partZip = join(outDir, partName)
    console.log(`[runtime-plugin] 打包第 ${i + 1}/${indexBatches.length} 卷 ${partName} …`)
    await writeStoreZipPart(partZip, indexBatches[i]!, files)
    const size = statSync(partZip).size
    const sha = sha512Hex(partZip)
    parts.push({ name: partName, size, sha512: sha })
    console.log(`  ✓ ${partName}  ${(size / 1024 ** 2).toFixed(1)} MiB  sha512 ${sha.slice(0, 16)}…`)
  }

  const manifest = { id, version: pluginVersion, installDir: def.installDir, parts }
  writeFileSync(join(outDir, `${id}.manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
  console.log(`[runtime-plugin] 清单已写入 ${outDir}/${id}.manifest.json`)
  console.log(`[runtime-plugin] 完成。请将 ${outDir} 下的分卷与清单上传到 runtime-plugins tag 对应的 GitHub Release。`)
}

void main()