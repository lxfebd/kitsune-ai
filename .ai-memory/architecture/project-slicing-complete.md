# Kitsune AI 项目完整切片文档

> 生成日期：2026-08-10
> 覆盖范围：全部 6 apps + 51 packages + 3 services + config + plugins + 根工程文件
> 文件总数：~1500+ 源文件

---

## 一、项目总览

```
agentpet/                          # 备份根目录
├── yachiyo-airi/                  # ★ 主 monorepo（git，~2 commits，master）
│   ├── apps/          (6)         # 应用层
│   ├── packages/      (51)        # 库包层
│   ├── services/      (3)         # 独立服务
│   ├── plugins/       (2空目录)    # 插件系统
│   ├── config/        (2套)       # YAML 配置
│   ├── docs/                      # 规划文档/进度日志
│   ├── scripts/                   # 工具脚本
│   ├── .ai-memory/                # 架构记忆库
│   ├── AGENTS.md                  # 工程规范（337行）
│   ├── pnpm-workspace.yaml        # workspace 定义
│   ├── turbo.json                 # Turborepo 构建编排
│   └── uno.config.ts              # 全局 UnoCSS 配置
├── pet-agent/                     # 早期独立桌宠原型
├── docs/                          # 官方 VitePress 文档站
└── open/、llama-*/、node_modules/  # 第三方参考
```

**技术栈**：Vue 3.5 + Vite + TS + Pinia(+Colada) + VueUse + UnoCSS
**桌面端**：Electron + electron-vite + injeca(DI) + @moeru/eventa(IPC/RPC)
**后端**：Hono + Drizzle ORM + PostgreSQL + Redis + better-auth + OpenTelemetry
**AI 运行时**：xsai（基于 AI SDK 的 OpenAI-compatible 层）
**构建**：pnpm@10.33.0 + Turborepo + catalog 版本管理

---

## 二、Apps 层 — 6 个应用

### A1: @kitsune/stage-tamagotchi — Electron 桌面宠物

**版本**：0.10.2 | **入口**：`src/main/index.ts` | **构建**：electron-vite

#### 内部结构 — 4 个进程域

```
src/
├── main/           # Electron 主进程
│   ├── index.ts    # 主入口（DI 容器组装）
│   ├── app/        # 应用级（debugger, file-logger, single-instance）
│   ├── configs/    # 配置（artistry.ts, global.ts）
│   ├── libs/       # 核心库
│   │   ├── bootkit/          # 启动周期（lifecycle.ts）
│   │   ├── electron/         # 窗口管理（window-manager, location, persistence）
│   │   ├── i18n/             # 国际化
│   │   ├── win32/            # Windows 窗口枚举
│   │   └── live2d-file-server.ts / model-file-server.ts
│   ├── services/   # 主进程服务（2 大类）
│   │   ├── electron/         # Electron 原生服务
│   │   │   ├── app.ts / window.ts / screen.ts
│   │   │   ├── powerMonitor.ts / system-preferences.ts
│   │   │   ├── auto-updater.ts（自动更新）
│   │   │   ├── global-shortcut.ts（全局快捷键）
│   │   │   └── global-shortcut-uiohook.ts（uiohook 快捷键）
│   │   └── kitsune/          # Kitsune 业务服务（14 个模块）
│   │       ├── agent-api/        # Agent API 调用
│   │       ├── asr/              # 语音识别引擎（engines, ipc-handlers）
│   │       ├── auth.ts           # 认证
│   │       ├── channel-server/   # 主从窗口 WebSocket 服务端
│   │       ├── comfyui/          # ComfyUI 集成
│   │       ├── connectors/       # 连接器
│   │       ├── desktop-automation/ # 桌面自动化（Win/Mac/Linux 平台适配 + safety）
│   │       ├── doctor/           # 健康检查
│   │       ├── godot-stage/      # Godot 舞台管理
│   │       ├── http-server/      # 本地 HTTP 服务（server-manager, static-assets, errors）
│   │       ├── i18n/             # 国际化
│   │       ├── logger/           # 日志
│   │       ├── mcp-servers/      # MCP Stdio 管理器
│   │       ├── memory/           # 本地记忆（BM25 + adapters + store）
│   │       ├── onboarding/       # 首次引导
│   │       ├── overseer/         # 监工系统（auditLog, permission, capture, executor）
│   │       │   └── executor/     # DAG 执行器（planner, taskRunner, loop, codeStyleAnalyzer）
│   │       ├── persona/          # 人格（userPreferences）
│   │       ├── petContract.ts / petMcpBridge.ts / petMcpServerChild.ts
│   │       ├── plugins/          # 插件宿主
│   │       │   ├── host/         # 插件主机（config, registry, debug）
│   │       │   ├── kits/         # 插件工具包（gamelet, widget）
│   │       │   ├── features/     # 内置功能（auto-reload, static-assets）
│   │       │   └── examples/     # 示例插件（devtools-sample-plugin）
│   │       ├── sidecar/          # 侧车进程管理
│   │       ├── tts/              # 语音合成
│   │       ├── vision/           # 视觉推理
│   │       ├── widgets/          # 图像生成（Artistry: ComfyUI, Replicate, Nanobanana）
│   │       └── window-snap/      # 窗口吸附
│   ├── tray/          # 系统托盘
│   └── windows/       # 15 个子窗口
│       ├── about/ / beat-sync/ / caption/ / chat/ / dashboard/
│       ├── desktop-overlay/ / devtools/ / inlay/ / main/ / notice/
│       ├── onboarding/ / settings/ / shared/ / spotlight/ / widgets/
│       └── shared/     # 窗口共享逻辑（display, persistence, taskbar, window-snap）
│
├── preload/        # Electron preload 脚本
│   ├── index.ts / beat-sync.ts / shared.ts
│
├── renderer/       # 渲染进程（Vue 3）
│   ├── main.ts             # 渲染进程入口
│   ├── App.vue             # 根组件
│   ├── layouts/            # 布局（default, settings, stage）
│   ├── pages/              # 路由页面（19 个）
│   │   ├── index.vue / chat.vue / about.vue / caption.vue
│   │   ├── dashboard/ / desktop-overlay.vue / onboarding.vue
│   │   ├── spotlight.vue / widgets.vue / notice/ / inlay/
│   │   ├── devtools/       # 15 个开发工具页面
│   │   └── settings/       # 设置页（account, connection, data, environment, models, modules, sidecar, system）
│   ├── stores/             # 渲染进程 store（12 个）
│   │   ├── chat-sync.ts / chat-sync-lifecycle.ts
│   │   ├── controls-island.ts / resources.ts / window.ts
│   │   ├── mcp-tools.ts / plugin-tools.ts
│   │   ├── stage-three-runtime-diagnostics.ts
│   │   ├── stage-window-lifecycle.ts
│   │   ├── settings/       # server-channel, server-channel-options
│   │   └── tools/          # builtin tools（desktop-automation, image-journal, weather, widgets）
│   ├── components/         # 渲染进程组件
│   │   ├── Window/TitleBar.vue / WindowRouterLink.vue
│   │   ├── stage-islands/  # controls-island, resource-status-island, status-island
│   │   └── chat-tool-renderers/
│   ├── composables/        # 8 个 composables
│   ├── widgets/            # 桌面 widget（artistry, extension-ui, map, weather）
│   └── bridges/            # 桥接（electron-auth-callback, stage-three-runtime-trace）
│
└── shared/         # 主进程 + 渲染进程共享契约
    ├── eventa/             # Eventa IPC 契约
    │   ├── index.ts
    │   └── plugin/         # 插件事件（assets, capabilities, host, tools, domains）
    ├── mcp-config.ts / model-settings-runtime.ts
    ├── spotlight-shortcut.ts
    ├── desktop-overlay-heartbeat.ts / desktop-overlay-live-window-smoke.ts
    └── utils/electron/windows/window-size.ts
```

**外部依赖亮点**：xsai（stream-text, generate-text, generate-speech）、uiohook-napi、sherpa-onnx、electron-updater、koffi（FFI）、animejs、injeca（DI）、@moeru/eventa

---

### A2: @kitsune/stage-web — Web 前端

**入口**：`src/main.ts` | **构建**：Vite

```
src/
├── main.ts / App.vue
├── pages/               # 路由页面
│   ├── index.vue / [...all].vue
│   ├── devtools/        # 10 个 devtools 页面
│   └── settings/        # 设置（characters, system）
├── stores/              # 3 个（background, devtools-lag, pwa）
├── composables/         # 4 个（audio-input, audio-record, icon-animation, perf/）
├── components/          # 4 个（AudioWaveform, DataGui, Devtools, IconAnimation）
├── modules/             # 2 个（i18n, pwa）
├── workers/vad/         # VAD 音频活动检测 worker
└── styles/              # 3 个 CSS 文件
```

**依赖差异**（与 tamagotchi 相比无 Electron 特有依赖，增加 d3, html2canvas, onnxruntime-web, workbox-window）

---

### A3: @kitsune/server — Hono 后端

**入口**：`src/bin/run.ts` | **构建**：tsc

```
src/
├── app.ts                    # Hono 应用构建 + 路由注册 + DI 启动
├── bin/run.ts                # CLI 入口
├── libs/                     # 基础设施
│   ├── db.ts                 # Drizzle + PostgreSQL
│   ├── redis.ts              # ioredis 客户端
│   ├── auth.ts               # better-auth 配置
│   ├── env.ts                # 环境变量（Valibot）
│   ├── external-dependency.ts
│   └── gravatar.ts / mock-db.ts
├── middlewares/               # 中间件
│   ├── auth.ts               # sessionMiddleware + authGuard
│   ├── rate-limit.ts         # 速率限制
│   ├── admin-guard.ts        # 管理后台守卫
│   └── config-guard.ts       # 配置守卫
├── routes/                   # API 路由（12 个端点组）
│   ├── openai/v1/            # OpenAI-compatible API（核心）
│   │   ├── gateway.ts                        # 网关入口
│   │   ├── operations/chat-completions/      # 聊天补全
│   │   ├── operations/speech-catalog/        # 语音目录
│   │   ├── operations/speech-generation/     # 语音生成
│   │   ├── middlewares/                      # billing, telemetry, traffic-control
│   │   └── http/response.ts
│   ├── chat-ws/              # 聊天 WebSocket（broadcast, connection-registry, rpc）
│   ├── audio-speech-ws/      # 实时 TTS WebSocket（protocol, session）
│   ├── audio-transcription-stream/ # 音频转录流
│   ├── characters/           # 角色接口
│   ├── chats/                # 聊天历史
│   ├── providers/            # 提供商接口
│   ├── flux/                 # Flux 积分/流量
│   ├── voice-packs/          # 语音包
│   ├── stripe/               # Stripe 支付（checkout, webhook, price-catalog）
│   └── admin/                # 管理后台 API（config, flux-grants, users, voice-packs）
├── services/                 # 业务服务层
│   ├── domain/               # 领域服务
│   │   ├── llm-router/       # ★ LLM/TTS 多上游网关
│   │   │   ├── router.ts             # 主路由逻辑
│   │   │   ├── config-loader.ts      # 配置加载
│   │   │   ├── key-rotator.ts        # 密钥轮换
│   │   │   ├── concurrency-ledger.ts # 并发控制
│   │   │   ├── error-mapping.ts      # 错误映射
│   │   │   └── config-sync-subscriber.ts
│   │   ├── llm-tracing/     # LLM 链路追踪
│   │   ├── billing/         # 计费（billing, billing-service, flux-meter）
│   │   ├── admin/           # 管理域（flux-grants, router-config, users）
│   │   ├── chats.ts / characters.ts / providers.ts
│   │   ├── flux.ts / flux-transaction.ts
│   │   ├── stripe.ts / product-events.ts
│   │   ├── openai-speech/   # OpenAI 语音
│   │   ├── voice-packs/     # 语音包
│   │   ├── user-deletion/   # 用户删除
│   │   └── request-log.ts   # 请求日志
│   └── adapters/            # 外部适配器
│       ├── config-kv.ts     # Redis KV 配置
│       ├── email.ts         # 邮件
│       └── tts/             # TTS 适配器（azure, dashscope-cosyvoice, stepfun, volcengine, unspeech）
├── schemas/                  # Drizzle ORM 表定义（11 张表）
│   ├── accounts.ts / chats.ts / characters.ts
│   ├── flux.ts / flux-transaction.ts
│   ├── providers.ts / voice-packs.ts
│   ├── stripe.ts / product-events.ts
│   ├── llm-request-log.ts / user-character.ts
├── otel/                     # OpenTelemetry
│   ├── gauges/               # 指标（active-sessions, distinct-active-users, rolling-active-users, total-users, tts-pool）
│   └── index.ts
├── utils/                    # 工具（chat-broadcast, envelope-crypto, error, http-query, id, redis-keys, server-admin-ui）
└── types/                    # 类型（hono, character-avatar-model, character-capability）
```

---

### A4: @kitsune/stage-pocket — Capacitor 移动端

**构建**：Vite + Capacitor（iOS/Android）

```
src/
├── main.ts / App.vue
├── pages/           # index.vue, devtools/（8 个）, settings/（connection, system）
├── stores/          # background.ts
├── composables/     # audio-input, audio-record, icon-animation
├── components/      # AudioWaveform, DataGui, IconAnimation, onboarding, websocket-status-button
├── modules/         # capacitor-lifecycle, deep-links, i18n, pwa, server-channel-qr-probe, websocket-bridge
├── workers/vad/     # VAD worker
└── styles/
```

**依赖差异**：@capacitor/*（android, app, barcode-scanner, core, ios, local-notifications）、capacitor-native-settings

---

### A5: @kitsune/ui-admin — 管理后台

```
src/
├── main.ts / App.vue
├── pages/           # 6 个页面
│   ├── OverviewPage.vue / FluxPage.vue
│   ├── LlmRouterPage.vue / UsersPage.vue
│   └── VoicePacksPage.vue / VoicePackFormPage.vue
├── components/      # 管理组件
│   ├── admin-list/AdminListPanel.vue
│   └── llm-router/  # 6 个路由器配置组件
├── modules/         # api.ts, router-config-form.ts, server-admin-context.ts
└── styles/
```

---

### A6: @kitsune/component-calling — 实时音频

```
src/
├── main.ts / App.vue
├── pages/index.vue
├── plugins/         # 插件示例
│   ├── plugin-component-calling/          # 主插件
│   └── plugin-component-calling-weather/  # 天气组件
└── utils/xsai-testing.ts
```

---

## 三、Packages 层 — 51 个包

### P1: stage-ui — 前端核心（578 个源文件，最大包）

```
src/
├── stores/           # ★ 30+ Pinia 状态管理
│   ├── chat.ts               # 聊天编排入口（useChatOrchestratorStore）
│   ├── llm.ts                # LLM 调用（useLLM.stream）
│   ├── llm-tools.ts          # 工具注册
│   ├── llm-router.ts         # 本地/云端路由
│   ├── llm-streaming-control.ts  # LLM 流控制
│   ├── providers.ts          # 提供商注册
│   ├── provider-catalog.ts   # 提供商目录
│   ├── mcp-tool-bridge.ts    # MCP 工具桥接
│   ├── mcp.ts                # MCP 配置
│   ├── characters.ts         # 角色列表
│   ├── character/            # 角色状态
│   │   ├── index.ts
│   │   ├── notebook.ts
│   │   └── orchestrator/     # 角色编排器（spark-notify-agent）
│   ├── chat/                 # 聊天子系统（7 个文件）
│   │   ├── session-store.ts  # 会话持久化
│   │   ├── stream-store.ts   # 流式消息
│   │   ├── context-store.ts  # 上下文注册表
│   │   ├── data-store.ts     # 数据存储
│   │   ├── context-prompt.ts # 上下文提示
│   │   ├── hooks.ts          # 聊天 hooks
│   │   └── ...
│   ├── modules/              # 功能模块（10 个）
│   │   ├── artistry.ts       # 图像生成
│   │   ├── hearing.ts        # 听觉/ASR
│   │   ├── speech.ts         # 语音输出
│   │   ├── persona.ts        # 人格
│   │   ├── discord.ts / twitter.ts
│   │   ├── gaming-factorio.ts / gaming-minecraft.ts
│   │   └── vision/           # 视觉推理（orchestrator, agents, processing-store）
│   ├── settings/             # 用户偏好（11 个）
│   ├── providers/            # 提供商适配（aliyun, elevenlabs, google-gemini-speech, openrouter, web-speech-api）
│   ├── analytics/            # 分析（posthog, privacy-policy）
│   ├── devtools/             # 开发工具（4 个）
│   ├── mods/api/             # 模块间通信（channel-server, channel-gateway, context-bridge, events）
│   └── ...（audio, background, configurator, display-models, live2d, three, 等）
│
├── components/       # 15 大类组件
│   ├── scenarios/chat/       # ★ 聊天场景（核心）
│   │   ├── components/       # assistant-item, user-item, response-part, tool-call-block, tool-call-display, history, sessions-drawer, error-item, action-menu
│   │   └── composables/      # use-chat-history-scroll, use-element-scroll
│   ├── scenarios/dialogs/    # 对话框（about, audio-input, background-picker, bug-report, model-selector, onboarding, validation-details）
│   ├── scenarios/providers/  # 提供商配置 UI（14 个组件）
│   ├── scenarios/settings/   # 设置 UI（model-settings, bar, check-bar, 等）
│   ├── auth/                 # 认证（login, register, profile）
│   ├── form/                 # 表单组件（checkbox, combobox-select, field, input, range, select, textarea）
│   ├── layouts/              # 布局（backgrounds, ripple-grid, splitpanes, section, page-header）
│   ├── menu/                 # 菜单（character-card, voice-card, radio-card, icon-item）
│   ├── gadgets/              # 小工具（audio-spectrum, chat-bubble, level-meter, processing-meter, threshold-meter, time-series-chart）
│   ├── misc/                 # 杂项（alert, button, error-container, progress, skeleton, steppers, steps, profile-switcher）
│   ├── physics/              # 物理（cursor-floating, cursor-momentum）
│   ├── modules/              # 模块组件（GamingFactorio, GamingMinecraft, MessagingDiscord, X）
│   ├── scenes/               # 舞台场景（Stage.vue, ViewControlSlider）
│   ├── widgets/              # 桌面小部件（ColorPalette, PoppingSubtitles, PoppinText）
│   └── animations/           # 动画（Replayable）
│
├── composables/      # 30+ Vue composables
│   ├── audio/                # 音频（analyzer, context, device, recorder）
│   ├── vision/               # 视觉（inference, workloads）
│   ├── use-chat-session/     # 聊天会话
│   ├── api.ts / download.ts / markdown.ts / queues.ts
│   ├── canvas-alpha.ts / llm-marker-parser.ts / response-categoriser.ts
│   ├── use-analytics.ts / use-breakpoints.ts / use-build-info.ts
│   ├── use-duck-db.ts / use-inference-preload.ts / use-inference-status.ts
│   ├── use-io-tracer.ts / use-local-first.ts / use-model-preload.ts
│   ├── use-optimistic.ts / use-provider-validation.ts / use-speech-pipeline-analytics.ts
│   └── ...
│
├── libs/             # 库层
│   ├── providers/            # ★ 30+ AI 提供商实现
│   │   ├── providers/        # 每个提供商独立目录（302-ai, aihubmix, amazon-bedrock, anthropic, app-local, azure, byteplus, cerebras, cloudflare, deepseek, google-generative-ai, groq, mimo, minimax, mistral, ollama, openai, openrouter, 等）
│   │   ├── validators/       # 提供商验证器
│   │   └── types.ts / source-metadata.ts / registry.ts
│   ├── inference/            # 推理运行时（adapters, asr-engine-registry, coordinator, gpu-resource-coordinator, load-queue, worker-manager）
│   ├── audio/                # 音频（decode, manager, vad）
│   ├── speech/               # 语音（streaming-pipeline, streaming-session, tts-session）
│   ├── chat-sync/            # 聊天同步（cloud-mapper, wire-message, ws-client）
│   └── ...
│
├── services/         # 服务层（characters, inference-service-providers, speech/bus, speech/pipeline-runtime）
├── tools/            # 工具函数（character/orchestrator, debug, mcp）
├── types/            # 类型定义（character, chat-session, chat）
├── database/         # 数据库（chat-sessions.repo, storage）
├── workers/          # Web Workers（background-removal, kokoro, vad）
└── constants/        # 常量（emotions, injections, persona-content, prompts, theme）
```

---

### P2: core-agent — 聊天编排运行时

```
src/
├── runtime/                      # ★ 核心运行时
│   ├── chat-orchestrator-runtime.ts   # 主引擎（ingest, cancelQueuedSends）
│   ├── llm-service.ts                 # LLM 服务（streamFrom, sanitizeMessages）
│   ├── response-categoriser.ts        # 响应分类（text/reasoning/tool-call）
│   ├── llm-marker-parser.ts           # LLM 标记解析
│   ├── context-registry.ts            # 上下文历史管理
│   └── agent-hooks.ts                 # Hook 系统
├── contracts/                  # 端口契约（5 个）
│   ├── llm-port.ts             # LLM 服务抽象
│   ├── stream-port.ts          # 前端流状态更新
│   ├── context-port.ts         # 上下文注入
│   ├── session-port.ts         # 会话持久化
│   └── hook-types.ts           # Hook 注册中心
├── messages/                   # 消息处理
│   ├── compaction.ts           # 消息压缩
│   ├── context-prompt.ts       # 上下文提示构建
│   ├── projection.ts           # 消息投影
│   ├── render-provider-chat.ts # 提供商聊天渲染
│   └── datetime-prefix.ts      # 时间戳前缀
├── agents/                     # 智能体
│   └── spark-notify/           # Spark 通知（event-source, handler, schema, tools）
├── session/                    # 会话
│   └── merge-loaded-session-messages.ts
└── types.ts / utils.ts
```

---

### P3: core-character — 角色 pipeline 编排

```
src/
├── context-builder.ts   # 角色上下文构建
├── registry.ts          # 角色注册表
├── loader.ts            # 角色加载器
└── types.ts
```

---

### P4: ccc — Character Card 标准处理

```
src/
├── define/            # 卡片定义
│   ├── card.ts / ext.ts / types/
├── export/            # 导出格式
│   ├── png.ts / json.ts / md.ts / apng.ts
│   └── types/         # assets, character_book, character_card_v3, data, extensions
└── utils/             # 工具（chat, markdown）
```

---

### P5: 音频相关包（4 个）

#### audio — 音频编码/处理
```
src/
├── audio-context/     # AudioContext 管理 + processor.worklet
├── encoding/          # WAV 编码
└── utils/
```

#### pipelines-audio — 音频 pipeline
```
src/
├── speech-pipeline.ts         # 主语音 pipeline
├── timeline.ts                # 时间线管理
├── stream.ts                  # 流式处理
├── priority.ts                # 优先级队列
├── llm-streaming-control/     # LLM 流控制（controller, parsers for act/call/delay）
├── processors/tts-chunker.ts  # TTS 文本分块
├── managers/playback-manager.ts # 播放管理
└── utils/
```

#### audio-pipelines-transcribe — 转录 pipeline
```
src/
├── transcribe.ts
└── utils/
```

#### kitsune-tts-hybrid — 混合 TTS 管理器
```
src/
├── ttsManager.ts          # TTS 管理器
├── ttsRequestQueue.ts     # 请求队列
├── ttsFallbackChain.ts    # 回退链（Qwen3 → GPT-SoVITS）
├── qwen3TtsAdapter.ts     # 阿里云 Qwen3-TTS-VC 适配器
├── gptsovitsAdapter.ts    # 本地 GPT-SoVITS 适配器
├── engine-registry.ts     # 引擎注册
└── types.ts
```

---

### P6: 服务端包（5 个）

#### server-sdk — 前端 SDK
```
src/
├── client.ts       # HTTP 客户端
├── codec.ts        # 编解码
└── extension-peer.ts  # 扩展端
```

#### server-sdk-shared — 共享契约
```
src/
├── index.ts
```

#### server-runtime — 服务端运行时
```
src/
├── server/             # 服务器实现
├── server-ws/          # WebSocket（kitsune codec）
├── config/             # 配置（env, config）
├── middlewares/         # 中间件（route matching）
├── bin/run.ts          # CLI 入口
└── types/
```

#### server-schema — Drizzle ORM 表定义
```
src/
├── index.ts
```

#### server-shared — 共享类型
```
src/
├── index.ts
```

---

### P7: Electron 包（3 个）

#### electron-eventa — Electron IPC 契约
```
src/
├── electron/               # Eventa 事件定义
│   ├── app.ts / window.ts / screen.ts
│   ├── powerMonitor.ts / system-preferences.ts
│   └── index.ts
└── electron-updater/       # 自动更新契约
```

#### electron-vueuse — Electron VueUse 风格 composables
```
src/
├── composables/            # 10 个 use* composables
│   ├── use-electron-all-displays.ts
│   ├── use-electron-auto-updater.ts
│   ├── use-electron-eventa-context.ts
│   ├── use-electron-mouse*.ts（4 个鼠标相关）
│   ├── use-electron-window-bounds.ts
│   └── use-electron-window-resize.ts
└── main/                   # 主进程循环（loop, renderer-loop）
```

#### electron-screen-capture — 屏幕捕获
```
src/
├── main/               # 主进程捕获逻辑
├── vue/                # Vue composable（use-electron-screen-capture）
└── renderer.ts
```

---

### P8: 插件 SDK 包（3 个）

#### plugin-protocol — 插件协议
```
src/
├── types/events.ts    # 事件定义
├── types/index.ts
└── index.ts
```

#### plugin-sdk — 通用插件 SDK
```
src/
├── plugin/             # 插件核心（host, plugin）
├── channels/           # 通道（local, remote）
├── extension/          # 扩展
├── kit/                # 工具包
└── utils/
```

#### plugin-sdk-tamagotchi — Tamagotchi 插件辅助
```
src/
├── gamelet/            # Gamelet 工具
├── tools/              # 工具注册（registry）
├── widgets/            # Widget 工具
├── kits/               # 工具包（gamelet, tool）
└── index.ts
```

---

### P9: 模型/角色包（4 个）

#### kitsune-persona — 八千代人格系统
```
src/
├── personaLoader.ts              # 人格加载
├── personaConfigStore.ts         # 配置存储
├── personaStateStore.ts          # 状态存储
├── personaProfileStore.ts        # 档案存储
├── personaContextBuilder.ts      # 上下文构建
├── personaAdjuster.ts            # 人格调整
├── personaModeResolver.ts        # 模式解析
├── personaGuidanceStateStore.ts  # 引导状态
├── personaPreferenceWriteback.ts # 偏好回写
└── types.ts
```

#### kitsune-emotion-mapper — 语义情绪映射
```
src/
├── emotionMapper.ts        # 情绪映射器
├── emotion-mapping.json    # 映射配置
└── index.ts
```

#### model-driver-lipsync — 口型同步
```
src/
├── live2d/             # Live2D 口型驱动
├── shared/wlipsync/    # WLipsync 引擎
└── index.ts
```

#### model-driver-mediapipe — MediaPipe 动捕
```
src/
├── engine.ts           # 引擎
├── backends/           # mediapipe backend
├── three/              # VRM 姿势映射（apply-pose-to-vrm, pose-to-vrm）
└── utils/
```

---

### P10: 场景渲染包（7 个）

#### stage-ui-live2d — Live2D 场景组件
```
src/
├── components/scenes/live2d/   # Canvas.vue, Model.vue
├── composables/live2d/         # 10 个 composables
│   ├── live2d.ts               # 主引擎
│   ├── animation.ts            # 动画控制
│   ├── expression-controller.ts # 表情控制
│   ├── motion-manager.ts       # 动作管理
│   ├── emotion-adapter.ts      # 情绪适配
│   ├── eye-tracking.ts         # 眼追
│   ├── fit-model.ts            # 模型适配
│   ├── beat-sync.ts            # 节拍同步
│   └── soullink-bridge.ts      # 灵魂链接桥接
├── stores/ / tools/ / utils/ / constants/
└── index.ts
```

#### stage-ui-spine — Spine 2D 场景
类似 live2d 结构

#### stage-ui-three — Three.js 3D 场景
类似 live2d 结构（VRM 渲染）

#### stage-ui-pixi — Pixi 场景（计划中，可能空目录）

#### stage-shared — 跨 stage 共享
```
src/
├── artistry.ts
├── beat-sync/
├── composables/
└── electron-renderer.d.ts
```

#### stage-layouts — 共享布局
```
src/
├── index.ts
```

#### stage-pages — 共享页面
```
src/
├── index.ts
```

---

### P11: UI 基础库（3 个）

#### ui — 基础 UI 组件库（基于 reka-ui）
```
src/
├── components/Form/   # 标准化表单组件
├── components/        # 按钮、输入框、布局等 primitives
├── composables/       # useDark 等
└── index.ts
```

#### ui-loading-screens — 加载屏幕
```
src/
├── index.ts
```

#### ui-transitions — 过渡动画
```
src/
├── index.ts
```

---

### P12: 截图/测试包（5 个）

#### vishot-runtime — 截图运行时契约
```
src/
├── index.ts
```

#### vishot-runner-browser — 浏览器截图 runner
```
src/
├── cli/capture.ts        # CLI 捕获
├── runtime/              # 运行时（artifacts, capture, files, selectors, vite-server）
└── index.ts
```

#### vishot-runner-electron — Electron 截图 runner
```
src/
├── cli/capture.ts
├── runtime/              # artifacts, capture, context, define-scenario, load-scenario
└── utils/
```

#### scenarios-stage-tamagotchi-browser — 浏览器场景
#### scenarios-stage-tamagotchi-electron — Electron 场景

---

### P13: 字体/工具/国际化包（9 个）

#### font-chillroundm / font-cjkfonts-allseto / font-xiaolai / font-departure-mono
各包仅提供 CSS 和字体文件

#### i18n — 国际化
```
src/
├── locales/            # 多语言翻译
├── index.ts
```

#### unocss-preset-fonts — UnoCSS 字体预设
```
src/
├── index.ts
```

#### better-ws — 传输无关 WebSocket
```
src/
├── client/             # WebSocket 客户端
├── server/             # 服务器（h3 adapter）
├── shared/             # 共享类型
└── index.ts
```

#### cap-vite — Capacitor Vite CLI
```
src/
├── index.ts
```

#### stream-kit — 队列与流式工具
```
src/
├── queue.ts      # 单线程发送队列
└── index.ts
```

---

### P14: 已弃用包（4 个）

| 包 | 路径 | 状态 | 说明 |
|----|------|------|------|
| kitsune-mcp-bridge | packages/kitsune-mcp-bridge | ❌ 弃用 | 无引用方 |
| kitsune-overseer | packages/kitsune-overseer | ❌ 弃用 | 无入口文件，JS 已移至 `_dead_overseer_js_` |
| kitsune-skills-system | packages/kitsune-skills-system | ❌ 弃用 | 无入口文件 |
| kitsune-screenshot | packages/kitsune-screenshot | ⚠️ 待确认 | 截图编排 CLI |

---

## 四、Services 层 — 3 个独立服务

### S1: computer-use-mcp — macOS 桌面编排 MCP 服务
```
src/
├── index.ts
```

### S2: discord-bot — Discord 机器人
```
src/
├── index.ts
```
依赖：@kitsune/audio, server-sdk, server-shared, @xsai/*, discord.js/voice

### S3: minecraft — Mineflayer 智能体
```
src/
├── index.ts
```
依赖：mineflayer, mineflayer-pathfinder, mineflayer-pvp, mineflayer-collectblock 等

---

## 五、Config 层 — 2 套配置

`config/default/` 和 `config/yachiyo/` 各含 7 个配置：

| 文件 | 关键内容 |
|------|----------|
| providers.yaml | 活跃 provider: xiaomi-claude；支持 local/xiaomi-mimo/nvidia-nim/qwen/qwen3_tts；router.mode: auto |
| tools.yaml | 30+ 工具，分 13 类（基础/记忆/文件/Shell/语音/Live2D/桌面/浏览器/技能/系统管理/IDE/监工/CLI） |
| skills.yaml | 技能加载与触发策略 |
| mcp.yaml | 8 个 MCP 服务器（shell, puppeteer, filesystem, bing-search, github, sqlite, memory, fetch） |
| voice-policy.yaml | 自动回复开启，must_speak_if/may_speak_if/must_not_speak_if 条件，限制 220 字符/45 秒/3 次每分钟 |
| live2d-presets.yaml | 表情/手势/反应预设 |
| desktop-live2d.json | 桌面 Live2D 运行时配置 |

---

## 六、plugins 层

`plugins/` 下 `default/` 和 `yachiyo/` 两个目录均为空（git 未跟踪任何插件文件）。
历史记录中曾存在 9 个插件（comfyui, tts, local-llm, weather-adapter, git-visualizer, example-adapter, coview-desktop, cli-anything, ai-monitor），本备份中均不存在。

---

## 七、根工程文件

| 文件 | 用途 |
|------|------|
| AGENTS.md（337行） | 完整工程规范（技术栈、结构、命令、开发实践、测试、TypeScript、i18n、CSS、命名、注释、JSDoc、模块设计、PR 工作流） |
| package.json | 根包配置，scripts（dev/build/test/lint/typecheck），devDependencies 通过 catalog 管理 |
| pnpm-workspace.yaml | 10 个 workspace 目录模式 + 200+ catalog 条目 |
| turbo.json | Turborepo 构建任务 pipeline |
| uno.config.ts | 全局 UnoCSS 配置（presets, shortcuts, rules） |
| tsconfig.json | 根 TypeScript 配置 |
| vitest.config.ts | 根测试配置 |
| cspell.config.yaml | 拼写检查 |
| crowdin.yml | 翻译平台配置 |
| flake.nix | Nix 构建 |
| bump.config.ts | 版本 bump |
| electron-builder.config.ts | 桌面端打包（在 apps/stage-tamagotchi/） |
| knip.json | 死代码分析 |

---

## 八、pet-agent 早期原型（独立项目）

```
pet-agent/
├── start.js                    # 启动入口
├── 启动桌面版.bat              # Windows 启动脚本
├── src/
│   ├── ui/app/                 # Vue 3 + Vite UI
│   ├── plugins/tooling/adapters/ # 工具适配器
│   └── ...
├── tts-engines/                # TTS 引擎
├── asr-engines/vosk/           # Vosk ASR 侧车
├── voices/                     # 语音文件
├── templates/ / test/ / tests/ / user/
└── test-results-final.txt / test_tts.wav
```

---

## 九、项目依赖关系图（核心链路）

```
stage-web / stage-pocket / stage-tamagotchi
  └── stage-ui（stores/composables/components）
        ├── core-agent（聊天编排）
        │     ├── core-character（角色 pipeline）
        │     └── stream-kit（队列）
        ├── ccc（Character Card）
        ├── audio / pipelines-audio（音频）
        ├── kitsune-tts-hybrid（TTS 回退链）
        ├── kitsune-persona（人格）
        ├── kitsune-emotion-mapper（情绪映射）
        ├── electron-* / server-sdk（平台层）
        └── server（后端网关）
              ├── server-runtime / server-schema
              ├── llm-router（多上游路由）
              └── services/domain/*（业务逻辑）
```

---

## 十、模块文件规模统计

| 模块 | 源文件数 | 类型 |
|------|---------|------|
| packages/stage-ui | ~578 | 前端核心 |
| apps/stage-tamagotchi | ~260 | 桌面端 |
| apps/server | ~200（含 .d.ts） | 后端 |
| packages/core-agent | ~30 | 核心引擎 |
| packages/stage-ui-live2d | ~20 | Live2D 渲染 |
| packages/kitsune-persona | ~12 | 人格系统 |
| packages/kitsune-tts-hybrid | ~9 | TTS 管理 |
| 其他包 | 3-10 各 | 工具/字体/配置 |
| **总计** | **~1500+** | |