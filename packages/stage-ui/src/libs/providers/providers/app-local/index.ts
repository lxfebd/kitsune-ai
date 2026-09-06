import { isStageTamagotchi } from '@kitsune/stage-shared'
import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../types'
import { createOpenAICompatibleValidators } from '../../validators'
import { defineProvider } from '../registry'

const appLocalConfigSchema = z.object({
  apiKey: z
    .string('API Key')
    .optional()
    .default('local'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('http://127.0.0.1:9400/v1'),
})

type AppLocalConfig = z.input<typeof appLocalConfigSchema>

export const providerAppLocalChat = defineProvider<AppLocalConfig>({
  id: 'app-local-chat',
  order: 1,
  name: 'App Local',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.app-local-chat.title'),
  description: 'Built-in small local model running inside the app.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.app-local-chat.description'),
  tasks: ['chat'],
  icon: 'i-solar:cpu-bold-duotone',
  isAvailableBy: isStageTamagotchi,

  createProviderConfig: ({ t }) => appLocalConfigSchema.extend({
    apiKey: appLocalConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
      section: 'advanced',
    }),
    baseUrl: appLocalConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    return createOpenAI(config.apiKey as string, config.baseUrl)
  },

  validationRequiredWhen() {
    return false
  },
  validators: {
    ...createOpenAICompatibleValidators({
      checks: [ProviderValidationCheck.Connectivity, ProviderValidationCheck.ModelList, ProviderValidationCheck.ChatCompletions],
      connectivityFailureReason: ({ errorMessage }) =>
        `本地模型服务未启动或无法连接：${errorMessage}。请先在插件设置中启用“本地 LLM”插件并等待模型下载完成。`,
    }),
  },
})
