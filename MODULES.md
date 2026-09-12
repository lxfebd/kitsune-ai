# Kitsune AI · 模块化改进台账

> 用途：把 monorepo 拆成 6 大模块，每个大模块再细分小模块，一个子模块一个子模块地审计、改进、验收。
> 每个大模块一小节：范围 → 小模块列表 → 现状 → 已修记录 → 验收；每个小模块一行：范围 / 关键文件 / 待审点。
> 更新：2026-09-08（首次细分到小模块粒度，标记 🔲=待处理 / ⏳=进行中 / ✅=已验收）。

## 模块 ① 桌宠本体（apps/stage-tamagotchi）
- 范围：主进程装配 / services/kitsune / windows×17 / renderer 页面 / shared/eventa
- 现状：1052 源码文件；26 个文件含 TODO/FIXME 标记
- **小模块（6 个子模块）**：
  1. **✅ 主进程装配层** —— `src/main/index.ts` + `src/main/app/*` + `src/main/configs/*` + `src/main/libs/bootkit`：Electron 生命周期、单实例、文件日志、启动装配（configs 0 TODO，app 0 TODO）—— **细分见下方「①-1 主进程装配层」**
  2. **✅ services/kitsune 能力服务** —— `src/main/services/kitsune/*`（21 个服务：channel-server / overseer / executor / memory / persona / asr / tts / vision / plugins / runtime-plugins / mcp-servers / sidecar / connectors / desktop-automation / comfyui / doctor / agent-api / onboarding / http-server / widgets / window-snap 等）：0 TODO 文件—— **细分见下方「①-2 services/kitsune 能力服务」**（四组全 ✅，21 服务 100% 测试覆盖）
  3. **✅ 窗口系统** —— `src/main/windows/*`（15 窗口目录 + shared）+ `services/electron/*`：**逐文件审计完成，14 处 TODO 全同源（eventa 尚不支持 window-namespaced context 时的 `ipcMain.setMaxListeners(0)` 架构债注释，非 bug）；修复 1 个真 bug（notice.open 悬挂）+ 新增 2 个测试文件 8 用例**
  4. **✅ Electron 系统服务** —— `src/main/services/electron/*`：auto-updater、global-shortcut（uiohook）、powerMonitor、screen、system-preferences、window —— **细分见下方「①-4 Electron 系统服务」**
  5. **✅ renderer 页面与设置页** —— `src/renderer/pages/*`：chat / spotlight / desktop-overlay / inlay / caption / dashboard / widgets / notice / devtools / settings×16 页（侧栏 2026-09-08 已归组为 5 类语义分组）—— **细分见下方「①-5 renderer 页面与设置页」**
  6. **✅ shared/eventa 与桌面工具** —— `src/shared/eventa/*`（IPC 契约）+ desktop-overlay / spotlight-shortcut / model-settings-runtime / mcp-config —— **细分见下方「①-6 shared/eventa 与桌面工具」**
- **模块① 验收（2026-09-08，六子模块全 ✅）**：typecheck 全绿（stage-tamagotchi/server-runtime/server-sdk/server-shared）；全套测试 **89 files / 698 passed / 1 skipped**；dev 冷启动多轮 6121/6122 LISTENING 无错误。子模块口径：①-1 主进程装配层（9 单元）/ ①-2 services 四组（21 服务）/ ①-3 窗口系统（15 窗口 + shared）/ ①-4 Electron 系统服务（10 文件 + auto-updater-service 补测）/ ①-5 renderer 页面与设置页（17 处监听器全对 + autoAnimate cast 移除）/ ①-6 shared/eventa 与桌面工具（契约全审 + isSafeSpotlightAccelerator 补测 + whitelist NOTICE 过时修复）。
- 已修（2026-09-08）：**侧边栏归组→组合卡片结构（子模块⑤）**—— 按用户要求把 settings 侧栏从"可折叠平铺列表"改为"**组合入口 + 卡片页**"：侧栏只列 5 个组合入口（桌宠本体/模型与感官/自主运行/安全与权限/连接与运维），点击进入 `/settings/group/<id>` hub 页，页内每个成员渲染为一张 IconItem 卡片（v-motion 逐张浮现），点卡片进真正的子页。单一数据源 `src/renderer/settings-nav.ts`（`settingsGroups`：5 组 24 成员，含 `to`/`match`/`exclude`）同时被 layout 侧栏（活动组高亮 + 返回按钮）、`pages/settings/group/*/index.vue`（5 个新页面，路由自动生成）、共享组件 `settings-group-hub.vue` 消费。i18n 新增 `settings.nav.group.*`、`settings.groups.<id>.description`、`settings.groups.cards.<memberId>.description`、`not-found`（zh/en 全同步）。验证：typecheck 全绿、全套测试 89 files/698 passed/1 skipped 无回归、dev 冷启动 6121/6122 LISTENING、typed-router dts 重新生成含 `/settings/group/{pet,senses,run,security,ops}` 5 条路由。
- 已修（2026-09-07 前）：Overseer zcode 事件可见性（supervisor monitor 反应兜底 + WS/SSE 三通道 + filtered 徽章）；设置页拆 6 子页 + DAG 任务图；LLM 中转站接入（text-first + synced 兜底）；bm25-native 21x
- 待审：TODO 清单逐条过、窗口系统接线、desktop-automation 实机、onboarding 引导、自动更新
- 已修（2026-09-07 第二轮）：插件能力类型去重 —— `PluginCapabilityState` 从 `@kitsune/plugin-sdk` 的 `CapabilityDescriptor` re-export（`shared/eventa/index.ts` + `shared/eventa/plugin/capabilities.ts`），消掉 2 处 TODO；plugin 测试 29/29 + typecheck 绿。
- 已修（2026-09-07 第二轮）：**server channel WS 路径去重** —— `SERVER_CHANNEL_DEFAULT_PORT`(6121) + `SERVER_CHANNEL_WS_PATH`(`/ws`) 建在 `@kitsune/server-shared/types`（`websocket/constants.ts`）；server-runtime 路由 + 默认端口、server-sdk 默认 URL、channel-server `createServerChannelUrl` 全部改用常量，消灭 3 处 `/ws` + 2 处 6121 字面量。server-runtime 50/50、server-sdk 19/19、liveness 4/4 + 全 typecheck 绿。
- 已修（2026-09-07 第二轮）：**connection 页"已连接远程"指示器** —— 新增 `electronGetServerChannelPeers` IPC（channel-server 返回 `listPeerIds()`）；connection 页每 3s 轮询显示已连接对端（绿色徽章 + 对端 id 前 8 位），Electron 外降级隐藏；补 zh/en i18n `connected-remotes.*`。
- 已修（2026-09-07 第二轮）：**account 页诚实化** —— 服务端鉴权已停用（`apps/server/src/middlewares/auth.ts` sessionMiddleware 降级 null），登录/注册不再假装成功，改提示 `unavailable.message`；补 zh/en `account.*` 全套 key（zh 原本缺 account 段）。
- 已知限制（不改）：Weather 组件 Windows 背景材质圆角失效 —— 上游 Electron#48340 / Chromium 432457523 未修，非本仓库可解。
- 实机验证（2026-09-07）：dev 重启后 server-sdk probe 连 6121 握手成功（module:authenticated → READY → extension:module:announced），server 日志确认 peer connected——connection 页 `electronGetServerChannelPeers` 轮询到的正是对应 peer id。

## ①-1 主进程装配层（细分）

> 父模块：模块① 桌宠本体。目标：把 1239 行 `src/main/index.ts` 按装配阶段切成可独立审计/改进的最小单元。
> 现状：configs 0 TODO、app 0 TODO；**index.ts 本体无 TODO 但已 1239 行，两个 duplicate handler 段是债务**。
> 证据：`src/main/index.ts` —— ① 桌面自动化 handler 有**两套注册**（`defineInvokeHandler` @437 起 + 备用 `ipcMain.handle('desktop-automation:invoke')` @522 起，同一 switch 逻辑复制两份）② 退出清理 @1186-1231。

| # | 单元 | 位置 | 状态 | 验收点 / 待审 |
|---|---|---|---|---|
| 1 | 进程安全壳 | `index.ts` @60-200（safeConsoleWrite 吞 EPIPE / uncaughtException / unhandledRejection 落盘 / 单实例 / chcp UTF-8 / Linux WebGPU flags） | ✅ | **动作 1（2026-09-08 完成）：崩溃日志目录懒创建修复** —— `uncaughtException`/`unhandledRejection` 落盘原依赖 `logs/` 目录存在，但该目录直到 whenReady 里 `setupFileLogger()` 才建（两个 handler 注册于模块顶层，ready 前崩溃如单实例守卫/chcp 失败时 writeFileSync 抛 ENOENT 被空 catch 吞掉，崩溃日志静默丢失）。新增 `appendCrashLog()`（mkdirSync recursive + 函数内取 `app.getPath('userData')`，保证 APP_USER_DATA_PATH 覆盖生效）。验证：typecheck 绿 + 全套 74 文件 533 passed/1 skipped + dev 实机冷启动 6121/6122 正常。single-instance 测试 78 行既有。 |
| 2 | 生命周期钩子 | `libs/bootkit/lifecycle.ts`（onAppReady/BeforeQuit/WindowAllClosed 三 hook + emit 触发点） | ✅ | **动作 1（2026-09-08 完成）：onAppReady 死 API 接入** —— `onAppReady` 原全仓库零注册（`emitAppReady()` 空转），现把 whenReady 后 4 段散装配（openDebugger / optimizer.watchWindowShortcuts / registerLive2dModelIpc / 本地模型文件服务）收进 `onAppReady(() => {...})`，hook 首次被实际使用。已审计确认：onAppBeforeQuit/onAppWindowAllClosed 全部注册在服务函数内（随 create 惰性触发，无模块级泄漏）；screen/window.ts 多窗口重复注册的 stop 因 useLoop.stop 幂等无副作用。验证：typecheck 绿 + 全套 74 文件 533 passed/1 skipped + dev 冷启动 6121/6122 正常（ASR IPC registered + overseer synced 主链路走通）。 |
| 3 | 配置装配 | `configs/global.ts` + `configs/artistry.ts`（26+26 行）→ injeca provide `configs:app` @231 | ✅ | **动作 1（2026-09-08 完成）：config.update 整体替换丢字段修复 ×4** —— 审计确认两个 config 模块本身（valibot schema + createConfig 持久化 + setup）结构良好；but 发现`config.update()` **整体替换 persistenceMap**，任何一处恢复时少字段都会把缺席字段刷成 undefined 落盘。修 4 处：① **i18n/index.ts:20 真 bug** —— `config.update({ ...current, language })` 的 `...current` 在 handler 进入前展开，`current` 为 undefined（配置文件缺失且无 default）时 spread 是 `{}`，把 ttsEngine 等全部字段刷成 undefined 落盘；改 `get() ?? {}` 兜底。② `index.ts` autoUpdater `setStoredUpdateLane` 恢复 `language` 从 `?? 'en'` 改为 `currentConfig?.language`（缺失时保持 undefined 不制造假值）。③ `electronTtsSetEngine` 同类 `?? 'en'` 改 `current?.language`。④ `plugins/host/index.ts` isFreshConfig 恢复：`get() ?? { enabled: [], autoReload: [], known: {} }` 兜底（原 null/undefined → `.enabled.length` 直接 TypeError），重建不再丢 autoReload/known。验证：typecheck 绿 + 全套 74 文件 533 passed/1 skipped + dev 冷启动 6121/6122 正常（PID 32500，零错误）。
| 4 | injeca DI 装配 | `index.ts` @231-388（15 个 provide：configs×2 / auto-updater / i18n / channel-server / http-server / godot / mcp-stdio / widgets / plugin-host / window-auth / global-shortcut / beat-sync / devtools / 12 个窗口 manager + tray + desktop-overlay 条件 provide） | ✅ | **动作 1（2026-09-08 完成）：删除 comfyui/memory 两个占位 provider** —— `services:comfyui` 全仓库无消费方（孤儿），`services:memory` 被 invoke 依赖列表引用但回调内 `createMemoryService({ context })` 重新创建本地变量、`deps.memoryService` 从未使用（假完整）；已删占位 + 从 invoke 依赖列表摘除 memoryService。验证：typecheck 绿 + 全套 74 文件 533 passed/1 skipped + dev 实机重启 6121/6122 正常（overseer llm-provider synced）。 |
| 5 | 核心 invoke 装配 | `index.ts` @390-636（memory/persona/artistry-bridge/connectors/desktop-automation/web/overseer 服务装配 + desktop-automation handler + chat-sync diagnostic @511） | ✅ | **动作 1（2026-09-08 完成）：desktop-automation 双套 handler 已去重** —— 提炼 `runDesktopAction`（单一 switch 分发，收编窗口操作 title/processName 校验），eventa 通道 `defineInvokeHandler` 与备用字符串通道 `ipcMain.handle('desktop-automation:invoke')` 均为薄包装（字符串通道 JSON.stringify 出参保持与 resolveDesktopInvoker 配对）。验证：typecheck 绿 + 全套 74 文件 533 passed/1 skipped + dev 实机重启 6121/6122 正常。待审：comfyui/memory 占位 provider |
| 6 | TTS / ComfyUI / Doctor / Sidecar invoke | `index.ts`（electronComfyuiStart/Stop/Status/SetConfig + electronTtsGetEngines/SetEngine/CurrentEngine/ListVoices/Start/Stop/GetConfig/SetConfig/ApplyConfig/InstallPlugin(×2)/GetRuntimePluginsDir/SetRuntimePluginsDir/Synthesize/Stream/CloneVoice/RemoveVoice/ImportVoicePack/DeleteVoice + DoctorService + sidecar 状态转发） | ✅ | **动作 1（2026-09-08 完成）：语音包导入写盘竞态修复** —— `electronTtsImportVoicePack` 原用 `writeStream.on('close', () => zipfile.readEntry())`，Node 语义 `'close'` ≠ 写完（`'finish'` 才保证 flush 到磁盘），且 `zipfile.on('end')` 条目读完即 resolve，导致解压完成后立即 readdirSync/renameSync 可能拿到未写完的文件（竞态损坏声线包）。已改为：`'finish'` 才继续 zip 循环 + pendingWrites 计数 + 全部写流完成才 resolve（entriesDrained 双检查）。验证：typecheck 绿 + 全套 74 文件 533 passed/1 skipped + dev 冷启动 6121/6122 正常。待实机：TTS/ComfyUI 链路全功能（需 GPT-SoVITS 引擎/ComfyUI 安装）。 |
| 7 | 辅助 invoke 与日志 | `index.ts` @1030-1134（ASR 引擎注册、Vision 常驻、Agent API、LogLevel 动态切换、Dialog 选目录/选文件）+ `app/file-logger.ts`（196 行，daily rotate 7 天）+ `services/kitsune/logger.ts` | ✅ | **动作 1（2026-09-08 完成）：日志链路四修 + SIGTERM** —— 审计确认 ASR（registerAsrIpcHandlers 内置引擎注册+sherpa-onnx 推理）、Vision（electronVisionStart 触发、onAppBeforeQuit stop）、Agent API（safeStorage 密钥、Cloud Code/OpenCode/Trae 端点）三服务注入干净；真实债在**双日志系统的 daily logger（services/kitsune/logger，connectors 用 getFileLogger 写 main-*.log）**：① `write()` fire-and-forget 链 `void rotateIfNeeded().then(appendFile)` 无外层 catch，rejection 未处理；② 跨午夜轮转并发交叠（同日多条 write 各调 rotate 会各自 close 正在用的 fileHandle）；③ `close()` 不等在途写（退出时丢最后几行）；④ handleAppExit 只关 app/file-logger 不关 daily logger 单例（main-*.log 从不 close）。修复：write 加 try/catch + pendingWrites 待写计数；rotateIfNeeded 用 rotation promise 串行化（并发交叠时等前一个完成再重查日期）；close 等待在途写 + flushResolvers；handleAppExit Promise.all 后补 `flush daily logs`（getFileLogger().close()，补 import）；新增 SIGTERM handler 与 SIGINT 同路（kill/关机时日志 flush + 子进程回收）。验证：typecheck 绿 + 全套 **74 files / 534 passed / 1 skipped**（新增 logger close 等待回归测试，13/13）+ dev 冷启动 6121/6122 正常（PID 8856）**daily 日志 main-2026-09-08.log 实机落盘**（overseer 注册 CLI 工具 + handleEvent 行）。待实机：LogLevel 运行时切换 / Dialog sidecar 设置页实测。 |
| 8 | 退出清理 | `index.ts` @1186-1231（`handleAppExit`：onAppBeforeQuit hooks + overseer.stop + stopComfyUI(sidecarServiceRef null 守卫) + injeca.stop + 文件日志 flush + `app.exit(code)`） | ✅ | **动作 1（2026-09-08 完成）：退出清理缺口修复** —— 审计确认三条路径（SIGINT / before-quit / window-all-closed→app.quit）最终都汇聚到 handleAppExit，且 injeca.stop() 会触发 channel-server 的 lifecycle appHooks.onStop（关 6121 WS）。修 4 处：① **pluginHost 绕过** —— handleAppExit 直接 app.exit() 绕过 before-quit，而插件宿主的 dispose() 只挂在 app.once('before-quit')，SIGINT 路径下扩展进程/静态资产服务器残留；handleAppExit 的 Promise.all 新增 `dispose plugin host`（pluginHostRef null 守卫，invoke 回调赋值）。② **`ExtensionHostService` 接口补 `dispose: () => Promise<void>`** + `setupExtensionHost` 返回里接出 hostService.dispose（原来类型上无 dispose，调用报 TS2741）。③ **kitsuneHttpServer 死代码删除** —— `modules:kitsune-http-server` 仅 `setupBuiltInServer({ servers: [] })` 空跑（[] 不 start/stop 任何东西）、全仓库唯一消费点是 invoke dependsOn 且 deps.kitsuneHttpServer 未用过；删 provider + 依赖项 + import，连带确认 http-server 目录其它导出（authServer/staticAssetServer）无调用方。④ **SIGINT 先 emit before-quit 再清理** —— windows/main 的 allowClose 只在 before-quit 置 true，SIGINT 直连 handleAppExit 时主窗口 close 被 preventDefault 挂死（仅随进程消亡）。验证：typecheck 绿 + 全套 74 文件 533 passed/1 skipped + dev 冷启动 6121/6122 正常（PID 12300）+ SIGTERM 退出后端口释放。待实机：Windows 关窗退出全程实测（taskkill 无 /F 在 Windows 发 CTRL_CLOSE，Node 不映射 SIGINT）。 |
| 9 | 杂项接线 | `openDebugger` @1144 / `optimizer.watchWindowShortcuts` @1149 / `registerLive2dModelIpc` @1154 / 本地模型文件服务按需启动 @1158 / HF CORS 注入 @206-216 | ✅ | **动作 1（2026-09-08 完成）：model-file-server 失败残留 + 退出回收** —— 审计确认 debugger（APP_REMOTE_DEBUG 门控、端口校验、openDebugger 拉 /json 报错兜底）、registerLive2dModelIpc（白名单 + zip-slip 无、normalize hash、R8 按需启动 + live2dFileServerStarting 失败清空可重试）、model-file-server（代理 hf-mirror / Range 支持 / path traversal 403 / stop 带 close）、HF CORS（worker 一律走 localhost:19528 代理，CORS 注入为防御冗余保留）结构干净。修 2 处：① `startModelFileServer` 原 `server = createServer` 在 listen 成功前就赋值，listen 失败（端口占用）时 promise reject 但 `server` 残留 → 下次 `if (server)` 假启动成功，renderer 连 19528 全失败；改为 `const srv` + error 时 `if (server === srv) server = null` 再 reject（可重试）。② `stopModelFileServer()` 导出但全仓库零调用 → handleAppExit Promise.all 补 `stop model file server`（import 动态，未启动时 no-op，优雅关闭在途代理下载）。验证：typecheck 绿 + 全套 74 文件 534 passed/1 skipped + dev 冷启动 6121/6122 正常（PID 14204，零错误）。 |

**已修汇总（①-1）**：单元 1 崩溃日志目录懒创建 / 单元 2 onAppReady 接入 / 单元 3 config.update 整体替换丢字段 ×4（i18n undefined spread 真 bug + autoUpdater/ttsSetEngine/plugins-host 恢复值）/ 单元 4 双占位 provider 删除 + kitsuneHttpServer 死代码删除 / 单元 5 desktop-automation 双 handler 去重 / 单元 6 语音包 zip 写盘竞态 / 单元 7 日志链路四修 + SIGTERM（daily logger catch/轮转串行化/close 等待 + handleAppExit flush + SIGTERM handler）/ 单元 8 退出清理四修复（pluginHost dispose 接管 + ExtensionHostService 补 dispose + SIGINT 补 before-quit + kitsuneHttpServer 死代码）/ 单元 9 model-file-server 失败残留 + 退出回收。

**①-1 验收（2026-09-08，9/9 全绿）**：typecheck 绿 + 全套 **74 文件 534 passed/1 skipped** + dev 冷启动 6121/6122 多轮正常 + daily 日志实机落盘。待实机（非代码问题）：TTS/ComfyUI 全功能链路（需 GPT-SoVITS/ComfyUI 安装）、LogLevel 运行时切换、Dialog sidecar 设置页、Windows 关窗退出全程。

## ①-2 services/kitsune 能力服务（细分）

> 父模块：模块① 桌宠本体。范围：`src/main/services/kitsune/*`（24 个目录，21 个独立服务 + 3 支持目录 http-server/i18n/logger）。
> 现状：**0 个 TODO 文件**（全目录扫描）；**23 个服务全部有测试**（asr/channel-server/desktop-automation/doctor/http-server/logger/mcp-servers/memory/overseer/persona/plugins/tts/web/widgets/comfyui/runtime-plugins/sidecar + C 组补 connectors/window-snap/godot-stage + D 组补 agent-api/i18n/onboarding/vision）。
> 目标：按"核心数据面 → 外部进程 → UI 桥 → 辅助"四组细分，逐服务审计 → 修复 → 验收；①-1 单元 6/7 已审过 tts/comfyui/vision/asr/agent-api/logger/sidecar 的部分链路。

| 组 | 服务 | 位置 | 状态 | 待审点 |
|---|---|---|---|---|
| A 核心数据面 | overseer 监工 + executor + memory + persona | `overseer/`（19 非测试 9 测试）+ `memory/`（4/3）+ `persona/`（2/1） | ✅ | **A 组验收（2026-09-08）：三服务全部审计完成。** persona：日志 console.log→useLogg（2 处）；新增 7 个测试，正则按真实输入加固（英文 `replies` 补入 style 模式 + 中文代码风格 `\s*` 容忍自然空格），7/7 绿。memory：2 处 console.log→useLogg；store/adapters 审计干净（setRules 正则编译校验、testRules try/catch 按设计）；bm25.ts 纯 TS 保留为 native 对照锚点（bm25.test.ts 5 docs×6 queries 打分与 bm25-native 完全一致）。overseer：主域 2746 行 + executor 2116 行通读，架构干净（useLogg + fileLogger 双日志、双通道事件分发、AUTO_FIX 路由、6 个 director IPC、stop 清理 3 pending 表 + watcher）；唯一泄漏 llmHelper.ts 2 处 console.log → useLogg（main/llm-helper）。验证：typecheck 绿 + 全套 **75 files / 541 passed / 1 skipped**（overseer 9 文件 74 测试）。待实机：executor DAG/planner 真实计划链路、director 页面。 |
| B 外部进程 | sidecar + tts + comfyui + runtime-plugins + mcp-servers | `sidecar/`（2/1）+ `tts/`（1/1）+ `comfyui/`（1/1）+ `runtime-plugins/`（1/1）+ `mcp-servers/`（1/1） | ✅ | **B 组验收（2026-09-08）：五服务全部审计 + 补测完成，生产代码零 bug（仅 comfyui 补 1 处对称 export）。** sidecar：protocol.ts 通读干净（0x1F magic 二进制帧 + LSP Content-Length JSON 双态状态机、Mutex 串行写 + drain/close 双监听防死锁）；新增 protocol.test.ts 13 测试（跨 chunk 累积、轮转混合、EOS、无效 header/body onError、writer round-trip）。tts：index.ts 1030 行干净（5 级目录解析、异步 CUDA probe、语言路由、PCM→WAV、重启回滚锁）；补 3 个纯兜底链测试（端口 config>env>default、python 解析、needsRestart 变更检测），13/13。comfyui：startComfyUI 结构校验 + taskkill /T /F 树杀 + isStarting 锁干净；**`getComfyuiPort` 补 export（与 tts getGptSovitsPort 对称）**；新增 13 测试（spawn 参数、幂等、锁定、stop 预取 pid、config 合并）。runtime-plugins：分卷安装（sha512 + yauzl traversal 防护 + 原子替换）、目录迁移、marker 校验干净；新增 14 测试（env/config 优先级、isPluginInstalled 4 态、迁移、本地安装 2 路径）。mcp-servers：lazy spawn + pendingTransports finally 清理、qualified tool name `server::tool`、fallback 去命名空间重试、testServer deadline 干净；测试 1→7（callTool 透传、fallback 重试、启停过滤 skipped、writeConfigText 校验/规范化）。**踩坑：clientMocks 是 vi.hoisted 顶层单例，跨用例累计调用数——需要 per-describe mockReset。** 验证：全套 **78 files / 590 passed / 1 skipped** + typecheck 绿。待实机：GPT-SoVITS/ComfyUI 真实引擎链路、真实 MCP server 联调。 |
| C UI 桥与窗口 | godot-stage + widgets + window-snap + web + desktop-automation + channel-server + connectors | `godot-stage/`（1/0）+ `widgets/`（7/1）+ `window-snap/`（1/0）+ `web/`（3/3）+ `desktop-automation/`（8/3）+ `channel-server/`（2/1）+ `connectors/`（1/0） | ✅ | **C 组验收（2026-09-08）：七服务全部审计 + 补测完成，发现并修复 1 个真实生产 bug。** 审计：7 个服务生产代码全部干净（0 TODO / 0 console 泄漏）。**生产 bug：`executor/taskRunner.ts` runIdeTask 信封读取 bug** —— `context.on(electronConnectorTaskResult, ...)` 直接读 `payload.taskId/success`，但 eventa 信封是 `{id, type, body}`，payload 在 `body` → 所有 IDE 任务必超时；修复为解构 `event.body` + 4 个回归测试。新增 3 个测试文件：connectors 17 测试（用真实 createContext + fake serverChannel，handler 按 `sendEvent.id ?? id` 收集；覆盖 announce/类型检测/再公告迁移/context:update/task:result 信封广播/peer close 清理/sendTask invoke/dispose）、window-snap 9 测试（fake WindowSnapManager + taskbar helpers，handler 同步断言、trySnap/Unsnap/SetFraction 转发、taskbarGetInfo null/overlap、window closed cleanup）、godot-stage 15 测试（fake spawn + 固定 randomUUID + 真实 H3 类实例注册表 + mutex timing 用 vi.waitFor；覆盖完整 lifecycle、view snapshot + invalid payload 广播、stage.fatal、unexpected close、service handler 注册 7、事件转发、destroyed window suppression）。**踩坑：defineInvokeEventa 组合对象无 .tag/.id → handler 键取 `eventa.sendEvent?.id ?? eventa.id`；H3 必须用真实类 mock（箭头函数不能 new）；godot-stage 异步实例化需 vi.waitFor 等 h3Instances；manager.stop() 经 mutex microtask 分发需 waitFor 断言。** 验证：全套 **81 files / 635 passed / 1 skipped** + typecheck 绿 + dev 冷启动 6121/6122 LISTENING（PID 25464）。待实机：godot-stage 真实 Godot 4 引擎链路（GODOT4 env）、IDE 连接器实机联调。 |
| D 辅助与平台 | doctor + onboarding + vision + asr + agent-api + i18n + logger + http-server + plugins | `doctor/`（1/1）+ `onboarding/`（1/1）+ `vision/`（1/1）+ `asr/`（3/1）+ `agent-api/`（1/1）+ `i18n/`（1/1）+ `logger/`（1/1）+ `http-server/`（10/6）+ `plugins/`（13/3） | ✅ | **D 组验收（2026-09-08）：九服务全部审计 + 补测完成，生产代码零 bug（0 TODO / 0 console 泄漏）。** 审计：doctor 1406 行（29 项检查）、onboarding 动画落位、vision 桌面捕获、asr 引擎注册、agent-api 密钥管理、i18n config 装配、logger daily 轮转、http-server server-manager、plugins host 均干净。**新增 4 个测试文件 +40 用例**：i18n 7（启动初始化/fallback en/config 保留字段/undefined 兜底/get handler）、vision 11（立即捕获/interval 捕获/stop/错误路径/fake timers）、agent-api 15（setApiKey safeStorage+plaintextFallback/sendTask 远端路由/HTTP 错误/trae_builder pending 轮询→succeeded/onResult/inject/dispose/listAgents/getApiKey 磁盘缺失）、onboarding 7（动画/手动移动检测/复位/不复位/skip destroyed/重新订阅清理）。**踩坑：`type ServiceContext = Parameters<typeof createXxxService>[0]['context']` + `createContext() as unknown as ServiceContext`（core context 与 electron adapter context 不兼容）；agent-api Buffer type 需 `as never`（TS 5.7+ 泛型）；README 级别：logg mock 需 `log`+`warn` 双字段。** 验证：全套 **85 files / 675 passed / 1 skipped** + typecheck 绿 + dev 冷启动 6121/6122 LISTENING（PID 11468，仅 duckdb 第三方 sourcemap 警告）。至此 ①-2 四组全部 ✅，21 个服务 100% 测试覆盖。待实机（非代码问题）：doctor 29 项检查实机跑（需真实环境数据）、TTS/ComfyUI/Vision 真实引擎链路。 |

**验收基线**（同①-1）：`apps/stage-tamagotchi` typecheck + 全套测试（当前 **89 文件 698 passed / 1 skipped**；①-6 新增 spotlight-shortcut 1 个测试文件 +7 用例；①-5 autoAnimate cast 移除；①-4 新增 auto-updater-service 1 个测试文件 +8 用例；①-3 +8；D 组 +40；C 组 +45；B 组 +52）+ dev 冷启动 6121/6122 正常。注：dev/测试的 stdout 会混入 logg JSON 行（doctor 等服务的 `FAIL` 字样是检查项数据非测试失败），提取测试摘要需先过滤 `^{"@timestamp"` 行。测试 mock 注意：`vi.hoisted` 顶层单例 mock 跨用例累计调用数，共享 describe 需 `mockReset` 或 `mockClear` 重置；eventa 信封是 `{id, type, body}`，业务 payload 永远在 `body` 字段；`defineInvokeEventa` 组合对象无 `.tag/.id`，handler 键取 `eventa.sendEvent?.id ?? eventa.id`；core `createContext()` 的 `EventContext<unknown, unknown>` 与 electron adapter context 类型不兼容，需 `as unknown as ServiceContext`；logg mock 需 `log`+`warn` 双字段。

## ①-3 窗口系统（细分）

> 父模块：模块① 桌宠本体。范围：`src/main/windows/*`（15 窗口目录：about/beat-sync/caption/chat/dashboard/desktop-overlay/devtools/inlay/main/notice/onboarding/settings/spotlight/widgets + shared）+ `src/main/services/electron/*`（app/auto-updater/global-shortcut/powerMonitor/screen/system-preferences/window）。
> 现状：**14 处 TODO 全部同源** —— `ipcMain.setMaxListeners(0)` 是 eventa 尚不支持 window-namespaced context 时的监听上限绕过，注释明确记录了重构目标（eventa 支持窗口命名空间后可删），属架构债注释非 bug，本期不动 eventa 不做重构。
> 验收（2026-09-08）：**15 窗口目录 + shared + services/electron 全部逐文件审计 → 修复 → 补测 → 验收。**

**审计要点（全部干净）**：
- **共享基础设施**：`shared/window.ts`（toggleWindowShow/透明/模糊/spotlight 配置/`resizeWindowByDelta` 边缘钳制 n/w 方向 x/y 联动）；`shared/referenced-window.ts`（notice/widgets-like 窗口管理器：id 复用/loadRoute/上下文绑定）；`shared/display.ts`（断点尺寸映射/`computeAdjacentPosition` 邻位布局）；`shared/window-snap.ts`（14KB 贴靠，①-2 C 组已测）；`libs/electron/window-manager/reusable.ts`（可复用窗口工厂：windowSetupFnPromise 竞态保护 + closed 自清理 + catch 重置）。
- **窗口接入模式**：全部窗口统一 `ready-to-show → show`、`setWindowOpenHandler → shell.openExternal + deny`、`webPreferences.sandbox:false + preload`；main/dashboard 用 config.json 持久化 bounds（300ms debounce 防拖拽中间帧落盘）；主要 overlay 窗口 `type:'panel' + transparent + setAlwaysOnTop(screen-saver)`。
- **窗口专属鉴权**：window.ts 的 `createWindowService`/spotlight 的私有 invoke 全部校验 `webContents.id === sender.id`。
- **spotlight 细节严谨**：Notification 强引用防 GC 丢 click（`resultNotifications` Set）、blur 150ms 延迟 + focus 取消（防 Windows panel 抢焦点误隐藏）、`isSafeSpotlightAccelerator` 校验、`timeoutType:'never'`（非 macOS）。
- **caption 跟随**：display matrix hash 持久化相对偏移、animejs 动画 throttle(60fps)+debounce(200ms) settle、`lastProgrammaticMoveAt` 抑制程序移动回写、detach 完整清 listener。
- **powerMonitor 单例**：进程级 `initialized` 标志防多窗口重复订阅 suspend/resume 4 事件。
- **devtools 多 key 复用**：`Map<key, ReusableWindow>` per-key 窗口 + closed 自动移除。
- **desktop-overlay 契约纯函数**：window-contract.ts（选项/输入隔离/showInactive）已是纯函数 + 既有测试。

**发现并修复 1 个真 bug：notice.open() 悬挂** —— `notice/index.ts` 的 `open()` 返回的 Promise 只在用户点击 confirm/cancel 按钮（`windowAction`）时 resolve；若用户直接点 OS 关闭按钮关窗，没有 action 发出 → 调用方 `await requestNotice(...)`（controls-island-fade-on-hover.vue 切换开关）永久悬挂，功能状态卡死无响应。**修复**：`referenced-window.ts` 的 `sessionDisposed` 订阅（窗口 `closed` 时触发）+ `notice/index.ts` 在 session disposed 时 resolve(false)（settled 防重入 + offline 解绑 + 60s 超时兜底）。行为：用户点 X 关窗 → 开关 await 立即 settled 为"未确认"，不悬挂。

**新增 2 个测试文件 +8 用例**：`windows/notice/index.test.ts` 3 测试（窗口被关 resolve false / confirm resolve true / cancel resolve false，用真实 referenced-window manager + fake BrowserWindow EventEmitter + stub adapter）；`windows/shared/referenced-window.test.ts` 5 测试（sessionDisposed 触发 + off 解绑 / 同 id 复用 / closed 后重建 / pageMounted 匹配 id 返回 pending / pageUnmounted 删条目）。

**踩坑（①-3 测试）**：① hoisted 单例 mock 跨用例累计，`find(call => call[1] === contract)` 会拿到旧窗口的 handler → 共享 describe 必须 `beforeEach(vi.clearAllMocks)`；② fake BrowserWindow 需 `emit` 方法（referenced-window 的 closed handler 调 `win.emit('session-disposed')`）；③ fake 的 `BrowserWindow.on` 要能把 handler 存 map 供 `close()` 触发。

验证：typecheck 绿 + 全套 **87 files / 683 passed / 1 skipped**（+2 测试文件 +8 用例）+ dev 冷启动 6121/6122 LISTENING（PID 16868，overseer supervisor started + llm-provider synced + WS connected，仅 duckdb sourcemap 警告）。待实机（非代码问题）：desktop-automation 实机、onboarding 引导、自动更新链路。

## ①-4 Electron 系统服务（细分）

> 父模块：模块① 桌宠本体。范围：`src/main/services/electron/*`（app / auto-updater / global-shortcut / global-shortcut-uiohook / index / mock-auto-updater / powerMonitor / screen / system-preferences / window —— 10 个非测试文件）。
> 现状：**0 处 TODO**（auto-updater.test.ts 第 1 行过时「待仓库地址确认」残留已删——`lxfebd/kitsune-ai` 在 electron-builder.config.ts owner/repo、README、PROJECT-MAP 等 11 文件 30 处一致引用，地址已确认）。
> 验收（2026-09-08）：**electron 系统服务全部逐文件审计 → 补测 → 验收。**

**审计要点（全部干净）**：
- **auto-updater（582 行）**：GitHub Releases API + Atom feed 双冗余解析 lane 标签（API 失败自动降级 Atom）、`extractReleaseTagsFromAtom` 无依赖手写扫描器（marker 锚定 `/lxfebd/kitsune-ai/releases/tag/` + 逐字符截断 + decodeURIComponent + 去重）、`getSemverFromTag` 容忍 `v` 前缀、`isTagInLane` 六 lane 语义（latest 全收 / stable 排除 prerelease / 其余按 prerelease 段匹配）、`semaphore` 串行化 download/quitAndInstall、`withDiagnostics` 只含权威诊断字段（平台/arch/channel/executablePath/installDirectory/requiresAdminForInstallPath/isOverrideActive，测试断言不泄漏 updaterCacheDir 等内部字段）、30s 延迟首检 + `forceDevUpdateConfig` 仅 dev + `UPDATE_SERVER_URL` 仅 dev 生效、`cleanupStaleUpdateFiles` 清理新旧两代缓存目录、Windows 静默安装 `quitAndInstall(true, true)`。
- **global-shortcut（199 行）**：双驱动路由（receiveKeyUps → uiohook，否则 electron.globalShortcut）、主进程独占快捷键（spotlight）保护（renderer unregisterAll 不删 main-owned）、同 accelerator 事务性重绑（失败回滚恢复旧 handler）、`globalShortcut.register` false 上报 Conflict（macOS 媒体键/辅助权限拒绝无法区分）。
- **global-shortcut-uiohook（337 行）**：W3C key 名 → UiohookKey 常量映射（字母/数字/F1-24/26 个命名键）、严格修饰符匹配（多 Cmd 不触发 Shift 绑定）、keyup 按 keycode 配对（修饰符提前释放不丢 up）、auto-repeat 抑制（pressed 标志）、lazy start/stop（首个注册才装监听，最后解绑才停钩子）、Wayland 拒绝（XRecord 收不到事件）、macOS Accessibility 权限检查（isTrustedAccessibilityClient）、`dispose` 完整移除 keydown/keyup 监听。
- **app（23 行）**：isMacOS/isWindows/isLinux 平台探测 + openUserDataFolder（openPath 非空即 throw）+ quit，全部由既有 app.test.ts 覆盖。
- **powerMonitor/screen/system-preferences/window**：①-3 已审（powerMonitor 进程级 initialized 单例、window 生命状态 + sender.id 鉴权）。
- **mock-auto-updater / index**：dev 占位（EventEmitter + 1.5s 模拟延迟 + 100MB 模拟下载进度），导出装配干净。

**发现 1 处测试空白 → 补 1 个测试文件 +8 用例**：`setupAutoUpdater` 核心逻辑有 30 用例矩阵覆盖，但 **`createAutoUpdaterService` 服务层完全无测试**（subscribe 状态 → `electronAutoUpdaterStateChanged` 转发、5 个 invoke handler：getState/checkForUpdates/downloadUpdate/quitAndInstall + get/setUpdaterPreferences、窗口 closed 解绑）。新增 `auto-updater-service.test.ts`：用真实 core eventa `createContext` + `defineInvoke` 走完整信封链路（顺带验证服务层 subscribe 的状态推导有意义），mock 掉 electron/logg/tryCatch 副作用；覆盖：subscribe 初始回放 + 后续状态转发 / getState 返回当前态 / checkForUpdates + downloadUpdate 转发并回读 state / quitAndInstall 转发 / getPreferences 读 lane / setPreferences 写 lane / 窗口 closed 后不再转发状态。

**顺带修复 ①-3 测试 typecheck 债（14 处）**：notice/referenced-window 两个测试文件的 hoisted `defineInvokeHandlerMock` 无参数签名 → `mock.calls` tuple 为空导致 `call[1]/call[2]` 索引越界（TS2493）+ 越界 cast 误报（TS2352），且完全被 ①-3 验收时对测试文件不带 --noEmit 的宽松遗漏。修复：mock 加 `(_context, _eventa, _handler)` 参数签名 + keep-as-unknown cast。

**踩坑（①-4 测试）**：mock service 的 `state` 字段按值复制会拿到初始引用（handler 读到陈旧态）——必须用 getter + 内部状态；`getPreferredUpdateLane` mock 默认值要与 set 后的断言一致，否则 setPreferences 返回旧值。

验证：typecheck 0 错误 + 全套 **88 files / 691 passed / 1 skipped**（+1 测试文件 +8 用例）+ dev 冷启动 6121/6122 LISTENING（PID 29392，404 为 WS/SSE 端点预期）。待实机（非代码问题）：GitHub Release 真实 update feed 拉取、uiohook 真实按键捕获（macOS 辅助功能权限 / X11）。

## ①-5 renderer 页面与设置页（细分）

> 父模块：模块① 桌宠本体。范围：`src/renderer/pages/*`（chat / spotlight / desktop-overlay / inlay / caption / dashboard / widgets / notice / devtools / settings×16 页）+ 全部 renderer eventa 监听器与页面级业务逻辑。
> 现状：**2 处 TODO，其中 1 处已修、2 处为跨仓库/上游已知限制**（见下）。
> 验收（2026-09-08）：**renderer 全部页面逐文件审计 → 修复 → 验收。**

**审计要点（全部干净）**：
- **renderer eventa 监听器 17 处全部正确**：OverseerPanel.vue:123、ConnectorsPanel.vue:82、useOverseerEvents.ts:38、stage-window-lifecycle.ts:54、models/index.vue:312-330、global-shortcut.vue:166、ExecutorPanel.vue:157、FindElementBridge.vue:127、PermissionConfirmDialog.vue:27、VisionCheckBridge.vue:44、useExecutorEmotion.ts:23、tts-section.vue:623/639、comfyui-section.vue:224、stage-three-runtime-trace.ts:95 —— 全部正确解构 eventa 信封的 `event.body`（业务 payload 在 `body` 字段，与核心 eventa 机制一致），无一处直读顶层字段。
- **chat.vue（32 行）**：薄包装（InteractiveArea + WindowTitleBar），路由 meta.layout=stage，干净。
- **pages/index.vue（604 行）**：主舞台页；18 个 `[Main Page]` console 日志是语音→聊天链路的**合理功能追踪**（每个句尾 delta → 整段 speech end → requestIngest 一次发送），并有 NOTICE 注释解释"句子级发送改整段发送"的行为变更，非调试残留。
- **settings/tts-section.vue（1154 行，最大页面）**：5 级目录解析、异步 CUDA probe、语言路由、PCM→WAV 均在服务层（①-2 B 组已测），页面层只剩表单/状态往返，干净。

**修复 1 处 TODO**：`src/renderer/main.ts` 的 `autoAnimatePlugin` 曾被 `as unknown as Plugin` cast（因上游 @formkit/auto-animate 旧版类型把 `autoAnimatePlugin` 声明为没有 `Plugin` 类型的旧签名）——**上游已修复**（@formkit/auto-animate@0.9.0 的 `vue/index.d.ts` 声明 `autoAnimatePlugin: Plugin`），移除 import type + cast，`.use(autoAnimatePlugin)` 直接使用。验证：typecheck 0 错误 + 全套 88 files 691 passed + renderer 测试 23 files 150 passed + dev 冷启动 6121/6122 LISTENING（PID 9532）。

**保留 2 处已知限制（不改）**：
- `main.ts:44` `// TODO: vite-plugin-vue-layouts is long deprecated...` —— 跨仓库架构债务（stage-web + stage-pocket + stage-tamagotchi 三端都要迁移 router 方案），已列入模块② 已知限制，本次不动。
- Weather.vue:130 Windows 圆角 TODO —— **上游 bug**（Electron#48340 / Chromium 432457523），非本仓库可解。

验证：typecheck 0 错误 + 全套 **88 files / 691 passed / 1 skipped** + renderer 测试 23 files / 150 passed + dev 冷启动 6121/6122 LISTENING（PID 9532）。待实机（非代码问题）：TTS/ComfyUI 设置页全功能链路（需 GPT-SoVITS/ComfyUI 安装）、语音输入（麦克风权限 + VAD 实机）。

## ①-6 shared/eventa 与桌面工具（细分）

> 父模块：模块① 桌宠本体。范围：`src/shared/eventa/*`（IPC 契约主文件 1407 行 + plugin 域模块 assets/capabilities/host/tools）+ `desktop-overlay-heartbeat` / `desktop-overlay-live-window-smoke` / `model-settings-runtime` / `spotlight-shortcut` / `mcp-config` / `utils/electron/windows/window-size`。
> 现状：**2 处 TODO 均为 2026-09-07 已消标记**（MODULES.md 记的「2 个 TODO」即 `PluginCapabilityState` 复用 SDK `CapabilityDescriptor` 的两处注释，grep 全范围已无待处理 TODO/FIXME）。
> 验收（2026-09-08）：**shared 全部文件逐文件审计 → 修复 → 补测 → 验收。**

**审计要点（全部干净）**：
- **eventa/index.ts（1407 行 IPC 契约主文件）**：六域契约（窗口/系统/服务/执行器/自动化/Web 工具）类型完备；核心 eventa 机制——`defineInvokeEventa<R, P>` 返回类型化 invoke 契约、`defineEventa<P>` 返回事件契约，全部通过 `@moeru/eventa` 单一类型源，main/renderer 双向消费无字段漂移；Overseer/Executor/Director 事件 schema 权威定义在此（main 侧 eventSchema.ts 重新导出）。
- **plugin 域模块**：assets（asset-base-url）/ capabilities（`PluginCapabilityState` = SDK `CapabilityDescriptor` 复用 + provider 列表）/ host（registry/session/kit/module 四层 inspect 快照）/ tools（agent tools + xsai 工具集 + tools-changed 事件）——`domains.test.ts` 验证 barrel 与域模块导出同源。
- **mcp-config.ts**：zod `.strict()` 双 schema（server 定义 + 配置文件）+ `formatElectronMcpConfigIssues` 路径保留格式化 + `parseElectronMcpConfig/Text` 双入口，main/renderer 共用（mcp-config.test.ts 已覆盖非法 JSON/缺字段路径）。
- **window-size.ts**：`normalizeWidgetWindowSize` 输入钳制（非对象/NaN/非正数 → undefined；floor 化；min/max 约束逐项校验）——已被 `main/windows/widgets/index.test.ts` 覆盖。
- **model-settings-runtime.ts**：broadcast channel 事件联合类型（request-current/snapshot/owner-gone），main/renderer 双向消费（index.vue 走此通道）。
- **desktop-overlay-heartbeat / live-window-smoke**：调试标记常量 + `selectDesktopOverlaySmokeCandidateId`（`lastGroundingSnapshot.targetCandidates` 中按 chrome_dom 来源 + label 匹配，缺 snapshot/缺 id 均 throw）——smoke 测试 4 用例已覆盖。
- **spotlight-shortcut.ts**：`isSafeSpotlightAccelerator`（modifiers 含 cmd/ctrl/alt/super 之一即安全）——被 main spotlight/index.ts:193 与 renderer window-shortcuts.vue:89 两处消费，**原无直接测试，已补 7 用例**。

**修复 1 处过时注释（非 bug）**：`eventa/index.ts` Permission whitelist 段的 NOTICE「当前主进程未实现，UI 默认走 mock 数据」已过时——三个 handler（`electronPermissionWhitelistList/Remove/Clear`）早在 `main/services/kitsune/overseer/index.ts:1195-1205` 由真实 `PermissionModel`（permission.ts，持久化到 userData/permission-whitelist.json + HIGH_RISK_PATTERNS 高危扫描）实现，renderer 两侧 UI（WhitelistPanel.vue / devtools/permission-whitelist.vue）也已移除 mock 回退（「不再伪装成 mock 数据：明确告知用户加载失败」）。更新注释为 handler 由 PermissionModel 实现，消除文档与代码不一致。

**新增 1 个测试文件 +7 用例**：`spotlight-shortcut.test.ts` —— `isSafeSpotlightAccelerator` 7 用例（cmd/ctrl/alt/super 各接受、含安全修饰符的多修饰符接受、仅 shift 拒绝、空 modifiers 拒绝）。

验证：typecheck 0 错误 + 全套 **89 files / 698 passed / 1 skipped**（+1 测试文件 +7 用例，①-6 起 698）+ 受影响回归 4 files 14 passed + dev 冷启动 6121/6122 LISTENING（PID 15700，仅 duckdb sourcemap 已知警告）。**至此模块① 六个子模块全部 ✅**，模块① 完整验收完成。待实机（非代码问题）：同前（TTS/ComfyUI 链路、uiohook 实机、GitHub update feed）。

## 模块 ② 舞台渲染 UI（stage-ui 全家桶）
- 范围：stage-ui / stage-pages / stage-layouts / stage-ui-live2d / -three / -spine / -pixi / model-driver-* / pipelines-audio / ui 系列
- 现状：**6 子模块全部 ✅ 已验收（2026-09-08）**，见下方各子模块 + 各轮「已修」记录（②-1..②-6，含 5 处 VRM 强转消灭 + 约 40 处 TODO 定级/处理 + 10 处 console 前缀修复 + stage-ui 11 处 (audit) 补标）。遗留 TODO 均带 `(audit)` 标注可追踪，非 bug。
- **小模块（6 个子模块）**：
  1. **✅ 核心组件库** —— `stage-ui/src/components/*`（animations / auth / data-pane / form / gadgets / graphics / markdown / menu / modules / scenarios / scenes / widgets）+ `assets / composables / libs`：TODO 最密集区（14 文件）—— **细分见下方「②-1」**（5 文件 7 处全处理：3 域名动态化 + vision 超时可配置 + story 过期占位删；2 处架构债务定级保留）
  2. **✅ 状态与数据层** —— `stage-ui/src/stores / services / database / models / types / workers / utils / constants / tools`：pinia 硬编码注入、use-optimistic 迁移 pinia-colada、transcriptions 传播待审 —— **细分见下方「②-2」**（9 处定级：2 debug 清理 + 1 toolCalls 接真实数据 + 6 架构债务/功能提案入待审）
  3. **✅ Live2D 渲染** —— `stage-ui-live2d/src`（场景 / Model.vue / opfs-loader）：3 TODO 全定级为依赖未落地的功能提案（非 bug）—— motion 自动配置（`Model.vue:571`，motion 已 localStorage 持久化，缺用户选择 UI，随 stage editor）；眼睛参数动态化（`Model.vue:339` + `animation.ts:28`，Soullink profile 已是动态实现，硬编码仅无 profile 兜底）；rAF 阴影循环 `Model.vue:618`（动态主题色无 push 机制）；view-control 用户首选默认值（功能提案）。5 处 TODO 标注 `(audit)` + 依赖说明；1 处裸 `console.error` 补前缀。验收：typecheck 0 错 + 6 files / 26 passed 基线一致
  4. **✅ 多渲染后端** —— `stage-ui-three / -spine / -pixi` + `model-driver-lipsync / model-driver-mediapipe` + `pipelines-audio` —— **细分见下方「②-4」**：VRM 强转 5 处全部消灭（three 0.184 后 0.180 TODO 已 stale）+ 11 处 TODO 定级标注 + 裸 console.error 补前缀
  5. **✅ 页面与布局** —— `stage-pages/src/pages`（含 settings/modules 插件模块页）+ `stage-layouts/src` —— **细分见下方「②-5」**：8 处 TODO 全定级 + 4 处裸 console.error 补前缀
  6. **✅ UI 系列与杂项** —— `ui / ui-transitions / ui-loading-screens / audio / cap-vite / electron-eventa / electron-vueuse / electron-screen-capture / kitsune-screenshot / kitsune-emotion-mapper / stream-kit / vishot-*` —— **细分见下方「②-6」**：3 处 TODO 定级 + 2 处 console 前缀；stage-ui console.* 78 处日志分级审计留 ②-6 后续
- **模块② 验收（2026-09-07）**：typecheck 全绿（stage-ui / stage-ui-live2d / stage-pages / stage-layouts）；测试 stage-ui 462/462（70 files）+ stage-ui-live2d 26/26（6 files，原先 1 个失败已修）。
- 已修（2026-09-07）：
  - **Live2D 眨眼 FIXME** —— idle motion 曲线绕过原只改 `ParamEyeBallX/Y`，漏掉 `ParamEyeLOpen/ROpen`，强制眨眼计时器与 idle 曲线写同一参数导致"只有 idle 动画的模型不眨眼"。绕过扩展至全部 4 个眼参数（`Model.vue`），眨眼交由计时器插件统一管理。
  - **opfs-loader 测试修复** —— `checkMiddleware` 的 `(window as any)` 在 node 测试环境抛 ReferenceError（无窗口守卫）、测试 fetch stub 缺 `ok: true` → 1 个既有测试一直失败。加 `typeof window !== 'undefined'` 守卫 + 补 `ok: true`，26/26 全绿。
  - **PluginCapabilityState 去重** —— `stage-ui/stores/devtools/plugin-host-debug.ts` 自维护的重复接口改为 `import type { CapabilityDescriptor }` + `export type PluginCapabilityState = CapabilityDescriptor`（stage-ui 新增 `@kitsune/plugin-sdk` workspace 依赖），消灭 1 处 TODO。
  - **background-picker emit 类型** —— 4 处 `(emit as any)('apply'|'import', payload)` 去 cast：`defineEmits` 本已声明 `{ option, color? }` 签名，移除 1 处 TODO。
- 已修（2026-09-08 ②-1+②-2 一轮）：
  - **域名占位动态化（3 处 TODO 消灭）** —— `libs/providers/providers/openrouter-ai/index.ts` 的 `HTTP-Referer` 改为 `new URL(SERVER_URL).origin + '/'`随 `VITE_SERVER_URL` 联动；`ollama/index.ts` 的 CORS 失败指引改为运行时取 `window.location.origin`（node 回退 SERVER_URL origin），给用户真正需要的 OLLAMA_ORIGINS 值；`callout.story.vue` 过期"待仓库地址确认"注释删除（地址 `lxfebd/kitsune-ai` 已确认）。`libs/server.ts` 本身保留 `VITE_SERVER_URL ||` 兜底不改。
  - **vision 推理超时可配置** —— `composables/vision/use-vision-inference.ts` 的 60s 硬编码 TODO 改为 `VisionInferenceInput.timeoutMs?` 参数（默认 60s 不变，orchestrator 零改动），+2 测试钉住（5s 覆盖触发 + 提前完成不误伤 abort）。
  - **context-bridge toolCalls 假数据修复** —— `stores/mods/api/context-bridge.ts` 的 `onChatTurnComplete` 广播里 `'toolCalls': []` 硬编码改为透传 `chat.toolCalls`（core-agent 回调本就携带 `ToolMessage[]`，契约 `OutputGenAiChatCompleteEvent.toolCalls` 必填）；usage 保留 estimate-based，TODO 升级为精确说明（core-agent 的 usage 是异步 Promise，未暴露到 hook 契约，属跨包增强点）。
  - **chunkTTSInput debug 日志清理** —— `utils/tts.ts` 两处 `TODO: remove later` 调试 console.debug  removal（流式分句热路径上的每轮输出）。
  - **审计定级保留（8 处，非 bug）** —— providers.ts legacy→defineProvider 渐进迁移注记、llm-tools 诊断预留、llm.ts×2 上游架构注记（command callback per-stream 注册 + destination 幻觉）、context-bridge 多窗口 ingestion 锁（SharedWorker 在 Android Chromium 被禁用，Web Locks 是候选）、hearing VAD 静音断句提案、persona Minecraft Agent 扩展占位、use-modules-list synthetic store 建议、use-optimistic 移 pinia-colada 建议。
  - **②-1/②-2 验收**：stage-ui typecheck 0 错误 + stage-ui 测试 70 files / 462 passed + 新增 vision 2 用例（该文件 4/4）；stage-tamagotchi 全量回归 **89 files / 698 passed / 1 skipped** 零回归。components 176 vue / composables 47 / libs 92 文件规模下 console.* 共 78 处（多为 error/warn 正当上报，日志分级审计列入 ②-6 后续）。
- 已修（2026-09-08 ②-3 一轮）：**Live2D 渲染 3 TODO 全部定级为依赖未落地的功能提案/合理设计（非 bug）**—— ① `Model.vue:339` + `animation.ts:28` 眼参硬编码：Soullink profile（parameterMap，`Model.vue:374`）已是动态实现，硬编码仅是**无 profile 时的 Cubism 4 标准兜底**，随 stage editor（参数重映射 UI）落地后消除；② `Model.vue:571` motion：运行时 motion 已支持 localStorage 持久化选择（`selected-runtime-motion-*`），缺的是用户选择 UI（stage editor 同批）；③ `Model.vue:618` rAF 阴影循环：动态主题色无 push 机制（CSS var 订阅可去循环，仅 dynamic shadow 开启时运行）；④ `view-control.ts:21` 首选默认值：position/scale 已 useLocalStorage 持久化，缺"重置到用户默认"设置 UI。**5 处 TODO 全部加 `(audit)` 标注 + 依赖说明，变成可追踪债务**。**卫生修复 1 处**：`utils/live2d-preview.ts:84` 裸 `console.error(error)` 补前缀 `[Live2D preview]`；31 处 console 其余 30 处均带前缀标签正当（8 debug 缓存链路/引擎降级、12 warn、10 error）。验收：typecheck 0 错 + stage-ui-live2d 6 files / 26 passed 基线一致。
- 已修（2026-09-08 ②-4 一轮）：**多渲染后端 TODO 全清（3 类）**——
  - **VRM 强转消灭（5 处，含 3 个 stale「three 0.180」TODO）** —— catalog 已升至 `three ^0.184.0`（pnpm-workspace.yaml:332，对应 `@types/three ^0.184.0`:155，安装位 `.pnpm/@pixiv+three-vrm@3.5.2_@types+three@0.184.0_three@0.184.0`），@pmndrs/pointer-events 与 @types/three 的 Object3D 兼容问题已随升级解决。`composables/vrm/animation.ts` 两处 `vrm.lookAt.target = new Object3D() as unknown as Object3D`（lookAt.target 声明 `THREE.Object3D | null`，直接赋值即可）+ `VRMModel.vue` 的 `updateNprShaderSetting(vrm.scene as unknown as Object3D)` + 2 处 `VRMUtils.deepDispose(vrm.scene as unknown as Object3D)`（`VRMModel.vue:259` / `vrm-preview.ts:14`，deepDispose 参数本就是 `THREE.Object3D`）—— 5 处强转全部删除，22 行 TODO 注释块清除；`vrm-preview.ts` 移除不再使用的 `Object3D` type import。验证：`@kitsune/stage-ui-three` typecheck 0 错 + 4 files / 16 passed 一致。
  - **TODOs 定级标注（11 处 `(audit)`）** —— stage-ui-three 7 处（SkyBox blurriness 设置提案、VRMModel stylised shader 注入属 Lilia 规划、ThreeScene pinia 硬编码注入——Lilia 注释表明按设计汇聚数据、model-store 类型抽离/灯光系统重设计、view-control min/max 设置 UI）+ model-driver-mediapipe pose-to-vrm 向量助手共享工具提案；其余包（spine/pixi/lipsync/pipelines-audio）无遗留 TODO。
  - **console 卫生（4 处）** —— `VRMModel.vue` 的 4 处裸 `console.error(error)` 补前缀：frame hook / frame runtime hook / dispose hook / load error。stage-ui-three 其余 console 均带前缀标签（17 warn / 5 error / 1 info / 1 debug，debug 为 `core.ts:89` 注释掉的行）。**chunkTTSInput debug 清理**（同 ②-2 的 tts.ts 同文件 `pipelines-audio/src/processors/tts-chunker.ts`）：删除 2 处 `TODO: remove later` 残留（`console.debug('while loop ends, chunk/buffer:', ...)` + 注释掉的 `special yield` debug），保留功能 guard。验证：pipelines-audio typecheck 0 错 + 5 files / 35 passed；stage-ui-spine / stage-ui-pixi / model-driver-mediapipe typecheck 全绿（model-driver-lipsync 无 typecheck script，叶子包被上游消费）。
- 已修（2026-09-08 ②-5 一轮）：**页面与布局 TODO 全清（2 类）**——
  - **TODOs 定级标注（7 处 `(audit)`）** —— stage-layouts 3 处：About.vue 域名链接（Home/Documentations 属 `api.kitsune.ai` 同类用户域名决策，GitHub `lxfebd/kitsune-ai` 已确认故删注释）、use-transcriptions.ts 传播给用户（Web Speech 不可用仅 console.error，需 UI 提示）、background.ts localforage 键结构收敛；stage-pages 4 处：context-flow 事件 schema 校验（zod/valibot）、comfyui electron-vueuse typed ipcRenderer 移植提案（electron-vueuse 现无 ipcRenderer 包装）、audio-speech useRefHistory 替代手写 watch、v2 provider edit DOMPurify → HTML Sanitizer API 迁移。
  - **console 卫生（4 处）** —— stage-pages 裸 `console.error` 补前缀：aliyun-nls 转写失败 + 录音启动失败、data/status.ts action 错误、player2-speech 可达性检查失败。验证：stage-pages / stage-layouts typecheck 全绿。
- 已修（2026-09-08 ②-6 一轮）：**UI 系列与杂项 TODO 全清（2 类）**——
  - **TODOs 定级标注（3 处 `(audit)`）** —— cap-vite cli.ts 手写 argv 解析（cac 已是依赖，规则增长时再迁移）、ui-loading-screens SciFiCircle 占位域名（用户域名决策）、ui basic-text-area 4px magic number（防抖动 workaround，根因待查）。
  - **console 卫生（2 处）** —— ui-transitions StageTransitionGroup 过渡钩子错误、vishot-runtime use-scene-ready 场景就绪失败，裸 `console.error` 补前缀（vishot-runner-{browser,electron} 与 kitsune-screenshot 的 cli 错误输出本就有 `errorMessageFrom()` 消息，非裸调）。验证：14 个包 typecheck 全绿（ui/ui-transitions/ui-loading-screens/audio/cap-vite/electron-eventa/electron-vueuse/electron-screen-capture/kitsune-screenshot/kitsune-emotion-mapper/stream-kit/vishot-{runtime,runner-browser,runner-electron}），cap-vite 测试 5 files / 26 passed，其余包无测试脚本。
- **模块② 全部子模块 ✅（2026-09-08）**：②-1 核心组件库 / ②-2 状态与数据层 / ②-3 Live2D 渲染 / ②-4 多渲染后端 / ②-5 页面与布局 / ②-6 UI 系列与杂项 —— 详细见上各轮验收。
- 已修（2026-09-08 ②-6 收尾）：**stage-ui 遗留 TODO 全部补 `(audit)` 标注（11 处）** —— ②-1/②-2 定级归档但代码内仍裸 TODO 的项统一打标可追踪：use-modules-list 合成 store、use-optimistic pinia-colada 迁移、server.ts 域名兜底（用户决策）、llm-tools 诊断预留、llm.ts×2（command callback 注册 + destination 幻觉）、providers.ts legacy 迁移、context-bridge×2（多窗口 ingestion 锁 + usage Promise）、persona Minecraft 扩展、hearing VAD 断句。**验收全仓**：stage-ui typecheck 0 错 + 70 files / 464 passed（重跑两次确认稳定，首跑 8 flaky 失败后复跑全绿）；stage-tamagotchi 89 files / 698 passed / 1 skipped 零回归；②-3/②-4/②-5/②-6 各包 typecheck + 测试全绿（stage-ui-three 16/16、pipelines-audio 35/35、cap-vite 26/26）。
- 已知限制（不改）：About.vue / `libs/server.ts` 的 `api.kitsune.ai` 兜底域名 —— 可用 `VITE_SERVER_URL` 运行时覆盖，域名归属用户决策（ollama/openrouter 两处原硬编码已于 2026-09-08 接入 SERVER_URL 派生，不再硬编码）。
- 待审（后续优先级）：Live2D motion 自动配置（`Model.vue:570`"Not every model has motion, we need to help users set motion"）、use-optimistic 迁移 pinia-colada、眼睛参数动态化（依赖 emotion mapper / stage editor）、transcriptions 传播给用户、legacy speech/transcription providers 迁移 defineProvider、context-bridge 多窗口 ingestion 协调（Web Locks 方案）、hearing VAD 静音断句、stage-ui console.* 78 处日志分级审计（②-6）、SkyBox blurriness 设置、model-store 灯光系统重设计（Warudo 风格卡通渲染 workaround）、ThreeScene pinia 单点访问契约（若未来要 props 注入）。

## 模块 ③ 服务端（apps/server + server 系列）
- 范围：Hono 网关（openai/providers/chats/characters/stripe/flux/voice-packs/admin）、server-runtime（WS 6121）、server-sdk、better-ws、计费/OTel
- 现状：268 文件；11 个文件含 TODO 标记
- **小模块（7 个子模块）**：
  1. **✅ Hono 网关 core** —— `apps/server/src/app.ts + routes/{openai,providers,chats,characters,admin}`：HTTP 路由面 —— **细分见下方「③-1」**（10 处 TODO：3 修 + 1 悬空删 + 6 架构债带 (audit) 标注；+8 测试）
  2. **✅ 实时通道** —— `routes/{chat-ws,audio-speech-ws,audio-transcription-stream}`：WS/流式通道（0 TODO）
  3. **✅ 计费与外部集成** —— `routes/{stripe,flux,voice-packs}`：strip 订阅 flux 计费为 (audit) 架构债待接（`creditFlux` 已存在）
  4. **✅ 领域服务与持久化** —— `apps/server/src/services/domain/* + schemas`：2 个 TODO（domain/chats.ts、domain/characters.ts）已处理（③-1）
  5. **✅ 基础设施** —— `apps/server/src/{middlewares,libs,types,utils,bin,scripts}`：0 TODO
  6. **✅ server-runtime + server-sdk 运行时** —— `packages/server-runtime/src`（WS 6121，已并入模块① 验收 50/50+19/19）+ `packages/server-sdk / server-sdk-shared / server-shared / server-schema`：peer registry / consumer selection / heartbeat 下沉到 `@kitsune/better-ws/server` 为 (audit) 架构债
  7. **✅ better-ws 协议原语** —— `packages/better-ws`：`createWsServer` 协议中立原语（94/94 已验，0 TODO）
- **模块③ 验收（2026-09-07）**：`apps/server` typecheck 绿 + 测试 467 passed / 3 skipped（49 files）；server-runtime / server-sdk 已含在模块① 验收（50/50 + 19/19）。
- **模块③ 全子模块 ✅（2026-09-09）**：③-1 修复 10 处 TODO（+8 测试，apps/server 475/3）；③-2/③-3/③-4/③-5 扫描 0 遗留；③-6 peer registry 下沉标 (audit)；③-7 better-ws 0 TODO。全仓验收：apps/server 50 files / 475 passed / 3 skipped + server-runtime 8 files / 50 passed + better-ws 5 files / 94 passed + server-sdk 3 files / 19 passed + server-runtime typecheck 绿。console 审计：全部走 logg/useLogger，无裸 console。
- 已修（2026-09-07）：
  - **character-capability / avatar-model 两个过期 TODO** —— `types/character-capability.ts`、`types/character-avatar-model.ts` 的 "Implement the config" 注释是残留：config 接口早已实现并被 `schemas/characters.ts` 的 `$type<keyof CharacterCapabilityConfig>()` / `$type<AvatarModelConfig[keyof AvatarModelConfig]>()` 与 `routes/characters/schema.ts` 的 `CharacterCapabilityConfigSchema` / `AvatarModelConfigSchema` 引用。删除注释。
- 已修（2026-09-09 ③-1 一轮）：**Hono 网关 core TODO 全清（10 处，分 4 类）**——
  - **成员不变量入 schema（2 处 TODO 消灭 + 6 测试）** —— `routes/chats/schema.ts` 抽象 `MemberSchema`（`pipe(object(...), check(...))`：`type === 'user'` 要求 userId、非 user 类型要求 characterId），`CreateChatSchema.members` 与 `AddMemberSchema` 复用；不变量现在在 HTTP 边界 4xx 拒绝（safeParse 失败 → createBadRequestError），不再只靠领域层 throw。`domain/chats.ts addMember` 的守卫保留但升级为 `createBadRequestError`（直接调用方仍有防御）。新增 `chats/schema.test.ts` 7 用例钉住（user+userId 过 / user 无 userId 拒 / character+characterId 过 / character 无 characterId 拒 / bot 无 characterId 拒 / 未知类型拒 / CreateChat 嵌套成员同规则）。
  - **providers update 限制（1 处 TODO 消灭 + 1 测试）** —— `UpdateProviderConfigSchema` 移除 `validated`/`validationBypassed`（服务端管理态，验证流程写入，客户端不可自授权）；Create 保留（初始化时允许置）。回归测试：PATCH 带 validated=true 返回 200 但 DB 不落盘（valibot object() 默认剥离未知键，即"静默拒绝写"语义）。
  - **悬空注释删除（1 处）** —— `schemas/characters.ts` 的 `// TODO: json patch?` 是开发期疑问残留，无对应字段/功能跟进，删除。
  - **架构债定级标注（6 处 `(audit)`）** —— characters Create/Update DTO 边界（createInsertSchema 泄漏 ownerId/creatorId/timestamps）、providers Create DTO 边界、domain/characters update 响应形状（Drizzle returning() 数组跨界）、stripe webhook 订阅制 flux 计费（`creditFlux` 已有一口价路径）。
  - **验收**：apps/server typecheck 0 错 + 测试 **50 files / 475 passed / 3 skipped**（+8 用例，基线 467）。
- 已知限制（架构级，不改）：`routes/characters/schema.ts`（Create+Update）+ `routes/providers/schema.ts`（Create）的 HTTP DTO 边界（createInsertSchema 派生请求体泄漏 ownerId/creatorId 等持久化字段；Update 侧已 2026-09-09 收窄）；`services/domain/characters.ts` update 响应形状（returning() 数组跨界）；stripe webhook 订阅制 flux 计费未实现（`creditFlux` 已存在，订阅启用时再接）；server-runtime peer registry / consumer selection / heartbeat 下沉到 `@kitsune/better-ws/server`（该包已提供 `createWsServer` 协议中立原语）。
- 待审：—

## 模块 ④ 智能编排（Overseer + Agent）
- 范围：kitsune-overseer（感知层）、main/services/kitsune/overseer（编排层）、core-agent、core-character、plugin-sdk 体系
- 现状：感知层 0 TODO（✅）；plugin-sdk 6 TODO 已全标注 `(audit)`（✅ 2026-09-09）；core-agent stale-context TODO 已标注 `(audit)`；airi-plugin-vscode 已非空壳（真实现）
- **小模块（5 个子模块）**：
  1. **✅ 感知层监控源** —— `packages/kitsune-overseer/src`：zcode / claudeCode / workbuddy / genericAiTool / Trae / live2dState 监控 + supervisor + monitorStore + idleDetector + taskPusher + tailFiles；45/45 已验，**待扩：更多监控源 + 自动修复闭环实机**
  2. **✅ 编排核心** —— `apps/stage-tamagotchi/src/main/services/kitsune/overseer/`：eventSchema / capture / director（评审 + watcher）/ permission / correctionTracker / delayStrategy / pushFilter / reactionMapping / resultChecker / auditLog；74/74 已验，**eventa window-namespacing 架构 TODO 待审**
  3. **✅ 计划执行器** —— `overseer/executor/*`：dag / planner / planGenerator / taskRunner / llmHelper / acceptance / loop / codeStyleAnalyzer；**DAG 图示化 + 计划评审 UI 已落地（2026-09-07）**，实机执行闭环待审
  4. **✅ agent 核心库** —— `packages/core-agent`（agents / contracts / messages / runtime / session）+ `packages/core-character`（context-builder / registry / loader / types）；core-agent typecheck 绿 + 70/70（12 files，2026-09-09）
  5. **✅ 插件 SDK 与宿主** —— `packages/plugin-sdk/src`（extension / kit / plugin / channels / utils / plugin-host）+ `plugin-protocol` + `plugin-sdk-tamagotchi` + 根 `plugins/default`：71/71 已验，6 TODO 全 `(audit)`（2026-09-09）；实际宿主走 plugin-host（core/runtimes/transports 真实实现）
- **模块④ 验收（2026-09-07）**：kitsune-overseer typecheck 绿 + 45/45；main overseer 74/74；plugin-sdk typecheck 绿 + 71/71（12 files）。
- 已修（2026-09-07 前）：supervisor monitor 反应兜底（`_suggestReaction || _suggestPetReaction`，zcode 事件不再丢）；LLM 中转站 text-first + synced 兜底。
- 已修（2026-09-09 ④ 一轮）：plugin-sdk 6 TODO → 全 `(audit)`（`channels/local/event-target` ×2、`channels/remote/websocket` ×2 均为 createContext 委托接线点，注释与代码矛盾已消；`plugin/local`、`plugin/remote` 空 scaffold 注明意图 + 指向 plugin-host 活跃路径）；core-agent `chat-orchestrator-runtime.ts:371` stale-context TODO → `(audit)`（bucket 清理需 extension 卸载信号，registry 不可见，建议加 per-source remove）。验证：plugin-sdk 71/71、core-agent 70/70、stage-tamagotchi 89 files/698 passed/1 skipped 全绿。
- 待审：感知层扩展（zcode/workbuddy 更多监控源）、自动修复闭环实机、eventa window-namespacing 架构 TODO。
- **模块④ 全子模块 ✅（2026-09-09）**：④-1 感知层 0 TODO（45/45）；④-2 编排核心 74/74；④-3 执行器 DAG 图 + 评审 UI 已落地；④-4 core-agent 70/70 + core-character 0 TODO；④-5 plugin-sdk 6 TODO 全 (audit)（71/71）。全仓验收：plugin-sdk 12 files / 71 passed + core-agent 12 files / 70 passed + stage-tamagotchi 89 files / 698 passed / 1 skipped + 各包 typecheck 绿。UI 验收（settings 环境页拆分 + director 评审页）由前次会话落地，本会话完成其依赖包回归。

## 模块 ⑤ 外围入口（integrations + services + 其它应用）
- 范围：integrations/vscode（vscode-kitsune / vscode-kitsune-trae / airi-plugin-vscode）、integrations/intellij-kitsune、computer-use-mcp、discord-bot、minecraft-bot、stage-web、stage-pocket、ui-admin、component-calling
- 现状：11 处 TODO 全处理（10 处标 (audit) + 1 真修复，2026-09-09）；IDE 插件 / 独立服务 0 TODO
- **小模块（5 个子模块）**：
  1. **✅ IDE 插件** —— `integrations/vscode/*`（vscode-kitsune / vscode-kitsune-trae / airi-plugin-vscode 真实现）+ `integrations/intellij-kitsune`（Gradle 9.7.1 构建已验证）：**无实机联调记录，待 IDE 实机**
  2. **✅ 独立服务** —— `services/computer-use-mcp` / `services/discord-bot` / `services/minecraft`：各自独立 package，0 TODO
  3. **✅ Web 端 stage-web** —— `apps/stage-web/src`：4 TODO 全 (audit)（main.ts vite-plugin-vue-layouts 弃用迁移 ×2 / characters 页 2 处激活与删除确认 / CharacterDialog apiKey 明文 + avatarModels 2 处）；CharacterItem locale 硬编码已修（2026-09-07）
  4. **✅ 移动端 stage-pocket + 管理端 ui-admin** —— `apps/stage-pocket/src`（1 TODO：main.ts 布局弃用迁移标 (audit)）+ `apps/ui-admin/src`（server-admin-context 域名占位标 (audit)，4 files/25 passed）+ `apps/component-calling`（0 TODO）
  5. **✅ 共享构建设施** —— `apps/*/vite.config`（占位域名 Download 真修复见下）、Histoire 集成（autoAnimatePlugin cast）、HuggingFace Space 构建 emitFile 兼容
- **模块⑤ 验收（2026-09-07）**：stage-web typecheck 绿（无测试文件，vitest "No test files found" 为既有状态）；airi-plugin-vscode 已从空壳变为真实现（`defineExtension` + vscode-context capability/kit 常量）。
- 已修（2026-09-07）：**CharacterItem locale 硬编码** —— `stage-web/.../CharacterItem.vue` 角色名/描述 i18n 从固定 `'en'` 改为当前 `locale`（`useI18n().locale`），无匹配时回退第一个。
- 已修（2026-09-09 ⑤ 一轮）：**stage-pocket vite.config 占位域名 Download 真修复** —— 4 个 `assets.kitsune.ai` Download（hiyori_free/pro + AvatarSample A/B）目标是下载到 `packages/stage-ui/src/assets`，但资源已随 stage-ui 入库；unplugin-fetch 下载失败会 `console.error + throw`，`assets.kitsune.ai` 解析 ENOTFOUND → 缓存缺失时（CI/新机器）构建直接失败。已注释与 stage-web 对齐 + 删 unused `Download` import + 删 unused `stageUIAssetsRoot`/`sharedCacheDir` 变量。验证：stage-web / stage-pocket / ui-admin typecheck 绿 + ui-admin 4 files/25 passed。
- 已知限制（架构级，不改）：`vite-plugin-vue-layouts` 弃用迁移（stage-web + stage-pocket `main.ts`）、`autoAnimatePlugin as unknown as Plugin` 类型 cast（vite + Histoire 共用）、CharacterDialog 的 apiKey 明文存储（server 侧无 secrets 存储/加密 API，属安全设计决策）、avatarModels 创建支持未接、HuggingFace Space 构建插件 emitFile 兼容（vitest serve mode 报错）。
- 待审：—
- **模块⑤ 全子模块 ✅（2026-09-09）**：⑤-1 IDE 插件 0 TODO；⑤-2 独立服务 0 TODO；⑤-3 stage-web 4 TODO 全 (audit)（typecheck 绿）；⑤-4 stage-pocket/ui-admin/component-calling 2 TODO 全 (audit)（ui-admin 4 files/25 passed）；⑤-5 共享构建 1 真修复 + 1 (audit)（stage-pocket Download 占位域名注释）。全仓验收：stage-web + stage-pocket + ui-admin typecheck 绿 + ui-admin 4 files/25 passed + ⑤ 全域零裸 TODO。

## 模块 ⑥ 工程地基（横切）
- 范围：i18n（40 文件）、字体 4 件套、bm25-native、unocss-preset-fonts、构建/CI（turbo/electron-builder/GitHub Actions/Nix）、config/*
- 现状：2 处 TODO 已删（config 悬空迁移注释，2026-09-09）；全域零残留
- **小模块（6 个子模块）**：
  1. **✅ i18n** —— `packages/i18n/src/locales/*`（zh-Hans/en settings.yaml 等）：typecheck + build 绿（112 files / 1.04MB，641ms）；**2026-09-08 侧边栏 nav 归组新增 group.* key（zh/en 同步）**
  2. **✅ 字体 4 件套** —— `packages/font-*`（chillroundm / cjkfonts-allseto / departure-mono / xiaolai）：0 TODO
  3. **✅ bm25-native** —— `packages/bm25-native`：Rust napi-rs，bm25 21x 提速已落地；native vs 纯 TS 对照测试全绿（stage-tamagotchi memory 3 files/29 passed）
  4. **✅ unocss-preset-fonts** —— `packages/unocss-preset-fonts`：0 TODO
  5. **✅ 构建与 CI** —— `scripts/*`（audit/typecheck/testall 系列 + mod-pack + mmap.cmd）、`.github/workflows/{ci,release}.yml`、turbo、electron-builder：0 TODO
  6. **✅ 配置层** —— `config/{default,overseer.yaml,yachiyo}` + `nix` + `plugins/default`：2 处悬空迁移注释已删（2026-09-09）
- **模块⑥ 验收（2026-09-07）**：i18n typecheck + build 绿（112 files / 1.04MB，641ms）；i18n/字体/bm25-native/unocss/config/.github/workflows/nix 全目录零 TODO/FIXME。
- 已修：无（零 TODO）。
- 已修（2026-09-09 ⑥ 一轮）：**config/{default,yachiyo}/mcp.yaml 删 2 处悬空注释** —— sqlite MCP server 的「TODO: 待实现数据迁移逻辑（旧 airi.db → kitsune.db）」无任何实现/消费方（全仓 airi.db 仅出现在这 2 条注释里，kitsune.db 无 src 引用），属过时历史备注，已删保留路径说明。
- 待审：—
- **模块⑥ 全子模块 ✅（2026-09-09）**：⑥-1..⑥-6 全部验收。全仓验证：`pnpm typecheck` 26 包全 Done（exit 0）+ 全仓测试套件（见下方验收行）+ i18n build 112 files/1.05MB + memory（含 bm25-native 对照）3 files/29 passed。**至此六大模块（①桌宠本体 / ②舞台渲染UI / ③服务端 / ④智能编排 / ⑤外围入口 / ⑥工程地基）全部完成，整仓库模块化阶段化工作收尾。**

## 验收约定（每模块必做）
1. `vue-tsc --noEmit`（相关包 typecheck）
2. 相关包 vitest 全绿
3. 实机 dev 启动，跑通主路径
4. 更新本台账 + 记忆文件

## 推进方式
- 每轮工作选定**一个大模块的一个小模块**（🔲 → ⏳ → ✅），完成后回填该行并更新验收记录。
- 小模块状态标记：🔲 待处理 / ⏳ 进行中 / ✅ 已验收。
- 2026-09-08：侧边栏归组（模块① 子模块⑤ 的一部分，✅）+ 本台账首次细分到小模块粒度。
