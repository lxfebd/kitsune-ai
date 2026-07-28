# Soullink Emotion SDK 集成变更日志

## BREAKING Changes

### PixiJS v6 → v7 升级
- **依赖变更**: 13 个 `@pixi/*` 子包替换为统一的 `pixi.js@^7.4.3`
- **依赖变更**: `pixi-filters` 从 `^4.2.0` 升级到 `^5.3.0`
- **依赖变更**: `pixi-live2d-display` 从 `^0.4.0` 升级到 `0.5.0-beta`
- **API 变更**: `extensions.add(TickerPlugin)` 不再需要（v7 自动注册），已从 Canvas.vue 和 live2d-preview.ts 移除
- **API 变更**: `MotionManager.on('motionStart'/'motionFinish')` 在 pixi-live2d-display v0.5.0-beta 中被移除，改用 `startMotion` 包装 + playing 状态监听
- **类型变更**: `Application.view` 返回 `ICanvas` 而非 `HTMLCanvasElement`，需要显式类型断言

### 配置泛化 (De-airi)
- **BREAKING**: `config/yachiyo/` 不再是默认配置目录，新的默认目录为 `config/default/`
- **BREAKING**: `packages/kitsune-persona` 默认 profile 从 `'yachiyo'` 改为 `'default'`
- **BREAKING**: `apps/stage-tamagotchi` 中的 `config/yachiyo` 硬编码路径已改为通过 `KITSUNE_PROFILE` 环境变量配置

### LLM 工具变更
- `live2d.emote` 工具的 `emotion` 枚举从 8 项扩展到 15 项，新增 `intensity` 参数
- `live2d.gesture` 工具的 `type` 枚举从 7 项扩展到 14 项
- `live2d.react` 工具的 `intent` 枚举从 6 项扩展到 12 项
- 所有原有枚举值保留，向后兼容

## 新增功能

### Soullink Emotion Engine 集成
- 集成 `@soullink-emotion/engine@0.1.0-beta.1`（零依赖纯 TypeScript）
- VAD（Valence-Arousal-Dominance）连续情绪模型，替代离散情绪枚举
- 24 通道 FACS 表情系统（眉×3、眼×6、嘴×4、视线×2、头×3、身×3、特效×3）
- 5 层 MotionMixer（idle/emotion/reaction/speech/manual）
- 统一 IdleEngine（呼吸、眨眼、注视、身体摇摆、微动）
- LipSyncController（attack/release 平滑、噪声门、重音检测）
- 反应时序状态机（LISTENING → REACTING → SPEAKING → RECOVERING → IDLE）

### 新增文件
- `src/composables/live2d/soullink-bridge.ts` — SoullinkBridgePlugin composable
- `src/composables/live2d/emotion-adapter.ts` — 情绪适配器 + legacyEmotionMap
- `assets/live2d/yachiyo-kaguya/soullink.profile.json` — 模型 Profile（18 FACS 通道、10 表情、18 动作）
- `config/default/` — 默认配置目录（从 config/yachiyo/ 复制）

### 配置泛化
- `KITSUNE_PROFILE` 环境变量支持多角色 profile 切换
- `config/default/README.md` — profile 文档

## 迁移指南

### 从 v6 升级的开发者
1. 运行 `pnpm install` 更新依赖
2. 所有 `from '@pixi/xxx'` 导入改为 `from 'pixi.js'`
3. 移除 `extensions.add(TickerPlugin)` 调用
4. 如果使用了 `motionManager.on('motionStart'/'motionFinish')`，改用 `startMotion` 包装

### 从 yachiyo 配置迁移
1. `config/yachiyo/` 保留不动，`config/default/` 是新的默认目录
2. 设置 `KITSUNE_PROFILE=your_profile` 切换到自定义 profile
3. LLM prompt 中的情绪名（happy/sad/shy 等）通过 `legacyEmotionMap` 自动映射，无需修改

## 已知限制

- `pixi-live2d-display@0.5.0-beta` 是 beta 版本，可能存在未发现的渲染问题
- SoullinkBridgePlugin 目前与现有 6 个插件共存（非替换），两者参数会叠加
- AudioLevelAnalyzer 桥接未实现（需要 TTS 集成配合）
- 原生动画指令（expression/motion）仅记录日志，未自动触发
- 需要浏览器环境进行视觉回归测试
