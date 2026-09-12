# Kitsune AI · 设计规范（Design）

> 整个项目的视觉规则：主题、字体、组件样式约定、动效与图标。**改视觉先读这里**，然后按 [AGENTS.md §Styling](./AGENTS.md) 落地。
> 样式实现集中在根目录 `uno.config.ts`（UnoCSS）。

更新：2026-09-07。

## 一、风格基调

- **本地优先 + 温暖灵动**：桌宠是"活物"，UI 轻盈、通透、有呼吸感，避免生硬的企业级板式。
- 大量使用**半透明玻璃拟态**（`backdrop-blur` + 低透明度色阶）与柔和圆角。
- 支持**亮/暗双主题**（`useDark`），暗色为默认完整适配对象；所有颜色在亮暗下都有对应 token。

## 二、主题令牌（UnoCSS theme）

配置在 `uno.config.ts`：

- **基础色相 `baseHue: 345`**（玫瑰/粉系）—— 由 `@proj-airi/unocss-preset-chromatic` 生成完整色阶（50–950）。
- **主色 `primary: 0`**：`bg-primary-500`、`text-primary-950`、`dark:bg-primary-700/30` 等均为同一族。亮暗切换靠 `dark:` 变体，不要写死单色。
- **安全列表**：`safelistAllPrimaryBackgrounds()` 为所有 primary 色阶 + 透明度组合预生成，动态/条件类（如变量拼接的类名）必须确保在 safelist 里（见 `uno.config.ts` safelist 段）。

## 三、字体

`uno.config.ts` → `presetWebFontsFonts(provider)`：

| 角色 | 字体 |
|---|---|
| `sans`（正文） | DM Sans / DM Sans Variable |
| `serif`（标题点缀） | DM Serif Display |
| `mono`（代码/数字） | DM Mono |

> 网不好时 Netlify 构建会因 Google Fonts 超时失败：`uno.config.ts` 顶部已把 `setDefaultAutoSelectFamilyAttemptTimeout` 提到 1000ms 规避（注释里有完整背景）。

## 四、组件样式约定（改组件必读）

- **基础原语**：`packages/ui/src/components/`（reka-ui 之上）：`form/*`（checkbox/combobox/select/range/textarea/input/radio…）、`layouts/*`（collapsible/screen/skeleton/truncatable）、`misc/*`（button/callout/progress/error-boundary…）。
- **新增/改动 `packages/ui` 组件**：实现模式以 `packages/ui/src/components/form` 为参考——props/slots/emits 用 `defineProps<…>` + `withDefaults`，JSDoc 说明字段语义（见 `misc/button.vue` 的 variant/size/shape）。
- **业务组件**：`packages/stage-ui/src/components/`（含 scenarios/widgets/modules 等子目录），页面/场景专用件放 `components/scenarios/`。
- **类名写法（硬性）**：用 Vue `v-bind` 类数组，如
  `:class="['px-2 py-1','flex items-center','bg-white/50 dark:bg-black/50']"`
  不要长字符串 `class="px-2 py-1 flex …"`，不要 attributify 展开写法（`px="2" py="1"`）。顺手重构旧代码。
- **图标**：Iconify 图标集（solar 主用、ph、simple-icons 等），**不画自造 SVG**；条件/动态图标记得进 safelist。
- **动画**：先在 `apps/stage-web/src/styles` 找现成的复用；`packages/ui/src/components/animations` 有 `transition-*` 系列；保持"直觉、活泼、可读"。

## 五、动效

- 桌宠侧：Live2D 表情/口型/呼吸/视线/节拍同步（见 `packages/stage-ui-live2d` 等）。
- UI 侧：进入/离开过渡优先用 `transition-bidirectional/horizontal/vertical`；hover 态用低透明度叠色（`hover:bg-primary-500/20`）而不是硬变色。

## 六、检查清单（做完视觉改动）

- [ ] 亮/暗两套都看（`dark:` 变体齐全）
- [ ] 类名用类数组写法
- [ ] 颜色走 theme token（primary 系），不写死 hex
- [ ] 图标用 Iconify，动态类进 safelist
- [ ] 没有在 app/package 里散落新 i18n key（翻译在 `packages/i18n`）
- [ ] 新增组件按 `packages/ui/src/components/form` 的接口模式写