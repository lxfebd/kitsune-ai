import type { ComposerTranslation } from 'vue-i18n'

import type { ProviderDefinition, ProviderInstance, ProviderValidationPlan } from '../../libs'
import type { ProviderMetadata } from '../providers'

import { listModels } from '@xsai/model'

import { resolveProviderSourceMetadata } from '../../libs/providers/source-metadata'
import { CHAT_COMPLETIONS_VALIDATOR_ID, isModelProvider } from '../../libs/providers/types'
import { getValidatorsOfProvider, validateProvider } from '../../libs/providers/validators/run'

function getCategoryFromTasks(tasks: string[]): ProviderMetadata['category'] {
  if (tasks.some(task => ['vision', 'image-understanding', 'image-to-text', 'multimodal'].includes(task.toLowerCase()))) {
    return 'vision'
  }
  if (tasks.some(task => ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'].includes(task.toLowerCase()))) {
    return 'transcription'
  }
  if (tasks.some(task => ['text-to-speech', 'speech', 'tts'].includes(task.toLowerCase()))) {
    return 'speech'
  }
  if (tasks.some(task => ['embed', 'embedding'].includes(task.toLowerCase()))) {
    return 'embed'
  }

  return 'chat'
}

/** Zod schema-like object with safeParse — avoids `as any` while remaining compatible with Zod v3/v4. */
interface SafeParsable {
  safeParse: (value: unknown) => { success: boolean, data?: unknown }
}

function safeFieldDefault(fieldSchema: unknown): unknown | undefined {
  if (fieldSchema && typeof fieldSchema === 'object' && 'safeParse' in fieldSchema) {
    const parsed = (fieldSchema as SafeParsable).safeParse(undefined)
    if (parsed.success)
      return parsed.data
  }
  return undefined
}

function extractSchemaDefaults(definition: ProviderDefinition, t: ComposerTranslation) {
  const defaults: Record<string, unknown> = {}

  try {
    const schema = definition.createProviderConfig({ t }) as unknown as (SafeParsable & { shape?: Record<string, unknown> })
    const shape = schema?.shape

    // Zod object-level parsing fails when required fields (for example apiKey) are missing.
    // Extract each field default individually to preserve default base URLs.
    if (shape && typeof shape === 'object') {
      for (const [key, fieldSchema] of Object.entries(shape)) {
        const value = safeFieldDefault(fieldSchema)
        if (value !== undefined)
          defaults[key] = value
      }
    }

    const parsed = schema?.safeParse?.({})
    if (parsed?.success) {
      Object.assign(defaults, parsed.data as Record<string, unknown>)
    }
  }
  catch (e) {
    console.warn('Failed to extract provider schema defaults:', e)
  }

  return defaults
}

function buildConfigValidationResult(plan: ProviderValidationPlan) {
  const invalidSteps = plan.steps.filter(step => step.kind === 'config' && step.status === 'invalid')
  if (invalidSteps.length === 0) {
    return {
      errors: [],
      reason: '',
      valid: true,
    }
  }

  const reasons = invalidSteps.map(step => step.reason).filter(Boolean)
  return {
    errors: invalidSteps.map(step => new Error(step.reason || `${step.id} is invalid`)),
    reason: reasons.join('; '),
    valid: false,
  }
}

interface RawModelInfo {
  id: string
  name?: string
  display_name?: string
  description?: string
  context_length?: number
}

function mapModelsToMetadataModels(providerId: string, models: RawModelInfo[]) {
  return models.map(model => ({
    id: model.id,
    name: model.name || model.display_name || model.id,
    provider: providerId,
    description: model.description || '',
    contextLength: model.context_length || 0,
    deprecated: false,
  }))
}

async function disposeProvider(provider: ProviderInstance | undefined): Promise<void> {
  if (provider && 'dispose' in provider && typeof provider.dispose === 'function')
    await provider.dispose()
}

function appendUniqueReason(reasons: string[], next: string) {
  if (!next)
    return
  if (!reasons.includes(next))
    reasons.push(next)
}

export function convertProviderDefinitionToMetadata(
  definition: ProviderDefinition<any>,
  t: ComposerTranslation,
  options: {
    fallbackDefaultOptions?: ProviderMetadata['defaultOptions']
  } = {},
): ProviderMetadata {
  const keyExtractor = (input: string): string => input
  const category = getCategoryFromTasks(definition.tasks)
  const schemaDefaults = extractSchemaDefaults(definition, t)
  const providerSourceMetadata = resolveProviderSourceMetadata(definition)
  return {
    id: definition.id,
    order: definition.order,
    category,
    tasks: definition.tasks,
    nameKey: definition.nameLocalize({ t: keyExtractor }),
    name: definition.name,
    descriptionKey: definition.descriptionLocalize({ t: keyExtractor }),
    description: definition.description,
    icon: definition.icon,
    iconColor: definition.iconColor,
    iconImage: definition.iconImage,
    ...providerSourceMetadata,
    isAvailableBy: definition.isAvailableBy,
    requiresCredentials: definition.requiresCredentials,
    onboardingFields: definition.onboardingFields?.({ t }),
    defaultOptions: () => {
      if (Object.keys(schemaDefaults).length > 0) {
        return { ...schemaDefaults }
      }

      return options.fallbackDefaultOptions?.() || {}
    },
    // NOTICE: ProviderMetadata.createProvider 返回逐项 Promise 联合（Promise<ChatProvider> | ...），
    // 但 definition.createProvider 返回同步 ProviderInstance。用 as any 桥接类型差异。
    createProvider: async config => definition.createProvider(config) as any,
    capabilities: {
      listModels: definition.extraMethods?.listModels
        ? async (config) => {
          // NOTICE: createProvider may throw when credentials are incomplete
          // (e.g. empty apiKey). Providers with hardcoded listModels don't need
          // a valid provider instance, so we catch and still call listModels.
          let provider: ProviderInstance | undefined
          try {
            provider = definition.createProvider(config)
          }
          catch {
            provider = undefined
          }
          try {
            const models = await definition.extraMethods!.listModels!(config, provider as ProviderInstance)
            return mapModelsToMetadataModels(definition.id, models as RawModelInfo[])
          }
          finally {
            await disposeProvider(provider)
          }
        }
        : async (config) => {
          const provider = definition.createProvider(config)
          try {
            if (isModelProvider(provider)) {
              const models = await listModels(provider.model())
              return mapModelsToMetadataModels(definition.id, models as RawModelInfo[])
            }

            const configRecord = config as Record<string, unknown>
            const baseUrl = typeof configRecord.baseUrl === 'string' ? configRecord.baseUrl.trim() : ''
            const apiKey = typeof configRecord.apiKey === 'string' ? configRecord.apiKey.trim() : ''
            if (!baseUrl)
              return []

            const models = await listModels({
              baseURL: baseUrl,
              ...(apiKey ? { apiKey } : {}),
            })
            return mapModelsToMetadataModels(definition.id, models as RawModelInfo[])
          }
          catch {
            return []
          }
          finally {
            await disposeProvider(provider)
          }
        },
      listVoices: definition.extraMethods?.listVoices
        ? async (config, model) => {
          const provider = definition.createProvider(config)
          try {
            return await definition.extraMethods!.listVoices!(config, provider, model)
          }
          finally {
            await disposeProvider(provider)
          }
        }
        : undefined,
      loadModel: definition.extraMethods?.loadModel
        ? async (config, hooks) => {
          const provider = definition.createProvider(config)
          try {
            await definition.extraMethods!.loadModel!(config, provider, hooks)
          }
          finally {
            await disposeProvider(provider)
          }
        }
        : undefined,
    },
    validators: {
      chatPingCheckAvailable: !definition.disableChatPingCheckUI
        && (definition.validators?.validateProvider || [])
          .some(creator => creator({ t }).id.includes(CHAT_COMPLETIONS_VALIDATOR_ID)),
      validateProviderConfig: async (config, options) => {
        // onlyChatPingCheck: skip all validators except chat completions.
        // Used by the manual "Test Generation" button on settings pages.
        if (options?.onlyChatPingCheck) {
          const plan = getValidatorsOfProvider({
            definition,
            config,
            schemaDefaults,
            contextOptions: { t },
          })
          plan.configValidators = []
          plan.providerValidators = plan.providerValidators.filter(v => v.id.includes(CHAT_COMPLETIONS_VALIDATOR_ID))
          plan.steps = plan.steps.filter(s => s.id.includes(CHAT_COMPLETIONS_VALIDATOR_ID))

          if (plan.providerValidators.length === 0) {
            return { errors: [], reason: '', valid: true }
          }

          await validateProvider(plan, { t })
          const invalidSteps = plan.steps.filter(step => step.status === 'invalid')
          return {
            errors: invalidSteps.map(step => new Error(step.reason || `${step.id} is invalid`)),
            reason: invalidSteps.map(step => step.reason).filter(Boolean).join('; '),
            valid: invalidSteps.length === 0,
          }
        }

        const plan = getValidatorsOfProvider({
          definition,
          config,
          schemaDefaults,
          contextOptions: { t },
        })

        if (options?.skipChatPingCheck) {
          plan.providerValidators = plan.providerValidators.filter(v => !v.id.includes(CHAT_COMPLETIONS_VALIDATOR_ID))
          plan.steps = plan.steps.filter(s => !s.id.includes(CHAT_COMPLETIONS_VALIDATOR_ID))
        }

        // Run full validation pipeline (config + provider validators) only when required.
        // This preserves strict config checks while avoiding unnecessary network checks.
        if (plan.shouldValidate) {
          await validateProvider(plan, { t })
          const invalidSteps = plan.steps.filter(step => step.status === 'invalid')
          if (invalidSteps.length === 0) {
            return {
              errors: [],
              reason: '',
              valid: true,
            }
          }

          const reasons = invalidSteps.map(step => step.reason).filter(Boolean)
          const hasMissingBaseUrlError = reasons.some(reason => reason.includes('Base URL is required'))
          const defaultBaseUrl = typeof schemaDefaults.baseUrl === 'string' ? schemaDefaults.baseUrl.trim() : ''
          if (hasMissingBaseUrlError && defaultBaseUrl) {
            appendUniqueReason(reasons, `Default to ${defaultBaseUrl}.`)
          }

          const connectivityFailed = invalidSteps.some(step => step.id === 'openai-compatible:check-connectivity')
          if (connectivityFailed) {
            const troubleshooting = definition.business?.({ t })?.troubleshooting?.validators?.openaiCompatibleCheckConnectivity?.content || ''
            if (troubleshooting) {
              appendUniqueReason(reasons, troubleshooting)
            }
          }

          return {
            errors: invalidSteps.map(step => new Error(step.reason || `${step.id} is invalid`)),
            reason: reasons.join('; '),
            valid: false,
          }
        }

        await validateProvider(plan, { t })
        return buildConfigValidationResult(plan)
      },
    },
    transcriptionFeatures: definition.capabilities?.transcription
      ? {
          supportsGenerate: definition.capabilities.transcription.generateOutput,
          supportsStreamOutput: definition.capabilities.transcription.streamOutput,
          supportsStreamInput: definition.capabilities.transcription.streamInput,
        }
      : undefined,
  }
}

export function convertProviderDefinitionsToMetadata(
  definitions: ProviderDefinition<any>[],
  t: ComposerTranslation,
  currentMetadata: Record<string, ProviderMetadata>,
) {
  const translated: Record<string, ProviderMetadata> = {}

  for (const definition of definitions) {
    translated[definition.id] = convertProviderDefinitionToMetadata(definition, t, {
      fallbackDefaultOptions: currentMetadata[definition.id]?.defaultOptions,
    })
  }

  return translated
}
