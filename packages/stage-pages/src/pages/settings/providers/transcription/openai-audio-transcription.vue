<script setup lang="ts">
import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import {
  TranscriptionPlayground,
  TranscriptionProviderSettings,
} from '@kitsune/stage-ui/components'
import { useHearingStore } from '@kitsune/stage-ui/stores/modules/hearing'
import { useProvidersStore } from '@kitsune/stage-ui/stores/providers'
import { FieldCombobox } from '@kitsune/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const hearingStore = useHearingStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)
const { t } = useI18n()

// Get provider metadata
const providerId = 'openai-audio-transcription'
const defaultModel = 'whisper-1'

// Model selection
const model = computed({
  get: () => providers.value[providerId]?.model as string | undefined || defaultModel,
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].model = value
  },
})

// Load models
const providerModels = computed(() => {
  return providersStore.getModelsForProvider(providerId)
})

const isLoadingModels = computed(() => {
  return providersStore.isLoadingModels[providerId] || false
})

// Check if API key is configured
const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)

// Load models on mount
onMounted(async () => {
  await providersStore.loadModelsForConfiguredProviders()
  await providersStore.fetchModelsForProvider(providerId)
})

// Generate transcription
async function handleGenerateTranscription(file: File) {
  const provider = await providersStore.getProviderInstance<TranscriptionProviderWithExtraOptions<string, any>>(providerId)
  if (!provider) {
    throw new Error('Failed to initialize transcription provider')
  }

  // Get provider configuration
  const providerConfig = providersStore.getProviderConfig(providerId)

  // Get model from configuration or use default
  const modelToUse = providerConfig.model as string | undefined || defaultModel

  return await hearingStore.transcription(
    providerId,
    provider,
    modelToUse,
    file,
    'json',
  )
}

watch(model, async () => {
  const providerConfig = providersStore.getProviderConfig(providerId)
  providerConfig.model = model.value
})
</script>

<template>
  <TranscriptionProviderSettings
    :provider-id="providerId"
    :default-model="defaultModel"
  >
    <template #basic-settings>
      <!-- Model selection -->
      <FieldCombobox
        v-model="model"
        :label="t('settings.pages.providers.provider.common.fields.field.model.label')"
        :description="t('settings.pages.providers.provider.common.fields.field.model.description')"
        :options="providerModels.map(m => ({ value: m.id, label: m.name }))"
        :disabled="isLoadingModels || providerModels.length === 0"
        :placeholder="t('settings.pages.providers.provider.common.fields.field.model.placeholder')"
      />
    </template>
    <template #playground>
      <TranscriptionPlayground
        :generate-transcription="handleGenerateTranscription"
        :api-key-configured="apiKeyConfigured"
      />
    </template>
  </TranscriptionProviderSettings>
</template>

<route lang="yaml">
  meta:
    layout: settings
    stageTransition:
      name: slide
  </route>
