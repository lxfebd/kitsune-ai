# 三个空壳 Services 实现方案

> 复用分析先行，避免重复造轮子

---

## 一、现有可复用代码审查

### 通信基础
- `@kitsune/server-sdk` 提供完整的 WebSocket 客户端（`ClientOptions` 支持 `handshake: 'module'` + `identity: ExtensionModuleIdentity`）
- 所有 service 可通过 server-sdk 连接 server，注册为模块，通过 `context:update`（推送状态）和 `spark:command`（接收命令）通信

### 1. computer-use-mcp

**已有可复用代码：**
- `desktop-automation/`（跨平台鼠标/键盘/窗口管理，含 koffi Win32 实现）
- `desktop-overlay/` 窗口（桌面覆盖层）
- `petMcpBridge.ts`（MCP Server 子进程桥接，已有 HTTP localhost 监听）
- `mcp-servers/`（MCP Stdio 管理器）
- `overseer` 的 `findElement`（视觉定位）

**方案：** 复用 `desktop-automation` 服务 + `petMcpBridge` 桥接，暴露 MCP 工具接口

### 2. discord-bot

**已有可复用代码：**
- `stores/modules/discord.ts`（Discord 配置 store，含 token 管理）
- `components/modules/MessagingDiscord.vue`（UI 组件）
- `@discordjs/voice`（已在依赖中）
- `server-sdk` WebSocket 客户端（通信通道）
- `configurator`（`ui:configure` 事件，配置已从前端广播到 server）

**方案：** 复用 `server-sdk` 连接 server，通过 `configurator` 接收配置；复用 `@discordjs/voice` 处理语音；复用 `@kitsune/audio` 处理音频编解码

### 3. minecraft

**已有可复用代码：**
- `stores/modules/gaming-minecraft.ts`（Minecraft store，定义了完整 WebSocket 事件契约）
- `stores/chat/context-providers/minecraft.ts`（聊天上下文注入）
- `components/modules/GamingMinecraft.vue`（UI 组件）
- `mineflayer` 等依赖（已在 package.json 中）
- `server-sdk` WebSocket 客户端（通信通道）

**方案：** 复用 `server-sdk` 以 `minecraft-bot` 身份注册；复用 store 定义的事件契约；复用 `mineflayer` 库

---

## 二、实现方案

所有 service 遵循统一架构：
```
service → server-sdk WebSocket → apps/server → stage-ui stores → Vue 组件
```

### S1: computer-use-mcp

**功能：** 通过 MCP 协议暴露桌面自动化能力（鼠标/键盘/窗口/截屏）

```
computer-use-mcp
  ├── 复用 desktop-automation 服务（跨平台鼠标键盘窗口）
  ├── 复用 MCP 协议层（@modelcontextprotocol/sdk）
  └── 暴露工具：click / moveTo / type / pressKey / screenshot / listWindows / focusWindow
```

### S2: discord-bot

**功能：** Discord 消息转发 + LLM 回复

```
discord-bot
  ├── 复用 server-sdk 连接 server（接收配置+转发消息）
  ├── 复用 @discordjs/voice（语音频道）
  ├── 复用 @kitsune/audio（音频编码解码）
  └── 消息流转：Discord → server-sdk WebSocket → server → LLM → 回复
```

### S3: minecraft

**功能：** Mineflayer 智能体，对接前端 store 契约

```
minecraft
  ├── 复用 server-sdk 以 minecraft-bot 身份注册
  ├── 复用 mineflayer 连接 Minecraft 服务器
  ├── 复用 store 定义的事件契约（context:update / spark:command / registry:modules）
  └── 状态流转：Minecraft 服务器 → mineflayer → server-sdk WebSocket → server → stage-ui store
```

---

## 三、无重复功能确认

| 功能 | 已有实现 | 本 service 是否重复 |
|------|---------|-------------------|
| 桌面鼠标键盘 | `desktop-automation/` | 复用，不重复 |
| MCP 协议 | `petMcpBridge.ts` + `mcp-servers/` | 复用，不重复 |
| Discord 消息 | 仅有 store + UI 组件 | 不重复（缺少服务端实现） |
| Minecraft 客户端 | 仅有 store + UI 组件 + context provider | 不重复（缺少 Mineflayer 连接） |
| WebSocket 通信 | `server-sdk` 客户端 | 复用，不重复 |
| 服务注册 | `server` 的 WebSocket 注册表 | 复用，不重复 |