#!/usr/bin/env node
/**
 * 精简 GPT-SoVITS-v2pro-20250604-nvidia50 存档引擎（22GB → 精简树，GPU/CPU 双模）。
 *
 * 与 scripts/slim-gptsovits.ts 的区别：那条针对 kitsune 打包的扁平分卷结构（api.py/runtime/
 * pretrained_models/ 在根级）；这条针对 E:\agentpet 里 GPT-SoVITS 官方仓库结构（api.py 在根级、
 * 模型在 GPT_SoVITS/pretrained_models/、python 在 runtime/）。
 *
 * 设计红线（与 tts/index.ts 设备分支对齐，用户要求）：
 *   - CPU/GPU 双模：CPU 档靠 CUDA_VISIBLE_DEVICES='' 运行期不加载 CUDA；GPU 档（-d cuda）必须
 *     加载 CUDA。⇒ runtime/（torch 2.7.0+cu128，5090 Blackwell 用的 CUDA 12.8）整体保留，
 *     不剔 CUDA DLL。本存档是 nvidia50 专用 CUDA 版，正配 5090。
 *   - 多语言：zh 用 pypinyin，ja 用 pyopenjtalk（均在 runtime/Lib），en 用 cmudict。全部保留。
 *   - 声音克隆=零样本：cloneVoice 只复制参考音频+写 manifest，不依赖 sv。⇒ sv 可删。
 *
 * 剔除（几乎全是训练/多版本/备用部件，推理用不到）：
 *   1. GPT_SoVITS/pretrained_models/{gsv-v4-pretrained(789M), s2Gv3.pth(734M),
 *      gsv-v2final-pretrained(339M), v2Pro/s2Dv2ProPlus.pth+s2Gv2ProPlus.pth(~311M),
 *      s2D488k.pth(102M), s2G488k.pth(102M)} —— 只有 v2Pro 声线，这些是 v1/v2/v3/v4/Plus/488k 底模。
 *      ⚠️ 保留：v2Pro/{s2Gv2Pro.pth,s2Dv2Pro.pth}、chinese-hubert-base、chinese-roberta-wwm-ext-large、
 *      s1v3.ckpt(v2Pro 的 GPT 底模)、s1bert25hz-2kh(v1 但 api.py 直接列，保留防启动报错)、
 *      s2G488k.pth+s2D488k.pth(api.py 启动 fallback 默认指向，删了未 set_model 直接合成会崩，共 ~192M)、
 *      sv(推理链 API 里 TTS.py:689 强制构造 SV()，删了必崩)、fast_langdetect(语言检测)、
 *      bigvgan_v2_24khz(声码器)。
 *   2. GPT_SoVITS/text/{G2PWModel(608M), G2PWModel_1.1.zip(84M), g2pw(3M)} —— 备用中文前端，主路径 pypinyin。
 *      ⚠️ chinese2.py 的 is_g2pw 硬编码 True，精简档需改为 False（已改产物）；保留其余 text/
 *      （text/__init__.py 硬 import symbols2/symbols，多语言前端 ja_userdic/cmudict/engdict 等）。
 *   3. tools/{asr(1.2G), uvr5(719M), AP_BWE_main(114M)} —— 训练/预处理工具；保留纯 py（含
 *      tools/audio_sr.py 供 audio_sr() 条件导入，按原文件逻辑仅在 AP_BWE 模型存在时使用，否则返回原音频）。
 *   4. GPT_weights_v2Pro/{妮芙-e5,e10, 艾丽妮-e5,e10}.ckpt(4×148M) 与
 *      SoVITS_weights_v2Pro/{妮芙_e4_s112, 艾丽妮_e4_s136}.pth(2×128.7M) —— 多版本，只留 manifest 引用的
 *      e15 与 e8_s224/e8_s272。
 *   5. 垃圾：__pycache__、TEMP/、output/、logs/、airi-models-v1.0.zip(100M)。
 *
 * 自检（违规 exitCode=1）：
 *   1. 关键文件在（runtime/python.exe 或 runtime/Scripts/python.exe、api.py、v2Pro/s2Gv2Pro.pth、
 *      s1v3.ckpt、s1bert25hz-2kh、s2G488k/s2D488k、hubert、roberta、sv/eres2net、fast_langdetect、bigvgan）。
 *   2. runtime 的 torch 为 CUDA 版（torch/lib 含 torch_cuda/cudnn/cublas）—— GPU 档必需。
 *   3. 语言前端在（pyopenjtalk、pypinyin 在 runtime site-packages）。
 *   4. 声线权重（艾丽妮-e15.ckpt、妮芙-e15.ckpt、e8_s272、e8_s224）在。
 *   5. 剔除项不残留（G2PWModel、v3/v4/Plus、asr/uvr5/AP_BWE）；
 *      中文前端已切 pypinyin（chinese2.py is_g2pw=False，G2PWModel 权重不引用）。
 *
 * 用法：
 *   npx tsx scripts/slim-gptsovits-archived.ts \
 *     --source "E:/agentpet/open/GPT-SoVITS-v2pro-20250604-nvidia50/GPT-SoVITS-v2pro-20250604-nvidia50" \
 *     --out "apps/stage-tamagotchi/resources/gpt-sovits"
 *
 * 不会改动源目录。
 */

import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'

// ---------------------------------------------------------------------------
// 定制排除规则（针对 nvidia50 上游结构）
// ---------------------------------------------------------------------------

/** 精确排除路径（相对引擎根，`/` 分隔）；目录路径以 `/` 结尾。 */
const EXCLUDE_PATHS = new Set<string>([
  // 用不到的多代底模/训练工具（s2G488k/s2D488k 保留：api.py 启动 fallback 默认指向）
  'GPT_SoVITS/pretrained_models/gsv-v4-pretrained/',
  'GPT_SoVITS/pretrained_models/s2Gv3.pth',
  'GPT_SoVITS/pretrained_models/gsv-v2final-pretrained/',
  'GPT_SoVITS/pretrained_models/v2Pro/s2Dv2ProPlus.pth',
  'GPT_SoVITS/pretrained_models/v2Pro/s2Gv2ProPlus.pth',
  // 备用中文前端（主路径 pypinyin）
  'GPT_SoVITS/text/G2PWModel/',
  'GPT_SoVITS/text/G2PWModel_1.1.zip',
  'GPT_SoVITS/text/g2pw/',
  // 训练/预处理工具的大模型目录（保留纯 py）
  'tools/asr/',
  'tools/uvr5/',
  'tools/AP_BWE_main/',
  // 多版本声线（只留 manifest 引用的 e15 + e8_s272/e8_s224）
  'GPT_weights_v2Pro/妮芙-e5.ckpt',
  'GPT_weights_v2Pro/妮芙-e10.ckpt',
  'GPT_weights_v2Pro/艾丽妮-e5.ckpt',
  'GPT_weights_v2Pro/艾丽妮-e10.ckpt',
  'SoVITS_weights_v2Pro/妮芙_e4_s112.pth',
  'SoVITS_weights_v2Pro/艾丽妮_e4_s136.pth',
  // 垃圾/冗余（__pycache__ 按条目名匹配，见 isExcludedEntryName）
  'TEMP/',
  'output/',
  'logs/',
  'airi-models-v1.0.zip',
])

/** 按文件/目录名匹配的排除（不依赖相对路径前缀，能命中任意深层目录）。 */
const EXCLUDE_ENTRY_NAMES = new Set<string>(['__pycache__'])

/** 关键文件自检：精简后必须存在。python.exe 单独做 either/or 判定（见 main）。 */
const CRITICAL_FILES = [
  'api.py',
  'GPT_SoVITS/pretrained_models/v2Pro/s2Gv2Pro.pth',
  'GPT_SoVITS/pretrained_models/v2Pro/s2Dv2Pro.pth',
  'GPT_SoVITS/pretrained_models/s1v3.ckpt',
  'GPT_SoVITS/pretrained_models/s1bert25hz-2kh-longer-epoch=68e-step=50232.ckpt',
  'GPT_SoVITS/pretrained_models/s2G488k.pth',
  'GPT_SoVITS/pretrained_models/s2D488k.pth',
  'GPT_SoVITS/pretrained_models/chinese-hubert-base/pytorch_model.bin',
  'GPT_SoVITS/pretrained_models/chinese-roberta-wwm-ext-large/pytorch_model.bin',
  'GPT_SoVITS/pretrained_models/fast_langdetect/lid.176.bin',
  'GPT_SoVITS/pretrained_models/models--nvidia--bigvgan_v2_24khz_100band_256x/bigvgan_generator.pt',
  'GPT_SoVITS/pretrained_models/sv/pretrained_eres2netv2w24s4ep4.ckpt',
  'GPT_weights_v2Pro/艾丽妮-e15.ckpt',
  'GPT_weights_v2Pro/妮芙-e15.ckpt',
  'SoVITS_weights_v2Pro/艾丽妮_e8_s272.pth',
  'SoVITS_weights_v2Pro/妮芙_e8_s224.pth',
]

/** 语言前端依赖（runtime site-packages 里必须有，多语言 zh/ja/en 用）。 */
const LANG_PKGS = ['pyopenjtalk', 'pypinyin']

/** 剔除项残留检查列表（路径命中即判定残留，防误删后重放）。 */
const RESIDUE_CHECK = [
  'GPT_SoVITS/pretrained_models/gsv-v4-pretrained/',
  'GPT_SoVITS/pretrained_models/s2Gv3.pth',
  'GPT_SoVITS/pretrained_models/gsv-v2final-pretrained/',
  'GPT_SoVITS/pretrained_models/v2Pro/s2Dv2ProPlus.pth',
  'GPT_SoVITS/pretrained_models/v2Pro/s2Gv2ProPlus.pth',
  'GPT_SoVITS/text/G2PWModel/',
  'GPT_SoVITS/text/g2pw/',
  'tools/asr/',
  'tools/uvr5/',
  'tools/AP_BWE_main/',
]

/** 判断相对路径是否命中排除（精确 + 目录前缀）。 */
function isExcluded(rel: string): boolean {
  if (EXCLUDE_PATHS.has(rel))
    return true
  for (const p of EXCLUDE_PATHS) {
    if (p.endsWith('/') && rel.startsWith(p))
      return true
  }
  return false
}

/** 按条目名排除（命中任意深度的同名文件/目录）。 */
function isExcludedEntryName(name: string): boolean {
  return EXCLUDE_ENTRY_NAMES.has(name)
}

// ---------------------------------------------------------------------------
// 复制精简树
// ---------------------------------------------------------------------------

async function copyTree(sourceRoot: string, outDir: string): Promise<{ copied: number, bytes: number, dropped: number }> {
  let copied = 0
  let bytes = 0
  let dropped = 0

  const walk = async (dir: string, relDir: string): Promise<void> => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name)
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name
      if (isExcludedEntryName(entry.name)) {
        dropped += 1
        continue
      }
      if (entry.isDirectory()) {
        if (isExcluded(`${rel}/`)) {
          dropped += 1
          continue
        }
        await walk(abs, rel)
        continue
      }
      if (entry.isFile()) {
        if (isExcluded(rel)) {
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

/** 在精简树中补写 voices/<id>/manifest.json（kitsune tts 服务依赖解析权重路径）。 */
function writeVoiceManifests(outDir: string): void {
  const manifests: Record<string, string> = {
    'voices/艾丽妮/manifest.json': JSON.stringify({
      id: 'ailini',
      display_name: '艾丽妮',
      language: 'zh',
      default_reference: '作战中1.wav',
      default_prompt_text: '你好，我是艾丽妮。',
      description: '艾丽妮 - GPT-SoVITS voice clone (v2Pro)',
      gpt_model: 'GPT_weights_v2Pro/艾丽妮-e15.ckpt',
      sovits_model: 'SoVITS_weights_v2Pro/艾丽妮_e8_s272.pth',
    }, null, 2) + '\n',
    'voices/妮芙/manifest.json': JSON.stringify({
      id: 'nifu',
      display_name: '妮芙',
      language: 'ja',
      default_reference: '作战中1.wav',
      default_prompt_text: '你好，我是妮芙。',
      description: '妮芙 - GPT-SoVITS voice clone (v2Pro, 日语训练声线 / 中文跨语言合成)',
      gpt_model: 'GPT_weights_v2Pro/妮芙-e15.ckpt',
      sovits_model: 'SoVITS_weights_v2Pro/妮芙_e8_s224.pth',
    }, null, 2) + '\n',
  }
  for (const [rel, text] of Object.entries(manifests)) {
    const abs = join(outDir, rel.split('/').join(sep))
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, text, 'utf-8')
  }
}

/**
 * 精简档中文前端补丁：chinese2.py 的 is_g2pw 硬编码 True（G2PW 权重已剔除会崩）。
 * 改写为 False，让 zh 走 pypinyin 纯推理（api.py 实测：pypinyin 分支完整独立，
 * 不引用 g2pw 模块；G2PWModel 权重可省 608M）。
 */
function applyChinesePypinyinPatch(outDir: string): void {
  const file = join(outDir, 'GPT_SoVITS', 'text', 'chinese2.py')
  if (!existsSync(file)) {
    console.error('[archived-slim] ⚠️ 补丁失败：chinese2.py 不存在')
    process.exit(1)
  }
  const src = readFileSync(file, 'utf-8')
  const patched = src.includes('is_g2pw = False') && !src.includes('is_g2pw = True')
    ? src
    : src.replace('is_g2pw = True', 'is_g2pw = False  # 精简档：走 pypinyin 纯推理，不依赖 G2PWModel')
  if (patched === src && !src.includes('is_g2pw = False')) {
    console.error('[archived-slim] ⚠️ 补丁失败：chinese2.py 未找到 is_g2pw 硬编码')
    process.exit(1)
  }
  writeFileSync(file, patched, 'utf-8')
  console.log('[archived-slim] ✅ 中文前端已切 pypinyin（chinese2.py is_g2pw=False）')
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  let source = ''
  let out = ''
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source') {
      source = argv[i + 1]!
      i += 1
    }
    else if (argv[i] === '--out') {
      out = argv[i + 1]!
      i += 1
    }
  }
  if (!source || !out) {
    console.error('用法: npx tsx scripts/slim-gptsovits-archived.ts --source <引擎目录> --out <目标目录>')
    process.exit(1)
  }
  if (!existsSync(source)) {
    console.error(`源目录不存在: ${source}`)
    process.exit(1)
  }

  mkdirSync(out, { recursive: true })
  console.log(`[archived-slim] 从 ${source} 复制精简树 → ${out} …`)
  const { copied, bytes, dropped } = await copyTree(source, out)
  console.log(`[archived-slim] 复制 ${copied} 文件 / ${(bytes / 1073741824).toFixed(2)} GiB，跳过 ${dropped} 条目`)

  // 补写 voices manifest（kitsune tts 依赖）
  writeVoiceManifests(out)
  console.log('[archived-slim] 已补写 voices/艾丽妮 + voices/妮芙 manifest.json')

  // 中文前端切 pypinyin（G2PW 权重已剔除，chinese2.py 硬编码 True 会崩）
  applyChinesePypinyinPatch(out)

  // ---- 自检 1：关键文件 ----
  // python.exe 二选一（runtime/ 顶层 或 runtime/Scripts/ 下），不存在才失败
  const pythonExe = join(out, 'runtime', 'python.exe')
  const scriptsPython = join(out, 'runtime', 'Scripts', 'python.exe')
  if (!existsSync(pythonExe) && !existsSync(scriptsPython)) {
    console.error('[archived-slim] ⚠️ 自检失败：runtime 下没有 python.exe（runtime/python.exe 或 runtime/Scripts/python.exe）')
    process.exit(1)
  }
  const missing = CRITICAL_FILES.filter(f => !existsSync(join(out, f.split('/').join(sep))))
  if (missing.length > 0) {
    console.error(`[archived-slim] ⚠️ 自检失败：缺少关键文件 ${missing.join(', ')}`)
    process.exit(1)
  }

  // ---- 自检 2：torch CUDA 版（5090 GPU 档必需） ----
  const torchLib = join(out, 'runtime', 'Lib', 'site-packages', 'torch', 'lib')
  const libFiles = existsSync(torchLib) ? readdirSync(torchLib) : []
  const hasCuda = libFiles.some(f => /torch_cuda|cudnn|cublas/i.test(f))
  if (!hasCuda) {
    console.error('[archived-slim] ⚠️ 自检失败：runtime 的 torch 非 CUDA 版（5090 GPU 档无法加速）')
    process.exit(1)
  }

  // ---- 自检 3：语言前端 ----
  const sitePkgs = join(out, 'runtime', 'Lib', 'site-packages')
  const missingLang = LANG_PKGS.filter(p => !existsSync(join(sitePkgs, p)))
  if (missingLang.length > 0) {
    console.error(`[archived-slim] ⚠️ 自检失败：缺少语言前端 ${missingLang.join(', ')}`)
    process.exit(1)
  }

  // ---- 自检 4：剔除项残留 ----
  const rels = new Set<string>()
  const collect = (dir: string, relDir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const rel = relDir ? `${relDir}/${e.name}` : e.name
      if (e.isDirectory()) {
        rels.add(`${rel}/`)
        collect(join(dir, e.name), rel)
      }
      else {
        rels.add(rel)
      }
    }
  }
  collect(out, '')
  const residues = RESIDUE_CHECK.filter(r => [...rels].some(x => x === r || x.startsWith(r)))
  if (residues.length > 0) {
    console.error(`[archived-slim] ⚠️ 自检失败：剔除项残留 ${residues.join(', ')}`)
    process.exit(1)
  }

  console.log('[archived-slim] ✅ 精简完成：GPU/CPU 双模、CUDA 保留、多语言前端齐全、声线权重完整、剔除项清零')
  console.log(`[archived-slim] 使用：GPT_SOVITS_DIR="${out}" 或设置页「引擎目录」指向该目录`)
}

void main()
