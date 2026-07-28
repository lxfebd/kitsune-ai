# 配置系统

> 本文档描述 Kitsune AI 的配置文件、AI 技能规范、插件配置和开发规范。

## 一、YAML 配置（config/yachiyo/）

| 文件 | 用途 | 关键内容 |
|------|------|----------|
| `providers.yaml` | AI 模型提供商与路由 | active_provider、providers 列表、router 规则 |
| `tools.yaml` | 可用工具白名单与定义 | allow/deny、每个工具的 schema、安全沙箱、IDE/MCP/admin/cli-hub 工具 |
| `skills.yaml` | 技能加载与触发 | entries、limits、trigger 策略 |
| `mcp.yaml` | MCP 服务器列表 | shell、puppeteer、filesystem、bing-search、github、sqlite、memory、fetch |
| `voice-policy.yaml` | 语音回复策略 | auto_reply、must_speak_if、may_speak_if、must_not_speak_if、limits |
| `live2d-presets.yaml` | Live2D 表情/手势/反应预设 | emote、gesture、react 映射 |
| `desktop-live2d.json` | 桌面 Live2D 运行时配置 | — |

### 1.1 providers.yaml 关键配置

- `active_provider: xiaomi-claude`
- 支持：local（llamafile）、xiaomi-claude、xiaomi-mimo、nvidia-nim、qwen、qwen3_tts
- `router.mode: auto`，`default_route: cloud`
- `local_max_tools: 10`（超过则路由到云端）

### 1.2 tools.yaml 关键工具分类

| 类别 | 代表工具 |
|------|----------|
| 基础 | get_time, add, echo |
| 记忆 | memory_write, memory_search |
| 文件 | workspace.write_file, edit_file, file_read, file_list, file_info |
|  Shell | shell.exec, shell.approve |
| 语音 | voice.tts_aliyun_vc, voice.tts_cosyvoice2, voice.asr_aliyun, voice.asr_dispatch |
| Live2D | live2d.param.set, live2d.motion.play, live2d.expression.set, live2d.emote, live2d.gesture, live2d.react |
| 桌面 | desktop.capture.*, desktop.displays.list, desktop.windows.list |
| 浏览器 | browser.navigate, browser.evaluate, browser.screenshot |
| 技能 | web_search, image_gen, translate |
| 系统管理 | admin.model_provider, admin.persona, admin.plugin, admin.mcp_server |
| IDE 集成 | ide.parse, ide.convert_prompt, ide.submit, ide.task_status, ide.cancel_task |
| 监工 | overseer_toggle, overseer_status, overseer_tool_status, overseer_stats |
| CLI-Anything | cli-hub.list, cli-hub.search, cli-hub.install, cli-hub.invoke, cli-hub.skill |

安全策略：
- `exec.security: sandbox`
- `safeBins` 白名单包含 git、node、pnpm、python、docker 等
- `timeoutSec: 60`，`maxOutputChars: 16000`

### 1.3 voice-policy.yaml 语音策略

- 自动回复开启
- 必须发声：音频输入且回复复杂度低
- 可以发声：句子数 <= 4，无代码块
- 禁止发声：含代码、表格、多链接、故障排查
- 限制：最多 220 字符、45 秒、每分钟最多 3 次 TTS

### 1.4 mcp.yaml 默认 MCP 服务器

| 名称 | 命令 | 用途 |
|------|------|------|
| shell | @kevinwatt/shell-mcp | Shell MCP |
| puppeteer | @modelcontextprotocol/server-puppeteer | 浏览器自动化 |
| filesystem | @modelcontextprotocol/server-filesystem | 文件系统访问 |
| bing-search | bing-cn-mcp | 必应搜索 |
| github | @modelcontextprotocol/server-github | GitHub API |
| sqlite | @modelcontextprotocol/server-sqlite | SQLite 数据库 |
| memory | @modelcontextprotocol/server-memory | 记忆服务 |
| fetch | @modelcontextprotocol/server-fetch | HTTP 抓取 |

## 二、AI 技能规范（.agents/skills/）

| 技能 | 文件 | 用途 |
|------|------|------|
| vue | `.agents/skills/vue/SKILL.md` | Vue 3 Composition API 规范 |
| xsai | `.agents/skills/xsai/SKILL.md` | xsAI OpenAI-compatible 运行时规范 |
| pnpm | `.agents/skills/pnpm/SKILL.md` | pnpm workspace / catalog / patch 规范 |
| unocss | `.agents/skills/unocss/SKILL.md` | UnoCSS 使用规范 |
| eventa | `.agents/skills/eventa/SKILL.md` | Eventa IPC/RPC 规范 |

### 2.1 Vue 技能要点

- 使用 Vue 3.5
- 优先 `<script setup lang="ts">`
- 优先 Composition API
- 性能敏感处使用 `shallowRef` 替代 `ref`
- 避免 Reactive Props Destructure

### 2.2 xsAI 技能要点

- OpenAI-compatible-first
- `streamText` 用于增量文本、推理 delta、工具事件
- `generateObject` / `streamObject` 用于结构化输出
- `tool()` 配合 Zod/Valibot，`rawTool()` 配合原始 JSON Schema
- 优先使用最小粒度包（如 `@xsai/generate-text`）

### 2.3 pnpm 技能要点

- 使用 `pnpm-workspace.yaml` 配置 workspace
- catalog 集中管理依赖版本
- patches 目录存放第三方包补丁
- CI 使用 `--frozen-lockfile`

## 三、插件系统

### 3.1 插件目录

- `plugins/yachiyo/`：Yachiyo 官方插件
- `plugins/kitsune-plugin-ai-monitor/`：AI 监控插件

### 3.2 插件格式

每个插件包含：
- `plugin.yaml`：元数据、配置 schema、入口
- `package.json`：Node 依赖（如适用）
- `src/index.js` 或等价入口：运行时逻辑

### 3.3 桌面端插件加载

`apps/stage-tamagotchi/src/main/services/kitsune/plugins/` 负责：
- 加载 `.petplugin` 包
- 设置插件主机环境
- 注册运行时能力

### 3.4 插件 SDK

- `@kitsune/plugin-protocol`：事件定义与共享 WebSocket 类型
- `@kitsune/plugin-sdk`：通用插件 SDK
- `@kitsune/plugin-sdk-tamagotchi`：Tamagotchi 专用辅助

## 四、角色卡与人格

### 4.1 角色卡标准

- `packages/ccc`：Character Card V2/V3 + Kitsune 扩展
- 支持导入/导出 PNG、JSON、Markdown、APNG
- `extracted-modules/airi-card.ts`：Airi 扩展模块定义

### 4.2 八千代人格

- `packages/kitsune-persona/SOUL.md`
- 灵感来源：《超时空辉耀姬！》月见八千代
- 角色：月读世界管理者、歌姬、守望者
- 默认表达：理性 60% / 诗性 40%
- 说话方式：安静、温柔、克制，默认给 2-4 个选项

## 五、开发规范与脚本

### 5.1 根目录脚本

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

### 5.2 常用诊断脚本

- `scripts/list-module-loc.mjs`：列出各模块位置
- `capture-electron.mjs`：Electron 截图
- `capture-settings.mjs`：设置页截图
- `diag-dom.mjs` / `diag-elements.mjs` / `diag-factorio.mjs` / `diag-routes.mjs`：各类诊断

### 5.3 构建与发布

- 使用 `turbo.json` 定义构建任务与缓存
- `bump.config.ts`：版本 bump 配置
- `electron-builder.config.ts`：桌面端打包配置
- `wrangler.toml`：Cloudflare Pages 部署
- `netlify.toml` / `railway.toml`：对应平台部署

## 六、文档

- `docs/`：VitePress 多语言文档（zh-Hans / en / ja）
- `docs/content/zh-Hans/index.md`：首页
- `docs/desktop-lane-status.md`：桌面端路线状态

## 七、Nix 与依赖哈希

- `nix/`：Nix 构建配置
- `patches/`：第三方包补丁
  - `mineflayer@4.37.0.patch`
  - `pixi-live2d-display.patch`
  - `sponsorkit@17.1.0.patch`
  - `uiohook-napi@1.5.5.patch`
