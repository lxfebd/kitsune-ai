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
 *   npx tsx scripts/package-runtime-plugins.ts tts-gptsovits     [--source <dir>] [--out <dir>] [--version <ver>]  # GPU 版（8.5G，CUDA 全量）
 *   npx tsx scripts/package-runtime-plugins.ts tts-gptsovits-cpu [--source <dir>] [--out <dir>] [--version <ver>]  # CPU 精简版（4.9G，无 CUDA）
 *
 * 设计约束（与 apps/stage-tamagotchi/src/main/services/kitsune/tts/index.ts 的设备分支对齐）：
 * 引擎包同时服务 CPU 与 GPU 两种推理档——CPU 档靠 `CUDA_VISIBLE_DEVICES=''` 在运行期**不加载**
 * CUDA 库（省内存/CPU，但文件仍在包内），GPU 档（-d cuda / -hp）则必须加载它们。因此
 * **CUDA DLL 家族不能从包内物理删除**（除非确定只给无显卡机器分发，即 --cpu-only）。
 * 声线依赖 voices/<id>/manifest.json 的 gpt_model/sovits_model 指向的权重（v2Pro 声线含
 * 中文 ja 训练跨语言声线），打包自检强制校验这些引用完整——删了声线就哑。
 *
 * 三版分发（2026-09-09 定稿，产物均为「最终精简成品」，打包用 full 模式只切片不动内容）：
 *   - GPU 版（`tts-gptsovits`，installDir `gpt-sovits`，约 8.5G）：torch 2.7.0+cu128，CUDA 家族完整，
 *     `-d cuda / -hp` 走 GPU；无显卡机器装错会自动降级 CPU 推理（不坏功能，只是慢）。
 *   - CPU 精简版（`tts-gptsovits-cpu`，installDir `gpt-sovits-cpu`，约 4.9G）：runtime 内嵌 torch 2.7.0+cpu
 *     wheel，无任何 CUDA DLL；任何机器（含 AMD 显卡）都能用，推理只走 CPU。运行期必须 `-d cpu -fp`
 *     （CPU 半精度抛 Unsupported dtype Half），由 tts/index.ts 的 device 分支保证。
 *   - AMD 显卡版：无官方 Windows 原生路径（torch_directml 仅支持 torch 2.0；ROCm 仅 Linux/WSL2），
 *     直接分发 CPU 精简版即可。
 *
 * --slim 安全精简（CPU/GPU 双模通用，约 6.4GB → 5.5GB）：只剔除推理永不触碰的部件——
 *   - text/G2PWModel 的 g2pW.onnx + text/g2pw/ + chinese2.py/symbols2.py（约 610MB）：G2PW 是
 *     备用中文前端，主路径 chinese.py 用 pypinyin；日文/英文前端（pyopenjtalk 等）不受影响。
 *   - pretrained_models/sv/（约 103MB）：说话人校验训练工具模型；声音克隆是零样本参考合成
 *     （cloneVoice 只复制参考音频 + 写 manifest），运行时不使用 sv。
 *   - torch/functorch、torch/examples、pyinstaller 等框架附加件（约 150MB）。
 * 保留 CUDA 家族与全部声线/基座权重。多语言（zh/ja/en）、声音克隆、流式合成 API 完全兼容。
 *
 * --cpu-only（仅无显卡机器，约 6.4GB → 3.3GB）：在 --slim 基础上再剔除 torch/lib 的 CUDA
 *   DLL 家族（约 2.29GB）；保留 torch_cpu/torch_python/c10/libiomp5md 等 CPU 必需 DLL。
 *   该档在 GPU 机器上仍可运行（torch 检测不到 CUDA 走 CPU），但 GPU 档失效——选错代价是
 *   性能，不会坏功能。
 *
 * 产物（写入 --out，默认为 `dist/runtime-plugins/release/`）：
 *   <installDir>.0001.zip         第 1 卷
 *   <installDir>.0002.zip         第 2 卷
 *   …
 *   <id>.manifest.json            清单（id / version / installDir / parts[]，含每卷 size + sha512）
 *
 * 注意：v2Pro 引擎成品已按「最终精简」状态维护在 apps/stage-tamagotchi/resources/gpt-sovits(/cpu)，
 * 打包用默认 full 模式（只收集 + 切片，不再剔除任何内容）——两版的 --slim / --cpu-only 原地精简
 * 已在制作阶段手工完成并回归，脚本保留这两个模式仅作参考，避免二次剔除破坏已验收的成品。
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
  readFileSync,
  readdirSync,
  readSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, relative, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'

/** 单分卷大小上限（字节）。GitHub 单资产上限为 2GB，留出余量避免边界问题。 */
const MAX_PART_BYTES = 1_500_000_000

type RuntimePluginId = 'tts-gptsovits' | 'tts-gptsovits-cpu' | 'asr-sherpa'

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
  'tts-gptsovits-cpu': {
    id: 'tts-gptsovits-cpu',
    installDir: 'gpt-sovits-cpu',
    defaultSource: join('apps', 'stage-tamagotchi', 'resources', 'gpt-sovits-cpu'),
    defaultVersion: '1.0.0',
  },
}

/** 目录收集时跳过的开发/运行时产物目录。 */
const SKIPPED_DIR_NAMES = new Set(['__pycache__'])

/** 收集模式：full=全量；slim=安全精简（CPU/GPU 双模）；cpu=--cpu-only（再剔 CUDA）。 */
type SlimMode = 'full' | 'slim' | 'cpu'

/**
 * 精简（--slim 与 --cpu-only 共用）排除的文件/目录-relative 路径（相对插件根目录，`/` 分隔）。
 * 红线：不得排除 voices 下各 manifest 引用的权重（GPT_weights_v2Pro/、SoVITS_weights_v2Pro/）、
 * pretrained_models 核心模型、以及任何语言前端依赖（zh 主路径 pypinyin、ja 的 pyopenjtalk）——
 * 打包自检会解析 manifest 引用兜底。维护说明：与上方文档注释保持同步。
 */
const SLIM_COMMON_EXCLUDE_PATHS = new Set<string>([
  // G2PW 备用中文前端（主路径 chinese.py 用 pypinyin；g2pW.onnx 约 606MB）
  'text/G2PWModel',
  'text/g2pw',
  'text/chinese2.py',
  'text/symbols2.py',
  // 说话人校验训练工具模型（零样本克隆不依赖 sv）
  'pretrained_models/sv',
  // 框架附加/开发产物（推理不需要；torch/cuda 子包保留——GPU 档 import 需要）
  'runtime/Lib/site-packages/torch/functorch',
  'runtime/Lib/site-packages/torch/examples',
  'runtime/Lib/site-packages/pyinstaller',
  // 推理产物/调试输出
  '_tts_test_output.wav',
])

/** 精简模式下需要排除的路径前缀（目录整体剔除）。 */
const SLIM_EXCLUDE_PREFIXES: string[] = [
  // 目录整体剔除项目前为空；整目录剔除走 SLIM_COMMON_EXCLUDE_PATHS 的目录路径（见 collectFiles）。
]

/**
 * --cpu-only 专属：torch/lib 下按 DLL 文件名剔除 CUDA 运行时家族（约 2.29GB，27 个 DLL）：
 * cuBLAS/cuDNN/cuSPARSE/cuSOLVER/cuRAND/cuFFT/cuPTI/NVRTC/NVJitLink/torch_cuda/c10_cuda/cudart 等。
 * 保留 CPU 推理必需的 torch_cpu.dll/torch_python.dll/c10.dll/libiomp5md.dll（约 313MB）。
 * 注意：不能用整目录前缀排除，否则会误删 CPU DLL 导致引擎无法 import torch。
 * --slim（双模档）绝不能用这条规则——GPU 档（-d cuda / -hp）依赖这些 DLL。
 */
const CPU_ONLY_CUDA_LIB_DIR = 'runtime/Lib/site-packages/torch/lib/'
const CPU_ONLY_CUDA_NAME_MARKERS = [
  'cublas', 'cublaslt', 'cudnn', 'cusparse', 'cusolver', 'curand', 'cufft',
  'cupti', 'nvrtc', 'nvjitlink', 'nvperf', 'nvtoolsext', 'cudart', 'torch_cuda',
  'c10_cuda', 'caffe2_nvrtc',
]

function parseArgs(argv: string[]): { id: string, source?: string, out?: string, version?: string, slim: boolean, cpuOnly: boolean } {
  const args = argv.slice(2)
  const result: { id: string, source?: string, out?: string, version?: string, slim: boolean, cpuOnly: boolean } = {
    id: args[0] ?? '',
    slim: false,
    cpuOnly: false,
  }
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
    else if (a === '--slim') {
      result.slim = true
    }
    else if (a === '--cpu-only') {
      result.cpuOnly = true
    }
  }
  return result
}

/** 判断相对路径是否命中精简排除规则（精确路径、目录前缀、--cpu-only 的 CUDA DLL 文件名）。 */
function isSlimExcluded(rel: string, mode: SlimMode): boolean {
  if (mode === 'full')
    return false
  if (SLIM_COMMON_EXCLUDE_PATHS.has(rel))
    return true
  if (SLIM_EXCLUDE_PREFIXES.some(p => rel.startsWith(p)))
    return true
  // --cpu-only 才剔除 torch/lib 下的 CUDA 家族 DLL（保留 torch_cpu.dll 等 CPU 必需库）
  if (mode === 'cpu' && rel.startsWith(CPU_ONLY_CUDA_LIB_DIR) && rel.endsWith('.dll')) {
    const base = rel.slice(CPU_ONLY_CUDA_LIB_DIR.length).toLowerCase()
    if (CPU_ONLY_CUDA_NAME_MARKERS.some(m => base.includes(m)))
      return true
  }
  return false
}

/** 目录是否命中精简排除规则（目录路径整体剔除）。 */
function isSlimExcludedDir(relDir: string, mode: SlimMode): boolean {
  if (mode === 'full')
    return false
  return SLIM_COMMON_EXCLUDE_PATHS.has(`${relDir}/`) || SLIM_EXCLUDE_PREFIXES.some(p => relDir.startsWith(p))
}

/** 递归收集源目录下的普通文件（绝对路径 + 相对源根目录的路径 + 大小）。slim/cpu 模式下剔除相应部件。 */
function collectFiles(root: string, mode: SlimMode = 'full'): { abs: string, rel: string, size: number }[] {
  const files: { abs: string, rel: string, size: number }[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIPPED_DIR_NAMES.has(entry.name))
        continue
      const abs = join(dir, entry.name)
      if (entry.isDirectory()) {
        // 目录整体命中排除规则时直接跳过整棵子树（省掉逐文件 stat）
        if (mode !== 'full') {
          const relDir = relative(root, abs).split(sep).join('/')
          if (isSlimExcludedDir(relDir, mode))
            continue
        }
        walk(abs)
        continue
      }
      if (entry.isFile()) {
        const rel = relative(root, abs).split(sep).join('/')
        if (isSlimExcluded(rel, mode))
          continue
        files.push({ abs, rel, size: statSync(abs).size })
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
function splitIntoParts(files: { size: number, rel: string }[]): number[][] {
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
        header.writeUInt16LE(0x0800, 6) // flags: bit 11 (UTF-8 filenames)
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
        entry.writeUInt16LE(0x0800, 8) // flags: bit 11 (UTF-8 filenames)
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
  const { id, source, out, version, slim, cpuOnly } = parseArgs(process.argv)
  const def = PLUGIN_DEFS[id]
  if (!def) {
    console.error(`用法: npx tsx scripts/package-runtime-plugins.ts <id> [--source <dir>] [--out <dir>] [--version <ver>] [--slim | --cpu-only]`)
    console.error(`支持的插件 id: ${Object.keys(PLUGIN_DEFS).join(', ')}`)
    process.exit(1)
  }

  const mode: SlimMode = cpuOnly ? 'cpu' : (slim ? 'slim' : 'full')
  const sourceRoot = source ?? def.defaultSource
  if (!existsSync(sourceRoot)) {
    console.error(`源目录不存在: ${sourceRoot}`)
    process.exit(1)
  }

  const outDir = out ?? 'dist/runtime-plugins/release'
  mkdirSync(outDir, { recursive: true })

  const pluginVersion = version ?? def.defaultVersion
  const modeLabel = mode === 'cpu' ? '--cpu-only（再剔 CUDA，仅无显卡机器）' : (mode === 'slim' ? '--slim（安全精简，CPU/GPU 双模）' : '全量')
  console.log(`[runtime-plugin] ${modeLabel} 收集 ${sourceRoot} …`)
  const files = collectFiles(sourceRoot, mode)
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

  runPackSelfCheck(sourceRoot, files, mode)

  console.log(`[runtime-plugin] 完成。请将 ${outDir} 下的分卷与清单上传到 runtime-plugins tag 对应的 GitHub Release。`)
}

/**
 * 打包自检：校验关键文件与全部声线 manifest 引用齐全，以及（--cpu-only）无 CUDA 残留。
 * 声线引用从源目录的 voices 下各 manifest 实际解析——能兜住任何会删声线权重的规则错误。
 */
function runPackSelfCheck(sourceRoot: string, files: { rel: string }[], mode: SlimMode): void {
  const rels = new Set(files.map(f => f.rel))
  // v2Pro 目录布局：模型权重位于 GPT_SoVITS/pretrained_models/ 下（v1 的根级 pretrained_models/ 已不存在）。
  const critical = [
    'runtime/python.exe',
    'api.py',
    'GPT_SoVITS/pretrained_models/chinese-hubert-base/pytorch_model.bin',
    'GPT_SoVITS/pretrained_models/v2Pro/s2Gv2Pro.pth',
  ]
  const missing = critical.filter(p => !rels.has(p))
  if (missing.length > 0) {
    console.error(`[runtime-plugin] ⚠️ 自检失败：缺少关键文件 ${missing.join(', ')}`)
    process.exitCode = 1
  }

  if (mode !== 'full') {
    const voicesRoot = join(sourceRoot, 'voices')
    if (existsSync(voicesRoot)) {
      const voiceIds = readdirSync(voicesRoot, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
      const orphanRefs: string[] = []
      const unparsed: string[] = []
      for (const vid of voiceIds) {
        const mf = join(voicesRoot, vid, 'manifest.json')
        if (!existsSync(mf))
          continue
        try {
          const data = JSON.parse(readFileSync(mf, 'utf-8')) as { gpt_model?: string, sovits_model?: string }
          for (const key of ['gpt_model', 'sovits_model'] as const) {
            const ref = data[key]
            if (ref) {
              const norm = ref.replace(/\\/g, '/').replace(/^\//, '')
              if (!rels.has(norm))
                orphanRefs.push(`${vid}#${key}=${norm}`)
            }
          }
        }
        catch {
          unparsed.push(vid)
        }
      }
      if (orphanRefs.length > 0) {
        console.error(`[runtime-plugin] ⚠️ 自检失败：声线引用的权重被剔除 ${orphanRefs.join(', ')}`)
        process.exitCode = 1
      }
      if (unparsed.length > 0)
        console.log(`[runtime-plugin] 提示：无法解析声线 manifest ${unparsed.join(', ')}（跳过其引用校验）`)
    }
  }

  if (mode === 'cpu') {
    const cudaResidue = files.filter(f => f.rel.startsWith(CPU_ONLY_CUDA_LIB_DIR) && f.rel.endsWith('.dll')
      && CPU_ONLY_CUDA_NAME_MARKERS.some(m => f.rel.toLowerCase().includes(m)))
    if (cudaResidue.length > 0) {
      console.error(`[runtime-plugin] ⚠️ 自检失败：残留 CUDA DLL ${cudaResidue.map(f => f.rel).join(', ')}`)
      process.exitCode = 1
    }
    const cpuKept = files.filter(f => f.rel.startsWith(CPU_ONLY_CUDA_LIB_DIR) && f.rel.endsWith('torch_cpu.dll'))
    if (cpuKept.length === 0) {
      console.error('[runtime-plugin] ⚠️ 自检失败：torch_cpu.dll 被误删（CPU 推理必需）')
      process.exitCode = 1
    }
  }

  if (process.exitCode === 0) {
    const okLabel = mode === 'cpu' ? '关键文件齐全、CUDA 家族已清除、声线引用完整'
      : (mode === 'slim' ? '关键文件齐全、CUDA 家族保留、声线引用完整'
        : '关键文件齐全')
    console.log(`[runtime-plugin] 自检通过：${okLabel}`)
  }
}

void main()