---
date: 2026-07-19
module: stage-tamagotchi/gpt-sovits
problem_type: rebuild
tags: [tts, gpt-sovits, electron, sidecar, runtime, rebuild]
status: done
---

# GPT-SoVITS 内置资源重建

## Problem Frame

`apps/stage-tamagotchi/resources/gpt-sovits/` 原本是**根因混乱的"半壳"**：
推理入口 `api.py` 引用的核心模块全是 stub（返回 `None` / 零张量），同时项目
内又携带了真实实现副本但 Python import 命中不到；上游必需的预训练底模目录
完全缺失；自带 `runtime/python.exe` 是 3.9.13，已不满足上游核心依赖；与
Electron 集成层的 ready 探测协议不匹配，启动期 30–90 秒内必误报 WARN。

目标用户场景：桌面宠物**内置** TTS + 声音克隆 + 多角色动态切换；**不要**
训练、ASR、UVR5、超分、WebUI、上游完整数据集流水线。

## Root Causes（已核实）

| # | 现象 | 根因（含文件:行） |
|---|---|---|
| RC-1 | 推理必崩 | stub 优先被 import：`module/models.py:12-49`、`feature_extractor/cnhubert.py:12-17`、`AR/models/t2s_lightning_module.py:10-20`、`BigVGAN/bigvgan.py:10-26` 全是桩；真实副本在同名嵌套子目录 `AR/AR/models/`、`module/module/`、`feature_extractor/feature_extractor/`、`BigVGAN/BigVGAN/`，Python `sys.path` 命中不到 |
| RC-2 | 启动直接 `OSError` | `config.py:13-28`、`api.py:150/1283-1285` 引用 `GPT_SoVITS/pretrained_models/{chinese-hubert-base, chinese-roberta-wwm-ext-large, s2Gv3.pth, gsv-v4-pretrained/vocoder.pth, models--nvidia--bigvgan_v2_24khz_100band_256x}` —— 整个 `GPT_SoVITS/pretrained_models/` 不存在 |
| RC-3 | v2Pro 保 SV 模型加载即崩 | `sv.py:6` 引用 `GPT_SoVITS/pretrained_models/sv/pretrained_eres2netv2w24s4ep4.ckpt` 不存在；v2Pro 路径会强制 `init_sv_cn()` |
| RC-4 | 中文路径乱码显示 | `SoVITS_weights_v2Pro/`、`GPT_weights_v2Pro/`、`voices/` 下的中文目录在 PowerShell 显示为 `??`；本仓 `process_ckpt.py:12-17` 的 `my_save` 已是上游专门的中文路径 workaround，文件本身能 round-trip，需保证 Electron 路径以 unicode 传递 |
| RC-5 | Python 版本不达标 | `runtime/python.exe` 为 3.9.13；peft、新版 transformers、上游部分语法已需 3.10+ |
| RC-6 | 集成层 ready 误报 | `tts/index.ts:206-215` 与 `doctor/index.ts:427-448` 用 `fetch /` + 3s timeout；模型加载 30–90s 内必然 timeout；sidecar `state==='running'` 仅表示进程 alive，不表示 HTTP 就绪 |
| RC-7 | 入口路径迷信 `GPT_SoVITS/` | `api.py:150` `sys.path.append("%s/GPT_SoVITS" % now_dir)`、`api.py:242/271/384` 等多处把 `GPT_SoVITS/pretrained_models` 硬编码在路径里；而本仓已扁平化、根本没有 `GPT_SoVITS/` 子目录 |
| RC-8 | 双入口 unused | `TTS_infer_pack/TTS.py`（1826 行）是上游完整运行时但 `api.py` 没用它，反而走 stub；存在双份维护负担 |
| RC-9 | 体积膨胀 | `_src/`（训练/UVR5/ASR/AP_BWE）、`prepare_datasets/`、`f5_tts/`、`TTS_infer_pack/` 的训练残余随 electron-builder 全部打包（`electron-builder.config.ts:107-108`） |

## Goals

- G1：`python api.py` 能在 3.10+ runtime 上启动并通过 `/health` 真实 ready
- G2：v2Pro 自训练权重（凛、艾丽妮）可热加载并合成出可用音频
- G3：多角色动态切换：`/switch_speaker` 热切到内置 `voices/<角色>/` 参考音频
- G4：预训练底模首次启动按需下载到本地缓存，仓内不带 GB 级文件
- G5：Electron 集成层 `/health` 状态机正确，启动期不再误报 WARN
- G6：去掉训练 / 数据集 / 超分 / UVR5 / ASR / WebUI 的非推理残留
- G7：`pnpm typecheck` / `pnpm lint` / `pnpm -F @kitsune/stage-tamagotchi exec vitest run` 全过

## Non-Goals

- 训练流水线、ASR 转录、UVR5 人声分离、AP_BWE 超分
- 提供上游完整 WebUI
- 追同步上游每个 commit（pin 历史快照后选择性 cherry-pick）
- 跨用户多 session 强隔离（v1 单实例 + 进程内 speaker_list 即可）

## Key Technical Decisions

| # | 决策 | 出处 / 理由 |
|---|---|---|
| KTD-1 | **以 `TTS_infer_pack/TTS.py` 为单一真实运行时**，删除所有同名 stub | 该文件 1826 行是上游 `api_v2.py` 同源产物的精简版，已封装切分、流水线、SV embedding、LoRA 合并；避免重写丢失边界处理 |
| KTD-2 | 顶层模块名扁平化：`AR/AR/`→`AR/`、`module/module/`→`module/`、`feature_extractor/feature_extractor/`→`feature_extractor/`、`BigVGAN/BigVGAN/`→`BigVGAN/`。真实实现**覆盖**当前 stub（同名删除后替换） | Python `from AR.models.t2s_lightning_module import ...` 才会命中真实；保留 `now_dir + "/GPT_SoVITS"` 在 `sys.path` 的过滤器不去掉但路径项改为 `now_dir` 自身 |
| KTD-3 | 预训练路径 `pretrained_models/` 放在 `gpt-sovits/` 根（不再有 `GPT_SoVITS/` 嵌套）；`config.py` 中 `pretrained_sovits_name`、`pretrained_gpt_name`、`cnhubert_path`、`bert_path` 全部改为相对项目根的扁平路径 | RC-2、RC-7 同时解决 |
| KTD-4 | 新增 `fetch_models.py` + `models_manifest.yaml`：用 `huggingface_hub.snapshot_download` 从 `RVC-Boss/GPT-SoVITS` 官方 HF 仓按白名单下载底模到 `pretrained_models/`；幂等、断点续传、SHA256 校验、`--check-only` 模式供 Electron 探测 | 用户选"运行时下载" |
| KTD-5 | runtime 用 Python 3.10 Embeddable（Windows）/ 3.10 venv（mac/linux）。生成器 `scripts/build-gpt-sovits-runtime.{ps1,sh}` 从 python.org 拉 embeddable zip + pip install wheels；产物 `runtime/` 整体 `.gitignore`，CI 可重新生成 | 用户选"重生成 3.10+ runtime" |
| KTD-6 | 入口 `api.py` 重写为 FastAPI 薄层：`POST /tts`（流式/非流式）、`POST /set_model`、`POST /switch_speaker`、`GET /speakers`、`GET /health`；委托 `TTS_infer_pack.TTS.TTS` 实例做事 | KTD-1 配套 |
| KTD-7 | `/health` 三态：`loading` / `ready` / `degraded`（含 `missing_models`、`missing_optional`、`runtime_version_low`、`last_infer_failed` 等 reason）。uvicorn 启动时立即挂载该路由，模型加载在 background task 中进行 | 给 Electron 提供真实状态机 |
| KTD-8 | 多角色：`voices/<speaker_id>/manifest.json` 元数据（中文名、默认参考音频、prompt text、language）；打包前把中文目录转拼音名 `rin/`、`ailini/`、`nifu/`，manifest 中记 `display_name`；api 层只认 speaker_id | RC-4 永久规避中文路径问题 |
| KTD-9 | Electron 集成层：`pollGptSovitsHealth` 改为 polling `/health` until `ready`，最长 180s；doctor 据真实 status 判断；缺底模时回 fetch 引导 | RC-6 |
| KTD-10 | `set_model` 热切换：支持 gpt + sovits 单文件路径，或 `speaker_id`（从 `voices/<id>/manifest.json` 读出）。内部用 `TTS_infer_pack.TTS.TTS` 现有的 `set_model_GPT` / `set_model_SoVITS` 方法 | 上游运行时原生支持热切换 |
| KTD-11 | 体积裁剪：`.gitignore` `gpt-sovits/_src/`、`prepare_datasets/`、`f5_tts/`、`TTS_infer_pack/` 中的训练专用模块；`electron-builder.config.ts` 的 `extraResources` 增加 filter 跳过这些目录；保留 `tools/i18n/`、`tools/audio_sr.py`（推理时 v3 超分选项走它） | RC-9 |
| KTD-12 | 工作分 5 个 PR：PR-1 重写 api.py + 扁平化、PR-2 运行时下载、PR-3 runtime 3.10+ 重打包、PR-4 Electron 集成层 + doctor、PR-5 测试 + 文档 | 用户选"一个 PR 一个 PR 推" |

## High-Level Module Layout（重塑后）

```
apps/stage-tamagotchi/resources/gpt-sovits/
├── api.py                    # 重写为薄 FastAPI 入口（KTD-6）
├── config.py                 # 路径扁平化（KTD-3）
├── sv.py                     # SV wrapper（保留，修路径）
├── process_ckpt.py           # ckpt 头解析（保留）
├── fetch_models.py           # 新增：HF 底模下载器（PR-2）
├── models_manifest.yaml      # 新增：需要下载的底模清单（PR-2）
├── runtime/                  # Python 3.10+ embeddable（PR-3，gitignore 大文件）
├── pretrained_models/        # 运行时下载到这里（PR-2，gitignore 大文件）
│   ├── chinese-hubert-base/
│   ├── chinese-roberta-wwm-ext-large/
│   ├── s2Gv3.pth
│   ├── gsv-v4-pretrained/vocoder.pth
│   ├── models--nvidia--bigvgan_v2_24khz_100band_256x/
│   └── sv/pretrained_eres2netv2w24s4ep4.ckpt
├── AR/                       # 扁平化，覆盖原 stub（PR-1，KTD-2）
│   ├── __init__.py
│   ├── data/
│   ├── models/
│   │   ├── t2s_lightning_module.py   # ← 真实实现（来自原 AR/AR/models/）
│   │   ├── t2s_model.py
│   │   └── ...
│   ├── modules/
│   ├── text_processing/
│   └── utils/
├── module/                   # 扁平化（PR-1）
│   ├── __init__.py
│   ├── models.py             # 真实（原 module/module/models.py）
│   ├── mel_processing.py
│   ├── attentions.py / commons.py / core_vq.py / ...
├── feature_extractor/        # 扁平化（PR-1）
│   ├── __init__.py
│   ├── cnhubert.py           # 真实
│   └── whisper_enc.py
├── BigVGAN/                  # 扁平化（PR-1）
│   ├── __init__.py
│   ├── bigvgan.py            # 真实 BigVGAN.from_pretrained
│   ├── activations.py / discriminators.py / ...
│   └── configs/*.json
├── TTS_infer_pack/           # 保留（KTD-1），删训练残余
│   ├── TTS.py
│   ├── TextPreprocessor.py
│   └── text_segmentation_method.py
├── text/                     # 保留
│   ├── chinese.py / japanese.py / english.py / cleaner.py / LangSegmenter.py
├── tools/                   # 仅保留推理必需
│   ├── i18n/
│   └── audio_sr.py            # v3 超分依赖
├── eres2net/                 # SV 依赖
├── configs/                  # s1/s2 配置（推理不读，但 TTS.py 兼容性保留）
├── voices/                  # 内置参考音频
│   ├── rin/manifest.json + *.wav   # 凛（KTD-8）
│   ├── ailini/manifest.json + *.wav # 艾丽妮
│   └── nifu/manifest.json + *.wav   # 妮芙
├── GPT_weights_v2Pro/        # 用户训练权重保留
└── SoVITS_weights_v2Pro/
```

## Implementation Phases

### PR-1：重写 api.py + 包路径扁平化

- 5 个模块组从嵌套 `X/X/` 扁平化到 `X/`（AR、module、feature_extractor、BigVGAN、text）
- 10 个 stub 文件被真实实现覆盖（`module/models.py` 49B→58078B）
- `config.py` / `sv.py` / `api.py` / `TTS.py` / `chinese2.py` 所有 `GPT_SoVITS/` 路径前缀已移除
- 新增 `/health`（三态：loading/ready/degraded）、`/speakers`、`/switch_speaker` 端点
- 模型初始化移至后台线程，uvicorn 立即启动
- `voices` 目录重命名：`艾丽妮`→`ailini`、`妮芙`→`nifu` + `manifest.json`
- 删除训练残留：`_src/`、`prepare_datasets/`、`f5_tts/`

**验证**：
```powershell
cd apps\stage-tamagotchi\resources\gpt-sovits
& runtime\python.exe -c "from AR.models.t2s_lightning_module import Text2SemanticLightningModule; import inspect; print(inspect.getsourcefile(Text2SemanticLightningModule))"
# 期望：apps/stage-tamagotchi/resources/gpt-sovits/AR/models/t2s_lightning_module.py
& runtime\python.exe -c "from module.models import SynthesizerTrnV3; import inspect; print(inspect.getsourcefile(SynthesizerTrnV3))"
& runtime\python.exe -c "import ast; ast.parse(open('api.py',encoding='utf-8').read()); print('api.py syntax ok')"
& runtime\python.exe api.py -p 9880 &
Start-Sleep 2
curl http://127.0.0.1:9880/health
# 期望：返回 {"status":"loading",...} 或 degraded
```

### PR-2：预训练底模运行时下载

- `models_manifest.yaml`：4 个 HF 仓库（GPT-SoVITS 主仓、chinese-hubert-base、chinese-roberta-wwm-ext-large、bigvgan）
- `fetch_models.py`：支持 `--check-only`、HF 镜像、JSON 事件输出
- `api.py` 启动时检查底模，缺则退出并给出中文引导
- `/health` 增加 `missing_optional` 字段

### PR-3：runtime 3.10+ 构建脚本

- `scripts/build-gpt-sovits-runtime.ps1`（Windows）+ `.sh`（macOS/Linux）
- `gpt-sovits/.gitignore`：忽略 `runtime/` + `pretrained_models/` + pycache
- `electron-builder.config.ts`：排除 `pretrained_models/` 打包

### PR-4：Electron 集成层

- `tts/index.ts`：新增 `pollGptSovitsHealth()` 轮询 `/health` 直到 ready/degraded（最长 180s）
- `startGptSovits` 启动后自动轮询等待
- `doctor/index.ts`：`probeSidecarHttp` 改为检查 `/health`，`checkOneSidecarDeep` 根据 loading/ready/degraded 给出精确诊断

### PR-5：测试 + 验证

- 修复 doctor 测试预存问题（`node:child_process` mock 补 exec，tts mock 补 `pollGptSovitsHealth`）
- typecheck 无新增错误，lint 0 errors

## Success Criteria

- SC-1：`pnpm -F @kitsune/stage-tamagotchi exec vitest run` 全过
- SC-2：`pnpm -F @kitsune/stage-tamagotchi typecheck` 全过
- SC-3：从开发模式 (`pnpm dev:tamagotchi`) 启动后，设置页能启动 GPT-SoVITS 并在 60~120s 内 ready
- SC-4：通过前端切换"凛"/"艾丽妮"/"妮芙"角色后，下一次 `/tts` 调用立即用新参考音频
- SC-5：打包后安装包体积不再增大（裁剪掉训练/数据集残余）

## Risks & Mitigations

| Risk | 影响 | Mitigation |
|---|---|---|
| R1 | `TTS_infer_pack/TTS.py` 可能依赖训练模块 | 删除任何文件前先 grep 它的 `from X import Y`；保守起见先保留 `TTS_infer_pack/` 全部 + 只删顶层 `_src/` |
| R2 | 嵌套包上移同名冲突可能丢真实文件 | 用 Python 脚本对比嵌套内外 hash，确定唯一 |
| R3 | 用户没装 GPU，CPU 推理超慢（30+s/句） | `config.py` 自动探测，CPU 模式关闭 `is_half`，`/health` 仍能 ready |
| R4 | BigVGAN CUDA kernel 编译失败（`use_cuda_kernel=False` 已设） | 沿用上游 `use_cuda_kernel=False`，CPU 走 torch 实现 |
| R5 | 3.10 runtime 体积比 3.9 大 ~50MB | electron-builder 用 7z 压缩；如超阈值则去 site-packages 中训练相关大包 |
| R6 | HF 下载在国内被墙 | 提供 `HF_ENDPOINT=https://hf-mirror.com` 环境变量回退；`fetch_models.py` 内置镜像开关 |

## Out-of-scope / Future

- 跨用户多 session 隔离（v2 考虑）
- LoRA 训练（明确不做）
- 上游 commit 追同步（不做，等上游大版本时人工再造一次）
- webui（明确不做）

## Learnings

实际实施过程中踩到的坑（PR-1 ~ PR-5 落地后补全）：

1. **嵌套包 Python import 行为**：`gpt-sovits/AR/AR/models/t2s_lightning_module.py` 里写 `from AR.models.t2s_model import ...`，原来靠 `api.py:150` 的 `sys.path.append("%s/GPT_SoVITS" % now_dir)` + 顶层 `AR/` 当作 stub 占位才命中嵌套真实版。扁平化时必须**先把真实版的内容上移到 `AR/`，再删嵌套 `AR/AR/`**，否则 `import AR.models.t2s_lightning_module` 会找不到 `AR/AR/models/t2s_model.py`。
2. **stub 文件字节数特征**：`module/models.py` 49B、`feature_extractor/cnhubert.py` 681B、`AR/models/t2s_lightning_module.py` 5020B 与 stylized stub docstring 都是明显的"占位"特征，扁平时一律以大文件为准。
3. **PowerShell 中文文件名显示**：`Get-ChildItem` 显示中文目录为 `??`，但 `ForEach-Object { $_.Name }` 拿到的字符串是真实 UTF-8 名称，**不要去"恢复"**这些字符——它们本就没有损坏。
4. **`/health` 必须立即挂载**：原方案如果等模型加载完再启 uvicorn，Electron 在 60~120s 内根本连不上 9880 → doctor 报 FAIL。让 FastAPI app 先 `uvicorn.run`，模型加载放在 `app.on_event("startup")` 后的 `asyncio.create_task` 里，最高优先级。
5. **v2Pro 自训练权重头部 tag**：`SoVITS_weights_v2Pro/*.pth` 文件头是 `30 35 03 04...`，对应 `process_ckpt.py:79` 的 `b"05": ["v2","v2Pro",False]`，是合法 v2Pro 标识。文件没坏，不需要重训。`GPT_weights_v2Pro/*.ckpt` 头是 `50 4B 03 04`（PK zip头），`get_sovits_version_from_path_fast` 不会去硬识别它，正常走 `load_sovits_new` 反序列化即可。
6. **TTS.py vs api.py 双入口分裂**：`TTS_infer_pack/TTS.py` 是上游真实运行时封装（封装了 `TTS` 类，含 `init`、`set_model_GPT`、`set_model_SoVITS`、`to` 等方法），`api.py` 重写时直接 import 它即可，不要在 api.py 里把 TTS.py 的逻辑复制一遍——否则会触发两边对 `speaker_list` 等全局状态的双向修改。
7. **doctor 测试的 mock 边界**：PR-4 修改 `tts/index.ts` 引入 `pollGptSovitsHealth` 后，`doctor/index.test.ts` 需要补 mock，否则单测在 import 阶段就失败。先看 `doctor/index.test.ts:68-69` 的现有 mock 表，扩展而非重写。

## References

- 上游仓库：https://github.com/RVC-Boss/GPT-SoVITS
- 上游模型仓：https://huggingface.co/RVC-Boss/GPT-SoVITS
- HF 镜像：https://hf-mirror.com
- 上游 `api_v2.py` 实现参考：https://github.com/RVC-Boss/GPT-SoVITS/blob/main/api_v2.py
- 上游中文路径 workaround：`apps/stage-tamagotchi/resources/gpt-sovits/process_ckpt.py:12-17`（`my_save`）
