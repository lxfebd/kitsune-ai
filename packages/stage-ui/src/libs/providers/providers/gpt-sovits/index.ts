import type { VoiceInfo } from '../../types'

import { isStageTamagotchi } from '@kitsune/stage-shared'
import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../types'
import { createOpenAICompatibleValidators } from '../../validators'
import { defineProvider } from '../registry'

const DEFAULT_PORT = 9880

const gptSovitsConfigSchema = z.object({
  apiKey: z
    .string('API Key')
    .optional()
    .default('local'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default(`http://127.0.0.1:${DEFAULT_PORT}/v1`),
})

type GptSovitsConfig = z.input<typeof gptSovitsConfigSchema>

export const providerGptSovits = defineProvider<GptSovitsConfig>({
  id: 'gpt-sovits',
  order: 1,
  name: 'GPT-SoVITS',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.gpt-sovits.title'),
  description: 'Local TTS via GPT-SoVITS sidecar (port 9880).',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.gpt-sovits.description'),
  tasks: ['text-to-speech'],
  icon: 'i-solar:cpu-bold-duotone',
  isAvailableBy: isStageTamagotchi,

  createProviderConfig: ({ t }) => gptSovitsConfigSchema.extend({
    apiKey: gptSovitsConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
      section: 'advanced',
    }),
    baseUrl: gptSovitsConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    return createOpenAI(config.apiKey as string, config.baseUrl)
  },

  extraMethods: {
    async listModels() {
      return [
        {
          id: 'gpt-sovits',
          name: 'GPT-SoVITS',
          provider: 'gpt-sovits',
          description: 'GPT-SoVITS local TTS model (stdin/stdout pipe)',
        },
      ]
    },
    async listVoices(): Promise<VoiceInfo[]> {
      // 通过 GPT-SoVITS sidecar HTTP API 获取可用声线
      // sidecar 在 /voices 端点返回 voices/ 目录中的声线列表
      try {
        const res = await fetch(`http://127.0.0.1:${DEFAULT_PORT}/voices`, {
          signal: AbortSignal.timeout(3000),
        })
        if (!res.ok)
          return []
        const data = await res.json() as { voices?: Array<{ id: string, name: string, lang: string }> }
        return (data.voices ?? []).map(v => ({
          id: v.id,
          name: v.name,
          provider: 'gpt-sovits',
          languages: [{ code: v.lang ?? 'zh', title: v.lang === 'ja' ? 'Japanese' : 'Chinese' }],
        }))
      }
      catch {
        return []
      }
    },
  },

  validationRequiredWhen(config) {
    // Only validate if user has explicitly configured a custom baseUrl or apiKey
    const defaultUrl = `http://127.0.0.1:${DEFAULT_PORT}/v1`
    const isDefaultBaseUrl = !config?.baseUrl || config.baseUrl === defaultUrl
    const isDefaultApiKey = !config?.apiKey || config.apiKey === 'local'
    return !isDefaultBaseUrl || !isDefaultApiKey
  },
  validators: {
    ...createOpenAICompatibleValidators({
      checks: [ProviderValidationCheck.Connectivity, ProviderValidationCheck.ModelList],
      connectivityFailureReason: ({ errorMessage }) =>
        `GPT-SoVITS sidecar 未启动或无法连接：${errorMessage}。请在「本地服务」页面启动 GPT-SoVITS。`,
    }),
  },
})
