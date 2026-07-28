<script setup lang="ts">
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import {
  Alert,
  SpeechPlayground,
  SpeechProviderSettings,
} from '@kitsune/stage-ui/components'
import { useProviderValidation } from '@kitsune/stage-ui/composables/use-provider-validation'
import { useSpeechStore } from '@kitsune/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@kitsune/stage-ui/stores/providers'
import { FieldCombobox, FieldTextArea } from '@kitsune/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

interface MimoSpeechProviderConfig {
  apiKey?: string
  baseUrl?: string
  format?: string
  model?: string
  stylePrompt?: string
  voice?: string
  voiceSample?: string
}

const speechStore = useSpeechStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)
const { t } = useI18n()

const defaultVoiceSettings = {
  speed: 1.0,
}

const providerId = 'mimo-audio-speech'
const defaultModel = 'mimo-v2.5-tts'
const defaultVoice = 'mimo_default'

const config = computed(() => providers.value[providerId] as MimoSpeechProviderConfig | undefined)

function ensureProviderConfig(): MimoSpeechProviderConfig {
  if (!providers.value[providerId]) {
    providers.value[providerId] = {}
  }

  return providers.value[providerId] as MimoSpeechProviderConfig
}

const providerModels = computed(() => providersStore.getModelsForProvider(providerId))
const modelOptions = computed(() => {
  const fallbackOptions = [
    { id: 'mimo-v2.5-tts', name: 'MiMo v2.5 TTS' },
    { id: 'mimo-v2.5-tts-voicedesign', name: 'MiMo v2.5 TTS Voice Design' },
    { id: 'mimo-v2.5-tts-voiceclone', name: 'MiMo v2.5 TTS Voice Clone' },
  ]

  return (providerModels.value.length > 0 ? providerModels.value : fallbackOptions).map(model => ({
    value: model.id,
    label: model.name,
  }))
})

const model = computed({
  get: () => config.value?.model || defaultModel,
  set: (value) => {
    ensureProviderConfig().model = value
  },
})

const availableVoices = computed(() => speechStore.availableVoices[providerId] || [])

const isVoiceDesignModel = computed(() => model.value === 'mimo-v2.5-tts-voicedesign')
const isVoiceCloneModel = computed(() => model.value === 'mimo-v2.5-tts-voiceclone')
const stylePromptLabel = computed(() => {
  if (isVoiceCloneModel.value)
    return 'Style prompt (optional)'
  if (isVoiceDesignModel.value)
    return 'Voice design prompt'
  return 'Style prompt'
})

const stylePromptDescription = computed(() => {
  if (isVoiceCloneModel.value) {
    return 'Optional natural-language control sent as the user message. Leave it empty for pure voice cloning.'
  }

  if (isVoiceDesignModel.value) {
    return 'Natural-language control sent as the user message. MiMo voice design requires this prompt and does not use a preset voice.'
  }

  return 'Natural-language control sent as the user message. You can leave it empty for a neutral delivery.'
})

const stylePrompt = computed({
  get: () => config.value?.stylePrompt || '',
  set: (value) => {
    ensureProviderConfig().stylePrompt = value
  },
})

const voiceSample = computed({
  get: () => config.value?.voiceSample || '',
  set: (value) => {
    ensureProviderConfig().voiceSample = value
  },
})

const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)

onMounted(async () => {
  ensureProviderConfig()

  if (!config.value?.model) {
    model.value = defaultModel
  }

  await providersStore.loadModelsForConfiguredProviders()
  await providersStore.fetchModelsForProvider(providerId)
  await speechStore.loadVoicesForProvider(providerId)
})

async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean, modelId?: string) {
  const provider = await providersStore.getProviderInstance<SpeechProvider<string>>(providerId)
  if (!provider) {
    throw new Error('Failed to initialize speech provider')
  }

  const providerConfig = providersStore.getProviderConfig(providerId)
  const modelToUse = modelId || model.value || defaultModel
  const requestConfig = {
    ...providerConfig,
    ...defaultVoiceSettings,
    stylePrompt: stylePrompt.value,
    voiceSample: voiceSample.value,
  }

  if (modelToUse === 'mimo-v2.5-tts-voiceclone' && !voiceSample.value.trim()) {
    throw new Error('Voice clone model requires a base64 audio sample in data URI format.')
  }

  const voiceToUse = modelToUse === 'mimo-v2.5-tts-voiceclone'
    ? voiceSample.value.trim()
    : voiceId || (config.value?.voice || defaultVoice)

  return await speechStore.speech(
    provider,
    modelToUse,
    input,
    voiceToUse,
    requestConfig,
  )
}

const {
  isValidating,
  isValid,
  validationMessage,
  forceValid,
} = useProviderValidation(providerId)
</script>

<template>
  <SpeechProviderSettings
    :provider-id="providerId"
    :default-model="defaultModel"
    :additional-settings="defaultVoiceSettings"
  >
    <template #voice-settings>
      <FieldCombobox
        v-model="model"
        :label="t('settings.pages.providers.provider.common.fields.field.model.label')"
        :description="t('settings.pages.providers.provider.common.fields.field.model.description')"
        :options="modelOptions"
        :placeholder="t('settings.pages.providers.provider.common.fields.field.model.placeholder')"
      />
      <FieldTextArea
        v-model="stylePrompt"
        :label="stylePromptLabel"
        :description="stylePromptDescription"
        :placeholder="t('settings.pages.providers.provider.mimo.style-prompt-placeholder')"
        :required="!isVoiceCloneModel"
      />
      <FieldTextArea
        v-if="isVoiceCloneModel"
        v-model="voiceSample"
        :label="t('settings.pages.providers.provider.mimo.voice-sample-label')"
        :description="t('settings.pages.providers.provider.mimo.voice-sample-description')"
        placeholder="data:audio/wav;base64,UklGRpyG..."
        :required="isVoiceCloneModel"
      />
    </template>

    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured"
        :voices-loading="speechStore.isLoadingSpeechProviderVoices"
        default-text="Hello! This is a test of the Xiaomi MiMo Speech."
      />
    </template>

    <template #advanced-settings>
      <Alert type="info">
        <template #title>
          MiMo model behavior
        </template>
        <template #content>
          <div class="whitespace-pre-wrap break-words text-sm space-y-1">
            <div>`mimo-v2.5-tts` uses the preset voice list below.</div>
            <div>`mimo-v2.5-tts-voicedesign` uses the style prompt to design a new voice and does not accept `audio.voice`.</div>
            <div>`mimo-v2.5-tts-voiceclone` uses the pasted voice sample and ignores the preset voice selector.</div>
          </div>
        </template>
      </Alert>
      <Alert v-if="!isValid && isValidating === 0 && validationMessage" type="error">
        <template #title>
          <div class="w-full flex items-center justify-between">
            <span>{{ t('settings.dialogs.onboarding.validationFailed') }}</span>
            <button
              type="button"
              class="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-600 font-medium transition-colors dark:bg-red-800/30 hover:bg-red-200 dark:text-red-300 dark:hover:bg-red-700/40"
              @click="forceValid"
            >
              {{ t('settings.pages.providers.common.continueAnyway') }}
            </button>
          </div>
        </template>
        <template v-if="validationMessage" #content>
          <div class="whitespace-pre-wrap break-all">
            {{ validationMessage }}
          </div>
        </template>
      </Alert>
      <Alert v-if="isValid && isValidating === 0" type="success">
        <template #title>
          {{ t('settings.dialogs.onboarding.validationSuccess') }}
        </template>
      </Alert>
    </template>
  </SpeechProviderSettings>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
