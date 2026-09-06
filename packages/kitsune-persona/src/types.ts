/** 人格系统类型定义 */

/** 人格模式 */
export type PersonaMode = 'rational' | 'idol' | 'hybrid' | 'strict'

/** 模式解析结果 */
export interface ModeResolution {
  mode: PersonaMode
  source: 'input' | 'session' | 'default'
}

/** 人格配置 */
export interface PersonaConfig {
  version: 1
  defaults: {
    profile: string
    mode: PersonaMode
    injectEnabled: boolean
    maxContextChars: number
    sharedAcrossSessions: boolean
  }
  source: {
    preferredRoot: string
    allowWorkspaceOverride: boolean
  }
  modes: Record<string, { style: string }>
  writeback: {
    enabled: boolean
    explicitOnly: boolean
    minSignals: number
  }
}

/** 人格档案 */
export interface PersonaProfile {
  version: 1
  profile: string
  personality: string
  style: string
  addressing: {
    default_user_title: string
    custom_name: string
    use_custom_first: boolean
  }
  guidance: {
    prompt_if_missing_name: boolean
    remind_cooldown_hours: number
  }
}

/** 人格内容（SOUL.md / IDENTITY.md / USER.md / RUNTIME_PERSONA.md） */
export interface PersonaContent {
  soul: string
  identity: string
  user: string
  /** 紧凑运行时人格（RUNTIME_PERSONA.md），含示例对话和核心规则 */
  runtime: string
  paths: {
    soulPath: string
    identityPath: string
    userPath: string
    runtimePath: string
  }
}

/** 会话状态 */
export interface PersonaSessionState {
  mode?: PersonaMode
  mode_source?: 'input' | 'session'
  updated_at?: string
}

/** 上下文构建结果 */
export interface PersonaContextResult {
  prompt: string
  mode: PersonaMode
  source: string
  addressing?: string
  guidance?: { promptedForCustomName: boolean }
  sources: string[]
  writeback?: { persisted: boolean; reason?: string; entryId?: string }
}

/** 记忆存储接口（用于偏好回写和记忆检索） */
export interface PersonaMemoryStore {
  searchEntries?(query: { query: string; limit: number; minScore: number; maxChars: number }): Promise<{ items: Array<{ content: string }> }>
  addEntry?(entry: { content: string; keywords: string[]; source_session_id?: string; source_trace_id?: string; metadata?: Record<string, unknown> }): Promise<{ id: string }>
}
