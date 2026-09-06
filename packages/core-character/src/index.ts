// @kitsune/core-character — 角色系统

// 类型定义
export type {
  Character,
  CharacterExpression,
  CharacterVoice,
  CharacterModel,
  CharacterMetadata,
  CharacterSource,
  CharacterFilter,
} from './types'

// 角色注册中心
export type { CharacterRegistry } from './registry'
export { createCharacterRegistry } from './registry'

// 角色加载器
export type { CharacterLoader } from './loader'
export { createCharacterLoader } from './loader'

// 角色上下文构建器
export type { CharacterContext, CharacterContextBuilder } from './context-builder'
export { createCharacterContextBuilder } from './context-builder'
