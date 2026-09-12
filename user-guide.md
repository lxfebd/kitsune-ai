# Kitsune AI · 用户指南（User Guide）

> 面向**使用 Kitsune 桌宠的人**（不写代码也能看懂）。开发/安装见 [development.md](./development.md)。

更新：2026-09-07。

## 一、这是什么

一个会**听、说、做事**的 AI 桌宠：Live2D 角色（八代·Airi）常驻桌面，能语音对话、陪你办公，还能**监控你正在用的编码 AI 工具**（ZCode、Claude Code、Trae、Cursor、Codex、OpenCode 等），在它们的任务面板里实时显示"正在做什么/出错了/完成了"。

## 二、启动

```bash
pnpm dev:tamagotchi     # 桌面桌宠（Electron）
```

首次运行会自动拉取本地语音模型。也可以只开 Web 版预览：`pnpm dev:web`。

## 三、界面与功能

| 区域 | 功能 |
|---|---|
| **Live2D 舞台** | 桌宠本体：表情、口型、呼吸、视线跟随；说话/反应动画 |
| **任务面板（OverseerPanel）** | 实时显示被监控工具的**任务流**：正在思考 → 执行工具（Bash/Edit/Read…）→ 完成 / 失败。失败的条目会提示错误（如 `工具执行失败 (errorCount=1)`） |
| **聊天** | 与桌宠对话；语音输入（本地 ASR）与语音回复（本地 TTS） |
| **设置** | 拆分为多个子页：模型、语音、监控工具、插件、外观、关于等 |
| **Tools / MCP** | 桌面 computer-use、浏览器控制、MCP server 接入 |
| **记忆与人格** | 桌宠记住长期/短期信息（本地 BM25）；可切换人格/Character Card |

> 功能地图（Feature map）完整清单见 [README.md §4](./README.md)。

## 四、语音

- **说给它听**：点击麦克风（或快捷键），本地 ASR 识别 → 对话。
- **它说给你听**：本地 TTS 播放；未安装 GPT-SoVITS 引擎时会自动跳过，可在设置页离线导入或手动 `pnpm dev:gpt-sovits` 启动。

## 五、监督编码工具（Overseer）

1. 在设置页开启要监控的工具（ZCode / Claude Code / Trae / Cursor / Codex / OpenCode / Windsurf / Lobster）。
2. 桌宠会持续感知这些工具的状态——**你正在用 ZCode 干活时，任务面板会展示当前工具调用、失败信号**。
3. 工具出错时桌宠会反应（担心），并可按授权流程为你**自动重试/修复**。

> 说明：任务面板只显示**推送级事件**（工具调用/任务完成/任务失败）。普通状态变化（status_update）不推送到面板，这是设计行为，不是故障。

## 六、常见问题

| 现象 | 原因与处理 |
|---|---|
| 桌宠显示"ZCode 未运行" | 最近 60s 没有检测到新活动。只要 ZCode 真的在跑（有工具调用写入会话 transcript），就会重新显示"运行中" |
| 任务面板很久没更新 | 事件为 5s 防抖 + 按类型/来源去重推送；`status_update` 永不推送是正常的 |
| 语音引擎没声音 | 检查 TTS engine 是否安装；未装则走云端路由（需在设置配置）或在设置页离线导入 |
| 想看逐条调试日志 | 开发态日志在 `userData/logs/main-YYYY-MM-DD.log`（保留 7 天） |

## 七、多端

- **Web**：`apps/stage-web`（浏览器 SPA）。
- **移动**：`apps/stage-pocket`（Capacitor + Kotlin/Swift）。
- **Admin**：`apps/ui-admin`（控制台）。
- 服务端 `apps/server` 供需要网关/计费/多上游路由的场景（`pnpm dev:server`）。