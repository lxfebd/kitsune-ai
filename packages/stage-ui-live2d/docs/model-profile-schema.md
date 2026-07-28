# ModelProfile Schema 文档

Soullink Emotion Engine 使用 `soullink.profile.json` 文件将 FACS（面部动作编码系统）语义通道映射到特定 Live2D 模型的 Cubism 参数。

## 文件位置

Profile 文件与模型的 `.model3.json` 放在同一目录：
```
assets/live2d/<model-id>/
  ├── <model-name>.model3.json
  ├── soullink.profile.json    ← 此文件
  ├── motions/
  └── textures/
```

## 顶层字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `modelId` | string | 是 | 模型唯一标识符 |
| `displayName` | string | 是 | 模型显示名称 |
| `version` | string | 是 | Profile 版本号 |
| `modelPath` | string | 是 | `.model3.json` 的相对路径 |
| `schemaVersion` | number | 否 | Schema 版本（当前: 2） |
| `capabilities` | object | 否 | 模型能力声明（12 个布尔标志） |
| `parameterMap` | object | 是 | FACSKey → Cubism 参数映射 |
| `customParams` | object | 否 | 自定义参数映射 |
| `privateEmotionMap` | object | 否 | 模型私有特效参数映射 |
| `idleConfig` | object | 否 | 空闲状态参数范围 |
| `neutralParams` | object | 否 | 中性姿态参数值 |
| `parameterSmoothing` | object | 否 | 参数平滑速度 |
| `expressionMap` | object | 否 | 情绪 → 原生 exp3 表情映射 |
| `motionMap` | object | 否 | 情绪 → 原生 motion3 动作映射 |

## parameterMap 详解

`parameterMap` 将 24 个 FACS 语义通道映射到模型的 Cubism 参数 ID。

### ParameterMapRule 字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `target` | string | — | 单目标 Cubism 参数 ID |
| `targets` | string[] | — | 多目标参数 ID（如 browInnerUp → 双眉） |
| `mode` | string | "set" | 混合模式: "set" / "add" / "subtract" / "inverse" |
| `scale` | number | 1 | 缩放因子 |
| `offset` | number | 0 | 偏移量 |
| `min` | number | — | 输出下限 |
| `max` | number | — | 输出上限 |
| `curve` | string | "linear" | 曲线: "linear" / "easeIn" / "easeOut" / "easeInOut" / "smoothstep" |
| `gamma` | number | — | Gamma 校正值 |
| `deadzone` | number | — | 死区阈值 |
| `inputRange` | [number, number] | — | 输入范围 |
| `outputRange` | [number, number] | — | 输出范围 |

### 示例

```json
{
  "parameterMap": {
    "headX": {
      "target": "ParamAngleX",
      "mode": "set",
      "scale": 30,
      "min": -30,
      "max": 30
    },
    "eyeOpen": {
      "targets": ["ParamEyeLOpen", "ParamEyeROpen"],
      "mode": "set",
      "scale": 1
    },
    "browInnerUp": {
      "targets": ["ParamBrowLY", "ParamBrowRY"],
      "mode": "add",
      "scale": 0.5
    },
    "eyeBlinkL": {
      "target": "ParamEyeLOpen",
      "mode": "subtract",
      "scale": 1
    },
    "blush": {
      "target": "ParamCheek",
      "mode": "set",
      "scale": 1,
      "min": 0,
      "max": 1
    }
  }
}
```

## FACS 通道列表

| FACSKey | 描述 | 典型 Cubism 参数 |
|---------|------|-----------------|
| `browInnerUp` | 眉毛内侧上扬 | ParamBrowLY, ParamBrowRY |
| `browOuterUp` | 眉毛外侧上扬 | ParamBrowLY, ParamBrowRY |
| `browDown` | 眉毛下压 | ParamBrowLY, ParamBrowRY |
| `eyeOpen` | 眼睛睁开度 | ParamEyeLOpen, ParamEyeROpen |
| `eyeSmile` | 微笑眼 | ParamEyeSmile |
| `eyeSquint` | 眯眼 | ParamEyeLOpen, ParamEyeROpen |
| `eyeBlinkL` | 左眼眨眼 | ParamEyeLOpen (subtract) |
| `eyeBlinkR` | 右眼眨眼 | ParamEyeROpen (subtract) |
| `mouthSmile` | 微笑 | ParamMouthForm |
| `mouthFrown` | 嘴角下垂 | ParamMouthForm |
| `mouthOpen` | 嘴巴张开 | ParamMouthOpenY |
| `mouthPucker` | 噘嘴 | — |
| `gazeX` | 视线水平 | ParamEyeBallX |
| `gazeY` | 视线垂直 | ParamEyeBallY |
| `headX` | 头部左右 | ParamAngleX |
| `headY` | 头部上下 | ParamAngleY |
| `headZ` | 头部倾斜 | ParamAngleZ |
| `bodyX` | 身体左右 | ParamBodyAngleX |
| `bodyY` | 身体上下 | ParamBodyAngleY |
| `bodyZ` | 身体倾斜 | ParamBodyAngleZ |
| `blush` | 脸红 | ParamCheek |
| `tear` | 眼泪 | — |
| `sweat` | 汗水 | — |
| `breath` | 呼吸 | ParamBreath |

## expressionMap 详解

将情绪/变体名映射到模型的原生 exp3 表情。

```json
{
  "expressionMap": {
    "happy": "smile",
    "sad": "tears",
    "shy": "narrow_eyes",
    "neutral": null
  }
}
```

## motionMap 详解

将情绪/变体名映射到模型的原生 motion3 动作。

```json
{
  "motionMap": {
    "greet": { "group": "Greet", "index": 0, "priority": "normal" },
    "react_error": { "group": "ReactError", "index": 0, "priority": "force" },
    "idle": { "group": "Idle", "index": 0, "priority": "idle" }
  }
}
```

## 自动生成

使用 `@soullink-emotion/profile-generator` 自动生成 Profile：

```ts
import { Live2DProfileAutoGenerator } from "@soullink-emotion/profile-generator";

const generator = new Live2DProfileAutoGenerator({
  modelsRoot: "/path/to/models",
  modelsBaseUrl: "https://assets.example.com/models",
});

const result = await generator.ensure({
  modelDir: "yachiyo-kaguya",
  displayName: "八千代辉夜姬",
});
```

自动生成覆盖率约 70%，剩余私有参数需手动添加 `profileOverrides`。
