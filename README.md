<h1 align="center">Kitsune AI（灵狐）</h1>

<p align="center">全栈 AI 桌宠 / 角色对话平台</p>

---

## 简介

Kitsune AI 是一个全栈 AI 桌宠与角色对话平台，支持 Web、移动端和桌面端，围绕角色卡、Live2D 渲染、多模型对话与语音合成构建。

### 核心能力

- **角色卡** - 基于 Character Card 标准扩展的人设与模块配置（意识 / 视觉 / 语音 / Live2D / 艺术性）
- **多入口** - Web (`stage-web`)、移动 (`stage-pocket`)、桌面 (`stage-tamagotchi`)、管理后台 (`ui-admin`)
- **对话运行时** - `packages/core-agent` 提供的平台无关聊天编排、上下文注册表与工具调用
- **模型网关** - `apps/server` 内置 LLM/TTS 多上游路由、密钥轮换、负载均衡
- **Live2D 渲染** - 浏览器/WebGL 模型加载、表情/动作/眼动追踪、OPFS 缓存
- **语音** - 云端 TTS API + 浏览器本地 + Electron sidecar 本地推理
- **机器人** - Satori / Discord / Telegram / Minecraft 独立服务接入同一运行时
- **插件** - Electron 桌面端 `.petplugin` 插件包与 sidecar 生命周期管理

## 技术栈

- **前端**: Vue 3 + Vite + TypeScript + Pinia + VueUse + UnoCSS
- **桌面端**: Electron + injeca 依赖注入 + `@moeru/eventa` IPC/RPC
- **后端**: Hono + Drizzle ORM + PostgreSQL + Redis
- **AI 运行时**: `packages/core-agent` + xsai 模型抽象
- **包管理**: pnpm workspace + Turborepo

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动 Web 开发服务器
pnpm dev:web

# 启动桌面端
pnpm dev:tamagotchi

# 启动后端
pnpm dev:server
```

## 项目结构

```
yachiyo-airi/
├── apps/
│   ├── server/              # Hono 后端服务
│   ├── stage-web/           # Web SPA
│   ├── stage-pocket/        # Capacitor 移动端
│   ├── stage-tamagotchi/    # Electron 桌面端
│   └── ui-admin/            # 管理后台
├── packages/
│   ├── core-agent/          # 聊天编排运行时
│   ├── stage-ui/            # 前端共享 stores / 组件
│   ├── stage-pages/         # 页面级组件
│   ├── stage-layouts/       # 布局组件
│   ├── stage-shared/        # 共享工具与常量
│   ├── server-sdk/          # 前后端通信 SDK
│   ├── server-schema/       # 共享数据库 schema
│   ├── ui/                  # 基础 UI tokens
│   └── i18n/                # 国际化
├── services/                # 独立机器人服务
├── extracted-modules/       # 通用能力模块（意识 / 语音 / 听觉 / 角色卡 / Live2D）
├── plugins/yachiyo/tts/     # TTS sidecar 插件
└── docs/                    # 用户文档与开发文档
```

## 文档索引

- [PROJECT-MAP.md](./PROJECT-MAP.md) - 项目地图：代码链路 + 三省六户职能划分
- [AGENTS.md](./AGENTS.md) - 开发规范与代码贡献指南
- [NOTICE.md](./NOTICE.md) - 项目声明与许可证
- [THIRD_PARTY_NOTICES](./THIRD_PARTY_NOTICES) - 第三方代码致谢

## 许可证

MIT License - 见 [LICENSE](./LICENSE) 文件
