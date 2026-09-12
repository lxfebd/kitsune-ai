# Kitsune AI · 项目整体说明（Project Overview）

> 本文档回答「这个项目是什么、解决什么问题、由哪些部分组成」。面向新加入者与协作者。
> 深度的代码级说明见 [PROJECT-MAP.md](./PROJECT-MAP.md)；协作规范见 [AGENTS.md](./AGENTS.md)；使用者操作见 [user-guide.md](./user-guide.md)。

更新：2026-09-07。

## 是什么

**Kitsune AI（灵狐）** 是一个本地优先的 AI 桌宠桌面应用：一只会**听、说、做事**的 Live2D 角色（八代·Airi），不仅能陪你聊天，还能**真实地接管 Claude / Trae / Cursor / Codex / OpenCode / ZCode 等编码工具的干活过程**——监控它们的任务、在失败时授权重试、自动修复闭环。

它是开源项目 [moeru-ai/airi](https://github.com/moeru-ai/airi)（Project AIRI，MIT）的社区 fork 与增强，所有上游署名保留在 [LICENSE](./LICENSE)。我们不称它为"原创框架"——它是建立在该开放内核之上的一套有主见的、产品级的构建。

## 核心能力

| 能力 | 说明 | 关键位置 |
|---|---|---|
| **本地语音** | ASR 全本地（Sherpa-onnx，SenseVoice/Paraformer，浏览器 Whisper 兜底）；TTS 走 GPT-SoVITS / Genie-TTS sidecar + Vox-CPM2，云端 Qwen3/Azure/DashScope/火山 可选路由 | `apps/stage-tamagotchi/src/main/services/kitsune/{asr,tts,sidecar}` |
| **Overseer 编排** | 持续监控编码 agent（Claude Code、Trae、Cursor、Codex、OpenCode、Windsurf、Lobster、ZCode）；任务失败时 反应 → 授权 → 重执行 → 自动修复 闭环 | `packages/kitsune-overseer`（感知层）+ `apps/stage-tamagotchi/src/main/services/kitsune/overseer`（编排层） |
| **Live2D 舞台** | 表情/口型同步/呼吸/视线追踪/节拍同步，浏览器预览也可模拟 | `packages/stage-ui-live2d`、`packages/stage-ui-pixi` |
| **Computer Use** | 跨平台鼠标/键盘/窗口自动化 + 视觉元素定位；桌面采集 + MCP bridge；浏览器控制与搜索 | `packages/computer-use-mcp` 等 |
| **记忆与人格** | 本地 BM25 记忆（短期+长期）、人格引擎、开放格式 Character Card | `packages/bm25-native`、`packages/core-character` |
| **多端** | 桌面（Electron）、Web SPA、Capacitor 移动端、Admin 控制台，共享一套 runtime 与服务通道 | `apps/stage-tamagotchi`、`apps/stage-web`、`apps/stage-pocket`、`apps/ui-admin` |

## 技术栈（按表面）

- **桌面 `apps/stage-tamagotchi`**：Electron 41 + Vue 3 + Vite + TypeScript + Pinia + VueUse + Eventa（IPC/RPC）+ UnoCSS + Vitest
- **Web `apps/stage-web`** / **移动 `apps/stage-pocket`**：Vue 3 + Vite + TS + Pinia + UnoCSS；移动端另加 Kotlin/Swift/Capacitor
- **服务端 `apps/server`**：Hono —— OpenAI 网关、计费、LLM/TTS 多上游路由、key 轮换、并发与链路追踪
- **共享包**：`packages/stage-ui`（业务组件/composables/stores 核心）、`packages/stage-ui-*`（渲染）、`packages/stage-shared`、`packages/ui`（reka-ui 基础原语）、`packages/i18n`（集中翻译）、`packages/server-*`（服务通道）

> 历史说明：早期桌面端曾用 Tauri（`crates/`），当前桌面端统一为 Electron。

## Monorepo 组成（概览）

```
apps/        6 个应用：stage-tamagotchi / stage-web / stage-pocket / ui-admin / server / component-calling
packages/    50 个共享包：stage-ui 系列 / ui / i18n / kitsune-overseer / bm25-native / server-* 等
services/    3 个服务（含 server-runtime：WS 6121）
integrations/  IDE 连接器（vscode-kitsune / vscode-kitsune-trae / intellij-kitsune / airi-plugin-*），全部走 6121 WS 协议
engines/     （模型运行时等引擎）
plugins/     运行时插件体系（@kitsune/plugin-sdk）
config/      工程配置
docs/        附加文档（archify 架构图等）
```

## 与其它文档的关系

| 文档 | 回答的问题 |
|---|---|
| [README.md](./README.md) | 面向公众的介绍、快速开始、Roadmap、Changelog |
| [project-overview.md](./project-overview.md)（本文） | 项目是什么、组成、与其他文档的索引 |
| [architecture.md](./architecture.md) | 分层架构、数据流、核心链路 |
| [AGENTS.md](./AGENTS.md) | AI 协作者进入项目必须先读的规范：技术栈、目录职责、命令、最佳实践 |
| [PROJECT-MAP.md](./PROJECT-MAP.md) | 代码级地图：核心链路逐行说明、目录职责、阅读建议、已知文档缺口 |
| [DESIGN.md](./DESIGN.md) | 视觉规则：主题、字体、组件样式约定 |
| [TODO.md](./TODO.md) | 当前任务、优先级与开发进度（含 MODULES.md 模块化台账索引） |
| [user-guide.md](./user-guide.md) | 面向使用者的功能说明 |
| [development.md](./development.md) | 开发方式、命令、回归清单 |
| [component-api.md](./component-api.md) | 组件 API 索引与契约 |
| [MODULES.md](./MODULES.md) | 模块化改进台账（6 大模块审计/修复/验收记录） |
