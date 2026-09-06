import type { VoiceInfo } from '../../types'

import { createSpeechProvider } from '@xsai-ext/providers/utils'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../types'
import { createOpenAICompatibleValidators } from '../../validators'
import { defineProvider } from '../registry'

const mimoTokenPlanSpeechConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://token-plan-cn.xiaomimimo.com/v1/'),
})

type MimoTokenPlanSpeechConfig = z.input<typeof mimoTokenPlanSpeechConfigSchema>

const DEFAULT_VOICES: VoiceInfo[] = [
  { id: 'mimo_default', name: 'MiMo-默认', provider: 'mimo-token-plan-speech', gender: 'female', languages: [{ code: 'en', title: 'English' }, { code: 'zh', title: 'Chinese' }] },
  { id: '冰糖', name: '冰糖', provider: 'mimo-token-plan-speech', gender: 'female', languages: [{ code: 'zh', title: 'Chinese' }] },
  { id: '茉莉', name: '茉莉', provider: 'mimo-token-plan-speech', gender: 'female', languages: [{ code: 'zh', title: 'Chinese' }] },
  { id: '苏打', name: '苏打', provider: 'mimo-token-plan-speech', gender: 'male', languages: [{ code: 'zh', title: 'Chinese' }] },
  { id: '白桦', name: '白桦', provider: 'mimo-token-plan-speech', gender: 'male', languages: [{ code: 'zh', title: 'Chinese' }] },
  { id: 'Mia', name: 'Mia', provider: 'mimo-token-plan-speech', gender: 'female', languages: [{ code: 'en', title: 'English' }] },
  { id: 'Chloe', name: 'Chloe', provider: 'mimo-token-plan-speech', gender: 'female', languages: [{ code: 'en', title: 'English' }] },
  { id: 'Milo', name: 'Milo', provider: 'mimo-token-plan-speech', gender: 'male', languages: [{ code: 'en', title: 'English' }] },
  { id: 'Dean', name: 'Dean', provider: 'mimo-token-plan-speech', gender: 'male', languages: [{ code: 'en', title: 'English' }] },
]

export const providerMimoTokenPlanSpeech = defineProvider<MimoTokenPlanSpeechConfig>({
  id: 'mimo-token-plan-speech',
  order: 4,
  name: 'Xiaomi MiMo Token Plan Speech',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.mimo-token-plan-speech.title'),
  description: 'token-plan-cn.xiaomimimo.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.mimo-token-plan-speech.description'),
  tasks: ['text-to-speech'],
  icon: 'i-simple-icons:xiaomi',

  createProviderConfig: ({ t }) => mimoTokenPlanSpeechConfigSchema.extend({
    apiKey: mimoTokenPlanSpeechConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: mimoTokenPlanSpeechConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    return createSpeechProvider({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || 'https://token-plan-cn.xiaomimimo.com/v1/',
    })
  },

  extraMethods: {
    async listModels() {
      return [
        {
          id: 'mimo-v2.5-tts',
          name: 'MiMo v2.5 TTS',
          provider: 'mimo-token-plan-speech',
          description: 'Preset voice synthesis with the built-in MiMo voice list',
          contextLength: 0,
          deprecated: false,
        },
        {
          id: 'mimo-v2.5-tts-voicedesign',
          name: 'MiMo v2.5 TTS Voice Design',
          provider: 'mimo-token-plan-speech',
          description: 'Design a new voice from a natural language description',
          contextLength: 0,
          deprecated: false,
        },
        {
          id: 'mimo-v2.5-tts-voiceclone',
          name: 'MiMo v2.5 TTS Voice Clone',
          provider: 'mimo-token-plan-speech',
          description: 'Clone a voice from a base64-encoded audio sample',
          contextLength: 0,
          deprecated: false,
        },
        {
          id: 'mimo-v2-tts',
          name: 'MiMo v2 TTS',
          provider: 'mimo-token-plan-speech',
          description: 'Preset voice synthesis with the built-in MiMo voice list',
          contextLength: 0,
          deprecated: false,
        },
      ]
    },
    async listVoices() {
      return DEFAULT_VOICES
    },
  },

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },
  validators: {
    ...createOpenAICompatibleValidators({
      checks: [ProviderValidationCheck.Connectivity, ProviderValidationCheck.ModelList],
    }),
  },
})
