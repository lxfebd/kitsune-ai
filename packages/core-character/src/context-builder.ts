import type { Character } from './types'

/**
 * 角色上下文构建结果
 */
export interface CharacterContext {
  /** 系统提示词片段 */
  systemPrompt: string
  /** 角色名称 */
  characterName: string
  /** 人格标识 */
  personaId?: string
}

/**
 * 角色上下文构建器
 *
 * 将角色定义转换为 LLM 可理解的系统提示词。
 * 支持内联 soul/identity 和外部 persona 引用两种模式。
 *
 * Use when: 需要将当前活跃角色注入 LLM 对话上下文。
 * Expects: Character 对象。
 * Returns: 包含系统提示词的 CharacterContext。
 */
export interface CharacterContextBuilder {
  /** 为指定角色构建上下文 */
  build(character: Character): CharacterContext
}

const DEFAULT_TEMPLATE = `You are {name}. {soul}

{identity}

Stay in character at all times. Respond as {name} would.`

export function createCharacterContextBuilder(options?: {
  template?: string
}): CharacterContextBuilder {
  const template = options?.template ?? DEFAULT_TEMPLATE

  function build(character: Character): CharacterContext {
    const parts: string[] = []

    // 构建系统提示词
    let prompt = template
      .replace(/\{name\}/g, character.name)
      .replace(/\{soul\}/g, character.soul ?? '')
      .replace(/\{identity\}/g, character.identity ?? '')
      .replace(/\{personaId\}/g, character.personaId ?? '')

    // 清理多余空行
    prompt = prompt.replace(/\n{3,}/g, '\n\n').trim()

    // 添加语音提示（如果有语音配置）
    if (character.voice) {
      parts.push(`Voice: use ${character.voice.adapter} with voice "${character.voice.voiceId}".`)
    }

    // 添加情感表达提示（如果有表达配置）
    if (character.expressions?.length) {
      const emotionList = character.expressions.map(e => e.emotion).join(', ')
      parts.push(`Available emotions: ${emotionList}.`)
    }

    if (parts.length > 0) {
      prompt += '\n\n' + parts.join('\n')
    }

    return {
      systemPrompt: prompt,
      characterName: character.name,
      personaId: character.personaId,
    }
  }

  return { build }
}
