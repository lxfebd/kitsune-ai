# 知识库框架（Knowledge Framework）

> 本文档是 Kitsune 项目的 AI 记忆库主索引与知识框架。  
> 最后更新：2026-07-02

## 一、项目定位

**Kitsune AI**（狐）是一个 AI 虚拟角色 / 桌面宠物 / 多端应用框架，命名空间为 `@kitsune/*`（由 `@yachiyo/*` 迁移而来）。

核心目标：以「角色卡（Character Card）」为中心，构建可运行在 Web / 移动端 / 桌面端 / 机器人平台 / 游戏引擎（Live2D / Spine / Godot）之上的 AI 角色系统。

## 二、顶层架构

```
apps/
├── stage-web          Web 前端（Vue 3 + Vite + UnoCSS）
├── stage-pocket       Capacitor 移动端
├── stage-tamagotchi   Electron 桌面宠物
├── ui-admin           管理后台
└── server             Hono 后端（LLM/TTS/Flux 网关）
```

```
packages/
├── core-agent          AI 聊天编排核心（平台无关）
├── stage-ui            UI 组件 + stores + composables
├── stage-ui-live2d     Live2D 渲染
├── stage-ui-spine      Spine 渲染
├── server-sdk          前端访问后端 SDK
├── server-sdk-shared    服务端共享类型
├── server-runtime      服务端运行时
├── server-schema       服务端数据库 schema
├── stream-kit          流式工具
├── i18n                国际化
├── fonts-*             字体包
├── plugin-sdk-*        插件 SDK
└── ... 等
```

## 二、核心数据流

### 2.1 完整请求链路

```
用户输入
  │
  ▼
UI 组件（apps/stage-web/src/components/chat/）
  │
  ▼
chat store（packages/stage-ui/src/stores/chat.ts）
  │  useChatOrchestratorStore.ingest()
  │  ├─ 创建 sessionId
  │  ├─ 写入 user message
  │  └─ 调用 orchestrator.streamChat()
  ▼
core-agent（packages/core-agent/src/runtime/chat-orchestrator-runtime.ts）
  │  ├─ sendQueue 串行队列
  │  ├─ performSend()
  │  │  ├─ buildProviderMessages()
  │  │  ├─ ingestContexts() ← contextProviders
  │  │  ├─ buildSystemPrompt()
  │  │  └─ streamChat()
  │  ├─ 流式响应 → 解析 → 工具调用 → 继续对话
  │  └─ 错误处理 / 重试 / 回退
  ▼
LLM Provider（小米 MiMo / 本地 llamafile / NVIDIA NIM / 阿里云 DashScope 等）
  ▼
stream-kit 流式解析
  ▼
UI 渲染（chat store → 组件）
```

## 二、核心数据流

### 2.1 聊天消息流
1. 用户输入 → `useChatOrchestratorStore.ingest()`
2. 运行时组装 system prompt + 上下文 + 工具定义
3. `coreLLM.streamText()` → Provider API
4. 流式响应 → `response-categoriser.ts` 分类
5. 分类结果 → `useChatStreamStore` 更新 UI
6. 工具调用 → `useLlmToolsStore` 执行 → 结果回填 → 继续对话

### 2.2 角色卡（Character Card）加载
1. `useKitsuneCardStore` 加载 `kitsune-card.json` / `kitsune-card.yaml`
2. 解析 `persona` / `scenario` / `first_mes` / `mes_example`
3. 注入 system prompt
4. 与 `usePersonaStore` 联动

### 2.3 语音/听觉
- `useSpeechStore` → TTS 队列 → `speech.ts` 播放
- `useHearingStore` → ASR 识别 → 文本注入聊天
- 语音策略：`voice-policy.yaml`

### 2.4 意识（Consciousness）
- `useConsciousnessStore` → 周期性心跳 + 状态更新
- 支持 `idle` / `active` / `sleeping` 等状态

### 2.5 角色卡（Character Card）
- `packages/ccc`：V2/V3 角色卡解析（Character Card 标准处理）
- `packages/kitsune-persona`：人格 / 角色定义
- 支持导入/导出 PNG、JSON、Markdown

### 2.6 插件系统
- `packages/plugin-sdk`：通用插件 SDK
- `packages/plugin-sdk-tamagotchi`：Tamagotchi 专用插件 SDK 辅助
- `plugins/`：内置插件（TTS、ComfyUI、local-llm、weather-adapter 等）

### 2.7 服务（services/）

> 2026-08-10 核对：本备份 `services/` 实际仅含 `computer-use-mcp`、`discord-bot`、`minecraft` 三个；下方"历史记录"中 `telegram-bot` / `twitter-bot` / `ai-hub` / `satori-bot` 在本备份中不存在，待与线上仓库核实。

- `services/computer-use-mcp`：macOS 桌面编排 MCP 服务
- `services/discord-bot`：Discord 机器人
- `services/minecraft`：Minecraft 机器人（计划迁移至 Fabric mod）

历史记录（本备份缺失，待核实）：`telegram-bot`、`twitter-bot`、`ai-hub`、`satori-bot`。

### 2.8 工具（tools/）
- `tools/`：开发工具与脚本

## 三、核心架构

### 3.1 分层架构

```
┌─────────────────────────────────────────────────┐
│  UI 层 (apps/stage-web, apps/stage-pocket,      │
│       apps/stage-tamagotchi, apps/ui-admin)      │
├─────────────────────────────────────────────────┤
│  状态层 (packages/stage-ui)                      │
│  - stores/chat.ts 聊天编排                    │
│  - stores/llm.ts LLM 调用                     │
│  - stores/providers.ts 提供商配置              │
│  - stores/consciousness.ts 意识/人格            │
│  - stores/voice.ts 语音                        │
│  - stores/hearing.ts 听觉                      │
│  - stores/kitsune-card.ts 角色卡               │
│  - stores/artifacts.ts 产物                   │
│  - stores/modules/* 模块系统                  │
├── 核心运行时 (packages/core-agent)
│  ├── chat-orchestrator-runtime.ts  聊天编排
│  ├── context-registry.ts          上下文注入
│  ├── llm-service.ts               LLM 流式服务
│  ├── agent-hooks.ts               Hook 系统
│  └── tool-registry.ts             工具注册
│
├── 后端 (apps/server)
│  ├── src/app.ts                  Hono 应用
│  ├── src/routes/                  REST 路由
│  ├── src/services/domain/llm-router/  LLM 路由
│  ├── src/services/domain/chat/      聊天服务
│  ├── src/services/domain/characters/ 角色服务
│  ├── src/services/domain/voice-packs/ 语音包
│  └── src/services/domain/flux/       Flux 计费
│
├── 桌面端 (apps/stage-tamagotchi)
│  ├── src/main/                    Electron 主进程
│  │   ├── services/kitsune/plugins/    插件加载
│  │   ├── services/kitsune/mcp-servers/ MCP 服务器
│  │   ├── services/kitsune/http-server/ HTTP 服务
│  │   ├── services/kitsune/channel-server/ WebSocket 服务
│  │   └── services/kitsune/godot-stage/  Godot 舞台
│  ├── src/preload/                预加载脚本
│  └── src/renderer/               UI 渲染层
│  └── src/shared/                 共享类型/常量
│
│  └── src/main/                    Electron 主进程
│      ├── index.ts                # 入口
│      ├── windows/               # 窗口管理
│      ├── services/              # 服务层
│      └── shared/                # 共享模块
│
│  └── src/renderer/              # 渲染进程
│      ├── src/                   # 渲染进程源码
│      └── index.html             # 入口 HTML
│
│  └── src/shared/               # 主/渲染进程共享
│      ├── constants.ts
│      └── types.ts
│
│  └── src/main/                  # Electron 主进程
│      ├── index.ts
│      ├── services/
│      │   ├── kitsune/           # 核心服务
│      │   │   ├── plugins/       # 插件系统
│      │   │   ├── mcp-servers/   # MCP 服务器
│      │   │   ├── http-server/   # HTTP 服务
│      │   │   ├── channel-server/ # WebSocket 服务
│      │   │   └── godot-stage/   # Godot 舞台
│      │   └── ...
│      └── ...
```