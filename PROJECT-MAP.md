# Kitsune AI · 项目地图（Project Map）

> 本文件是 Kitsune AI（灵狐）monorepo 的记忆库/地图：核心链路逐行说明、模块职能划分、常用命令与约定速查。
> 与 [AGENTS.md](./AGENTS.md)（技术栈/开发规范）配套使用；[CLAUDE.md](./CLAUDE.md) 已指向本文件。
> 最后更新：2026-09-05（对照仓库当前代码核实）。

---

## 1 · 项目身份

| 项 | 值 |
| --- | --- |
| 定位 | 本地优先的 AI 桌面桌宠：**听（ASR）、说（TTS）、表演（Live2D）、干活（Overseer / Computer Use）** |
| 上游 | [`moeru-ai/airi`](https://github.com/moeru-ai/airi)（Project AIRI，MIT）——社区 fork 增强，保留上游版权 |
| 角色 | Yachiyo·Airi（八千代·艾莉），前端 Live2D 角色 |
| 仓库 | `lxfebd/kitsune-ai`，默认分支 `master` |
| 工程 | pnpm 10.33 monorepo（workspaces + catalog）+ turbo 编排 |
| 许可 | MIT |

### 技术栈（按表面）

- **桌面 `stage-tamagotchi`**：Electron ^41、Vue 3.5、Vite ^8、TypeScript 5.9、Pinia 3、VueUse、`@moeru/eventa`（IPC/RPC）、`injeca`（DI）、UnoCSS、Vitest 4、oxlint。原生模块：`koffi`（Windows FFI 桌面自动化）、`uiohook-napi`（全局快捷键）、`sherpa-onnx`（WASM ASR）、`onnxruntime-node/-web`。
- **Web `stage-web`**：Vue 3 + Vue Router + Vite；后端 WIP。
- **移动 `stage-pocket`**：Vue 3 + **Capacitor ^8.3.1**（android/ios 双平台目录齐全），`cap-vite` 开发。
- **服务端 `apps/server`**：Hono 4.11 + `@hono/node-server/-ws`，Drizzle（Postgres/pglite）、Redis（ioredis）、OTel/Langfuse、better-auth。
- **通用**：校验用 `valibot`（+ 部分 zod）；AI 用 `@xsai/*`（generate-text / speech / stream-transcription）；风格 UnoCSS（不用 Tailwind）；Python sidecar（FastAPI）：GPT-SoVITS、Qwen3-TTS、VoxCPM。

---

## 2 · 分层架构总览

```
 渲染层（Vue, stage-ui 全家桶）        外部 AI 编码工具
   Live2D 舞台 · Chat · Settings          Claude · Trae · Cursor
   Tools（MCP 桥）                        Codex · OpenCode · Windsurf · Lobster
        │ IPC / Eventa                          ▲
 ────────┴────────────  Electron 主进程 ─────────┼────────
  Main（stage-tamagotchi）                Overseer（编排闭环）
   overseer · persona · memory · asr      监控 → 过滤 → 授权 → 执行
   tts · sidecar · connectors              → 视觉校验 → 自动修复
   desktop-automation · vision · plugins
   channel-server（WS 6121） · mcp-servers · comfyui · doctor
        │ WebSocket（server-sdk 协议）
 服务端
   server-runtime / apps/server（Hono）
   OpenAI 网关 · LLM/TTS 多上游路由 · key 轮换 · 并发账本 · 计费 · OTel
```

四个外围入口（都走 6121 WS「server channel」协议）：IDE 连接器（VSCode/Trae/IntelliJ）、`discord-bot`、`minecraft-bot`、`computer-use-mcp`（stdio MCP）。

---

## 3 · 三大核心链路

### 3.1 Overseer 编排闭环（差异化亮点）

分两层：**感知层（CommonJS 包）** + **编排层（桌面 app 内 TypeScript）**。

| 层 | 位置 | 职责 |
| --- | --- | --- |
| 感知 | `packages/kitsune-overseer/src`（CJS） | `supervisor.js` 按 id 实例化监控器：`claudeCodeMonitor.js`（优先读 `~/.claude/history.jsonl` mtime + traces 结构化信号）、`traeMonitor.js`（进程/日志/git/fs.watch）、`genericAiToolMonitor.js`（`TOOL_PRESETS` 覆盖 cursor/trae/windsurf/lobster/aider/codex，未预设回退 cursor）。`activityStates.js` 统一状态归一（idle/thinking/coding/executing/building/testing/completed/error…，含 `REVIEWABLE/ROUTABLE/NOTIFYABLE` 状态集合）。`taskPusher.js` CLI 命令引擎（spawn 非 exec，白名单 `TOOL_ALLOWLIST`）。`live2dStateBridge.js` 把状态映射为 Live2D 情绪事件。`monitorStore.js`/`idleDetector.js` 在用。 |
| 编排 | `apps/stage-tamagotchi/src/main/services/kitsune/overseer/`（TS） | `index.ts`（`createOverseerService`）：接收感知事件 → PushFilter + `permission.ts`（授权/白名单）→ executor 闭环 → 暴露 IPC。`executor/`：`loop.ts`（重试 + 子计划 + 回调记忆）、`taskRunner.ts`（三执行路径，见下）、`planGenerator.ts`（CliTask/IdeTask/DesktopTask + DAG）、`planner.ts`、`acceptance.ts`（验收）、`dag.ts`、`codeStyleAnalyzer.ts`、`llmHelper.ts`。自动修复路由表 `AUTO_FIX_ROUTE` 在 `index.ts`。 |

**三种任务执行路径**（`taskRunner.ts`）：
1. **CLI**：`runCliTask` → `TaskPusher.spawnCommand`（`claude`/`codex`/`aider`/`opencode` 子进程）。
2. **IDE 连接器**：`runIdeTask` → `ConnectorService.sendTask`（connectors 目录，trae/vscode/idea 类型检测 + `task:execute` WebSocket 消息）。
3. **桌面自动化**：`runDesktopTask`（聚焦窗口 → 视觉定位 → 输入 → 回车；含 `isPathSafe` 沙箱校验）。

配套服务：`desktop-automation`（`platform/` 下 windows-koffi / macos / linux + `safety.ts` 白名单）、`connectors`、`memory`。

**配置**：`config/overseer.yaml` —— `enabled: true`（app 启动即自启，`electronOverseerToggle` 可运行时开关）、监控 5 个工具 `claude_code`/`opencode`/`trae`/`cursor`/`codex`、`pollInterval: 10000`、`allowedRoots: []`。

> ⚠️ 历史：感知包 `index.js` 注明旧「自主执行链」（UnifiedSmartRouter/DecisionEngine/ActionExecutor/RiskController…）已于 2026-08-07 整体移除，由 app 内的 executor 闭环取代；其移动目标目录 `_dead_overseer_js_2026-08-07/` **不在当前仓库中**，纯属注释残留。

### 3.2 本地语音链路（ASR + TTS）

**ASR（识别）**：
- 主进程 `src/main/services/kitsune/asr/`：sherpa-onnx WASM 内存管线，`engines.ts` 注册 **SenseVoice（默认，带情感/事件）** 与 **Paraformer**，`index.ts` 串行化队列 + 引擎热切换，`ipc-handlers.ts` 注册 IPC。
- 模型：`resources/models/sherpa-onnx/` 或打包 extraResources；也可走运行时插件 `asr-sherpa`。
- 渲染层：`packages/stage-ui/src/stores/modules/hearing.ts`（听力核心 store：VAD worklet、`@xsai` 流式转写、Web Speech / 阿里云流式）；**Whisper 兜底**：`stage-ui/src/composables/whisper.ts` + `libs/inference/adapters/whisper`；转写管线接口在 `packages/audio-pipelines-transcribe/src/transcribe.ts`；音频管道编排 `packages/pipelines-audio/src/speech-pipeline.ts`（capture→VAD→encode→stream）。

**TTS（合成）**：
- `src/main/services/kitsune/tts/`：GPT-SoVITS 适配（`resolveGptSovitsDir` 路径探测：env→持久化→runtime-plugin→资源/PATH；spawn `api.py -p PORT -sm normal -mt raw` → HTTP /health、/set_model、流式 OGG）。
- `packages/kitsune-tts-hybrid/`：引擎注册表 + `gptsovitsAdapter`（stdin/stdout 管道）+ `qwen3TtsAdapter` + `ttsManager`（队列 + 降级链 `ttsFallbackChain`）+ sidecar Python 网关 `gateway.py`（统一 qwen3/voxcpm/gptsovits）。
- Qwen3-TTS 引擎：`packages/kitsune-tts-hybrid/engines/qwen3-tts/`（纯 C++ sidecar，端口 8006）；VoxCPM2：`sidecar/voxcpm_server.py`（端口 8001，SSE），当前 TS 未接线（遗留 sidecar）。
- 云侧适配器在 `apps/server/src/services/adapters/tts/`（azure / dashscope-cosyvoice / stepfun / volcengine / unspeech）。

**sidecar 基础设施**：`src/main/services/kitsune/sidecar/`（spawn、JSON-RPC + 二进制帧线路协议 `protocol.ts`、自动重启预算与降级、串行锁）。

**运行时插件**（模型/引擎按需下载）：`src/main/services/kitsune/runtime-plugins/` —— `tts-gptsovits`（~6.4GB，自带 Python runtime，分卷 zip）与 `asr-sherpa`，GitHub Release 下载 + sha512 校验，解压到 `userData/runtime-plugins/<id>/`；支持本地 ZIP 分卷离线导入（设置页入口）。打包脚本：`scripts/package-runtime-plugins.ts` / `publish-runtime-plugins.ts`。

### 3.3 Live2D 舞台

- 渲染：`packages/stage-ui-live2d/src/stores`（expression-store / model-parameters / view-control）+ `components/scenes/live2d`（Canvas/Model.vue）。
- 嘴型：`packages/model-driver-lipsync`（wlipsync profile 应用到 Live2D）；动捕实验：`model-driver-mediapipe`（blendshape/pose → VRM/Live2D）。
- 情绪映射：`packages/kitsune-emotion-mapper`（工具名/文本关键词/响应分类 → happy/sad/angry/surprised/thinking/alert + Live2D expression 参数）。
- 模型资产：`assets/live2d/yachiyo-kaguya/`；角色配置 `apps/stage-tamagotchi/persona/profile.yaml`。

---

## 4 · Monorepo 目录地图

### apps（6 个）

| 应用 | name | 定位 |
| --- | --- | --- |
| `stage-tamagotchi` | `@kitsune/stage-tamagotchi` | **桌面主应用**（Electron 桌宠）。入口 `src/main/index.ts`（injeca 装配全部服务）；preload 暴露 `window.electron`/`window.platform`；renderer 页面 `src/renderer/pages/`（chat/dashboard/settings/devtools(15 页)/onboarding/spotlight/desktop-overlay…），其余页面来自 `packages/stage-pages`（electron.vite 双 routesFolder 合并）。devtools 与 settings 子页优先本地版本。 |
| `stage-web` | `@kitsune/stage-web` | Web SPA（LLM 驱动虚拟角色）。页面 `src/pages/`（index/settings/devtools 10 页）。含 Dockerfile/netlify.toml/wrangler.toml。 |
| `stage-pocket` | `@kitsune/stage-pocket` | 移动端（Capacitor android/ios）。 |
| `ui-admin` | `@kitsune/ui-admin` | 管理台（Admin dashboard）。 |
| `component-calling` | `@kitsune/component-calling` | 实时音视频通话 demo。 |
| `server` | `@kitsune/server` | Hono 后端（OpenAI 网关/计费/多上游路由），详见 §5。 |

### packages（51 个，核心一览）

**stage 系列（舞台前端）**：`stage-ui`（核心：stores/providers(14) + stores/modules(21) + composables(47) + components(247) + libs/workers/database）、`stage-shared`（env/错误/CSV/tts/window/beat-sync）、`stage-pages`、`stage-layouts`（含 use-transcriptions）、`stage-ui-live2d`、`stage-ui-spine`、`stage-ui-three`（VRM）、`stage-ui-pixi`。

**kitsune- 系列**：`kitsune-overseer`（感知层）、`kitsune-persona`（SOUL.md/IDENTITY.md/persona.yaml 加载 + PersonaContextBuilder）、`kitsune-tts-hybrid`（TTS 混合路由）、`kitsune-emotion-mapper`（情绪映射）、`kitsune-screenshot`（截图编排 CLI）、`kitsune-mcp-bridge`（**已弃用**）、`kitsune-skills-system`（**已弃用**）。

**core- 系列**：`core-agent`（Agent 运行时：chat orchestrator / LLM 流式 / 上下文注册表 / hooks）、`core-character`（角色卡管道：registry/loader/context-builder）。

**server 系列**：`server-runtime`（独立 WS server channel 进程，端口 **6121**）、`server-sdk`（客户端 WS 协议 SDK：状态机 idle→connecting→authenticating→announcing→ready + SuperJSON codec + extension announce）、`server-sdk-shared`（聊天 wire 消息 + Eventa 定义）、`server-shared`、`server-schema`（含 drizzle migrations SQL）。

**音频**：`audio`（编码工具）、`audio-pipelines-transcribe`（ASR 转写管线）、`pipelines-audio`（capture/VAD/encode/stream + speech-pipeline + timeline）。

**模型驱动**：`model-driver-lipsync`、`model-driver-mediapipe`。

**插件**：`plugin-protocol`（事件定义）、`plugin-sdk`（extension/plugin/plugin-host/channels）、`plugin-sdk-tamagotchi`（gamelet/tools/widgets kits）。

**electron- / 基础**：`electron-eventa`、`electron-screen-capture`、`electron-vueuse`、`better-ws`（重连/peer/broadcast）、`stream-kit`（queue）、`cap-vite`、`ccc`（角色卡定义导出 PNG/APNG/JSON/MD）、`i18n`、`ui`/`ui-transitions`/`ui-loading-screens`、`unocss-preset-fonts` + `font-chillroundm`/`font-cjkfonts-allseto`/`font-departure-mono`/`font-xiaolai`、`vishot-runtime`/`vishot-runner-browser`/`vishot-runner-electron`（截图捕获三件套）、`scenarios-stage-tamagotchi-browser`/-electron。

### services（3 个）

| 服务 | name | 说明 |
| --- | --- | --- |
| `computer-use-mcp` | `@kitsune/computer-use-mcp` | MCP stdio 服务器，macOS 桌面自动化（AppleScript，默认 dry-run）。工具：`desktop_get_capabilities / desktop_observe_windows / desktop_screenshot / desktop_click / desktop_type_text / desktop_press_keys / desktop_scroll / desktop_open_app / desktop_focus_app / terminal_exec / clipboard_read_text / clipboard_write_text`。 |
| `discord-bot` | `@kitsune/discord-bot` | 经 `server-sdk` Client 连 6121 channel 注册 `discord-bot` extension；收 Discord 消息 → `input:text` → server → LLM → 回复。 |
| `minecraft` | `@kitsune/minecraft-bot` | mineflayer 机器人，连 6121 注册 `minecraft-bot`；推 `context:update`（lanes `minecraft:chat/status`），监听 `spark:command`（intent：move/chat/look/equip/status）。 |

### integrations（IDE 连接器，全部走 6121 WS 协议）

| 目录 | 说明 |
| --- | --- |
| `integrations/vscode/vscode-kitsune` | VSCode 扩展 `vscode-kitsune-ai`：包装 server-sdk Client，周期推 `context:update`，监听 `task:execute` 回 `task:result`。 |
| `integrations/vscode/vscode-kitsune-trae` | Trae IDE 同构扩展。 |
| `integrations/vscode/airi-plugin-vscode` | `@kitsune/kitsune-plugin-vscode` —— **空壳 stub（TODO）**。 |
| `integrations/intellij-kitsune` | Kotlin/Gradle IntelliJ 插件：手工复刻同一 WS 协议（`module:authenticate` → `extension:module:announce` → `registry:modules:sync` 握手、`transport:connection:heartbeat`、`context:update`/`task:execute`/`task:result`）。 |

### 其他顶层

| 路径 | 说明 |
| --- | --- |
| `config/` | 默认 profile `default/`（providers.yaml 含 `xiaomi-claude`/`local`、skills.yaml、tools.yaml、voice-policy.yaml、mcp.yaml、desktop-live2d.json、live2d-presets.yaml）+ `yachiyo/` + `overseer.yaml`。`KITSUNE_PROFILE` 环境变量切换 profile。 |
| `.agents/skills/` | 25 个 AI agent skill（agent-browser、ai-agent-dev、eventa、hono-server、injeca-di、live2d-renderer、plugin-development、monorepo-manager、pnpm、testing-vitest、tts-asr-pipeline、vue、three.js-3d…）。 |
| `scripts/` | `download-asr-models.ps1`（sherpa SenseVoice/Paraformer INT8）、`download-whisper-model.ps1`、`perf-monitor.ps1`、`serve-models.mjs`、`mod-pack.ts`（VRM .kitsune-mod 打包）、`package-runtime-plugins.ts`/`publish-runtime-plugins.ts`、`oxlint-staged.mjs`、`list-module-loc.mjs`。 |
| `.github/workflows/` | `ci.yml`（lint + build-test matrix）；`release.yml`（tag `v*`/手动选 win|linux|all；electron-builder `--publish never` + node 脚本生成 `latest-x64.yml`/`latest-x64-linux.yml` + `gh release create` 发布并校验）。 |
| `nix/` + `flake.nix` | Nix 打包（pnpm_10 + fetchPnpmDeps）+ devShell（pnpm、python314）+ `fhs` devShell（NixOS 跑 Electron 的系统库）。 |
| `.tool-versions` | `nodejs 24.13.0`（asdf）。 |

---

## 5 · 服务端（apps/server）

- 入口：`src/bin/run.ts`（cac CLI `api` 命令）→ `src/app.ts`（`buildApp`/`runApiServer`，WS 先于 bodyLimit 注册）。`instrumentation.ts` 预载 OTLP exporter + Langfuse。
- 路由（`src/routes/`）：
  - `openai/v1/`：OpenAI 兼容网关 —— `POST /api/v1/openai/chat/completions` 多上游 LLM 路由 + 限流/计费/遥测中间件；TTS `POST /api/v1/audio/speech`、`GET /voices(/streaming)`、`/models(/streaming)`。
  - `audio-speech-ws/`：`GET /api/v1/audio/speech/ws` 双向流式 TTS 代理（valibot 协议 + 二进制音频帧）。
  - `audio-transcription-stream/`：`POST /api/v1/audio/transcriptions/stream` 实时 ASR 代理。
  - `chat-ws/`：`GET /ws/chat` 聊天同步 RPC（Eventa）+ Redis Pub/Sub 跨实例广播。
  - `characters/` `providers/` `voice-packs/` `chats/`：REST CRUD。`flux/` 虚拟币流水。`admin/` + `admin-ui.ts`。
  - `stripe/`：计费代码存在但 `app.ts` **未挂载**（无登录/计费，billing 走 noop meter）。
- 领域服务（`src/services/domain/`）：`llm-router/`（`key-rotator` EnvelopeCrypto AES-GCM 逐 key 解密用完 wipe、`concurrency-ledger` Redis Lua 原子并发账本、`config-sync-subscriber` Redis pub/sub 配置失效）、`billing/`、`llm-tracing/`（Langfuse）。
- 中间件：auth（better-auth）、admin-guard、config-guard、rate-limit（hono-rate-limiter）。
- `docker-compose.otel.yml` + `otel/grafana`。

---

## 6 · 常用命令

```bash
pnpm install                  # 安装 + 构建本地包（postinstall 跑 simple-git-hooks + build:packages）
pnpm dev:tamagotchi           # 启动 Electron 桌面桌宠
pnpm dev:web                  # Web SPA
pnpm dev:server               # Hono 后端（OpenAI 网关）
pnpm dev:admin                # 管理台
pnpm dev:pocket:ios|android   # 移动端（Capacitor）
pnpm typecheck                # 全仓库 typecheck（tsc + vue-tsc）
pnpm lint / lint:fix          # oxlint（lint:fix 同时做格式化）
pnpm test:run                 # 全量测试（含 audio-pipelines-transcribe / vishot-runtime / stage-ui 三个独立项目）
pnpm exec vitest run <file>   # 单测定向
pnpm -F <name> <script>       # 按 workspace 过滤（AGENTS.md 推荐的作业方式）
pnpm build / build:web / build:tamagotchi / build:packages
pnpm knip                     # 死代码检测
```

---

## 7 · 约定速查（源自 AGENTS.md，精炼）

- **IPC**：一律 `@moeru/eventa`，契约集中定义（`apps/stage-tamagotchi/src/shared/eventa/index.ts` ~1250 行 + `eventa/plugin/*`）。
- **DI**：`injeca`，只在真实外部边界注入（DB/模型运行时/队列/文件系统/网络/时钟/env/feature gates），禁止为内部函数建 `Dependencies`/`Deps` 对象。
- **校验**：valibot，schema 贴近消费方；错误信息用 `errorMessageFrom(error)`（`@moeru/std`）。
- **样式**：UnoCSS（`uno.config.ts` 加 shortcuts/rules），Vue 用 v-bind class 数组；不用 Tailwind；图标用 Iconify。
- **i18n**：全部集中在 `packages/i18n`。
- **测试**：Vitest 按项目跑；先写复现测试再改代码；外部服务 mock（`vi.fn`/`vi.mock`）+ 带 env 守卫的集成测试；回归测试在用例名带 tracker id、上方注释带链接。
- **命名**：文件 camelCase；函数按领域操作命名（动词），概念用名词；不把多层归属塞进一个符号。
- **注释**：marker `TODO:`/`REVIEW:`/`NOTICE:`（workaround 必带 NOTICE：为什么/根因/来源/删除条件）；避免逐行翻译式注释。
- **提交**：Conventional Commits（`feat(<package>): …`，禁 gitmoji）；分支 `username/feat/short-name`；PR 门禁 typecheck + lint + test:run。
- **库选型**：涉及 node:*/DOM/Vue/Vite/GHA 的新需求先深调研候选库，再由用户拍板，禁止擅自选通用工具库。
- **不回加**向后兼容守卫；小范围渐进重构随改动进行。

---

## 8 · 阅读建议（从哪开始）

1. **桌面主循环**：`apps/stage-tamagotchi/src/main/index.ts`（injeca 装配全景）→ `src/shared/eventa/index.ts`（IPC 契约全景）→ `src/main/services/kitsune/overseer/index.ts`（编排闭环入口）。
2. **语音链路**：`packages/stage-ui/src/stores/modules/hearing.ts`（听力）→ `src/main/services/kitsune/asr/` + `tts/`（本地引擎）→ `packages/kitsune-tts-hybrid/`（混合路由）。
3. **舞台前端**：`packages/stage-ui/src/stores/modules/`（21 个业务 store）→ `composables/` → `components/`。
4. **服务端**：`apps/server/src/app.ts` → `routes/openai/v1/` → `services/domain/llm-router/`。
5. **连接器协议**：`packages/server-sdk/src/client.ts`（客户端状态机）→ `packages/server-runtime/src/server-ws/kitsune/`（服务端路由）。

---

## 9 · 已知文档缺口 / 与代码不一致处（修代码或文档前先看这里）

> 路线图 #5「文档对齐」大部分已处理（2026-09-05/06）。以下逐条列出状态：

- ~~`PROJECT-MAP.md`~~ —— 被 `CLAUDE.md` 引用。**本文件已补上**。
- ~~`crates/`（AGENTS.md 称旧 Tauri 桌面）~~ —— **已修**：AGENTS.md 改为说明 Tauri 已废弃，当前桌面为 Electron。
- ~~`docs/`、`docs/solutions/`、`docs/ai/context/ui-components.md`（AGENTS.md 引用）~~ —— **已修**：引用已改为 `packages/ui` 等真实位置。
- ~~`engines/`、`plugins/`、`examples/`（package.json workspaces）~~ —— **已修**：workspaces 改为 `packages/**`、`integrations/**`、`services/**`、`apps/**`（补齐 `integrations/`）。
- ~~`_dead_overseer_js_2026-08-07/`（kitsune-overseer/index.js 注释引用）~~ —— **已修**：改为说明历史归档不在当前仓库。PROJECT-MAP 历史记录里仍保留该词作文档（有意）。
- `packages/kitsune-mcp-bridge`、`packages/kitsune-skills-system` —— 标「已弃用」，无引用方，**可删**（尚未删）。
- ~~`.run_dev.cmd` / `.install_ignore.cmd`（硬编码 `e:\xiangm\agentpet-backup\...`）~~ —— **已删除**。
- ~~`config/{default,yachiyo}/mcp.yaml`、`desktop-live2d.json` 的 `G:/agentpet/...` 绝对路径~~ —— **已修**：改为相对路径/留空。
- ~~`electron-builder.config.ts` 引用不存在的 `resources/`、`engines/`、`build/` 目录~~ —— **已修**：改为「存在才打包」的优雅回退；mac 图标/entitlements 同理。
- ~~`packages/stage-ui-pixi` —— AGENTS.md 称「planned」~~ —— **已修**：AGENTS.md 更新为「Pixi.js rendering components & composables」。
- GPT-SoVITS 引擎已改运行时插件（README changelog 2026-08-19），不再打包内置。
- ~~`package.json` scripts `dev:docs`（@kitsune/docs 不存在）~~、~~`dev:server-auth`（@kitsune/ui-server-auth 不存在）~~ —— **已修**：dev:docs 删除，dev:server-auth 改指 @kitsune/server-runtime。

### 实现状态（2026-09-06 核验）

> 结论：**核心功能均有真实实现且已接线，不是空壳**。以下为核验摘要：

- 聊天链路：`InteractiveArea.vue → chat-sync.ts → chatOrchestratorRuntime → llm.ts → @xsai provider → LLM`，端到端闭合。
- 自主执行 Overseer：executor（loop/planner/taskRunner/permission/dag/capture/acceptance），82 测试通过。
- 记忆：bm25 检索 + store + adapters，带测试。
- 桌面自动化：click/moveTo/drag/type/pressKey/scroll/screenshot/findElement 全套 IPC。
- 角色系统：CRUD 完整；`characterPrompts`（system/personality/greetings）**已补齐前后端接线**（2026-09-06，原前端 `prompts: []` 占位已填）。
- 服务器网关：80 个路由文件，`/api/v1/*` 全部挂载。
- 已通过：`pnpm install --frozen-lockfile`、`vue-tsc --noEmit`（server/stage-ui/stage-web/stage-tamagotchi）、server+stage-ui 测试。

**尚未验证**：`pnpm dev` 实际启动（Electron GUI + 模型文件），建议首次运行前先 `pnpm dev:server` + `pnpm dev:web` 分别起。

---

## 10 · 关键路线图（README §6 摘录）

- 🟢 Now：Git 历史整理、内置 `browser.*`/`web_search` 工具适配器、安装包分发（electron-builder owner/repo + CI 自动发布）、路径清理、文档对齐（§9）。
- 🟡 Next：离线→联网渐进式语音降级、Character 生态（角色包一键导入导出）、窗口/托盘打磨、Overseer 任务可视化。
- 🔵 Later：云记忆同步（opt-in）、插件协议开放、服务端治理（账号/计费/多租户）、游戏/仿真舞台、Crowdin i18n。

---

## 附 · 角色配置位置速查

- 角色：`apps/stage-tamagotchi/config/persona.yaml`、`apps/stage-tamagotchi/persona/profile.yaml`（yachiyo）。
- 人格文档：`packages/kitsune-persona/`（SOUL.md / IDENTITY.md / USER.md / RUNTIME_PERSONA.md / persona.yaml）。
- Live2D 模型：`assets/live2d/yachiyo-kaguya/`；打包映射见 `apps/stage-tamagotchi/electron-builder.config.ts`（extraResources：`models/sherpa-onnx`、`live2d/models`）。

---

## 11 · 性能现状与原生加速（2026-09-06）

### 热点定位结论

重活已原生化：uiohook-napi（Rust 钩子）、sherpa-onnx（ASR 原生推理）、GPT-SoVITS/ComfyUI（Python sidecar 子进程）、Live2D（Cubism 运行时）。**JS 侧唯一确认的真热点是记忆库 BM25 索引构建**：TS 实现每次 `add()` 全量重算 avgDocLen，O(n²)，实测 10 万条建索引约 23s。

### 已实施：packages/bm25-native（napi-rs）

- Rust 实现 BM25（分词/打分与 TS 版逐位一致），`add/remove/search/size` 接口与 `createBM25Index` 同构。
- **增量 avgDocLen**（O(1) add）：10 万条建索引 23.3s → 1.1s（**21x**）；检索约 1.5x（非瓶颈顺带优化）。
- JS 包装层：`.node` 缺失时自动回退纯 TS 实现（`src/bm25-fallback.js`），功能不降级。
- 接线：`apps/stage-tamagotchi/src/main/services/kitsune/memory/store.ts` 改 import `@kitsune/bm25-native`。
- 验证：bm25/adapters/store 测试 29/29 通过（含 native-vs-TS 打分一致性测试）；stage-tamagotchi `vue-tsc --noEmit` 通过。
- 构建：`pnpm -F @kitsune/bm25-native build`（cargo release + 复制 `index.node`）；postinstall 自动执行。
- 注意：`index.node` 是平台特定二进制（当前 Windows x64）；跨平台分发需在各平台构建，electron-builder 可用 afterPack 钩子。
