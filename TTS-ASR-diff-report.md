# Yachiyo vs 官方 Airi — TTS/ASR 差异分析报告

> 生成时间：2026-07-13
> 对比范围：TTS/ASR 全链路（服务端 + 客户端）
> 分析方法：手术刀式切片，逐文件逐行对比

---

## 一、服务端 TTS 差异切片

### 1.1 适配器层：完全一致

| 文件 | 状态 | 说明 |
|------|------|------|
| `apps/server/src/services/adapters/tts/azure.ts` | 一致 | Azure Cognitive Services REST 适配器 |
| `apps/server/src/services/adapters/tts/dashscope-cosyvoice.ts` | 一致 | 阿里达摩院 CosyVoice |
| `apps/server/src/services/adapters/tts/stepfun.ts` | 一致 | 阶跃星辰 |
| `apps/server/src/services/adapters/tts/volcengine.ts` | 一致 | 火山引擎 |
| `apps/server/src/services/adapters/tts/unspeech.ts` | 一致 | 统一 OpenAI 形状代理层 |
| `apps/server/src/services/adapters/tts/types.ts` | 一致 | 适配器接口定义 |
| `apps/server/src/services/adapters/tts/index.ts` | 一致 | 注册表（4 个适配器） |

### 1.2 路由层：Yachiyo 大幅删减高级能力

| 能力 | Airi | Yachiyo | 差异说明 |
|------|------|---------|----------|
| 计费（flux-meter） | 有 | **无** | `routeTts()` 中预检、accumulate、扣费逻辑被移除 |
| 追踪（OTel span） | 有 | **无** | `createTraceSpan` 及 `recordTtsSpan` 调用被移除 |
| 缓存（Redis） | 有 | **无** | 语音目录缓存（6h/24h TTL）逻辑被移除 |
| 并发控制 | 有 | **无** | `concurrency-ledger` 限制逻辑被移除 |
| 故障降级 | 有 | 保留 | 基础的重试和错误处理保留 |

### 1.3 Yachiyo 独有扩展：kitsune-tts-hybrid

Airi 中**完全不存在**以下代码，是 Yachiyo 的自定义扩展：

- `packages/kitsune-tts-hybrid/src/index.ts` — 包入口，导出 TTS 管理器
- `packages/kitsune-tts-hybrid/src/ttsManager.ts` — 统一调度四种后端：
  - `qwen3Tts`（HTTP API）
  - `gptsovitsTts`（stdin/stdout JSON-RPC sidecar）
  - `electronLocal`（Web Speech API）
  - `http`（OpenAI 兼容）
  - 支持 abort 信号和 3 次重试
- `packages/kitsune-tts-hybrid/src/gptsovitsAdapter.ts` — GPT-SoVITS 适配器
- `packages/kitsune-tts-hybrid/src/qwen3TtsAdapter.ts` — Qwen3-TTS 适配器（支持 emotion 标签）
- `apps/stage-tamagotchi/src/main/services/kitsune/tts/genie-tts.ts` — SidecarService 封装，管理 Genie-TTS 进程生命周期

---

## 二、服务端 ASR 差异切片

### 2.1 结论：完全一致

| 文件 | 状态 | 说明 |
|------|------|------|
| `apps/server/src/routes/audio-transcription-stream/route.ts` | 一致 | 认证解析、密钥轮转、错误处理 |
| `apps/server/src/routes/audio-transcription-stream/session.ts` | 一致 | WebSocket → SSE 管道、事件处理 |

两项目服务端 ASR 均**仅支持阿里云 NLS**，代码逐行一致，Yachiyo 未做任何修改。

---

## 三、客户端 TTS 提供商差异切片

### 3.1 提供商矩阵

**Airi（17 个）：**
```
speech-noop
app-local-audio-speech        ← Yachiyo 缺失
browser-local-audio-speech
openai-audio-speech
openai-compatible-audio-speech
elevenlabs
deepgram-tts
microsoft-speech
index-tts-vllm
alibaba-cloud-model-studio
volcengine
minimax-speech
openrouter-audio-speech
mimo-audio-speech
comet-api-speech
player2-speech
kokoro-local
```

**Yachiyo（16 个）：**
```
speech-noop
browser-local-audio-speech
openai-audio-speech
openai-compatible-audio-speech
elevenlabs
deepgram-tts
microsoft-speech
index-tts-vllm
alibaba-cloud-model-studio
volcengine
minimax-speech
openrouter-audio-speech
mimo-audio-speech
comet-api-speech
player2-speech
kokoro-local
```

**差异：**
- **Yachiyo 删减**：`app-local-audio-speech`（App 本地 TTS）
- **Yachiyo 新增**：无新增客户端 TTS 提供商（`genie-tts` 未注册到 providers store）

### 3.2 openai-compatible-audio-speech 过滤逻辑

两项目共享**相同缺陷**：`listModels` 仅过滤包含 `"tts"` 子串的模型 ID，导致如 `speech-01` 等有效模型被遗漏。

---

## 四、客户端 ASR 提供商差异切片

### 4.1 提供商矩阵

**两项目完全一致（8 个）：**
```
app-local-audio-transcription
browser-local-audio-transcription
openai-audio-transcription
openai-compatible-audio-transcription  ← 有 bug
aliyun-nls-transcription
browser-web-speech-api
comet-api-transcription
mimo-audio-transcription
```

### 4.2 共同缺陷

`openai-compatible-audio-transcription` 的 `listModels` 返回空数组 `[]`，但 `hearing.ts` 的 `supportsModelListing` 判定为 `true`（因 `capabilities.listModels !== undefined`），导致 UI 显示**"没有模型"**。

---

## 五、客户端状态管理差异切片

### 5.1 speech.ts

| 功能 | Airi | Yachiyo | 差异 |
|------|------|---------|------|
| Voice Pack 映射 | 完整实现 | **直接返回 `undefined`** | Yachiyo 注释："Voice packs were tied to the official provider, which has been removed." |
| SSML 生成 | 保留 | 保留 | 一致 |
| pitch/rate/volume | 保留 | 保留 | 一致 |

### 5.2 hearing.ts

两项目结构**基本一致**，均支持：
- 流式转写 vs 文件转写生命周期
- VAD（Voice Activity Detection）
- Analytics 埋点

无显著差异。

---

## 六、自定义扩展差异切片

### 6.1 Yachiyo 独有的 genie-tts

虽然 `genie-tts` **未注册到 providers store**，但以下代码存在：

- `packages/stage-ui/src/libs/providers/providers/genie-tts/index.ts` — 提供商定义（sidecar 模式，默认端口 9880）
- `packages/stage-ui/src/libs/providers/providers/gpt-sovits/index.ts` — GPT-SoVITS 包装（名称显示为 "Genie TTS"）
- `apps/stage-tamagotchi/src/main/services/kitsune/tts/genie-tts.ts` — 主进程 sidecar 服务

**实现方式**：stdin/stdout JSON-RPC，非 HTTP，由 SidecarService 统一管理进程生命周期。

Airi 中**完全不存在**上述代码。

---

## 七、差异汇总（四分类）

### Yachiyo 新增
1. `packages/kitsune-tts-hybrid/` 包 — 本地 TTS 混合调度层
2. `genie-tts` sidecar 服务 — 主进程 GPT-SoVITS 管理
3. `apps/stage-tamagotchi/src/main/services/kitsune/tts/` — TTS 主进程服务目录

### Yachiyo 删减
1. `app-local-audio-speech` — 客户端 TTS 提供商（App 本地 TTS）
2. 服务端 TTS 计费（flux-meter）
3. 服务端 TTS 追踪（OTel）
4. 服务端 TTS 缓存（Redis）
5. 服务端 TTS 并发控制
6. Voice Pack 映射逻辑（`speech.ts` 中）

### 共同保留
1. 服务端 TTS 4 个适配器（azure/dashscope-cosyvoice/stepfun/volcengine）
2. 服务端 ASR（阿里云 NLS）
3. 客户端 16 个 TTS 提供商（除 app-local-audio-speech）
4. 客户端 8 个 ASR 提供商
5. speech/hearing stores 核心结构

### 共同缺陷
1. `openai-compatible-audio-transcription` 的 `listModels` 返回 `[]` 导致 UI 异常
2. `openai-compatible-audio-speech` 的 `listModels` 过度过滤（仅匹配含 `tts` 子串）

---

## 八、建议

1. **如需修复 ASR 模型列表 bug**：修改两项目共用的 `openai-compatible-audio-transcription` 的 `listModels`，返回预定义模型列表（whisper-1、gpt-4o-transcribe 等）。
2. **如需同步官方 TTS 能力**：Yachiyo 可考虑恢复 `app-local-audio-speech` 提供商，或明确说明移除原因。
3. **如需保留 Yachiyo 自定义能力**：`kitsune-tts-hybrid` 和 `genie-tts` 是 Yachiyo 的核心差异化能力，建议保持并完善 providers store 注册。
