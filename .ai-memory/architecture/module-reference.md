# 模块完整参考

> 本文档列出 yachiyo-airi 工作区中所有 apps、packages、services、plugins 的完整信息，供快速查阅。

## Apps

| 包名 | 路径 | 描述 | 关键脚本 |
|------|------|------|----------|
| @kitsune/component-calling | apps/component-calling | Realtime audio | dev, build, typecheck, preview |
| @kitsune/server | apps/server | Hono 后端：认证、计费、聊天同步、网关转发、可观测性 | dev, build, typecheck, start |
| @kitsune/stage-pocket | apps/stage-pocket | Kitsune AI 移动端（Capacitor） | dev:web, build, typecheck, preview |
| @kitsune/stage-tamagotchi | apps/stage-tamagotchi | Kitsune AI Electron 桌面宠物 | dev, build, typecheck, start |
| @kitsune/stage-web | apps/stage-web | LLM powered virtual character（Web 主入口） | dev, build, typecheck, preview |
| @kitsune/ui-admin | apps/ui-admin | Kitsune 管理后台 | dev, build, typecheck, preview |

### App 依赖关系

- `stage-web`、`stage-pocket`、`stage-tamagotchi` 均依赖 `packages/stage-ui`
- `stage-tamagotchi` 额外依赖 `stage-ui-live2d`、`stage-ui-spine`、`stage-ui-three`、`plugin-sdk-tamagotchi`
- `server` 依赖 `server-schema`、`server-sdk-shared`
- 前端应用通过 `server-sdk` 访问后端

## Packages

| 包名 | 路径 | 描述 | 状态 |
|------|------|------|------|
| @kitsune/audio | packages/audio | 音频编码/处理工具 | 活跃 |
| @kitsune/audio-pipelines-transcribe | packages/audio-pipelines-transcribe | 音频转录 pipeline | 活跃 |
| @kitsune/better-ws | packages/better-ws | 传输无关的可靠 WebSocket 运行时原语 | 活跃 |
| @kitsune/cap-vite | packages/cap-vite | 启动 Vite dev server 并运行 Capacitor live reload 的 CLI | 活跃 |
| @kitsune/ccc | packages/ccc | Character Card 标准处理（导入/导出/转换） | 活跃 |
| @kitsune/core-agent | packages/core-agent | 平台无关的聊天编排运行时 | 活跃 |
| @kitsune/core-character | packages/core-character | 角色 pipeline 编排（分段、情绪、延迟、可选 TTS） | 活跃 |
| @kitsune/electron-eventa | packages/electron-eventa | Electron IPC 共享 Eventa 契约 | 活跃 |
| @kitsune/electron-screen-capture | packages/electron-screen-capture | 屏幕捕获 | 活跃 |
| @kitsune/electron-vueuse | packages/electron-vueuse | Electron 应用的 VueUse 风格 composables | 活跃 |
| @kitsune/font-chillroundm | packages/font-chillroundm | 寒蝉半圆体字体 CSS | 活跃 |
| @kitsune/font-cjkfonts-allseto | packages/font-cjkfonts-allseto | 全瀨體字体 CSS | 活跃 |
| @kitsune/font-departure-mono | packages/font-departure-mono | Departure Mono 字体 CSS | 活跃 |
| @kitsune/font-xiaolai | packages/font-xiaolai | 小赖字体 CSS | 活跃 |
| @kitsune/i18n | packages/i18n | 国际化资源与工具 | 活跃 |
| @kitsune/emotion-mapper | packages/kitsune-emotion-mapper | 语义情绪映射 emotion -> expression + parameters | 活跃 |
| @kitsune/mcp-bridge | packages/kitsune-mcp-bridge | MCP 协议桥接（已弃用，无引用方） | 弃用 |
| @kitsune/overseer | packages/kitsune-overseer | 监工系统（已弃用，无入口文件；JS 已移至根 `_dead_overseer_js_2026-08-07/`） | 弃用 |
| @kitsune/persona | packages/kitsune-persona | 八千代人格系统（SOUL.md / IDENTITY.md / persona.yaml） | 活跃 |
| @kitsune/screenshot | packages/kitsune-screenshot | 截图编排 CLI | 活跃 |
| @kitsune/skills-system | packages/kitsune-skills-system | 技能系统（已弃用，无入口文件） | 弃用 |
| @kitsune/tts-hybrid | packages/kitsune-tts-hybrid | 混合 TTS：云端 + 本地 GPU | 活跃 |
| @kitsune/model-driver-lipsync | packages/model-driver-lipsync | 口型同步模型驱动 | 活跃 |
| @kitsune/model-driver-mediapipe | packages/model-driver-mediapipe | MediaPipe 动作捕捉实验 | 活跃 |
| @kitsune/pipelines-audio | packages/pipelines-audio | 音频 pipeline：采集、VAD、编码、流式 | 活跃 |
| @kitsune/plugin-protocol | packages/plugin-protocol | 插件协议事件定义与共享 WebSocket 类型 | 活跃 |
| @kitsune/plugin-sdk | packages/plugin-sdk | 插件 SDK | 活跃 |
| @kitsune/plugin-sdk-tamagotchi | packages/plugin-sdk-tamagotchi | Tamagotchi 插件 DX 辅助 | 活跃 |
| @kitsune/scenarios-stage-tamagotchi-browser | packages/scenarios-stage-tamagotchi-browser | 浏览器场景截图 | 活跃 |
| @kitsune/scenarios-stage-tamagotchi-electron | packages/scenarios-stage-tamagotchi-electron | Electron 场景截图 | 活跃 |
| @kitsune/server-runtime | packages/server-runtime | 多环境运行的服务端运行时实现 | 活跃 |
| @kitsune/server-schema | packages/server-schema | 共享 Drizzle ORM schema | 活跃 |
| @kitsune/server-sdk | packages/server-sdk | 前端访问后端的 SDK | 活跃 |
| @kitsune/server-sdk-shared | packages/server-sdk-shared | 服务端与 SDK 共享的事件契约 | 活跃 |
| @kitsune/server-shared | packages/server-shared | 服务端共享类型与工具 | 活跃 |
| @kitsune/stage-layouts | packages/stage-layouts | 共享布局组件 | 活跃 |
| @kitsune/stage-pages | packages/stage-pages | 共享页面组件 | 活跃 |
| @kitsune/stage-shared | packages/stage-shared | 跨 stage 共享常量与工具 | 活跃 |
| @kitsune/stage-ui | packages/stage-ui | 前端共享核心（stores / components / composables） | 活跃 |
| @kitsune/stage-ui-live2d | packages/stage-ui-live2d | Live2D 场景组件 | 活跃 |
| @kitsune/stage-ui-spine | packages/stage-ui-spine | Spine 2D 场景组件 | 活跃 |
| @kitsune/stage-ui-three | packages/stage-ui-three | Three.js 3D 场景组件 | 活跃 |
| @kitsune/stream-kit | packages/stream-kit | 队列与流式工具 | 活跃 |
| @kitsune/ui | packages/ui | 基础 UI 组件库（基于 reka-ui） | 活跃 |
| @kitsune/ui-loading-screens | packages/ui-loading-screens | 加载屏幕组件 | 活跃 |
| @kitsune/ui-transitions | packages/ui-transitions | 过渡动画组件 | 活跃 |
| @kitsune/unocss-preset-fonts | packages/unocss-preset-fonts | UnoCSS 字体预设 | 活跃 |
| @kitsune/vishot-runner-browser | packages/vishot-runner-browser | Vishot 浏览器截图 runner | 活跃 |
| @kitsune/vishot-runner-electron | packages/vishot-runner-electron | Vishot Electron 截图 runner | 活跃 |
| @kitsune/vishot-runtime | packages/vishot-runtime | Vishot 截图运行时契约与 Vue 绑定 | 活跃 |

## Services

> 本备份（`agentpet-backup`）中 `services/` 实际仅含以下 3 个。下方「文档历史记录」一栏列出 `module-reference.md` 早期版本（2026-07-02 读取各包 package.json 整理时）还记载、但当前目录中不存在的服务，待与线上仓库核实是服务被移除还是备份不全。

| 包名 | 路径 | 描述 |
|------|------|------|
| @kitsune/computer-use-mcp | services/computer-use-mcp | macOS 桌面编排 MCP 服务（观察、截图、控制、终端、浏览器 DOM） |
| @kitsune/discord-bot | services/discord-bot | Discord 机器人 |
| @kitsune/minecraft-bot | services/minecraft | 基于 Mineflayer 的 Minecraft 智能体（计划迁移至 Fabric mod） |

文档历史记录、本备份中缺失的服务（待核实）：

| 历史包名 | 历史路径 | 说明 |
|------|------|------|
| @kitsune/satori-bot | services/satori-bot | Satori 协议适配器，连接多聊天平台 |
| @kitsune/telegram-bot | services/telegram-bot | Telegram 机器人 |
| @kitsune/twitter-services | services/twitter-services | Twitter MCP 服务 |
| @kitsune/ai-hub | services/ai-hub | AI 服务聚合（仅 knowledge-framework.md 提及） |

## Plugins

> 本备份中 `plugins/` 下仅 `plugins/default/` 与 `plugins/yachiyo/` 两个**空目录**（git 未跟踪任何插件，全仓库无 `plugin.yaml` / `.petplugin`）。早期版本（2026-07-02）记载的下表插件在本备份中均不存在，待与线上仓库核实。

| 历史插件 | 历史路径 | 描述 |
|------|------|------|
| comfyui | plugins/yachiyo/comfyui | ComfyUI 集成插件 |
| tts | plugins/yachiyo/tts | TTS sidecar 插件 |
| local-llm | plugins/yachiyo/local-llm | 本地 LLM 插件 |
| weather-adapter | plugins/yachiyo/weather-adapter | 天气适配器 |
| git-visualizer | plugins/yachiyo/git-visualizer | Git 可视化 |
| example-adapter | plugins/yachiyo/example-adapter | 示例适配器 |
| coview-desktop | plugins/yachiyo/coview-desktop | 桌面协同查看 |
| cli-anything | plugins/yachiyo/cli-anything | CLI-Anything Hub 桥接 |
| ai-monitor | plugins/kitsune-plugin-ai-monitor | AI 监控插件 |

## 关键外部依赖

| 依赖 | 用途 |
|------|------|
| Vue 3 | 前端框架 |
| Vite | 构建工具 |
| Pinia / Pinia Colada | 状态管理 |
| VueUse | 组合式工具 |
| UnoCSS | 原子 CSS |
| xsai / @xsai/* | OpenAI-compatible LLM 运行时 |
| Hono | 后端框架 |
| Drizzle ORM | 数据库 ORM |
| better-auth | 认证 |
| Electron / electron-vite | 桌面端 |
| injeca | 依赖注入 |
| @moeru/eventa | IPC/RPC |
| OpenTelemetry | 可观测性 |

## 已弃用 / 缺失模块

以下模块在 package.json 中标记为无引用方或缺少入口文件，后续改造时优先排查：

- `@kitsune/mcp-bridge`（packages/kitsune-mcp-bridge）—— 无引用方
- `@kitsune/overseer`（packages/kitsune-overseer）—— 无入口文件，运行时 JS 已于 2026-08-07 移至根 `_dead_overseer_js_2026-08-07/`（对应 commit `c51e17c`）
- `@kitsune/skills-system`（packages/kitsune-skills-system）—— 无入口文件
- `services/minecraft` 的 Mineflayer 运行时—— 计划迁移到 Fabric mod

> 2026-08-10 核对补充：`packages/` 实有 **51** 个目录（早期版本称 48）。早期表格曾列出 `@kitsune/settings-ui`（packages/kitsune-ui）与 `@kitsune/memory-pgvector`（packages/memory-pgvector）两个包，但本备份中两者均**不存在**，已从上表移除——待与线上仓库核实是已被删/改名还是备份不全。
