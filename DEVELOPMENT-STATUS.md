# 当前开发状态（2026-09-12）

> 工作区 `J:\xiangm_transfer\pet\kitsune-ai` 的未提交改动归类。
> 生成依据：`git status --porcelain`（161 修改 / 9 删除 / 103 新增 = 273 处），
> 结合 `.zcode\cli\memories\...\kitsune-*.md` 的开发台账。
>
> **一句话**：代码已全部实现且测试绿，**全部尚未提交**——这是「功能已开发完、等待分批 commit」的中间态，不是「开发中断」态。

---

## 0. 总数与分布

| 类型 | 数量 | 说明 |
|---|---|---|
| `M` 已跟踪修改 | 161 | 功能演进 + 配置 + 测试 |
| `D` 删除 | 9 | 全部来自「消除桌面重复」重构 |
| `??` 新增 | 103 | 含 `desktop-platform` 新包、新功能、大量测试补齐 |
| **合计** | **273** | 待分批提交 |

---

## 1. 按模块归类（按改动量排序）

### ① 桌宠本体 `stage-tamagotchi` — 改动最集中（约 135 处）

| 子区 | 修改 | 新增 | 主题 |
|---|---|---|---|
| renderer | 15 | 31 | **第二批联动接线**：新增 `useConnectorEmotion / useDesktopActionEmotion / useDirectorEmotion / useMemoryEmotion / usePluginLifecycleEmotion` 等一整套「事件→桌宠情绪」composable（含 .test.ts）；设置页 `OverseerPanel.vue`、`ExecutorPanel.vue` 改造 |
| kitsune 服务 | 21 | 23 | **MCP 主动上报**：新增 `mcpActivityTracker.ts`、`mcpAgentConfig.ts`；`channel-server`、`comfyui`、`i18n`、`logger`、`memory`、`persona` 改动；新增大量 `.test.ts` |
| overseer 编排 | 12 | — | **coordinator 团队编排**：`executor/llmHelper.ts`、`planGenerator.ts`、`planner.ts`、`taskRunner.ts`、`loop.ts`、`acceptance.ts`；`eventSchema.ts` 扩事件类型 |
| desktop-automation | — | 1（测试） | 改走共享包，新增 `desktop-automation.test.ts` |
| shared/eventa | 1 | — | 事件契约调整 |

### ② 舞台渲染 UI — 约 38 处

| 包 | 修改 | 新增 | 主题 |
|---|---|---|---|
| stage-ui | 21 | 2 | `vision/use-vision-inference`、`sensevoice-emotion-map`、providers（ollama/openrouter/sherpa-asr）、`use-modules-list`、`use-optimistic`；新增 `stores/chat/pet-state.ts` |
| stage-ui-three | 7 | — | three 集成调整 |
| stage-pages | 7 | — | 页面层 |
| stage-ui-live2d | 6 | — | Live2D |
| stage-layouts | 3 | — | 布局 |
| ui-transitions | 1 | — | 舞台过渡组件 |

### ③ 服务端 — 约 11 处

| 包 | 修改 | 新增 | 主题 |
|---|---|---|---|
| apps/server | 10 | 1 | schema 边界（chats/characters/providers）；新增 `chats/schema.test.ts` |
| server-runtime | 3 | — | 运行时 |
| server-shared | — | 1 | websocket 常量 |

### ④ 智能编排 — 约 12 处

| 包 | 修改 | 新增 | 主题 |
|---|---|---|---|
| kitsune-overseer | 6 | — | 感知层 |
| plugin-sdk | 4 | — | 插件契约 |
| kitsune-tts-hybrid | 2 | 2 | 新增 `sherpaTtsAdapter.ts`（sherpa TTS 适配器） |
| vishot-runtime | 1 | — | 场景就绪 hook |

### ⑤ 外围入口 — 约 6 处

| 包 | 修改 | 新增 | 主题 |
|---|---|---|---|
| computer-use-mcp | 3 | — | **改消费共享包 + 键映射 + 入口守卫修复** |
| stage-web | 5 | — | 外围前端 |
| stage-pocket | 2 | — | 移动端壳 |
| ui-admin | 1 | — | 管理后台域名占位 |

### ⑥ 工程地基 — 约 8 处

| 区 | 修改 | 新增 | 主题 |
|---|---|---|---|
| config/default | 2 | — | `providers.yaml`（LLM 中转站）、`mcp.yaml` |
| config/overseer.yaml | 1 | — | **单一数据源**：工具清单 + 画像 + executor 参数段 |
| scripts | 1 | 2 | 新增 `slim-gptsovits.ts` + `slim-gptsovits-archived.ts`（TTS 瘦身脚本） |
| packages/i18n | 2 | — | 文案 |
| 根配置 | 2 | — | `package.json` + `pnpm-lock.yaml` |

### 📦 新增整包

| 包 | 说明 |
|---|---|
| `packages/desktop-platform/` | **全新共享包**（整包 103 处中约 8 文件）：koffi FFI 工厂 + win32/mac/linux + window-enumerator + 14 测试 |

### 📄 文档

新增 7 份根文档（`architecture.md` / `component-api.md` / `development.md` / `project-overview.md` / `TODO.md` / `MODULES.md` / `DESIGN.md` / `user-guide.md`）—— 这是仓库的**首次成体系文档化**，此前只有 README 和 PROJECT-MAP。

---

## 2. 真新功能清单（区别于测试补齐）

103 处新增里**约 70 处是 `.test.ts`**（六模块验收 + 第二批/第三批联动的测试补齐）。**真功能源码**只有这些：

| 文件 | 来源 |
|---|---|
| `packages/desktop-platform/**`（整包） | 消除桌面重复 |
| `mcpActivityTracker.ts` + `mcpAgentConfig.ts` | MCP 主动上报通道 |
| `use*Emotion.ts` 系列（renderer） | 第二批联动：事件→情绪 |
| `sherpaTtsAdapter.ts` | TTS 多引擎 |
| `stores/chat/pet-state.ts` | 桌宠状态 store |
| `scripts/slim-gptsovits*.ts` | TTS 瘦身打包 |
| `overseer/coordinator.ts`（已跟踪，在 M 里） | 团队编排 |
| `/settings/team`（已跟踪，在 M 里） | 团队设置页 |

---

## 3. 删除清单（9 个，全部是预期）

上一轮「消除桌面重复」删掉的旧实现，**无遗漏、无断链**：

- `services/kitsune/desktop-automation/platform/` × 8：`factory.ts`、`index.ts`、`linux.ts`、`macos.ts`、`windows-koffi.ts`、`windows-koffi.test.ts`、`windows.ts`、`windows.test.ts`
- `libs/win32/window-enumerator.ts` × 1

已抽到 `packages/desktop-platform`，主套与 MCP 都改为 import 共享包。

---

## 4. 需要清理的临时文件（建议提交前删）

这些**不应进版本库**：

| 文件 | 处理 |
|---|---|
| `apps/stage-tamagotchi/eventa-original-backup.ts` | 备份文件，删 |
| `apps/stage-tamagotchi/.eventa-canon-1353.bak` | 备份文件，删 |
| `apps/stage-tamagotchi/petcontract-results.json` | 脚本输出，删或 gitignore |
| `.slim-staging/` | 打包暂存区（含 Python egg），整目录加 `.gitignore` |
| `.mellos/schema-probe.mts` | Mellos 探针脚本，视需要保留或删 |
| `.app-test.log` / `.app-test.json` | 已删（本次验证产物） |

---

## 5. 验证状态（当前代码的验收硬指标）

| 检查 | 结果 |
|---|---|
| `desktop-platform` typecheck | ✅ 0 错 |
| `desktop-platform` vitest | ✅ 14/14 |
| `computer-use-mcp` typecheck | ✅ 0 错 |
| `computer-use-mcp` vitest | ✅ 7/7（含 3 个真实 spawn server） |
| `computer-use-mcp` stdio initialize 冒烟 | ✅ 返回 serverInfo |
| `stage-tamagotchi` vue-tsc | ✅ 0 错 |
| `stage-tamagotchi` vitest | ✅ 109 文件 / 860 passed / 1 skipped |
| `stage-tamagotchi` electron-vite build | ✅ 16.6s |

**结论：273 处改动对应的代码已全部验证绿，可以安全分批提交。**

---

## 6. 建议的分批提交顺序

按「依赖方向 + 主题内聚」分 5 批，每批独立可回滚：

1. **工程地基**：`config/**` + `package.json` + `pnpm-lock.yaml` + `scripts/**`
2. **桌面去重**：`packages/desktop-platform/**`（新增）+ 主套 desktop-automation 改动 + 9 个删除 + MCP 改动
3. **桌宠本体**：`stage-tamagotchi/src/main/**`（overseer + kitsune 服务 + shared/eventa）
4. **舞台与 UI**：`packages/stage-ui/**`、`stage-pages/**`、`stage-layouts/**`、`stage-web/**`、`stage-pocket/**`、`ui-admin/**`
5. **编排与文档**：`kitsune-overseer/**`、`plugin-sdk/**`、`kitsune-tts-hybrid/**` + 7 份根文档

> ⚠️ 提交前记得：① 删掉第 4 节的临时文件；② `.slim-staging/` 加进 `.gitignore`；③ 改完代码必须 `pnpm run build`（用户曾跑旧构建，见 memory `kitsune-true-machine-audit`）。

---

*生成于 2026-09-12。相关文档：`PROJECT-MAP.md`（架构总图）、`MODULES.md`（六模块验收台账）、`.zcode\cli\memories\...`（开发决策记忆）。*
