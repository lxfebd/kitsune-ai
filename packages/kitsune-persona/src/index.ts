// @kitsune/persona — 人格系统

// 类型定义
export type {
  PersonaMode,
  ModeResolution,
  PersonaConfig,
  PersonaProfile,
  PersonaContent,
  PersonaSessionState,
  PersonaContextResult,
  PersonaMemoryStore,
} from './types'

// 配置存储
export { PersonaConfigStore, normalizeConfig, DEFAULT_CONFIG } from './personaConfigStore'

// 人格内容加载
export { PersonaLoader } from './personaLoader'

// 档案存储
export { PersonaProfileStore, normalizeProfile, DEFAULT_PROFILE } from './personaProfileStore'

// 会话状态
export { PersonaStateStore } from './personaStateStore'

// 模式解析
export { detectModeFromInput, resolvePersonaMode } from './personaModeResolver'

// 引导状态
export { PersonaGuidanceStateStore } from './personaGuidanceStateStore'

// 偏好回写
export { detectExplicitPreferenceSignal, maybePersistPersonaPreference } from './personaPreferenceWriteback'

// 上下文构建器（核心入口）
export { PersonaContextBuilder } from './personaContextBuilder'

// 动态人格调整
export { adjustPersonaMode } from './personaAdjuster'
export type { AdjustmentInput, AdjustmentResult } from './personaAdjuster'
