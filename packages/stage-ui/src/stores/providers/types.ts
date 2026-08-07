import type {
  ChatProvider,
  ChatProviderWithExtraOptions,
  EmbedProvider,
  EmbedProviderWithExtraOptions,
  SpeechProvider,
  SpeechProviderWithExtraOptions,
  TranscriptionProvider,
  TranscriptionProviderWithExtraOptions,
} from '@xsai-ext/providers/utils'
import type { ProgressInfo } from '@xsai-transformers/shared/types'

import type { ProviderSourceDeployment, ProviderSourcePricing } from '../../libs/providers/source-metadata'
import type { ProviderOnboardingField } from '../../libs/providers/types'

export interface ProviderMetadata {
  id: string
  to?: string
  order?: number
  category: 'chat' | 'embed' | 'speech' | 'transcription' | 'vision'
  tasks: string[]
  nameKey: string
  name: string
  localizedName?: string
  descriptionKey: string
  description: string
  localizedDescription?: string
  configured?: boolean
  isAvailableBy?: () => Promise<boolean> | boolean
  icon?: string
  iconColor?: string
  iconImage?: string
  defaultOptions?: () => Record<string, unknown>
  onboardingFields?: ProviderOnboardingField[]
  createProvider: (
    config: Record<string, unknown>,
  ) =>
    | ChatProvider
    | ChatProviderWithExtraOptions
    | EmbedProvider
    | EmbedProviderWithExtraOptions
    | SpeechProvider
    | SpeechProviderWithExtraOptions
    | TranscriptionProvider
    | TranscriptionProviderWithExtraOptions
    | Promise<ChatProvider>
    | Promise<ChatProviderWithExtraOptions>
    | Promise<EmbedProvider>
    | Promise<EmbedProviderWithExtraOptions>
    | Promise<SpeechProvider>
    | Promise<SpeechProviderWithExtraOptions>
    | Promise<TranscriptionProvider>
    | Promise<TranscriptionProviderWithExtraOptions>
  capabilities: {
    listModels?: (config: Record<string, unknown>) => Promise<ModelInfo[]>
    listVoices?: (config: Record<string, unknown>, model?: string) => Promise<VoiceInfo[]>
    loadModel?: (config: Record<string, unknown>, hooks?: { onProgress?: (progress: ProgressInfo) => Promise<void> | void }) => Promise<void>
  }
  validators: {
    validateProviderConfig: (config: Record<string, unknown>, options?: { skipChatPingCheck?: boolean, onlyChatPingCheck?: boolean }) => Promise<{
      errors: unknown[]
      reason: string
      valid: boolean
    }> | {
      errors: unknown[]
      reason: string
      valid: boolean
    }
    chatPingCheckAvailable: boolean
  }
  requiresCredentials?: boolean
  transcriptionFeatures?: {
    supportsGenerate: boolean
    supportsStreamOutput: boolean
    supportsStreamInput: boolean
  }
  pricing?: ProviderSourcePricing
  deployment?: ProviderSourceDeployment
}

export interface ModelInfo {
  id: string
  name: string
  provider: string
  description?: string
  capabilities?: string[]
  contextLength?: number
  deprecated?: boolean
}

export interface VoiceInfo {
  id: string
  name: string
  provider: string
  compatibleModels?: string[]
  description?: string
  gender?: string
  deprecated?: boolean
  previewURL?: string
  languages: {
    code: string
    title: string
  }[]
}

export interface ProviderRuntimeState {
  isConfigured: boolean
  validatedCredentialHash?: string
  models: ModelInfo[]
  isLoadingModels: boolean
  modelLoadError: string | null
}
