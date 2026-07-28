import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSettingsStageModel } from '../settings/stage-model'
import { usePersonaStore } from './persona'

vi.mock('./artistry', async () => {
  const { defineStore } = await import('pinia')

  return {
    useArtistryStore: defineStore('artistry', {
      state: () => ({
        globalProvider: 'mock-artistry-provider',
        globalModel: 'mock-artistry-model',
        globalPromptPrefix: 'mock-artistry-prefix',
        globalProviderOptions: {},
        activeProvider: 'mock-artistry-provider',
        activeModel: 'mock-artistry-model',
        defaultPromptPrefix: 'mock-artistry-prefix',
        providerOptions: {},
      }),
      actions: {
        resetToGlobal() {},
      },
    }),
  }
})

vi.mock('./active-model', async () => {
  const { defineStore } = await import('pinia')

  return {
    useActiveModelStore: defineStore('active-model', {
      state: () => ({
        activeProvider: 'mock-consciousness-provider',
        activeModel: 'mock-consciousness-model',
      }),
    }),
  }
})

vi.mock('./speech', async () => {
  const { defineStore } = await import('pinia')

  return {
    useSpeechStore: defineStore('speech', {
      state: () => ({
        activeSpeechProvider: 'mock-speech-provider',
        activeSpeechModel: 'mock-speech-model',
        activeSpeechVoiceId: 'mock-speech-voice',
      }),
    }),
  }
})

vi.mock('./vision', async () => {
  const { defineStore } = await import('pinia')

  return {
    useVisionStore: defineStore('vision', {
      state: () => ({
        activeProvider: 'mock-vision-provider',
        activeModel: 'mock-vision-model',
      }),
    }),
  }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

/**
 * @example
 * describe('persona store', () => {})
 */
describe('persona store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  /**
   * @example
   * it('persists selected module config on active card', () => {})
   */
  it('persists selected module config on active card', () => {
    const stageModelStore = useSettingsStageModel()
    stageModelStore.stageModelSelected = 'preset-live2d-1'

    const cardStore = usePersonaStore()
    cardStore.initialize()

    expect(cardStore.updateActiveCardDisplayModel('display-model-iru-v2')).toBe(true)
    expect(cardStore.updateActiveCardConsciousness({ provider: 'openrouter-ai', model: 'anthropic/claude-sonnet' })).toBe(true)
    expect(cardStore.updateActiveCardVision({ provider: 'ollama', model: 'llava' })).toBe(true)
    expect(cardStore.updateActiveCardSpeech({ provider: 'elevenlabs', model: 'eleven_multilingual_v2', voice_id: 'aria' })).toBe(true)
    expect(cardStore.activeCard?.extensions.kitsune.modules).toMatchObject({
      displayModelId: 'display-model-iru-v2',
      consciousness: { provider: 'openrouter-ai', model: 'anthropic/claude-sonnet' },
      vision: { provider: 'ollama', model: 'llava' },
      speech: { provider: 'elevenlabs', model: 'eleven_multilingual_v2', voice_id: 'aria' },
    })
    expect(stageModelStore.stageModelSelected).toBe('preset-live2d-1')
  })

})
