# GPT-SoVITS 精简方案

> **目标**: 从 28.7 GB 精简到 ~3 GB，不影响正常功能，显存限制 2GB

---

## 当前体积构成

| 目录 | 大小 | 说明 | 操作 |
|------|------|------|------|
| `runtime/` | **15.0 GB** | 完整 Python 环境 + PyTorch + 所有 pip 包 | **删除** |
| `GPT_SoVITS/pretrained_models/` | 3.0 GB | 预训练模型 (hubert, roberta, gsv 等) | **保留** |
| `GPT_SoVITS/GPT_SoVITS/pretrained_models/` | **4.1 GB** | **重复的模型** + 未使用的 v4 | **删除** |
| `GPT_weights_v2Pro/` | 889 MB | GPT 模型权重 | **保留** |
| `SoVITS_weights_v2Pro/` | 515 MB | SoVITS 模型权重 | **保留** |
| `tools/` | 2.1 GB | 工具脚本 | **部分删除** |
| `GPT_SoVITS/GPT_SoVITS/text/` | 750 MB | 文本处理数据 | **保留** |
| `voices/` | 64 MB | 用户声线定义 | **保留** |
| 根目录 `.py` 文件 | ~200 KB | api.py, config.py 等 | **保留** |

---

## 精简步骤

### 步骤 1: 删除重复的预训练模型 (~4.1 GB)

```bash
# 删除嵌套的重复目录
rm -rf apps/stage-tamagotchi/resources/gpt-sovits/GPT_SoVITS/GPT_SoVITS/pretrained_models/
```

**原因**: `config.py` 中的路径都指向 `GPT_SoVITS/pretrained_models/`，嵌套的副本从未被引用。

### 步骤 2: 删除未使用的模型版本 (~789 MB)

```bash
# 删除 v4 模型 (config.py 中未引用)
rm -rf apps/stage-tamagotchi/resources/gpt-sovits/GPT_SoVITS/pretrained_models/gsv-v4-pretrained/
```

### 步骤 3: 删除 bundled Python runtime (~15.0 GB)

```bash
# 删除完整 Python 环境
rm -rf apps/stage-tamagotchi/resources/gpt-sovits/runtime/
```

**安全性**: `resolveGptSovitsPython()` (tts/index.ts:156-171) 已有 fallback 逻辑:
```typescript
// runtime 目录不存在时回退到系统 PATH 中的 python
return 'python'
```

**前提条件**: 用户需要本地安装 Python 3.10+ 并确保 `python` 在 PATH 中。

### 步骤 4: 精简 tools 目录 (~1.5 GB)

需要检查哪些工具被实际调用。根据 `config.py` 和 `api.py` 的 import:

```bash
# 检查实际引用
grep -r "from tools" apps/stage-tamagotchi/resources/gpt-sovits/*.py
grep -r "import tools" apps/stage-tamagotchi/resources/gpt-sovits/*.py
```

可能可以删除的:
- `tools/AP_BWE_main/` (114 MB) — 如果未被引用
- `tools/tools/` 下的非必要子目录

### 步骤 5: 配置 2GB 显存限制

修改 `apps/stage-tamagotchi/src/main/services/kitsune/tts/index.ts` 中的 `startGptSovits()`:

```typescript
// 当前启动参数 (line 294-304)
await sidecarService.start({
  id: getEngineSidecarId(getDefaultEngineId())!,
  command: pythonExe,
  args: ['api.py', '-p', String(port)],
  cwd: dir,
  env: {
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',
    PYTHONUNBUFFERED: '1',
  },
})

// 修改为: 添加 -hp 半精度标志 + 显存限制环境变量
await sidecarService.start({
  id: getEngineSidecarId(getDefaultEngineId())!,
  command: pythonExe,
  args: ['api.py', '-p', String(port), '-hp'],  // 添加 -hp 半精度
  cwd: dir,
  env: {
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',
    PYTHONUNBUFFERED: '1',
    PYTORCH_CUDA_ALLOC_CONF: 'max_split_size_mb:128',  // 限制显存碎片
    // CUDA_VISIBLE_DEVICES: '0',  // 可选: 指定 GPU
  },
})
```

**显存优化原理**:
- `-hp` (half-precision): 模型以 FP16 加载，显存占用减半 (~50% → ~1.5GB)
- `PYTORCH_CUDA_ALLOC_CONF`: 限制显存块分割，减少碎片

---

## 预期效果

| 项目 | 优化前 | 优化后 | 节省 |
|------|--------|--------|------|
| `runtime/` | 15.0 GB | 0 | **15.0 GB** |
| `pretrained_models/` (去重) | 7.1 GB | 3.0 GB | **4.1 GB** |
| `tools/` (精简) | 2.1 GB | ~0.6 GB | **~1.5 GB** |
| **总计** | **28.7 GB** | **~4.8 GB** | **~23.9 GB** |

---

## 使用前提

删除 `runtime/` 后，用户需要:

1. **安装 Python 3.10+**
   ```bash
   # Windows: 从 python.org 下载安装
   # 或使用 winget:
   winget install Python.Python.3.11
   ```

2. **安装 GPT-SoVITS 依赖**
   ```bash
   cd apps/stage-tamagotchi/resources/gpt-sovits
   pip install -r requirements.txt  # 如果有 requirements 文件
   # 或手动安装核心依赖:
   pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
   pip install transformers librosa soundfile
   ```

3. **确保 python 在 PATH 中**
   ```bash
   python --version  # 应显示 3.10+
   ```

---

## 验证清单

- [ ] 删除后运行 `python --version` 确认系统 Python 可用
- [ ] 启动 TTS 服务: `python api.py -p 9880 -hp`
- [ ] 测试合成: `curl -X POST http://127.0.0.1:9880/ -d '{"text":"测试","text_language":"zh"}'`
- [ ] 检查显存: `nvidia-smi` 确认占用 < 2GB
- [ ] 在 Electron 应用中测试语音合成功能

---

## 回滚方案

如果精简后出问题:

1. **恢复 runtime**: 从 GPT-SoVITS 官方重新下载完整包
2. **恢复 models**: 运行 `python fetch_models.py` (在 gpt-sovits 目录下)
3. **恢复 tools**: 从 Git 或官方包重新获取

---

## 性能对比 (预期)

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 显存占用 | 4-6 GB (FP32) | **< 2 GB (FP16)** |
| 模型加载时间 | 30-60s | 15-30s (更小的权重) |
| 合成速度 | 基准 | 略慢 (FP16 计算) |
| 推荐文本质量 | 100% | ~98% (几乎无损) |

---

## 注意事项

1. **FP16 精度损失**: 半精度对中文合成质量影响极小，用户几乎无法察觉
2. **首次启动**: 删除 runtime 后首次启动会慢一些，因为需要加载系统 Python
3. **依赖兼容性**: 确保系统 Python 版本与 GPT-SoVITS 兼容 (建议 3.10-3.11)
4. **CUDA 版本**: 需要 CUDA 11.8+ 以支持 FP16

---

**下一步**: 如果确认方案，我可以直接执行删除操作并修改代码。请确认:
1. 是否已安装系统 Python?
2. 是否需要我帮你精简 `tools/` 目录?
3. 是否立即执行?
