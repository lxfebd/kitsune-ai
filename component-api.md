# Kitsune AI · 组件 API（Component API）

> 组件契约索引：哪个包提供什么组件、关键 props/emits、使用前读哪份源码。
> **完整接口以源码 JSDoc 为准**（AGENTS.md 要求公开 API 必须带 JSDoc）；本文档负责"导航"——告诉你去哪查、约定是什么。
> 更新：2026-09-07。

## 一、组件分层

| 层 | 包 | 职责 | 备注 |
|---|---|---|---|
| 基础原语 | `packages/ui` | 无业务逻辑的表单/布局/通用件，reka-ui 之上 | 新增组件以此实现模式为参考 |
| 业务组件 | `packages/stage-ui` | 带业务语义的组件/composables/stores | 子目录见下 |
| 渲染 | `packages/stage-ui-live2d` / `-three` / `-pixi` / `-spine` / `model-driver-*` | Live2D/3D/Pixi/Spine 舞台渲染 | |
| 应用页 | `apps/*/src/renderer/pages` | 页面级组合 | 设置页布局 `layouts/settings.vue` |

## 二、`@kitsune/ui` 原语（`packages/ui/src/components/`）

### form/

| 组件 | 路径 | 关键 props（以源码为准） |
|---|---|---|
| `Checkbox` | `form/checkbox/checkbox.vue` | `checked / label / disabled` |
| `Combobox` / `ComboboxSelect` | `form/combobox/*` `form/combobox-select/*` | `options / placeholder / by` |
| `Field*` | `form/field/*` | 表单域包装：`label / error / hint / required`；`field-input / field-select / field-checkbox / field-range / field-key-values / field-values / field-text-area / field-combobox-select / field-input-file` |
| `Input` | `form/input/input.vue` | `type / variant(primary) / size(sm·md·lg) / theme / required / …`（参考 button 的模式） |
| `InputFile` / `BasicInputFile` / `InputFileCard` | `form/input/*` | 文件选择与展示 |
| `InputKeyValue` | `form/input/input-key-value.vue` | key-value 编辑 |
| `Radio` | `form/radio/radio.vue` | `modelValue / value / label` |
| `Range` / `RoundRange` / `ColorHueRange` | `form/range/*` | 滑杆：`modelValue / min / max / step` |
| `Select` / `SelectOption` | `form/select/*` | `options: SelectOptionItem[] / SelectOptionGroupItem[]（label·value·description·icon·groupLabel·children）`、`placeholder / by / contentMinWidth / contentWidth / shape(rounded·default) / variant(blurry·default)` |
| `SelectTab` | `form/select-tab/select-tab.vue` | 分段选择 |
| `Textarea` / `BasicTextArea` | `form/textarea/*` | 多行文本 |

### layouts/

| 组件 | 用途 |
|---|---|
| `Collapsible` | 折叠面板 |
| `Screen` | 全屏容器 |
| `Skeleton` | 骨架屏 |
| `Truncatable` | 超长文本截断 |

### misc/

| 组件 | 用途 |
|---|---|
| `Button` | `variant: primary·secondary·secondary-muted·danger·caution·pure·ghost`；`size: sm·md·lg`；`shape: rounded·pill·square`；`toggled / icon / label / loading / block`。默认 `primary / md / pill`。参考实现：`misc/button.vue` |
| `Callout` | 提示块 |
| `ContainerError` / `ErrorBoundary` | 错误容器与边界 |
| `DoubleCheckButton` | 双击确认 |
| `Progress` | 进度条 |

### animations/

`TransitionBidirectional` / `TransitionHorizontal` / `TransitionVertical` —— 进出场过渡，UI 动效优先复用。

> ⚠️ 变更纪律：改 `packages/ui` 组件时保持 props/slots/emits 与 `form/*` 参考实现一致（`defineProps<…>` + `withDefaults` + 字段 JSDoc），别单飞。

## 三、`@kitsune/stage-ui` 业务组件（`packages/stage-ui/src/components/`）

按目录导出（见 `components/index.ts`）：

- `data-pane/` — 数据面板
- `gadgets/` — 小工具
- `graphics/` — 图形
- `layouts/` — 布局件
- `markdown/` — Markdown 渲染
- `menu/` — 菜单
- `misc/` — 通用业务件
- `modules/` — 编排构建块
- `physics/` — 物理效果
- `scenarios/` — 页面/用例专用件
- `scenes/` — 场景
- `widgets/` — 桌面小部件：`ColorPalette`、`PoppinText`（含 `poppin-text/animators`）、`PoppingSubtitles`（弹幕字幕）等
- `auth/` — 认证相关

### 关键事件/协议

- **IPC/RPC**：一律 `@moeru/eventa`；契约集中在 `apps/stage-tamagotchi/src/shared`（`shared/eventa` 等）。
- **Overseer 事件**：`apps/stage-tamagotchi/src/main/services/kitsune/overseer/eventSchema.ts` 的 `OverseerEventType` / `PUSHABLE_EVENTS`（可推送：ToolInvocation / TaskEnd / TaskFailed / …；StatusUpdate 永不推送）。
- **插件能力**：`PluginCapabilityState` 从 `@kitsune/plugin-sdk` 的 `CapabilityDescriptor` re-export（`shared/eventa/plugin/capabilities.ts`）——不要再本地重复声明。

## 四、约定速查

- 组件命名：camelCase 文件名；业务组件放 stage-ui，基础原语放 ui，页面件放 apps。
- `packages/ui` 新组件参考 `form/*` 模式；JSDoc 说明字段语义（非显而易见处）。
- 图标 Iconify（solar 主用），动态类进 `uno.config.ts` safelist。
- 样式类名用类数组；颜色走 theme token（见 [DESIGN.md](./DESIGN.md)）。
- 翻译一律 `packages/i18n`，别在组件里散落文案。

## 五、怎么找某个组件的完整 API

1. `packages/ui/src/components/<dir>/<file>.vue` —— 基础原语（props/emits 都有 JSDoc）
2. `packages/stage-ui/src/components/<dir>/` —— 业务组件
3. `apps/stage-tamagotchi/src/renderer/pages/` —— 页面级用法示例
4. `packages/stage-ui/stories`（Histoire story）—— 交互示例（如 `components/misc/Button.story.vue`）