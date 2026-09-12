#!/usr/bin/env node
/**
 * 精简 GPT-SoVITS 引擎目录（运行时瘦身装配工具）。
 *
 * 背景：GPT-SoVITS 全量引擎约 6.4GB（分卷 gpt-sovits.0001~0006.zip），其中 ~2.3GB 是
 * CUDA 运行时库、600MB+ 是主合成用不到的备用模型/前端。桌面宠物 CPU 档靠
 * `-d cpu` + `CUDA_VISIBLE_DEVICES=''` 在运行期不加载 CUDA 库，但**引擎包必须同时服务
 * CPU 与 GPU 两种推理档**（GPU 档 -d cuda / -hp 依赖 CUDA DLL），因此 CUDA 家族默认保留。
 * 本脚本从已下载的全量分卷（或已解压的全量目录）直接产出精简目录：
 *
 *   --slim（默认，CPU/GPU 双模安全精简，约 6.4GB → 5.5GB）：只剔除推理永不触碰的部件——
 *     G2PW 备用中文前端（g2pW.onnx 606MB）、sv 说话人校验训练模型（103MB）、
 *     torch/functorch/examples/pyinstaller 等框架附加件（约 150MB）。
 *     保留 CUDA 家族、全部声线权重与基座模型；多语言（zh/ja/en）、声音克隆、
 *     流式合成完全兼容。
 *   --cpu-only（仅无显卡机器，约 6.4GB → 3.3GB）：在 --slim 基础上再剔除 torch/lib 的
 *     CUDA DLL 家族（约 2.29GB），保留 torch_cpu.dll 等 CPU 必需 DLL。GPU 机器选错此档
 *     只会失去 GPU 加速（自动降级 CPU），功能不坏。
 *
 * 产出物：精简后的引擎目录（复制自全量），结构与原目录完全一致（api.py / runtime /
 * pretrained_models / GPT_weights_v2Pro / SoVITS_weights_v2Pro / voices 都在根级），
 * 可直接作为 tts 引擎目录使用：`GPT_SOVITS_DIR=<目标目录>` 或设置页「引擎目录」指向它；
 * 也可后续用 `package-runtime-plugins.ts --slim` 打成精简分卷发布。
 *
 * 用法：
 *   # 从已下载的分卷目录（自动解压后精简），默认 --slim 双模档：
 *   npx tsx scripts/slim-gptsovits.ts --volumes <含 gpt-sovits.0001~0006.zip 的目录> --out <目标目录>
 *   # 无显卡机器（再剔 CUDA）：
 *   npx tsx scripts/slim-gptsovits.ts --volumes <分卷目录> --out <目标目录> --cpu-only
 *   # 从已解压的全量引擎目录精简（更快，免解压）：
 *   npx tsx scripts/slim-gptsovits.ts --source <全量引擎目录> --out <目标目录> [--cpu-only]
 *
 * 不会改动源目录/分卷。
 */

import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'

// ---------------------------------------------------------------------------
// 精简排除规则（与 package-runtime-plugins.ts 的 --slim / --cpu-only 保持一致）
// ---------------------------------------------------------------------------

/** --slim 与 --cpu-only 共用：精确路径排除（相对引擎根，`/` 分隔）；目录路径以 `/` 结尾。 */
const EXCLUDE_PATHS = new Set<string>([
  'runtime/Lib/site-packages/torch/functorch/',
  'runtime/Lib/site-packages/torch/examples/',
  'runtime/Lib/site-packages/pyinstaller/',
  'text/G2PWModel/',
  'text/g2pw/',
  'text/chinese2.py',
  'text/symbols2.py',
  'pretrained_models/sv/',
  '_tts_test_output.wav',
])

/** --cpu-only 专属：torch/lib 下按 DLL 文件名剔除的 CUDA 家族标记（保留 torch_cpu.dll 等 CPU 必需库）。 */
const TORCH_LIB = 'runtime/Lib/site-packages/torch/lib/'
const CUDA_NAME_MARKERS = [
  'cublas', 'cublaslt', 'cudnn', 'cusparse', 'cusolver', 'curand', 'cufft',
  'cupti', 'nvrtc', 'nvjitlink', 'nvperf', 'nvtoolsext', 'cudart', 'torch_cuda',
  'c10_cuda', 'caffe2_nvrtc',
]

/** 收集模式：slim=双模安全精简（默认）；cpu=--cpu-only（再剔 CUDA）。 */
type SlimMode = 'slim' | 'cpu'

function isExcluded(rel: string, mode: SlimMode): boolean {
  if (EXCLUDE_PATHS.has(rel))
    return true
  for (const p of EXCLUDE_PATHS) {
    if (p.endsWith('/') && rel.startsWith(p))
      return true
  }
  if (mode === 'cpu' && rel.startsWith(TORCH_LIB) && rel.endsWith('.dll')) {
    const base = rel.slice(TORCH_LIB.length).toLowerCase()
    if (CUDA_NAME_MARKERS.some(m => base.includes(m)))
      return true
  }
  return false
}

/** 关键文件自检：精简后这些必须存在。 */
const CRITICAL_FILES = [
  'runtime/python.exe',
  'api.py',
  'pretrained_models/chinese-hubert-base/pytorch_model.bin',
  'pretrained_models/v2Pro/s2Gv2Pro.pth',
  'runtime/Lib/site-packages/torch/lib/torch_cpu.dll',
]

// ---------------------------------------------------------------------------
// 复制精简树
// ---------------------------------------------------------------------------

async function copySlimTree(sourceRoot: string, outDir: string, mode: SlimMode): Promise<{ copied: number, bytes: number, dropped: number }> {
  let copied = 0
  let bytes = 0
  let dropped = 0

  const walk = async (dir: string, relDir: string): Promise<void> => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '__pycache__')
        continue
      const abs = join(dir, entry.name)
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (isExcluded(`${rel}/`, mode)) {
          dropped += 1
          continue
        }
        await walk(abs, rel)
        continue
      }
      if (entry.isFile()) {
        if (isExcluded(rel, mode)) {
          dropped += 1
          continue
        }
        const dest = join(outDir, rel.split('/').join(sep))
        mkdirSync(join(dest, '..'), { recursive: true })
        await pipeline(createReadStream(abs), createWriteStream(dest))
        copied += 1
        bytes += statSync(abs).size
      }
    }
  }

  await walk(sourceRoot, '')
  return { copied, bytes, dropped }
}

// ---------------------------------------------------------------------------
// 分卷解压（yauzl，防路径穿越）
// ---------------------------------------------------------------------------

function extractVolumes(volumesDir: string, targetDir: string): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const zips = readdirSync(volumesDir)
      .filter(f => f.startsWith('gpt-sovits.') && f.endsWith('.zip'))
      .sort()
    if (zips.length === 0) {
      reject(new Error(`未找到 gpt-sovits.*.zip 分卷: ${volumesDir}`))
      return
    }
    // yauzl 类型在 stage-tamagotchi 包内（root scripts 不在其 deps 解析链）；`as string`
    // 只跳过模块解析、不影响运行时（tsx 从仓库 node_modules 解析，行为与 runtime-plugins 一致）。
    const { default: yauzlOpen } = await import('yauzl' as string) as { default: any }
    let index = 0
    let pending = 0
    const done = (): void => {
      if (pending === 0 && index >= zips.length)
        resolve()
    }
    const openNext = (): void => {
      if (index >= zips.length) {
        done()
        return
      }
      const zipPath = join(volumesDir, zips[index]!)
      index += 1
      yauzlOpen.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
        if (err) {
          reject(err)
          return
        }
        if (!zipfile) {
          reject(new Error(`无法打开分卷: ${zipPath}`))
          return
        }
        zipfile.readEntry()
        zipfile.on('entry', (entry) => {
          const rel = entry.fileName.replace(/\\/g, '/')
          // 防路径穿越
          if (rel.includes('..') || rel.startsWith('/') || /^[a-zA-Z]:/.test(rel)) {
            zipfile.readEntry()
            return
          }
          if (entry.fileName.endsWith('/')) {
            mkdirSync(join(targetDir, rel), { recursive: true })
            zipfile.readEntry()
            return
          }
          pending += 1
          zipfile.openReadStream(entry, (err2, readStream) => {
            if (err2) {
              reject(err2)
              return
            }
            const dest = join(targetDir, rel)
            mkdirSync(join(dest, '..'), { recursive: true })
            pipeline(readStream, createWriteStream(dest)).then(() => {
              pending -= 1
              done()
            }).catch(reject)
            zipfile.readEntry()
          })
        })
        zipfile.on('end', () => {
          zipfile.close()
          openNext()
        })
        zipfile.on('error', reject)
      })
    }
    openNext()
  })
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

interface Args {
  volumes?: string
  source?: string
  out: string
  cpuOnly: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { out: '', cpuOnly: false }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--volumes') {
      args.volumes = argv[i + 1]
      i += 1
    }
    else if (argv[i] === '--source') {
      args.source = argv[i + 1]
      i += 1
    }
    else if (argv[i] === '--out') {
      args.out = argv[i + 1]!
      i += 1
    }
    else if (argv[i] === '--cpu-only') {
      args.cpuOnly = true
    }
  }
  return args
}

/** 解析源目录 voices 下各 manifest，返回其 gpt_model/sovits_model 引用（相对引擎根，`/` 分隔）。 */
function voiceModelRefs(sourceRoot: string): string[] {
  const voicesRoot = join(sourceRoot, 'voices')
  const refs: string[] = []
  if (!existsSync(voicesRoot))
    return refs
  for (const vid of readdirSync(voicesRoot, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)) {
    const mf = join(voicesRoot, vid, 'manifest.json')
    if (!existsSync(mf))
      continue
    try {
      const data = JSON.parse(readFileSync(mf, 'utf-8')) as { gpt_model?: string, sovits_model?: string }
      for (const key of ['gpt_model', 'sovits_model'] as const) {
        const ref = data[key]
        if (ref)
          refs.push(ref.replace(/\\/g, '/').replace(/^\//, ''))
      }
    }
    catch {
      // manifest 无法解析时跳过——引擎侧有空态兜底，不阻塞精简
    }
  }
  return refs
}

async function main(): Promise<void> {
  const { volumes, source, out, cpuOnly } = parseArgs(process.argv.slice(2))
  const mode: SlimMode = cpuOnly ? 'cpu' : 'slim'
  if (!out) {
    console.error('用法: npx tsx scripts/slim-gptsovits.ts (--volumes <分卷目录> | --source <全量目录>) --out <目标目录> [--cpu-only]')
    process.exit(1)
  }
  if (!volumes && !source) {
    console.error('必须提供 --volumes 或 --source 之一')
    process.exit(1)
  }

  mkdirSync(out, { recursive: true })

  let workDir = source
  if (!source) {
    console.log('[slim] 解压分卷到临时目录 …')
    const tmp = join(process.env.TEMP ?? '/tmp', `gptsovits-slim-${Date.now()}`)
    mkdirSync(tmp, { recursive: true })
    await extractVolumes(volumes!, tmp)
    workDir = tmp
  }
  if (!workDir || !existsSync(workDir)) {
    console.error(`源目录不存在: ${workDir}`)
    process.exit(1)
  }

  const modeLabel = mode === 'cpu' ? '--cpu-only（再剔 CUDA，仅无显卡机器）' : '--slim（安全精简，CPU/GPU 双模）'
  console.log(`[slim] ${modeLabel} 从 ${workDir} 复制精简树 → ${out} …`)
  const { copied, bytes, dropped } = await copySlimTree(workDir, out, mode)

  console.log(`[slim] 复制 ${copied} 文件 / ${(bytes / 1073741824).toFixed(2)} GiB，跳过 ${dropped} 条目`)

  // 自检 1：关键文件齐全
  const missing = CRITICAL_FILES.filter(f => !existsSync(join(out, f.split('/').join(sep))))
  if (missing.length > 0) {
    console.error(`[slim] ⚠️ 自检失败：缺少关键文件 ${missing.join(', ')}`)
    process.exit(1)
  }
  // 自检 2：声线引用的权重必须存在（voices/*/manifest.json 的 gpt_model/sovits_model）——防止声线哑
  const refs = voiceModelRefs(workDir)
  const orphanRefs = refs.filter(r => !existsSync(join(out, r.split('/').join(sep))))
  if (orphanRefs.length > 0) {
    console.error(`[slim] ⚠️ 自检失败：声线引用的权重缺失 ${orphanRefs.join(', ')}`)
    process.exit(1)
  }
  // 自检 3：模式相关——--cpu-only 无 CUDA 残留；双模档 CUDA 家族必须保留（GPU 档依赖）
  const torchLibAbs = join(out, TORCH_LIB.split('/').slice(0, -1).join(sep))
  const libDlls = readdirSync(torchLibAbs).filter(f => f.endsWith('.dll'))
  if (mode === 'cpu') {
    const cudaResidue = libDlls.filter(f => CUDA_NAME_MARKERS.some(m => f.toLowerCase().includes(m)))
    if (cudaResidue.length > 0) {
      console.error(`[slim] ⚠️ 自检失败：残留 CUDA DLL ${cudaResidue.join(', ')}`)
      process.exit(1)
    }
    if (!libDlls.includes('torch_cpu.dll')) {
      console.error('[slim] ⚠️ 自检失败：torch_cpu.dll 被误删（CPU 推理必需）')
      process.exit(1)
    }
  }
  else {
    const cudaKept = libDlls.filter(f => CUDA_NAME_MARKERS.some(m => f.toLowerCase().includes(m)))
    if (cudaKept.length === 0) {
      console.error('[slim] ⚠️ 自检失败：双模档 CUDA 家族缺失（GPU 档 -d cuda 无法工作）；如目标机器无显卡请用 --cpu-only')
      process.exit(1)
    }
  }
  console.log(`[slim] ✅ 精简完成：${mode === 'cpu' ? 'CPU 关键文件齐全、CUDA 家族已清除' : 'CPU/GPU 双模文件齐全（CUDA 保留）'}、声线引用完整`)
  console.log(`[slim] 使用：GPT_SOVITS_DIR="${out}" 或设置页「引擎目录」指向该目录`)
}

void main()
