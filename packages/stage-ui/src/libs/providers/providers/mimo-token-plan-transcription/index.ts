import { createTranscriptionProvider } from '@xsai-ext/providers/utils'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../types'
import { createOpenAICompatibleValidators } from '../../validators'
import { defineProvider } from '../registry'

const mimoTokenPlanTranscriptionConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://token-plan-cn.xiaomimimo.com/v1/'),
})

type MimoTokenPlanTranscriptionConfig = z.input<typeof mimoTokenPlanTranscriptionConfigSchema>

export const providerMimoTokenPlanTranscription = defineProvider<MimoTokenPlanTranscriptionConfig>({
  id: 'mimo-token-plan-transcription',
  order: 4,
  name: 'Xiaomi MiMo Token Plan Transcription',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.mimo-token-plan-transcription.title'),
  description: 'token-plan-cn.xiaomimimo.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.mimo-token-plan-transcription.description'),
  tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'],
  icon: 'i-simple-icons:xiaomi',

  createProviderConfig: ({ t }) => mimoTokenPlanTranscriptionConfigSchema.extend({
    apiKey: mimoTokenPlanTranscriptionConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: mimoTokenPlanTranscriptionConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    return createTranscriptionProvider({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || 'https://token-plan-cn.xiaomimimo.com/v1/',
    })
  },

  extraMethods: {
    async listModels() {
      return [
        {
          id: 'mimo-v2-omni',
          name: 'MiMo v2 Omni',
          provider: 'mimo-token-plan-transcription',
          description: 'Omni-modal model with native audio understanding and speech-to-text',
          contextLength: 256000,
          deprecated: false,
        },
        {
          id: 'mimo-v2.5',
          name: 'MiMo v2.5',
          provider: 'mimo-token-plan-transcription',
          description: 'Latest omni-modal model with audio understanding, 1M context',
          contextLength: 1_000_000,
          deprecated: false,
        },
        {
          id: 'mimo-v2.5-asr',
          name: 'MiMo v2.5 ASR',
          provider: 'mimo-token-plan-transcription',
          description: 'Automatic speech recognition model',
          contextLength: 256000,
          deprecated: false,
        },
      ]
    },
  },

  capabilities: {
    transcription: {
      protocol: 'http',
      generateOutput: true,
      streamOutput: false,
      streamInput: false,
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
