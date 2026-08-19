# Kitsune AI（灵狐）

> A local-first AI desktop companion that **listens, speaks, performs** — and can hand off real work to Claude · Trae · Cursor · Codex · OpenCode.

`Local ASR + TTS` · `Overseer AI orchestration` · `Live2D stage` · `Computer Use` · `Web / Mobile / Desktop / Admin`

[![license MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE) · [![workspace](https://img.shields.io/badge/workspace-pnpm%20%2B%20turbo-orange)](./package.json) · [![stack](https://img.shields.io/badge/stack-Vue3%20%2B%20Electron%20%2B%20Hono-8A2BE2)](./package.json)

---

## 1 · What is Kitsune

Kitsune is a **desktop AI companion** built on Vue 3 + Electron, front-ended by the Live2D character **Yachiyo·Airi**, and backed by a full runtime: on-device speech, an **Overseer** that watches and orchestrates other coding agents, cross-platform **computer use**, memory & persona, and Web / Mobile / Admin frontends.

It is a **community fork and enhancement** of the open-source [`moeru-ai/airi`](https://github.com/moeru-ai/airi) (Project AIRI, MIT). All upstream attribution is preserved under [`LICENSE`](./LICENSE). We deliberately do **not** call this an "original framework" — it is a personal, opinionated, product-grade build **on top of** that open kernel.

### Highlights

- 🔒 **Local-first voice** — ASR fully on-device via Sherpa-onnx (SenseVoice / Paraformer) with an in-browser Whisper fallback; TTS via GPT-SoVITS / Genie-TTS sidecars plus Vox-CPM2, with cloud (Qwen3 / Azure / DashScope / Volcano) as optional routing.
- 🧑‍💻 **Overseer** — continuously monitors Claude Code, Trae, Cursor, Codex, OpenCode, Windsurf, Lobster; on task failure it reacts → authorizes → re-executes and **auto-fixes** through a closed loop: CLI spawn · IDE connector (WebSocket) · desktop automation.
- 🎭 **A living character** — Live2D emote / mouth-sync / breathe / eye-tracking / beat-sync, simulated even in browser preview.
- 🖱 **Computer use** — cross-platform mouse / keyboard / window automation with visual element location; desktop capture + MCP bridge; browser control & search via Puppeteer / Bing-Fetch MCP.
- 🧠 **Remembers you** — local BM25 memory (short + long term), a persona engine, and open-format Character Cards.
- 🫡 **Self-managing** — the agent can switch models, personas, install plugins, and attach MCP servers on its own.
- 🌐 **Multi-surface** — desktop app, Web SPA, Capacitor mobile, and an admin console share one runtime and server channel.

---

## 2 · Architecture (simplified)

```
 Renderer (Vue)                  External AI coding tools
   Live2D · Chat · Settings        Claude · Trae · Cursor
   Tools (MCP bridge)              Codex · OpenCode · Windsurf
        │ IPC / Eventa                    ▲
 Main (Electron)  ─────────────►  Overseer
   Overseer · Persona               monitor → filter → authorize
   Memory · Sidecars                → rebuild → verify loop
   ASR/TTS/ComfyUI
        │ WebSocket · server-sdk
 apps/server (Hono)
   OpenAI gateway · Billing · LLM/TTS multi-upstream router
   key rotation · concurrency · tracing
```

---

## 3 · Quick start

```bash
pnpm install             # install + build local packages
pnpm dev:tamagotchi      # launch the Electron desktop companion
pnpm dev:web             # Web SPA in the browser
pnpm dev:server          # Hono backend (OpenAI gateway, billing)
```

Prerequisites: Node + pnpm. Local ASR / TTS pull on-device models on first run.

<details><summary>快速开始（中文）</summary>

```bash
pnpm install             # 安装依赖并构建本地包
pnpm dev:tamagotchi      # 启动 Electron 桌面桌宠
pnpm dev:web             # 浏览器打开 Web SPA
pnpm dev:server          # 启动 Hono 后端（OpenAI 网关 / 计费）
```

前置：Node + pnpm。本地 ASR / TTS 首次运行会按需拉取本地模型。

</details>

---

## 4 · Feature map（功能地图）

| Area | Delivered |
| --- | --- |
| Stage / rendering | Live2D + three.js + spine; 15 desktop windows; cursor-follow & window-snap |
| Speech (local) | Sherpa-onnx ASR (SenseVoice / Paraformer); GPT-SoVITS + Genie-TTS sidecars; Vox-CPM2 lip-sync |
| AI orchestration | Overseer monitor → authorize → execute → visual verify → auto-fix (CLI / IDE connector / desktop) |
| Computer use | Desktop automation (mouse/keyboard/window + vision); computer-use MCP; desktop capture overlay |
| Web & search | Browser control + search via Puppeteer / Bing-Fetch MCP; fetch / shell / filesystem tools |
| Agent capability | Agent-API push to cloud_code / opencode; self-manage model / persona / plugin / MCP / overseer |
| Memory & persona | BM25 short+long-term memory; persona config/profile/state/context; Character Cards |
| Multi-surface | `stage-web` SPA · `stage-pocket` mobile · `ui-admin` console · `stage-tamagotchi` desktop |
| Server | Hono OpenAI gateway + LLM/TTS router (key rotation, concurrency ledger, fallback, OTel) + Stripe/billing |
| Quality | 200+ test files; typecheck / lint gates; CI on GitHub Actions |

---

## 5 · Branding & provenance（品牌与出处）

- **Upstream / 官方上游**: [`moeru-ai/airi`](https://github.com/moeru-ai/airi) — *Project AIRI*, the official project this fork is built on.
- **Rebrand / 本项目品牌**: *Kitsune / Kitsune AI*（灵狐）。
- **Character / 角色**: *Yachiyo·Airi* — a name chosen by this project for its front-end Live2D companion.
- **Relationship**: a community-maintained enhancement of the AIRI scaffolding, kept MIT-compatible and attribution-preserving.

Compared with the upstream scaffolding, Kitsune adds the pieces a real desktop companion needs to feel finished:

- An **Overseer** closed loop that turns passive agent-monitoring into a capable task orchestrator.
- A **local-first** speech stack wired end-to-end (Sherpa-onnx + GPT-SoVITS / Genie-TTS sidecars), usable offline.
- **Persona + memory + self-management** so the agent can adjust its own configuration instead of only responding.
- Cross-platform **computer use** plus a Puppeteer / Fetch MCP toolset for real web work.
- Web, Mobile and Admin frontends wired to the same server channel, guarded by a large test suite.

---

## 6 · Roadmap — future direction（未来推进方向）

> Beijing-first product thinking: keep the core desktop loop stable, then expand outward. Directions are grouped by horizon; each item lists *why*, *what*, and a rough *acceptance* so contributors and PR authors know what "done" means.

### 🟢 Now — 加固与出让（upstream-ready 基础）

The project is feature-complete for a personal desktop companion. Before inviting forks & PRs we need **hygiene and releaseability**:

| # | 方向 / Task | 推进理由 Why | 验收 Done |
| --- | --- | --- | --- |
| 1 | **Git 历史整理**：清理未跟踪/未提交产物（`diag-*.mjs`、截图、`coverage/`、`.ai-memory/`、空 `patches/`），按模块拆分提交 | 关系到上交 GitHub 的代码库状态清晰度，他人 fork/PR 的第一步 | 仓库仅保留源码、文档与配置，`git status` 干净，提交信息遵循 Conventional Commits |
| 2 | **内置 `browser.*` / `web_search` 工具适配器** | 当前 Web/搜索工具走 MCP 服务器，缺内置实现就无法开箱即用，也会让 fork 者困惑 | 提供与工具声明同名、不依赖外部 MCP 的本地适配器 + 单测 |
| 3 | **安装包分发**：填充 `electron-builder.config.ts` 的发布 `owner`/`repo`，接入 GitHub Actions 自动发布 + 自动更新 | 桌面安装包是"获得别人试用"的门槛；`electron-updater` 已就绪 | 一键产出 Win/macOS/Linux 安装包，CI 自动生成 Release 与更新 feed |
| 4 | **路径清理**：把残留绝对资源路径（如 `G:/agentpet/...`）改为 `userData` / `process.resourcesPath` | 打包后固定路径会导致模型/资源读取失败，直接影响体验 | 无硬编码绝对路径，打包产物可换机运行 |
| 5 | **文档对齐**：README / AGENTS 与实际结构一致（去掉不存在的 `extracted-modules/` 等引用） | 他人 fork 时依据文档行动，失真的文档是最大的误导 | 文档中每个被引用路径都真实存在 |

### 🟡 Next — 体验闭环（desktop loop → 可玩性）

| # | 方向 / Task | 推进理由 Why | 验收 Done |
| --- | --- | --- | --- |
| 6 | **离线 → 联网的渐进式语音**：把 Whisper 兜底与本地 ASR 统一为"自动降级"策略 | 增加断网/低配机可用性，减少首启动模型下载挫败感 | 自适应设备算力自动选择 ASR/TTS 引擎，并给出清晰进度 |
| 7 | **Character ecosystem**：角色卡导入/导出的完善、一键打包 `Live2D 模型 + 声线 + 人格` | 用户自建角色是桌宠类产品的核心粘性 | `.zip` 角色包一键导入导出，模型/声线/人格随包走 |
| 8 | **窗口/舞台打磨**：多显示器、任务栏吸边、开机自启、系统托盘 | 桌宠的"存在感"依赖系统集成 | 常见桌面场景（多屏/托盘/随系统）稳定 |
| 9 | **Overseer 任务可视化**：任务面板展示 监控→授权→执行→校验 的实时状态与失败原因 | 编排层已是差异化亮点，需要可观测性才能让用户信任 | 前端任务列表含每个阶段的耗时与错误详情 |

### 🔵 Later — 平台化与规模化（toward a community project）

| # | 方向 / Task | 推进理由 Why | 验收 Done |
| --- | --- | --- | --- |
| 10 | **可选的云记忆同步（显式 opt-in）** | 多设备续聊是长期价值，但须尊重隐私、默认离线 | 仅在用户显式开启时上传，附加密与删除机制 |
| 11 | **插件协议开放**：正式化 `plugins/` 与 MCP 生态，形成可安装的市场/索引 | 让第三方能为此项目开发扩展，是社区化的关键 | 有最小插件示例 + 文档 + 版本化协议 |
| 12 | **服务端治理**：账号/OIDC（当前为 no-op stub）、计费可视化、多租户 | 若走向多人/商业化需要可靠的身份与账务 | auth 真正可用，计费面板与 Stripe 打通 |
| 13 | **游戏/仿真舞台**：对齐上游 `services/*`（如 minecraft）与 Godot 舞台 | 把桌宠从"聊天陪伴"推向"会玩"的虚拟存在 | 可连通的游戏 agent 舞台 demo |
| 14 | **i18n & 多语言文档**：接入上游 Crowdin 翻译流 | 扩大海外 echo 与贡献者规模 | 英文之外的 3+ 语言 docs 由社区维护 |

### 🤝 Contributor / fork guidance（如何参与）

- **遵循仓库约定**：见 [AGENTS.md](./AGENTS.md)（技术栈、命名、测试、提交规范）。
- **PR 门禁**：`pnpm typecheck` · `pnpm lint` · `pnpm test:run` 全绿；提交遵循 [Conventional Commits](.github/CONTRIBUTING.md)。
- **从哪开始**：入门友好项 = `#6` 渐进式语音、`#8` 窗口打磨、`#14` 翻译；需要架构共识的 = `#11` 插件协议。
- **keep upstream in mind**：凡改动公共能力，先对照 [`moeru-ai/airi`](https://github.com/moeru-ai/airi) 现状，避免重复造轮子；适合回馈上游的修复可单独向官方提。

---

## 7 · Docs & contributing（文档与贡献）

- [AGENTS.md](./AGENTS.md) — repository guide & conventions
- [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md) — contribution guide (commit conventions / PR checklist)
- [LICENSE](./LICENSE) — MIT

---

## License / 许可证

MIT License · see [LICENSE](./LICENSE). This repository retains the upstream copyright of `moeru-ai/airi`; all third-party notices must be kept with any redistribution.