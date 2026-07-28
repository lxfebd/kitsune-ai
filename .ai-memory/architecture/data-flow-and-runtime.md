# 数据流与运行时

> 本文档详细描述 Kitsune AI 的核心运行时、数据流、状态管理和关键执行路径。

## 一、聊天核心数据流

### 1.1 完整用户消息生命周期

```
用户输入
  │
  ▼
UI 组件（stage-web / stage-tamagotchi / stage-pocket）
  │  packages/stage-ui/src/components/scenarios/chat/
  ▼
chat store
  │  packages/stage-ui/src/stores/chat.ts
  │  useChatOrchestratorStore.ingest()
  ▼
core-agent 聊天编排运行时
  │  packages/core-agent/src/runtime/chat-orchestrator-runtime.ts
  │  createChatOrchestratorRuntime()
  │  ├─ sendQueue（stream-kit 单线程队列）
  │  ├─ performSend()
  │  ├─ ingestRuntimeContexts() ← runtimeContextProviders
  │  ├─ buildProviderMessages()
  │  ├─ 注入 system prompt supplement
  │  └─ 注入 context snapshot
  ▼
llm store
  │  packages/stage-ui/src/stores/llm.ts
  │  useLLM.stream()
  │  ├─ builtinToolsResolver（MCP / Debug / Spark Command / active tools）
  │  ├─ coreStreamFrom()（来自 core-agent）
  │  ├─ xsai 模型抽象层
  │  └─ 本地失败自动回退云端
  ▼
外部 LLM Provider
  │  小米 MiMo / 本地 llamafile / NVIDIA NIM / 阿里云 DashScope 等
  ▼
流式返回
  │  text-delta / reasoning-delta / tool-call / tool-call-result
  ▼
core-agent 响应解析
  │  response-categoriser.ts / llm-marker-parser.ts
  │  categorizeResponse() / createStreamingCategorizer()
  ▼
chat stream store
  │  packages/stage-ui/src/stores/chat/stream-store.ts
  │  streamingMessage 更新
  ▼
UI 重新渲染
  │  assistant-item.vue / response-part.vue / tool-call-display.vue
  ▼
会话历史持久化
     IndexedDB / server SDK / 本地存储
```

### 1.2 后端网关路径

```
前端 apps
  │
  ▼
@kitsune/server-sdk
  │  packages/server-sdk/src/client.ts / codec.ts
  ▼
apps/server（Hono）
  │  /api/v1/openai/chat/completions
  │  /api/v1/audio/speech
  │  /api/v1/flux/*
  │  WebSocket /chat-ws
  ▼
services/domain/llm-router/
  │  router.ts / config-loader.ts / index.ts
  │  多上游选择、密钥轮换、并发控制、错误映射
  ▼
上游 LLM / TTS 供应商
```

## 二、核心运行时详解

### 2.1 `packages/core-agent`

核心设计：**平台无关的聊天编排运行时**，通过端口（Port）与外部解耦。

| 端口/类型 | 文件 | 职责 |
|-----------|------|------|
| `ChatOrchestratorRuntime` | `runtime/chat-orchestrator-runtime.ts` | 主运行时 API，提供 `ingest`、`cancelQueuedSends` 等 |
| `ChatOrchestratorSessionPort` | 同上 | 会话持久化与 generation guard |
| `ChatOrchestratorLLMPort` | 同上 | LLM 流式调用边界 |
| `AgentContextPort` | `contracts/context-port.ts` | 上下文注入与快照 |
| `AgentForegroundStreamPort` | `contracts/stream-port.ts` | 前端流状态更新 |
| `AgentLLMPort` | `contracts/llm-port.ts` | LLM 服务抽象 |
| `ChatHookRegistry` | `contracts/hook-types.ts` | 运行时 hook 注册中心 |
| `response-categoriser.ts` | `runtime/response-categoriser.ts` | 将 LLM 响应分类为文本/推理/工具调用 |
| `llm-service.ts` | `runtime/llm-service.ts` | `streamFrom`、`sanitizeMessages`、错误分类 |
| `context-registry.ts` | `runtime/context-registry.ts` | 上下文历史管理 |
| `agent-hooks.ts` | `runtime/agent-hooks.ts` | hook 系统实现 |

关键常量：`STREAMING_UI_FLUSH_CHUNK_SIZE = 24`，控制 UI 刷新块大小。

### 2.2 `packages/stage-ui` 状态层

主要 store 及其职责：

| Store | 文件 | 职责 |
|-------|------|------|
| `useChatOrchestratorStore` | `stores/chat.ts` | 聊天编排入口 |
| `useChatSessionStore` | `stores/chat/session-store.ts` | 会话历史、IndexedDB 持久化 |
| `useChatStreamStore` | `stores/chat/stream-store.ts` | 流式消息状态 |
| `useChatContextStore` | `stores/chat/context-store.ts` | 上下文注册表前端实现 |
| `useLLM` | `stores/llm.ts` | LLM 调用与工具解析、本地失败回退 |
| `useLlmToolsStore` | `stores/llm-tools.ts` | 运行时注册的工具集合 |
| `useLlmRouter` | `stores/llm-router.ts` | 本地/云端路由决策 |
| `useProvidersStore` | `stores/providers.ts` | AI 服务提供商配置与实例 |
| `useAuthStore` | `stores/auth.ts` | 认证、token、OIDC、Flux 余额 |
| `useConsciousnessStore` | `stores/consciousness.ts` | 主模型（意识）参数 |
| `useSpeechStore` | `stores/speech.ts` | TTS 参数 |
| `useHearingStore` | `stores/hearing.ts` | ASR / 听觉参数 |
| `usePersonaStore` | `stores/modules/kitsune-card/index.ts` | 角色卡数据与模块配置 |
| `useArtistryStore` | `stores/modules/artistry.ts` | 图像生成（ComfyUI/Replicate） |
| `useModsServerChannelStore` | `stores/mods/api/channel-server.ts` | 模块间 spark:command 通信 |
| `useMcpToolBridgeStore` | `stores/mcp-tool-bridge.ts` | MCP 工具桥接 |
| `useCharacterStore` | `stores/character/index.ts` | 角色状态与属性 |
| `useSettingsStore` | `stores/settings/` | 用户偏好设置 |
| `useAnalyticsStore` | `stores/analytics/index.ts` | 行为数据收集 |

### 2.3 `apps/server` 后端运行时

| 目录 | 职责 |
|------|------|
| `src/app.ts` | Hono 应用构建、路由注册、依赖注入启动 |
| `src/index.ts` | 进程入口 `runApiServer` |
| `src/bin/run.ts` | CLI 启动入口 |
| `src/libs/db.ts` | Drizzle + PostgreSQL Pool |
| `src/libs/redis.ts` | ioredis 客户端 |
| `src/libs/auth.ts` | better-auth 配置 |
| `src/libs/env.ts` | 环境变量校验（Valibot） |
| `src/middlewares/auth.ts` | sessionMiddleware + authGuard |
| `src/middlewares/rate-limit.ts` | 速率限制 |
| `src/routes/openai/v1/` | OpenAI-compatible API |
| `src/routes/chat-ws/` | 聊天 WebSocket |
| `src/routes/audio-speech-ws/` | 实时 TTS WebSocket |
| `src/routes/flux/` | Flux 积分/流量接口 |
| `src/routes/characters/` | 角色接口 |
| `src/routes/providers/` | 提供商接口 |
| `src/routes/voice-packs/` | 语音包接口 |
| `src/services/domain/llm-router/` | LLM/TTS 多上游网关 |
| `src/services/domain/chats/` | 聊天领域服务 |
| `src/services/domain/flux/` | Flux 计费服务 |
| `src/services/domain/characters/` | 角色服务 |
| `src/services/domain/voice-packs/` | 语音包服务 |
| `src/services/adapters/config-kv.ts` | Redis KV 配置中心 |
| `src/schemas/` | Drizzle ORM 表定义 |

数据库表：accounts、chats、flux、stripe（见 `src/schemas/`）。

## 三、桌面端运行时

### 3.1 `apps/stage-tamagotchi`

Electron 主进程入口：`src/main/index.ts`

关键子系统：

| 目录/服务 | 职责 |
|-----------|------|
| `src/main/libs/electron/window-manager/` | 窗口创建、销毁、生命周期 |
| `src/main/services/kitsune/plugins/` | `.petplugin` 插件宿主 |
| `src/main/services/kitsune/mcp-servers/` | MCP Stdio 管理器 |
| `src/main/services/kitsune/http-server/` | 本地 HTTP 服务 |
| `src/main/services/kitsune/channel-server/` | 主从窗口 WebSocket 服务端 |
| `src/main/services/kitsune/godot-stage/` | Godot 舞台管理 |
| `src/main/services/kitsune/onboarding/` | 首次使用引导 |
| `src/main/windows/` | main / chat / settings / widgets / caption / spotlight / onboarding |
| `src/shared/eventa/` | Eventa IPC/RPC 契约 |
| `src/renderer/main.ts` | 渲染进程 Vue 初始化 |
| `src/renderer/pages/` | 渲染进程页面 |

## 四、机器人服务运行时

| Service | 协议/入口 | 与主系统交互 |
|---------|-----------|--------------|
| `discord-bot` | Discord Bot Token | 通过 `server-sdk` 接收配置 |
| `satori-bot` | Satori 协议 | 连接多平台 |
| `telegram-bot` | Telegram Bot API | 独立运行 |
| `minecraft` | Mineflayer | 计划迁移 Fabric mod，提供 runtime context |
| `twitter-services` | Twitter API | MCP 服务 |
| `computer-use-mcp` | MCP | macOS 桌面编排 |

## 五、关键执行路径

### 5.1 工具调用路径

1. `useLLM.stream()` 调用 `builtinToolsResolver()`
2. 收集：`mcp()` + `debug()` + `createSparkCommandTool()` + `llmToolsStore.activeTools`
3. 去重后传给 `coreStreamFrom()`
4. LLM 返回 tool-call
5. `core-agent` 解析并更新 streamingMessage
6. 工具结果通过 `ToolMessage` 回注到上下文

### 5.2 本地失败回退路径

1. `useLLM.stream()` 捕获错误
2. 若 `lastDecision.target === 'local'`，查找 cloud fallback
3. 重置兼容性 map
4. 使用云端 provider 和 model 重试
5. 仍失败则抛出错误

### 5.3 语音合成路径

1. 根据 `voice-policy.yaml` 判定是否发声
2. 选择 TTS provider：阿里云 Qwen3-TTS-VC 或本地 cosyvoice2 sidecar
3. 合成音频后交由 audio pipeline
4. 桌面端驱动 Live2D/Spine 口型同步

## 六、可观测性

- 后端使用 OpenTelemetry：`@hono/otel` + `instrumentation.ts`
- 本地可观测性：`docker compose -f apps/server/docker-compose.otel.yml up -d`
- 组件：Loki（日志）、Tempo（链路）
