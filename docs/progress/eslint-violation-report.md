# ESLint 静态分析违规报告

**执行时间**: 2026-07-21  
**工具版本**: ESLint 10.2.1 + moeru-lint  
**扫描文件数**: 2964  
**应用规则数**: 93  
**执行耗时**: 1.2s (24 threads)

---

## 总览

| 严重级别 | 数量 |
|---------|------|
| ⚠️ Warning | 1043 |
| ❌ Error | 0 |
| **总计** | **1043** |

---

## 违规分类统计

### 按规则分类

| 规则名称 | 描述 | 估计数量 | 严重程度 |
|---------|------|---------|---------|
| `no-irregular-whitespace` | 文件开头存在 BOM 字符（UTF-8 无签名问题） | ~600+ | Warning |
| `no-unused-vars` | 未使用的变量、导入、参数、函数 | ~100+ | Warning |
| `unicorn/no-new-array` | 使用 `new Array(singleArgument)` | ~200+ | Warning |
| `no-unused-expressions` | 未使用的表达式 | ~50+ | Warning |
| `no-cond-assign` | 条件表达式中的赋值 | ~20+ | Warning |
| `no-control-regex` | 正则表达式中的控制字符 | ~15+ | Warning |
| `unicorn/no-thenable` | 对象/类中添加了 `then` 方法 | ~5+ | Warning |
| `no-misleading-character-class` | 正则字符类中的组合字符 | ~3+ | Warning |
| `no-func-assign` | 函数声明被重新赋值 | ~4 | Warning |
| `no-constant-condition` | 常量条件表达式 | ~1 | Warning |

### 按文件路径分类（Top 10）

| 路径 | 主要违规类型 |
|-----|-------------|
| `packages/stage-ui/src/` | no-irregular-whitespace, no-unused-vars |
| `packages/core-agent/src/` | no-irregular-whitespace, no-unused-vars |
| `apps/stage-tamagotchi/out/main/` | unicorn/no-new-array, no-unused-expressions |
| `packages/kitsune-overseer/src/` | no-unused-vars, no-control-regex |
| `apps/stage-web/src/` | no-irregular-whitespace |
| `packages/plugin-sdk/src/` | no-irregular-whitespace |
| `packages/electron-vueuse/src/` | no-irregular-whitespace |
| `packages/stage-ui-live2d/src/` | no-irregular-whitespace |
| `open/soullink-emotion-sdk/packages/` | no-irregular-whitespace, no-unused-vars |
| `packages/stage-ui-spine/src/` | no-irregular-whitespace |

---

## 详细违规列表

### 1. no-irregular-whitespace（不规则空白字符）

**问题描述**: 大量文件开头包含 UTF-8 BOM（Byte Order Mark，`\xEF\xBB\xBF`）字符。

**受影响文件**（部分列表）:
- `packages/stage-ui/src/types/chat.ts`
- `packages/stage-ui/src/stores/settings/beat-sync.ts`
- `packages/stage-ui/src/tools/character/orchestrator/spark-notify.ts`
- `packages/stage-ui/src/utils/index.ts`
- `packages/stage-ui/src/stores/settings/theme.ts`
- `packages/stage-ui/src/utils/event-source.ts`
- `packages/stage-ui/src/stores/settings/audio-device.ts`
- `packages/stage-ui/src/stores/settings/stage-model.ts`
- `packages/stage-ui/src/tools/character/orchestrator/spark-command.ts`
- `packages/stage-ui/src/stores/settings/spine.ts`
- `packages/stage-ui/src/stores/settings/analytics.ts`
- `packages/stage-ui/src/tools/mcp.ts`
- `packages/stage-ui/src/stores/three.ts`
- `packages/stage-ui/src/stores/llm-streaming-control.ts`
- `packages/stage-ui/src/stores/settings/general.ts`
- `packages/stage-ui/src/stores/settings/controls-island.ts`
- `packages/stage-ui/src/stores/live2d.ts`
- `packages/core-agent/src/messages/context-prompt.test.ts`
- `packages/stage-ui/vite.config.ts`
- `packages/stage-ui/stories/setup.ts`
- `apps/ui-admin/vite.config.ts`
- `packages/stage-ui/stories/modules/i18n.ts`
- `packages/stage-ui/src/libs/speech/tts-session.ts`
- `packages/stage-ui/src/libs/chat-sync/ws-client.ts`
- `packages/stage-ui/src/stores/plugin-host-capabilities.ts`
- `apps/ui-admin/src/main.ts`
- `packages/stage-ui-live2d/src/composables/live2d/fit-model.ts`
- `packages/stage-ui/src/stores/perf-tracer-bridge.ts`
- `packages/stage-ui/src/libs/speech/tts-session.test.ts`
- `packages/stage-ui-live2d/src/composables/live2d/eye-tracking.test.ts`
- `packages/stage-ui/src/stores/modules/vision/store.ts`
- `packages/stage-ui/src/libs/chat-sync/wire-message.ts`
- `packages/stage-ui/src/stores/providers/web-speech-api/index.ts`
- `packages/stage-ui-live2d/src/composables/live2d/live2d.ts`
- `packages/stage-ui/src/stores/modules/vision/processing-store.ts`
- `packages/stage-ui-live2d/src/composables/live2d/live2d.test.ts`
- `packages/stage-ui/src/libs/chat-sync/wire-message.test.ts`
- `packages/stage-ui/src/libs/inference/adapters/kokoro.test.ts`
- `packages/stage-ui/src/stores/modules/vision/orchestrator.ts`
- `packages/ui-loading-screens/playground/src/main.ts`
- `packages/ui/src/constants/lamp-flicker-animation.ts`
- `packages/stage-ui/src/libs/inference/adapters/background-removal.ts`
- `packages/stage-ui/src/stores/modules/twitter.ts`
- `packages/stage-ui-spine/src/stores/spine.ts`
- `packages/core-agent/src/agents/spark-notify/event-source.ts`
- `packages/stage-ui/src/libs/inference/protocol.ts`
- `apps/stage-tamagotchi/scripts/desktop-overlay-live-window-smoke.ts`
- `packages/scenarios-stage-tamagotchi-electron/src/scenarios/demo-controls-settings-chat-websocket/sections/settings.ts`
- `packages/electron-vueuse/src/composables/use-electron-window-resize.ts`
- `packages/electron-vueuse/src/composables/use-electron-window-bounds.ts`
- `packages/core-agent/vitest.config.ts`
- `packages/scenarios-stage-tamagotchi-electron/src/scenarios/demo-controls-settings-chat-websocket/index.ts`
- `packages/electron-vueuse/src/composables/use-electron-mouse.ts`
- `packages/core-agent/src/types/chat.ts`
- `packages/plugin-sdk/src/index.ts`
- `packages/plugin-sdk-tamagotchi/src/tools/registry.ts`
- `packages/stage-ui/src/stores/modules/gaming-module-factory.ts`
- `packages/plugin-sdk/src/extension/shared.ts`
- `packages/plugin-sdk-tamagotchi/src/tools/index.ts`
- `packages/stage-ui/src/stores/modules/gaming-minecraft.ts`
- `packages/electron-vueuse/src/composables/use-electron-auto-updater.ts`
- `packages/plugin-sdk-tamagotchi/src/kits/tool/index.ts`
- `packages/plugin-sdk-tamagotchi/src/kits/gamelet/index.ts`
- `packages/stage-ui/src/stores/modules/discord.ts`
- `packages/plugin-sdk/src/channels/index.ts`
- `packages/plugin-sdk-tamagotchi/src/gamelet/index.ts`
- `packages/stage-ui/src/stores/modules/gaming-minecraft.ts`
- `packages/stage-ui/src/libs/inference/adapters/whisper.ts`
- `packages/stage-ui/src/stores/modules/persona.ts`
- `packages/electron-vueuse/src/composables/use-electron-window-resize.ts`
- `packages/electron-vueuse/src/composables/use-electron-window-bounds.ts`
- `packages/core-agent/vitest.config.ts`
- `packages/scenarios-stage-tamagotchi-electron/src/scenarios/demo-controls-settings-chat-websocket/index.ts`
- `packages/electron-vueuse/src/composables/use-electron-mouse.ts`
- `packages/core-agent/src/types/chat.ts`
- `packages/plugin-sdk/src/index.ts`
- `packages/plugin-sdk-tamagotchi/src/tools/registry.ts`
- `packages/stage-ui/src/stores/modules/gaming-module-factory.ts`
- `packages/plugin-sdk/src/extension/shared.ts`
- `packages/plugin-sdk-tamagotchi/src/tools/index.ts`
- `packages/stage-ui/src/stores/modules/gaming-minecraft.ts`
- `packages/electron-vueuse/src/composables/use-electron-auto-updater.ts`
- `packages/plugin-sdk-tamagotchi/src/kits/tool/index.ts`
- `packages/plugin-sdk-tamagotchi/src/kits/gamelet/index.ts`
- `packages/stage-ui/src/stores/modules/discord.ts`
- `packages/plugin-sdk/src/channels/index.ts`
- `packages/plugin-sdk-tamagotchi/src/gamelet/index.ts`
- `packages/stage-ui/src/stores/mods/api/channel-server.ts`
- `packages/plugin-sdk/src/plugin-host/runtimes/shared/services/permissions.ts`
- `packages/plugin-sdk/src/plugin-host/runtimes/shared/services/permissions.test.ts`
- `packages/stage-ui/src/constants/inject.ts`
- `packages/server-shared/src/types/websocket/events.ts`
- `packages/stage-ui/src/composables/whisper.ts`
- `packages/server-shared/src/types/index.ts`
- `apps/stage-web/src/workers/vad/vad.ts`
- `apps/server/src/scripts/otel/http-smoke.ts`
- `apps/stage-web/src/workers/vad/manager.ts`
- `packages/stage-ui/src/stores/mods/api/spark-notify-reaction.ts`
- `packages/core-agent/src/runtime/context-registry.ts`
- `apps/stage-web/src/stores/pwa.ts`
- `apps/stage-web/src/stores/devtools-lag.ts`
- `packages/core-agent/src/runtime/context-registry.test.ts`
- `apps/stage-web/src/stores/background.ts`
- `packages/stage-ui/src/libs/providers/providers/nvidia/index.ts`
- `apps/server/otel/grafana/dashboards/build.ts`
- `packages/stage-ui/src/stores/modules/gaming-module-factory.ts`
- `packages/plugin-sdk/src/extension/shared.ts`
- `packages/plugin-sdk-tamagotchi/src/tools/index.ts`
- `packages/stage-ui/src/stores/modules/gaming-minecraft.ts`
- `packages/electron-vueuse/src/composables/use-electron-auto-updater.ts`
- `packages/plugin-sdk-tamagotchi/src/kits/tool/index.ts`
- `packages/plugin-sdk-tamagotchi/src/kits/gamelet/index.ts`
- `packages/stage-ui/src/stores/modules/discord.ts`
- `packages/plugin-sdk/src/channels/index.ts`
- `packages/plugin-sdk-tamagotchi/src/gamelet/index.ts`
- `packages/stage-ui/src/stores/mods/api/channel-server.ts`
- `packages/plugin-sdk/src/plugin-host/runtimes/shared/services/permissions.ts`
- `packages/plugin-sdk/src/plugin-host/runtimes/shared/services/permissions.test.ts`
- `packages/stage-ui/src/constants/inject.ts`
- `packages/server-shared/src/types/websocket/events.ts`
- `packages/stage-ui/src/composables/whisper.ts`
- `packages/server-shared/src/types/index.ts`
- `apps/stage-web/src/modules/i18n.ts`
- `packages/server-sdk/test/extension-peer.test.ts`
- `packages/server-sdk/test/codec.test.ts`
- `apps/stage-web/src/main.ts`
- `apps/stage-web/src/composables/perf/register-lag-sampler.ts`
- `packages/server-sdk/test/client.test.ts`
- `apps/server/src/services/domain/chats.ts`
- `packages/unocss-preset-fonts/tsdown.config.ts`
- `apps/stage-web/src/composables/icon-animation.ts`
- `packages/unocss-preset-fonts/src/index.ts`
- `packages/vishot-runner-electron/src/utils/app-path.ts`
- `packages/scenarios-stage-tamagotchi-browser/scripts/capture.ts`
- `packages/core-agent/src/runtime/chat-orchestrator-runtime.test.ts`
- `apps/stage-web/src/stores/pwa.ts`
- `apps/stage-web/src/stores/devtools-lag.ts`
- `packages/core-agent/src/runtime/context-registry.test.ts`
- `apps/stage-web/src/stores/background.ts`
- `packages/stage-ui/src/libs/providers/providers/nvidia/index.ts`
- `apps/server/otel/grafana/dashboards/build.ts`

---

### 2. no-unused-vars（未使用的变量）

**具体违规项**:

| 文件 | 行号 | 类型 | 名称 | 建议 |
|-----|------|------|------|------|
| `open/soullink-emotion-sdk/packages/planner-openai/src/__tests__/SpeakingMotionApiClient.test.ts` | 6 | 参数 | `init` | 移除或添加 `_` 前缀 |
| `packages/stage-ui/src/stores/llm-router.ts` | 75 | 变量 | `activeProvider` | 移除 |
| `packages/stage-ui/src/stores/llm-router.ts` | 75 | 变量 | `activeModel` | 移除 |
| `packages/stage-ui/src/stores/providers.ts` | 11 | 类型导入 | `ProgressInfo` | 移除导入 |
| `packages/stage-ui/src/stores/providers.ts` | 22 | 类型导入 | `ProviderSourceDeployment` | 移除导入 |
| `packages/stage-ui/src/stores/providers.ts` | 22 | 类型导入 | `ProviderSourcePricing` | 移除导入 |
| `packages/stage-ui/src/stores/providers.ts` | 23 | 类型导入 | `ProviderOnboardingField` | 移除导入 |
| `packages/stage-ui/src/stores/providers.ts` | 32 | 标识符导入 | `getCachedWebGPUCapabilities` | 移除导入 |
| `packages/stage-ui/src/libs/inference/adapters/whisper.ts` | 17 | 标识符导入 | `DEVICE_LOSS_WASM_THRESHOLD` | 移除导入 |
| `packages/stage-ui/src/libs/inference/adapters/whisper.ts` | 18 | 标识符导入 | `MODEL_VRAM_ESTIMATES` | 移除导入 |
| `open/soullink-emotion-sdk/packages/engine/src/mixer/MotionMixer.ts` | 3 | 类型导入 | `FACSKey` | 移除导入 |
| `packages/stage-ui/src/stores/modules/persona.ts` | 10 | 标识符导入 | `SystemPromptV2` | 移除导入 |
| `packages/stage-ui/src/stores/modules/persona.ts` | 180 | 变量 | `t` | 移除 |
| `packages/kitsune-overseer/src/unifiedSmartRouter.js` | 39 | 参数 | `taskPusher` | 移除或添加 `_` 前缀 |
| `packages/kitsune-overseer/src/taskStore.test.js` | 8 | 变量 | `fs` | 移除 |
| `packages/kitsune-overseer/src/taskStore.test.js` | 9 | 变量 | `fsp` | 移除 |
| `packages/kitsune-overseer/src/taskStore.test.js` | 10 | 变量 | `path` | 移除 |
| `packages/kitsune-overseer/src/taskPusher.js` | 14 | 变量 | `path` | 移除 |
| `packages/kitsune-overseer/src/taskPlanner.js` | 92 | 参数 | `goal` | 移除或添加 `_` 前缀 |
| `packages/kitsune-overseer/src/supervisor.js` | 10 | 变量 | `MonitorStore` | 移除 |
| `apps/stage-tamagotchi/src/main/services/kitsune/overseer/executor/taskRunner.ts` | 48 | 变量 | `DESKTOP_TIMEOUT_MS` | 移除 |
| `packages/kitsune-overseer/src/suggestionPusher.js` | 15 | 变量 | `fs` | 移除 |
| `packages/kitsune-overseer/src/routeConfig.test.js` | 41 | 参数 | `index` | 移除或添加 `_` 前缀 |
| `packages/core-agent/src/runtime/chat-orchestrator-runtime.ts` | 12 | 标识符导入 | `formatTimePrefix` | 移除导入 |
| `packages/core-agent/src/runtime/chat-orchestrator-runtime.ts` | 19 | 函数 | `prependTextToContent` | 移除 |
| `packages/core-agent/src/runtime/chat-orchestrator-runtime.ts` | 332 | 变量 | `createdAt` | 移除 |
| `apps/stage-tamagotchi/src/main/services/kitsune/overseer/executor/loop.ts` | 157 | 变量 | `taskResult` | 使用或移除 |
| `packages/kitsune-overseer/src/riskController.js` | 76 | 参数 | `tool` | 移除或添加 `_` 前缀 |
| `packages/kitsune-overseer/src/riskController.js` | 76 | 参数 | `params` | 移除或添加 `_` 前缀 |
| `packages/kitsune-overseer/src/projectImprover.js` | 18 | 变量 | `fsp` | 移除 |
| `packages/kitsune-overseer/src/projectImprover.js` | 464 | 变量 | `existing` | 移除 |
| `packages/kitsune-overseer/src/autonomousAgentLoop.js` | 19 | 变量 | `fs` | 移除 |
| `packages/kitsune-overseer/src/autonomousAgentLoop.js` | 20 | 变量 | `path` | 移除 |
| `packages/kitsune-overseer/src/autonomousAgentLoop.js` | 332 | 参数 | `event` | 移除或添加 `_` 前缀 |
| `packages/kitsune-overseer/src/proactiveNotifier.js` | 185 | 变量 | `fullContent` | 使用或移除 |
| `packages/kitsune-overseer/src/archDuplicationDetector.js` | 57 | 变量 | `RE_CLASS_DEF` | 移除 |
| `packages/kitsune-overseer/src/archDuplicationDetector.js` | 58 | 变量 | `RE_CONSTRUCTOR` | 移除 |
| `packages/kitsune-overseer/src/monitorStore.js` | 22 | 变量 | `MAX_SUGGESTION_TRACKS` | 移除 |
| `apps/stage-tamagotchi/electron.vite.config.ts` | 18 | 标识符导入 | `Download` | 移除导入 |
| `apps/stage-tamagotchi/electron.vite.config.ts` | 19 | 标识符导入 | `DownloadLive2DSDK` | 移除导入 |
| `apps/stage-tamagotchi/electron.vite.config.ts` | 23 | 变量 | `sharedCacheDir` | 移除 |
| `packages/kitsune-overseer/src/agentToolKit.js` | 10 | 变量 | `fs` | 移除 |
| `packages/kitsune-mcp-bridge/src/mcpServerInstance.js` | 267 | 捕获参数 | `_` | 处理错误或移除 |
| `packages/kitsune-mcp-bridge/src/mcpServerInstance.js` | 324 | 捕获参数 | `_` | 处理错误或移除 |
| `scripts/serve-models.mjs` | 17 | 标识符导入 | `readFile` | 移除导入 |
| `scripts/serve-models.mjs` | 40 | 函数 | `listFiles` | 移除 |
| `packages/kitsune-overseer/src/llDbAutoRecorder.js` | 15 | 变量 | `fs` | 移除 |
| `apps/stage-tamagotchi/out/main/desktop-automation-_SxHj9qz.js` | 591 | 变量 | `allowedActions` | 移除 |

---

### 3. unicorn/no-new-array（不推荐使用 new Array）

**受影响文件**（主要在构建产物中）:
- `apps/stage-tamagotchi/out/main/index.js` - 大量违规（约 50+ 处）
- `apps/stage-tamagotchi/out/main/dist-DFHrhKRy.js` - 1 处

**建议**: 使用 `Array.from({ length: n })` 或 `[element]` 替代

---

### 4. no-unused-expressions（未使用的表达式）

**受影响文件**:
- `apps/stage-tamagotchi/out/main/index.js` - 约 20+ 处
- `apps/stage-tamagotchi/out/main/dist-DFHrhKRy.js` - 约 10+ 处
- `packages/kitsune-overseer/src/llmEnhancer.js:186` - 1 处
- `apps/stage-tamagotchi/out/main/desktop-automation-_SxHj9qz.js:587` - 1 处

**常见模式**:
- `??` 和 `||` 赋值表达式未被使用
- 条件表达式中的赋值未被使用

---

### 5. no-cond-assign（条件表达式中的赋值）

**受影响文件**:
- `apps/stage-tamagotchi/out/main/index.js` - 约 10+ 处
- `apps/stage-tamagotchi/out/main/dist-DFHrhKRy.js` - 约 5 处

**建议**: 用额外的括号包裹赋值表达式，或重构代码

---

### 6. no-control-regex（正则中的控制字符）

**受影响文件**:
- `packages/kitsune-overseer/src/taskPusher.js:100` - 6 个控制字符
- `packages/kitsune-overseer/src/taskPusher.js:113` - 1 个控制字符
- `open/soullink-emotion-sdk/packages/profile-generator/src/Live2DProfileAutoGenerator.ts:1822` - 1 处
- `apps/stage-tamagotchi/out/main/index.js` - 多处
- `apps/stage-tamagotchi/out/main/dist-DFHrhKRy.js` - 多处

**建议**: 如确实需要匹配控制字符，使用 Unicode 转义序列

---

### 7. unicorn/no-thenable（不推荐在对象/类中添加 then）

**受影响文件**:
- `apps/stage-tamagotchi/out/main/index.js:29252` - 类中添加了 `then` 方法
- `apps/stage-tamagotchi/out/main/index.js:47923` - 对象中添加了 `then` 属性
- `apps/stage-tamagotchi/out/main/index.js:51754` - 对象中添加了 `then` 属性

**风险**: 可能导致意外的 await 行为

---

### 8. 其他违规

| 规则 | 文件 | 行号 | 描述 |
|-----|------|------|------|
| `no-misleading-character-class` | `apps/stage-tamagotchi/out/main/index.js` | 32932, 32934 | 正则字符类中的组合字符 |
| `no-func-assign` | `apps/stage-tamagotchi/out/main/index.js` | 30285, 30286, 30303, 30313 | 函数声明被重新赋值 |
| `no-constant-condition` | `apps/stage-tamagotchi/out/main/dist-DFHrhKRy.js` | 5435 | 常量条件 `while (true)` |

---

## 优先级建议

### 高优先级（代码质量问题）

1. **no-unused-vars**: 清理未使用的变量、导入和参数，减少代码冗余
2. **no-irregular-whitespace**: 批量移除文件开头的 BOM 字符（影响大量文件）

### 中优先级（潜在风险）

3. **no-cond-assign**: 重构条件赋值，避免潜在的逻辑错误
4. **no-control-regex**: 审查正则表达式，确保控制字符匹配是有意为之
5. **unicorn/no-thenable**: 避免在对象/类中添加 `then` 方法

### 低优先级（代码风格）

6. **unicorn/no-new-array**: 主要出现在构建产物中，可选择性修复
7. **no-unused-expressions**: 审查并清理未使用的表达式

---

## 构建产物说明

大量违规出现在 `apps/stage-tamagotchi/out/main/` 目录下的构建产物中，这些文件是第三方库（如 YAML 解析器、加密库等）的打包结果，不建议手动修复。建议：

1. 更新相关依赖到最新版本
2. 在 ESLint 配置中排除 `out/` 目录
3. 对于确实需要的警告，使用 `eslint-disable` 注释

---

## 统计图表

```
违规类型分布：
█████████████████████████████████████████████████  no-irregular-whitespace (~60%)
████████████████████                                no-unused-vars (~15%)
██████████████                                      unicorn/no-new-array (~12%)
██████                                              no-unused-expressions (~5%)
████                                                no-cond-assign (~3%)
███                                                 no-control-regex (~2%)
██                                                  其他 (~3%)
```

---

**报告生成者**: AutoPlan ESLint Analysis  
**报告路径**: `docs/progress/eslint-violation-report.md`
