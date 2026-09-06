# intellij-kitsune

Kitsune AI 的 JetBrains IDE 连接器（IDEA / PyCharm / WebStorm / GoLand），通过本地 WebSocket 与 Kitsune AI 核心客户端通信，提供编码上下文推送与远程任务执行能力。

## 架构

对齐 `integrations/vscode/vscode-kitsune/` 的三层架构：

| 模块 | 职责 | 对应 vscode-kitsune |
| --- | --- | --- |
| `ws/KitsuneClient` | WebSocket 客户端（OkHttp），握手 / 心跳 / 重连 / 事件收发 | `src/airi.ts` |
| `context/ContextCollector` | 采集文件路径 / 光标 / 选区 / git 分支 | `src/context-collector.ts` |
| `context/EditorTracker` | 编辑器事件监听（切换 / 光标 / 选区 / 保存） | `src/extension.ts` 事件注册 |
| `task/TaskExecutor` | 执行反向任务（open_file / insert_code / run_command） | `src/extension.ts` executeTask |
| `KitsunePlugin` | 应用级服务，持有 WebSocket 客户端单例 | `Client` 全局单例 |
| `KitsuneProjectActivity` | 项目启动入口，注册监听 + 任务执行器 | `activate()` |

## 开发环境要求

- JDK 21（JetBrains Runtime 21）
- Gradle 8.x（通过 Gradle Wrapper）
- IntelliJ Platform Gradle Plugin 2.x（`org.jetbrains.intellij.platform` 2.16.0）
- Kotlin 2.1.20

## 构建与打包

```bash
# 准备开发沙箱（build/idea-sandbox/）
./gradlew prepareSandbox

# 启动带插件的开发用 IDE
./gradlew runIde

# 产出发布 zip（build/distributions/）
./gradlew buildPlugin

# 兼容性验证（IDEA / PyCharm / WebStorm）
./gradlew verifyPlugin
```

## 安装到 IDEA

1. 运行 `./gradlew buildPlugin` 产出 `build/distributions/intellij-kitsune-0.1.0.zip`
2. 打开 IDEA → Settings → Plugins → ⚙️ → Install Plugin from Disk
3. 选择 zip 文件，重启 IDE

## 协议对齐说明

与 vscode-kitsune 完全对齐 Kitsune Server Channel 协议：

- **端点**：`ws://localhost:6121/ws`
- **模块名**：`proj-airi:plugin-intellij`（对应 vscode 的 `proj-airi:plugin-vscode`）
- **握手**：`module:authenticate`（可选）→ `extension:module:announce` → 等待 `extension:module:announced` / `registry:modules:sync`
- **心跳**：`transport:connection:heartbeat`（应用层 ping/pong，15s 间隔）
- **上下文推送**：`context:update`（ReplaceSelf 策略）
- **反向任务**：订阅 `task:execute`，执行后回 `task:result`
- **metadata.source**：`{ kind: "plugin", id, extension: { id }, plugin: { id } }`
- **重连**：无限重试，指数退避（1s/2s/4s/8s/16s/30s），握手超时 15s

## 跨产品兼容

- 仅依赖 `com.intellij.modules.platform`，兼容 IDEA Community / Ultimate / PyCharm / WebStorm / GoLand
- Git4Idea、Terminal 为可选依赖，通过反射软引用
- 基线 IDEA Community 2025.2.6.2，向后兼容到 2024.2（`since-build = 242`）
