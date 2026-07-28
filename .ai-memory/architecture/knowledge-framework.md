# Kitsune AI / yachiyo-airi 知识框架

> 本文档是项目知识库的主入口，汇总全局认知、顶层架构、核心数据流、关键模块与阅读优先级。详细信息见同目录下其他分册。

## 一、项目定位

**Kitsune AI（灵狐）** 是全栈 AI 桌宠 / 角色对话平台，命名空间为 `@kitsune/*`（由 `@proj-airi/*` 迁移而来）。

核心围绕「角色卡（Character Card + Kitsune 扩展）」构建，支持：
- Web 主入口（`apps/stage-web`）
- Capacitor 移动端（`apps/stage-pocket`）
- Electron 桌面宠物（`apps/stage-tamagotchi`）
- Hono 后端服务（`apps/server`）
- 多平台机器人服务（`services/*`）
- MCP 服务与插件生态（`services/computer-use-mcp`、`plugins/*`）

## 二、顶层架构

```
用户入口层
├── apps/stage-web        Web SPA
├── apps/stage-pocket     Capacitor 移动端
├── apps/stage-tamagotchi Electron 桌面宠物
├── apps/ui-admin         管理后台
└── apps/component-calling Realtime audio

前端共享层
└── packages/stage-ui     Pinia stores + Vue 组件 + composables + providers

运行时 / 通信层
├── packages/core-agent   平台无关聊天编排运行时
├── packages/server-sdk   前端访问后端 SDK
├── packages/server-sdk-shared 共享事件契约
├── packages/server-runtime     多环境服务端运行时
├── packages/server-shared      服务端共享类型
├── packages/better-ws    可靠 WebSocket 原语
└── packages/stream-kit   队列与流式工具

后端服务层
└── apps/server           Hono + PostgreSQL + Redis + LLM/TTS 网关

机器人服务层
└── services/*            Discord / Satori / Telegram / Minecraft / Twitter / computer-use-mcp

通用能力模块
└── extracted-modules/    意识 / 语音 / 听觉 / 视觉 / 图像创作 / 角色卡 / Discord / Twitter / MCP

插件生态
└── plugins/*             TTS / ComfyUI / local-llm / weather / cli-anything / ai-monitor
```

## 三、核心数据流

用户输入 → `stage-ui/stores/chat.ts` → `core-agent/chat-orchestrator-runtime.ts` → `stage-ui/stores/llm.ts`（xsai）→ 外部 LLM Provider → 流式解析 → UI 更新 → 历史持久化。

后端路径：`stage-ui` → `server-sdk` → `apps/server` → `services/domain/llm-router/` → 上游供应商。

详见：[data-flow-and-runtime.md](data-flow-and-runtime.md)

## 四、关键模块速览

| 模块 | 路径 | 核心职责 |
|------|------|----------|
| 聊天运行时 | `packages/core-agent/src/runtime/` | 消息队列、上下文注入、工具调用、流式响应处理 |
| 前端状态 | `packages/stage-ui/src/stores/` | chat / llm / auth / providers / consciousness / speech / hearing / kitsune-card |
| 后端服务 | `apps/server/src/` | Hono 路由、Drizzle ORM、LLM/TTS 网关、认证、Flux 计费 |
| 桌面端 | `apps/stage-tamagotchi/src/main/` | Electron 主进程、窗口管理、插件系统、MCP 管理器 |
| 角色卡 | `packages/ccc/` + `extracted-modules/airi-card.ts` | Character Card V2/V3 + Airi 扩展 |
| 人格 | `packages/kitsune-persona/SOUL.md` | 八千代人格设定 |

## 五、模块完整参考

工作区共 6 个 apps、48 个 packages、6 个 services、9 个 plugins。

详见：[module-reference.md](module-reference.md)

## 六、配置与技能规范

- `config/yachiyo/providers.yaml`：AI 模型提供商与路由
- `config/yachiyo/tools.yaml`：可用工具白名单与 schema
- `config/yachiyo/mcp.yaml`：MCP 服务器列表
- `config/yachiyo/voice-policy.yaml`：语音回复策略
- `.agents/skills/`：Vue / xsai / pnpm / unocss / eventa AI 技能规范

详见：[config-system.md](config-system.md)

## 七、技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | Vue 3 + Vite + TypeScript |
| 状态管理 | Pinia + Pinia Colada + VueUse |
| 样式 | UnoCSS（baseHue=345 粉色主题） |
| 路由 | vue-router + unplugin-vue-router |
| 桌面端 | Electron + electron-vite + injeca 依赖注入 |
| IPC/RPC | `@moeru/eventa` |
| 后端 | Hono + Drizzle ORM + PostgreSQL + Redis |
| 认证 | better-auth |
| AI 运行时 | `@kitsune/core-agent` + xsai 模型抽象 |
| 可观测性 | OpenTelemetry + `@hono/otel` |
| 包管理 | pnpm workspace + Turborepo |

## 八、常用命令

```bash
pnpm dev:web          # 启动 Web
pnpm dev:tamagotchi   # 启动桌面端
pnpm dev:server       # 启动后端
pnpm dev:ui           # 启动 UI 组件库 story
pnpm build            # 构建 packages + apps
pnpm typecheck        # 全仓库类型检查
pnpm lint             # 全仓库 lint
pnpm test:run         # 全仓库测试
```

## 九、关键认知与注意事项

- 项目采用 monorepo，大量使用 workspace 依赖，修改一个 package 后需要联动检查引用方
- 前端三端（web / pocket / tamagotchi）共享 `stage-ui`，但 tamagotchi 额外依赖 live2d/spine/three 渲染包
- `core-agent` 是平台无关的运行时，通过 Port 与 UI/存储/LLM 解耦
- `tools.yaml` 定义了非常丰富的工具能力：文件、Shell、语音、Live2D、桌面捕获、浏览器、MCP 管理、IDE 集成、监工、CLI-Anything
- 同源代码库中同时包含：前端 SPA、Electron 桌面宠物、Capacitor 移动端、Hono 后端、多个独立机器人服务、MCP 服务、插件生态
- 开发时需要注意模块边界，避免循环依赖
- 大量 packages 中已有 3 个弃用包（mcp-bridge、overseer、skills-system），改造前先确认状态

## 十、阅读优先级

### 10.1 必读（建立全局认知）

1. `README.md` — 项目定位与快速开始
2. `AGENTS.md` — AI 代理协作规范
3. `PROJECT-MAP.md` — 项目地图（非常大，建议先看目录）
4. `.ai-memory/architecture/knowledge-framework.md` — 本文件

### 10.2 理解前端入口

1. `apps/stage-web/src/main.ts`
2. `apps/stage-web/src/App.vue`
3. `apps/stage-tamagotchi/src/main/index.ts`
4. `apps/stage-tamagotchi/src/renderer/main.ts`

### 10.3 理解状态与运行时

1. `packages/stage-ui/src/stores/chat.ts`
2. `packages/stage-ui/src/stores/llm.ts`
3. `packages/stage-ui/src/stores/providers.ts`
4. `packages/core-agent/src/runtime/chat-orchestrator-runtime.ts`
5. `packages/core-agent/src/runtime/llm-service.ts`

### 10.4 理解后端

1. `apps/server/src/app.ts`
2. `apps/server/src/services/domain/llm-router/index.ts`
3. `apps/server/src/services/domain/llm-router/router.ts`
4. `apps/server/src/schemas/index.ts`

### 10.5 理解配置与扩展

1. `config/yachiyo/providers.yaml`
2. `config/yachiyo/tools.yaml`
3. `config/yachiyo/mcp.yaml`
4. `extracted-modules/README.md`
5. `packages/kitsune-persona/SOUL.md`

## 十一、知识库文件索引

| 文件 | 内容 |
|------|------|
| `.ai-memory/README.md` | 记忆库使用规范 |
| `.ai-memory/architecture/knowledge-framework.md` | 本文件：综合知识框架 |
| `.ai-memory/architecture/module-reference.md` | 所有 apps/packages/services/plugins 完整参考 |
| `.ai-memory/architecture/data-flow-and-runtime.md` | 数据流、运行时、状态管理、执行路径 |
| `.ai-memory/architecture/config-system.md` | 配置文件、AI 技能、插件、开发规范 |
| `.ai-memory/sessions/*.md` | 每次会话摘要 |
| `.ai-memory/changes/*.md` | 改动日志 |
| `.ai-memory/decisions/*.md` | 架构/设计决策记录 |
| `.ai-memory/issues/*.md` | 问题与解决方案 |

---

_本知识库会随着后续会话持续更新。最新一次更新：2026-07-02。_
