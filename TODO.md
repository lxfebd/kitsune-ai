# Kitsune AI · TODO（当前任务、优先级与进度）

> 开发进度的**单一事实来源**。任务会持续从会话/评审沉淀到这里（"把长期有价值的信息搬到文档"）。
> 模块级审计与验收记录在 [MODULES.md](./MODULES.md)（6 大模块台账）；本文是其滚动视图。
> 更新：2026-09-07。

## 当前状态一览

| 领域 | 状态 |
|---|---|
| Overseer zcode 任务显示链路 | ✅ 已完成（2026-09-07）：感知层提取 lastToolCall/currentTask/errorMessage + activity；编排层映射 ToolInvocation/TaskEnd/TaskFailed；PushFilter 放行；45+74 测试 + typecheck 绿 + 实机日志 `task_failed → pushed` 端到端验证 |
| LLM 中转站接入 | ✅ 已完成（前文）：text-first 响应解析 + synced provider 兜底 |
| 设置页 UI 重构 | ✅ 已完成：拆 6 子页 + DAG 任务图 |
| 性能：BM25 原生加速 | ✅ 已完成：`packages/bm25-native`（napi-rs，约 21x） |
| 插件能力类型去重 | ✅ 已完成（第二轮）：`PluginCapabilityState` 从 `@kitsune/plugin-sdk` re-export，消 2 处 TODO；plugin 测试 29/29 |

## P1 · 高优先级（阻塞体验闭环）

- [ ] **TODO 清单逐条过**：全仓 26+ 文件含 TODO/FIXME 标记（桌宠本体为主），逐个评估 → 转 issue 或完成（台账见 MODULES.md 模块①）
- [ ] **窗口系统接线**：`windows×17` 的窗口管理核对（显隐/焦点/多屏）
- [ ] **desktop-automation 实机**：computer-use 实机跑通主路径（点击/输入/截屏）
- [ ] **onboarding 引导**：首次启动引导流程
- [ ] **自动更新**：更新通道（electron-updater / 手动检查）

## P2 · 中优先级

- [ ] **插件空壳补全**：`integrations/airi-plugin-vscode` 为空壳 stub；`@kitsune/plugin-sdk` 6 个 TODO（模块④）
- [ ] **感知层扩展**：zcode / workbuddy monitor 再打磨（freshness 窗口、多会话切换体验）
- [ ] **自动修复闭环实机**：Overseer 授权 → 重执行 → verify 的完整实机走查
- [ ] **stage-web / stage-pocket TODO 清理**：web 4 个、pocket 1 个（模块⑤）
- [ ] **server 系列待审**：Hono 网关 TODO 11 个文件（模块③）

## P3 · 低优先级 / 长期

- [ ] **docs 补齐**：本套 8 份文档与代码持续对齐（发现不一致记入 PROJECT-MAP §9）
- [ ] **场景资产 avif 化**：`to-avif` 脚本流转场景资源
- [ ] **intellij-kitsune 实机**：Gradle 9.7.1 构建已通，待 IDE 内实机验证
- [ ] **待删包清理**：PROJECT-MAP §9 记录的废弃包/文件清除

## 进行中 / 最近完成（日志）

- 2026-09-07：zcode 任务显示链路修复全链路验证完成（含回归 45+74 + typecheck + 实机日志）。
- 2026-09-07：模块① 插件能力类型去重落地（29/29 测试 + typecheck 绿）。
- 2026-09-06/07：架构图完善行动（64 节点、6 处"假完整"修复、mmap.cmd、双 map.json 陷阱）。
- 2026-09-06：工程地基补齐（Git、server 本地 mock 启动、P1 清理、实机启动验证）。

## 验收约定（每个任务/模块必做）

1. `vue-tsc --noEmit`（相关包 typecheck）
2. 相关包 vitest 全绿
3. 实机 dev 启动跑通主路径
4. 更新本 TODO + MODULES.md 台账 + 记忆文件
