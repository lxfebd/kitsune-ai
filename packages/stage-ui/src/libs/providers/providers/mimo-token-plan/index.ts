import { createXiaomi } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../types'
import { createOpenAICompatibleValidators } from '../../validators'
import { defineProvider } from '../registry'

const mimoTokenPlanConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://token-plan-cn.xiaomimimo.com/v1/'),
})

type MimoTokenPlanConfig = z.input<typeof mimoTokenPlanConfigSchema>

export const providerMimoTokenPlan = defineProvider<MimoTokenPlanConfig>({
  id: 'mimo-token-plan',
  order: 4,
  name: 'Xiaomi MiMo Token Plan',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.mimo-token-plan.title'),
  description: 'token-plan-cn.xiaomimimo.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.mimo-token-plan.description'),
  tasks: ['chat'],
  icon: 'i-simple-icons:xiaomi',

  createProviderConfig: ({ t }) => mimoTokenPlanConfigSchema.extend({
    apiKey: mimoTokenPlanConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: mimoTokenPlanConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    return createXiaomi(config.apiKey, config.baseUrl)
  },

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },
  validators: {
    ...createOpenAICompatibleValidators({
      checks: [ProviderValidationCheck.Connectivity, ProviderValidationCheck.ModelList, ProviderValidationCheck.ChatCompletions],
    }),
  },
})
