# Kitsune AI · 架构与数据流（Architecture）

> 本文档描述分层架构、核心数据流与三大核心链路。代码级逐行说明见 [PROJECT-MAP.md](./PROJECT-MAP.md)（§2 分层、§3 三大核心链路、§4 目录地图）。
> 本文与其互补：本文讲"数据怎么流"，PROJECT-MAP 讲"代码在哪、每行干什么"。

更新：2026-09-07。

## 一、分层架构总览

```
┌───────────────────────────── 表现层 ─────────────────────────────┐
│ Renderer (Vue)                                                  │
│   Live2D 舞台 · 聊天 · 设置 · 任务面板(OverseerPanel) · Tools     │
│   （stage-tamagotchi renderer / stage-web / stage-pocket）        │
└───────────────┬──────────────────────────────────────────────────┘
                │ IPC / Eventa（@moeru/eventa 类型安全 RPC）       │
┌───────────────▼──────────────────────────────────────────────────┐
│ Main (Electron)  ——  apps/stage-tamagotchi/src/main              │
│   services/kitsune/                                              │
│     overseer（编排层）· memory · persona · asr · tts · sidecar    │
│     connectors（IDE 6121 WS）· desktop-automation · vision        │
│     plugins · channel-server · mcp-servers · comfyui · doctor     │
└───────┬──────────────────────┬───────────────────────────────────┘
        │ WS 6121 (server-runtime)│ 本地 file/process 感知
┌───────▼──────────┐   ┌─────────▼──────────────────────────────┐
│ apps/server      │   │ packages/kitsune-overseer（感知层）       │
│ Hono 网关 / 计费  │   │ ClaudeCodeMonitor · TraeMonitor        │
│ LLM·TTS 多上游    │   │ CursorMonitor · ZCodeMonitor           │
└──────────────────┘   │ GenericAiToolMonitor · IdleDetector     │
                       └──────────────────────────────────────────┘
```

三层结构：**感知层**（`packages/kitsune-overseer`，读真实工具状态）→ **编排层**（`apps/stage-tamagotchi/src/main/services/kitsune/overseer`，过滤/授权/重试）→ **表现层**（Renderer 的 OverseerPanel 等）。

## 二、核心数据流：感知 → 编排 → 表现为任务

这是"AI 桌宠能看到并接管编码工具任务"的主链路：

```
ZCode / Claude Code / Trae / Cursor / Codex / OpenCode …
   │  写 transcript.jsonl / audit-log / IDE WS 事件
   ▼
packages/kitsune-overseer  (CommonJS; 10s 轮询 + chokidar 事件驱动)
   Supervisor ──按 config/overseer.yaml tools[] 实例化 monitors
   Monitor   ──产生状态 { isRunning, activity, currentTask, hasError,
   │              lastToolCall, errorMessage, … } + petReaction {emotion,
   │              action, message, activity}
   ▼  onPetReaction(reaction)
apps/.../overseer (TS 编排层)
   mapReactionToEvent(reaction) → OverseerEvent
     activity 分支：error→TaskFailed · completed→TaskEnd
                    thinking/executing/coding→ToolInvocation
     （无 activity 时退回关键词兜底，全部最终落 StatusUpdate）
   PushFilter ── PUSHABLE_EVENTS 白名单 + 5s debounce + ${type}:${source} 去重
     ⚠️ StatusUpdate 永不推送；ToolInvocation/TaskEnd/TaskFailed 可推送
   ▼ pushed OverseerEvent
   @moeru/eventa IPC ──► Renderer OverseerPanel
   WS 6121 broadcasts  ──► 其它端（web / admin）
```

**关键事实**（2026-09-07 排查 zcode 任务不显示时实测，勿再踩坑）：

- `tool_batch_complete` 的失败信号在 `payload.errorCount > 0`，**不存在 `entry.result` 字段**。
- 去重 key 含 `lastToolCall`，保证连续工具调用（不同 toolName）都会触发新事件。
- `StatusUpdate` 设计上永不推送（它映射自无 activity 的状态变更），这是过滤日志里大量 `status_update → filtered` 的正常原因。

## 三、三大核心链路

### 3.1 Overseer 编排闭环（差异化亮点）

```
monitor（感知）→ filter（白名单）→ authorize（授权确认）
  → rebuild（重执行）→ verify（验证）→ 回到 monitor
```

工具失败（TaskFailed）→ 桌宠反应（worried/concern）→ 用户授权 → 自动重试/修复。

### 3.2 本地语音链路（ASR + TTS）

```
麦克风 → Sherpa-onnx 本地 ASR（SenseVoice/Paraformer；浏览器 Whisper 兜底）
  → 文本进对话 → 回复文本
  → TTS（GPT-SoVITS / Genie-TTS sidecar + Vox-CPM2；可选云端 Qwen3/Azure/DashScope/火山）
  → 播放 → Live2D 口型同步
```

GPT-SoVITS 引擎未安装时自动跳过启动（设置页可离线导入或手动启动 `dev:gpt-sovits`）。

### 3.3 Live2D 舞台

Live2D 表情/口型/呼吸/视线/节拍同步；浏览器预览下由模拟驱动。渲染细节见 `packages/stage-ui-live2d`。

## 四、服务端通道

- `apps/server`：Hono —— OpenAI 兼容网关、计费（Stripe）、多上游 LLM/TTS 路由、key 轮换、OTel 追踪。
- `packages/server-runtime` + `better-ws`：提供 **WS 6121** 通道；`integrations/*` 全部走该协议。
- `packages/server-sdk` / `server-shared`：客户端侧的 rpc/sdk 与共享类型。

## 五、其它横切机制

| 机制 | 位置 | 说明 |
|---|---|---|
| 依赖注入 | `injeca` | main/index.ts 装配 services/plugins/frontend |
| IPC/RPC | `@moeru/eventa` | 契约集中在 `apps/stage-tamagotchi/src/shared` |
| 记忆 | `packages/bm25-native`（napi-rs，约 21x 加速）+ core-character | 短期+长期记忆、人格 |
| 日志 | `apps/.../services/kitsune/logger` | 每日 `main-YYYY-MM-DD.log`，保留 7 天 |
| 定时任务/计划 | `.kitsune/plans/` + director watcher | 计划文件与 LLM helper（text-first + synced 兜底） |

## 六、数据流速查（常用法）

| 问题 | 答案 |
|---|---|
| 桌宠看不到某工具的"任务" | 查该 Monitor 的 activity 是否映射到可推送事件（ToolInvocation/TaskEnd/TaskFailed）；`handleEvent` 日志显示 `filtered` 属正常 |
| 事件到不了 renderer | 查 PUSHABLE_EVENTS 白名单、PushFilter debounce/去重、Eventa 是否注册 |
| 想加新工具监控 | `config/overseer.yaml` tools[] 加条目 → 感知层建 Monitor（参考 zcodeMonitor 的 agentsRoot 注入模式）→ 编排层映射 |
| 想改视觉 | 见 [DESIGN.md](./DESIGN.md)（UnoCSS 主题、字体、组件样式约定） |

> 已知文档缺口与代码不一致处见 [PROJECT-MAP.md §9](./PROJECT-MAP.md)（改代码/文档前先看）。