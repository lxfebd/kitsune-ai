# Kitsune AI · 开发指南（Development）

> 面向**开发者**：环境、命令、回归清单、调试。协作规范与代码风格见 [AGENTS.md](./AGENTS.md)；代码级地图见 [PROJECT-MAP.md](./PROJECT-MAP.md)。

更新：2026-09-07。

## 一、环境

- **Node + pnpm**（pnpm workspace monorepo）
- **Git**（仓库 `J:\xiangm_transfer\pet\kitsune-ai`）
- Rust（如需改动 `packages/bm25-native` napi-rs 构建）
- 桌面开发可选：`@kitsune/stage-tamagotchi` 需 Node 工具链即可（Electron 由 pnpm 管理）

## 二、安装与常用命令

### 安装

```bash
pnpm install      # 安装依赖 + postinstall 构建本地包
```

> 网络受限环境：若 pnpm 拉取失败，参考本仓库此前记录的下载方式（记忆文件 kitsune-ai-notes 有条目）。

### 启动开发

```bash
pnpm dev:tamagotchi           # 桌面桌宠（主开发目标）。注：Windows 下含 chcp 65001 保证中文日志
pnpm dev:tamagotchi:xwayland  # Linux xwayland 场景
pnpm dev:web                  # Web SPA
pnpm dev:server               # Hono 后端（网关/计费）
pnpm dev:admin                # Admin 控制台
pnpm dev:pocket:ios|android   # 移动端
```

### 校验（回归三件套，改完必跑）

```bash
# 1) 类型检查（按包）
pnpm -F @kitsune/stage-tamagotchi typecheck
pnpm -F <package.json name> typecheck        # 通用写法

# 2) 单测（Vitest；按关心模块跑，保持轻量）
pnpm -F @kitsune/overseer test               # 感知层全套（当前 45 tests）
pnpm exec vitest run <path/to/file>          # 单文件
pnpm -F @kitsune/stage-tamagotchi exec vitest run src/main/services/kitsune/overseer src/main/services/kitsune/connectors   # 编排层+连接器（当前 74 tests）

# 3) Lint
pnpm lint            # oxlint .
pnpm lint:fix        # 自动修复 + 格式化
```

### 构建 / 打包

```bash
pnpm build:tamagotchi     # Electron 应用打包（含 typecheck + electron-vite build）
pnpm build                # turbo 全量构建 packages + apps
pnpm test:run             # 全量测试（root + audio-pipelines + vishot + stage-ui）
pnpm typecheck            # 全仓 typecheck
```

## 三、常见开发流

### 改桌宠主进程（main services）

- 入口装配：`apps/stage-tamagotchi/src/main/index.ts`（injeca DI）
- services 在 `src/main/services/kitsune/*`：overseer / memory / persona / asr / tts / sidecar / connectors / desktop-automation / vision / plugins / channel-server / mcp-servers / comfyui / doctor
- **修改 CommonJS 感知层（`packages/kitsune-overseer`）或主进程服务后，需重启 Electron dev 才生效**（HMR 不会重载 .js 包）
- renderer 页面在 `src/renderer/pages`；设置布局 `src/renderer/layouts/settings.vue`

### 加一个新被监控工具

1. `config/overseer.yaml` 的 `tools[]` 加条目（supervisor 按 tools 实例化 monitors）
2. 感知层 `packages/kitsune-overseer/src/` 新增/复用 Monitor（参考 `zcodeMonitor.js`：可注入 `agentsRoot`、`_analyzeActivity`、`_suggestPetReaction` 带 `activity`）
3. 编排层 `mapReactionToEvent`（`apps/stage-tamagotchi/src/main/services/kitsune/overseer/index.ts`）确认 activity 映射为可推送事件
4. 若映射结果不在白名单：`eventSchema.ts` 的 `PUSHABLE_EVENTS` 加类型
5. 回归：overseer 45 + 编排层 74 + typecheck + 实机日志验证

### 调试归零清单（遇到"看不到任务"类问题）

1. 确认最新 transcript 在 **60s 新鲜度窗口**内（`~/.zcode/cli/agents/` 下 mtime）
2. 查主进程日志 `handleEvent` 行：`result:"pushed"` 才是推送到 renderer；`filtered` 看了 `action`（`status_update` 为设计行为）
3. 感知层反应日志前缀 `[监工] 桌宠反应: [zcode] …` —— 若无该行，monitor 端就没检测到活动
4. 单测复现（先写失败的测试再改生产代码，AGENTS.md 硬性要求）

## 四、测试与质量规范（摘录自 AGENTS.md，必须遵守）

- 每个被调查的 bug：**先写测试复现，再改生产代码**；复现测试里带 issue 号/报告链接注释
- Mock IPC/services 用 `vi.fn`/`vi.mock`；**不要**依赖真实 Electron runtime
- 不要用 mock、hoisting、`as unknown as` 绕过真实 import 问题——先查包 exports / 循环依赖 / 类型边界
- 不要测试"不可能运行到的状态"、不要 mock `globalThis` 硬编码

## 五、回归清单（Release 前）

- [ ] `pnpm -F @kitsune/overseer test` 绿（45）
- [ ] `pnpm -F @kitsune/stage-tamagotchi exec vitest run src/main/services/kitsune/overseer src/main/services/kitsune/connectors` 绿（74）
- [ ] `pnpm -F @kitsune/stage-tamagotchi typecheck` exit 0
- [ ] 实机 `pnpm dev:tamagotchi` 启动，主链路走通（桌宠启动/对话/任务面板）
- [ ] 需要的模块同时跑 `pnpm exec vitest run <module path>`（如 stage-ui、packages/ui）
- [ ] `pnpm lint` 无新增 error
- [ ] 更新 [TODO.md](./TODO.md) 与 [MODULES.md](./MODULES.md) 模块台账

## 六、服务端与集成

- `apps/server`（Hono）：`pnpm dev:server`；路由 openai/providers/chats/characters/stripe/flux/voice-packs/admin
- `packages/server-runtime` + `better-ws`：**WS 6121** 通道；`integrations/*` 均走该协议
- 本地跑 server 需要 mock PG wire-server + 本地 Redis（无 Docker 环境的实机启动方案见记忆文件 server-mock-pg-redis）
- `integrations/intellij-kitsune` 构建需 **Gradle 9.7.1**（详见记忆 intellij-kitsune-build）