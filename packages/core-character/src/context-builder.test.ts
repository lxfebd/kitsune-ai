import { describe, expect, it } from 'vitest'

import { createCharacterContextBuilder } from './context-builder'

import type { Character } from './types'

describe('createCharacterContextBuilder', () => {
  it('builds context with soul and identity', () => {
    const builder = createCharacterContextBuilder()
    const char: Character = {
      id: 'test',
      name: 'Yachiyo',
      soul: 'I am a rational and poetic assistant.',
      identity: 'A desktop pet companion.',
    }

    const result = builder.build(char)
    expect(result.characterName).toBe('Yachiyo')
    expect(result.systemPrompt).toContain('Yachiyo')
    expect(result.systemPrompt).toContain('rational and poetic')
    expect(result.systemPrompt).toContain('desktop pet companion')
  })

  it('includes voice hints when voice is configured', () => {
    const builder = createCharacterContextBuilder()
    const char: Character = {
      id: 'test',
      name: 'Yachiyo',
      voice: { adapter: 'qwen3-tts', voiceId: 'yachiyo' },
    }

    const result = builder.build(char)
    expect(result.systemPrompt).toContain('Voice')
    expect(result.systemPrompt).toContain('qwen3-tts')
  })

  it('includes emotion hints when expressions are configured', () => {
    const builder = createCharacterContextBuilder()
    const char: Character = {
      id: 'test',
      name: 'Yachiyo',
      expressions: [
        { emotion: 'happy' },
        { emotion: 'sad' },
      ],
    }

    const result = builder.build(char)
    expect(result.systemPrompt).toContain('happy')
    expect(result.systemPrompt).toContain('sad')
  })

  it('handles minimal character definition', () => {
    const builder = createCharacterContextBuilder()
    const char: Character = { id: 'test', name: 'Bot' }

    const result = builder.build(char)
    expect(result.characterName).toBe('Bot')
    expect(result.systemPrompt).toContain('Bot')
  })

  it('uses custom template', () => {
    const builder = createCharacterContextBuilder({
      template: 'Hello, I am {name}. {soul}',
    })
    const char: Character = {
      id: 'test',
      name: 'Yachiyo',
      soul: 'My soul.',
    }

    const result = builder.build(char)
    expect(result.systemPrompt).toBe('Hello, I am Yachiyo. My soul.')
  })

  it('sets personaId when available', () => {
    const builder = createCharacterContextBuilder()
    const char: Character = {
      id: 'test',
      name: 'Yachiyo',
      personaId: 'yachiyo-v2',
    }

    const result = builder.build(char)
    expect(result.personaId).toBe('yachiyo-v2')
  })
})
