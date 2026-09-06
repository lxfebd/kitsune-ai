/**
 * 角色系统类型定义
 */

/** 角色情感表达配置 */
export interface CharacterExpression {
  /** 情感类型标识 */
  emotion: string
  /** Live2D 表情名称 */
  live2dExpression?: string
  /** Spine 动画名称 */
  spineAnimation?: string
  /** VRM 表情标识 */
  vrmExpression?: string
}

/** 角色语音配置 */
export interface CharacterVoice {
  /** TTS 适配器类型 */
  adapter: string
  /** 语音 ID / 名称 */
  voiceId: string
  /** 语速倍率 */
  speed?: number
  /** 音调偏移 */
  pitch?: number
  /** 音量倍率 */
  volume?: number
}

/** 角色模型配置 */
export interface CharacterModel {
  /** 渲染引擎类型 */
  engine: 'live2d' | 'spine' | 'three'
  /** 模型文件路径或 URL */
  source: string
  /** 模型缩放 */
  scale?: number
  /** 模型位置偏移 */
  offset?: { x: number; y: number }
  /** 初始动作 */
  initialMotion?: string
  /** 初始表情 */
  initialExpression?: string
}

/** 角色元数据 */
export interface CharacterMetadata {
  /** 角色描述 */
  description?: string
  /** 角色来源（作品名等） */
  source?: string
  /** 角色标签 */
  tags?: string[]
  /** 头像路径 */
  avatar?: string
  /** 创建时间 */
  createdAt?: string
  /** 最后修改时间 */
  updatedAt?: string
}

/** 完整角色定义 */
export interface Character {
  /** 角色唯一标识 */
  id: string
  /** 角色显示名称 */
  name: string
  /** 人格标识（对应 persona 系统） */
  personaId?: string
  /** SOUL.md 内容（内联人格，优先级高于 personaId） */
  soul?: string
  /** IDENTITY.md 内容 */
  identity?: string
  /** 语音配置 */
  voice?: CharacterVoice
  /** 模型配置 */
  model?: CharacterModel
  /** 情感表达映射 */
  expressions?: CharacterExpression[]
  /** 元数据 */
  metadata?: CharacterMetadata
  /** 是否启用 */
  enabled?: boolean
}

/** 角色加载来源 */
export interface CharacterSource {
  /** 来源类型 */
  type: 'file' | 'directory' | 'inline'
  /** 文件/目录路径 */
  path?: string
  /** 内联角色定义 */
  character?: Character
}

/** 角色查询过滤器 */
export interface CharacterFilter {
  /** 按标签过滤 */
  tags?: string[]
  /** 按渲染引擎过滤 */
  engine?: 'live2d' | 'spine' | 'three'
  /** 按启用状态过滤 */
  enabled?: boolean
  /** 搜索关键词（匹配 name/description） */
  query?: string
}
