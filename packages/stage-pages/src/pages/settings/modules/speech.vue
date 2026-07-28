<script setup lang="ts">
import type { VoicePackSnapshot } from '@kitsune/stage-ui/stores/modules/persona'
import type { VoiceInfo } from '@kitsune/stage-ui/stores/providers'
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import {
  Alert,
  ErrorContainer,
  RadioCardSimple,
  VoiceCardManySelect,
} from '@kitsune/stage-ui/components'
import { ProviderModelSelectionDialog } from '@kitsune/stage-ui/components/scenarios/providers'
import { useAnalytics } from '@kitsune/stage-ui/composables'
import { usePersonaStore, useVoicePacksStore } from '@kitsune/stage-ui/stores'
import { useSpeechStore, voicePackForSpeechProvider } from '@kitsune/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@kitsune/stage-ui/stores/providers'
import {
  Button,
  FieldCheckbox,
  FieldInput,
  FieldRange,
  Skeleton,
  Textarea,
} from '@kitsune/ui'
import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { errorMessageFrom } from '@moeru/std'
import { electronTtsImportVoicePack, electronTtsSynthesize, isStageTamagotchi } from '@kitsune/stage-shared'
import { getDefaultEngineId } from '@kitsune/tts-hybrid'
import { generateSpeech } from '@xsai/generate-speech'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

const GENIE_TTS_PROVIDER_ID = getDefaultEngineId()

const { t } = useI18n()
const providersStore = useProvidersStore()
const speechStore = useSpeechStore()
const personaStore = usePersonaStore()
const voicePacksStore = useVoicePacksStore()
const { allAudioSpeechProvidersMetadata, persistedSpeechProvidersMetadata } = storeToRefs(providersStore)
const { activeCard } = storeToRefs(personaStore)
const { packs: voicePacks, loading: isLoadingVoicePacks, error: voicePacksError } = storeToRefs(voicePacksStore)
const {
  activeSpeechProvider,
  activeSpeechModel,
  activeSpeechVoice,
  activeSpeechVoiceId,
  pitch,
  isLoadingSpeechProviderVoices,
  supportsModelListing,
  providerModels,
  isLoadingActiveProviderModels,
  activeProviderModelError,
  modelSearchQuery,
  speechProviderError,
  ssmlEnabled,
  availableVoices,
} = storeToRefs(speechStore)

const { trackProviderClick } = useAnalytics()

const voiceSearchQuery = ref('')
const voiceLangFilter = ref<string>('all')
const useSSML = ref(false)

const voiceLangFilterOptions = computed(() => [
  { value: 'all', label: t('settings.pages.modules.speech.sections.section.voice-settings.language-filter.all') },
  { value: 'zh', label: t('settings.pages.modules.speech.sections.section.voice-settings.language-filter.zh') },
  { value: 'ja', label: t('settings.pages.modules.speech.sections.section.voice-settings.language-filter.ja') },
])

const testText = ref('Hello, my name is AI Assistant')
const ssmlText = ref('')
const isGenerating = ref(false)
const audioUrl = ref('')
const audioPlayer = ref<HTMLAudioElement | null>(null)
const errorMessage = ref('')
const showModelDialog = ref(false)

const isImportingVoice = ref(false)

async function importVoicePack() {
  const ipcRenderer = (window as Window & { electron?: { ipcRenderer?: unknown } }).electron?.ipcRenderer
  if (!ipcRenderer) {
    errorMessage.value = '需要 Electron 环境'
    return
  }
  isImportingVoice.value = true
  errorMessage.value = ''
  try {
    const { context } = createContext(ipcRenderer as Parameters<typeof createContext>[0])
    const invokeImport = defineInvoke(context, electronTtsImportVoicePack)
    const result = await invokeImport({})
    if (result.success) {
      // 刷新声线列表
      await speechStore.loadVoicesForProvider(activeSpeechProvider.value)
    }
    else {
      errorMessage.value = result.error ?? '导入失败'
    }
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '导入失败'
  }
  finally {
    isImportingVoice.value = false
  }
}

const supportsVoicePackSelection = computed(() => false)
const shouldShowVoicePackSection = computed(() =>
  supportsVoicePackSelection.value
  && (isLoadingVoicePacks.value || voicePacksError.value != null || voicePacks.value.length > 0),
)

const selectableSpeechProvidersMetadata = computed(() => {
  return [
    ...persistedSpeechProvidersMetadata.value.filter(metadata => metadata.id !== 'speech-noop'),
    ...allAudioSpeechProvidersMetadata.value.filter(metadata => metadata.id === 'speech-noop'),
  ]
})

function createVoicePackVoice(voicePack: VoicePackSnapshot): VoiceInfo {
  return {
    id: voicePack.voiceId,
    name: voicePack.name,
    description: voicePack.name,
    previewURL: '',
    languages: [{ code: 'en', title: 'English' }],
    provider: activeSpeechProvider.value,
    gender: 'neutral',
  }
}

function formatCostMultiplier(multiplier: number) {
  return `${Number.isInteger(multiplier) ? multiplier : multiplier.toFixed(2).replace(/\.?0+$/, '')}x`
}

function syncOpenAICompatibleSettings() {
  if (activeSpeechProvider.value !== 'openai-compatible-audio-speech')
    return

  const providerConfig = providersStore.getProviderConfig(activeSpeechProvider.value)
  if (providerConfig?.model) {
    activeSpeechModel.value = providerConfig.model as string
  }
  else {
    activeSpeechModel.value = 'tts-1'
  }
  if (providerConfig?.voice) {
    activeSpeechVoiceId.value = providerConfig.voice as string
    updateCustomVoiceName(providerConfig.voice as string)
  }
  else {
    activeSpeechVoiceId.value = 'alloy'
    updateCustomVoiceName('alloy')
  }
}

onMounted(async () => {
  // Only fetch models for the active speech provider, skip openai-compatible-audio-speech
  // which may have stale HTTP baseUrl (e.g. old GPT-SoVITS 127.0.0.1:9880)
  if (activeSpeechProvider.value && activeSpeechProvider.value !== 'openai-compatible-audio-speech')
    await providersStore.fetchModelsForProvider(activeSpeechProvider.value)
  await voicePacksStore.load()
  speechStore.ensureActiveSpeechModel()
  await speechStore.loadVoicesForProvider(activeSpeechProvider.value, activeSpeechModel.value || undefined)
  syncOpenAICompatibleSettings()
})

async function bindVoicePack(pack: (typeof voicePacks.value)[number]) {
  const bound = personaStore.bindVoicePackToActiveCard(pack)
  if (!bound)
    return
  await speechStore.loadVoicesForProvider(activeSpeechProvider.value, activeSpeechModel.value || undefined)
}

watch(activeSpeechProvider, async (newProvider, oldProvider) => {
  // Skip openai-compatible-audio-speech which may have stale HTTP baseUrl
  if (newProvider && newProvider !== 'openai-compatible-audio-speech')
    await providersStore.fetchModelsForProvider(newProvider)
  if (oldProvider !== undefined && oldProvider !== newProvider) {
    activeSpeechModel.value = ''
    activeSpeechVoiceId.value = ''
    activeSpeechVoice.value = undefined
  }
  speechStore.ensureActiveSpeechModel()
  await speechStore.loadVoicesForProvider(newProvider, activeSpeechModel.value || undefined)
  syncOpenAICompatibleSettings()
})

watch(activeSpeechModel, async () => {
  if (activeSpeechProvider.value) {
    await speechStore.loadVoicesForProvider(activeSpeechProvider.value, activeSpeechModel.value || undefined)
  }
})

watch([activeSpeechProvider, activeSpeechModel, activeSpeechVoiceId], ([provider, model, voiceId]) => {
  personaStore.updateActiveCardSpeech({ provider, model, voice_id: voiceId })
})

async function generateTestSpeech() {
  if (!testText.value.trim() && !useSSML.value)
    return
  if (useSSML.value && !ssmlText.value.trim())
    return

  // GPT-SoVITS uses stdin/stdout protocol, not HTTP.
  // Use IPC to call main process for local speech synthesis.
  if (isStageTamagotchi() && activeSpeechProvider.value === GENIE_TTS_PROVIDER_ID) {
    try {
      const ipcRenderer = (window as Window & { electron?: { ipcRenderer?: unknown } }).electron?.ipcRenderer
      if (!ipcRenderer)
        throw new Error('Electron IPC is not available')

      const { context } = createContext(ipcRenderer as Parameters<typeof createContext>[0])
      const invokeTtsSynthesize = defineInvoke(context, electronTtsSynthesize)
      const text = useSSML.value ? ssmlText.value : testText.value
      const result = await invokeTtsSynthesize({
        text,
        voice: activeSpeechVoice.value?.id || 'default',
      })
      
      if (!result.success) {
        errorMessage.value = result.error || 'GPT-SoVITS synthesis failed'
        return
      }
      
      // If we have audio data, play it
      if (result.audioData && result.audioData.byteLength > 0) {
        try {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
          const ctx = new AudioCtx()
          // 浏览器自动播放策略：AudioContext 初始常为 suspended，需手动 resume
          if (ctx.state === 'suspended')
            await ctx.resume()
          const audioBuffer = await ctx.decodeAudioData(result.audioData.slice(0))
          const source = ctx.createBufferSource()
          source.buffer = audioBuffer
          source.connect(ctx.destination)
          await new Promise<void>((resolve, reject) => {
            source.onended = () => {
              setTimeout(() => ctx.close().catch(() => {}), 500)
              resolve()
            }
            const playErr = source.start(0)
            if (playErr instanceof Promise)
              playErr.catch(reject)
          })
        }
        catch (playError) {
          errorMessage.value = playError instanceof Error
            ? `音频解码/播放失败: ${playError.message}`
            : '音频解码/播放失败'
        }
      }
      else {
        errorMessage.value = '合成成功但未返回音频数据'
      }
      return
    }
    catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'GPT-SoVITS IPC failed'
      return
    }
  }

  const provider = await providersStore.getProviderInstance(activeSpeechProvider.value) as SpeechProviderWithExtraOptions<string, any>
  if (!provider) {
    console.error('Failed to initialize speech provider')
    return
  }

  const providerConfig = providersStore.getProviderConfig(activeSpeechProvider.value)
  let model = activeSpeechModel.value
  let voice = activeSpeechVoice.value

  if (activeSpeechProvider.value === 'openai-compatible-audio-speech') {
    if (!model && providerConfig?.model)
      model = providerConfig.model as string
    if (!voice && providerConfig?.voice) {
      voice = {
        id: providerConfig.voice as string,
        name: providerConfig.voice as string,
        description: providerConfig.voice as string,
        previewURL: '',
        languages: [{ code: 'en', title: 'English' }],
        provider: activeSpeechProvider.value,
        gender: 'neutral',
      }
    }
  }

  const voicePack = voicePackForSpeechProvider(activeSpeechProvider.value, activeCard.value?.extensions.kitsune.modules.speech.voicePack)
  if (voicePack) {
    model = voicePack.ttsModelId
    if (!voice || voice.id !== voicePack.voiceId)
      voice = createVoicePackVoice(voicePack)
  }

  if (!model || !voice) {
    console.error('No model or voice selected')
    return
  }

  isGenerating.value = true
  errorMessage.value = ''

  try {
    if (audioUrl.value)
      stopTestAudio()

    const speechRequest = useSSML.value
      ? { input: ssmlText.value, providerConfig }
      : speechStore.resolveVoicePackSpeechInput({
          text: testText.value,
          voice,
          providerConfig: {
            ...providerConfig,
            pitch: ssmlEnabled.value ? pitch.value : undefined,
          },
          params: voicePack?.params,
          voicePack,
          forceSSML: ssmlEnabled.value,
          supportsSSML: speechStore.supportsSSML,
          supportsAdapterProsody: false,
        })

    const response = await generateSpeech({
      ...provider.speech(model, speechRequest.providerConfig),
      input: speechRequest.input,
      voice: voice.id,
    })

    audioUrl.value = URL.createObjectURL(new Blob([response]))
    setTimeout(() => audioPlayer.value?.play(), 100)
  }
  catch (error) {
    console.error('Error generating speech:', error)
    errorMessage.value = errorMessageFrom(error) || 'An unknown error occurred'
  }
  finally {
    isGenerating.value = false
  }
}

function stopTestAudio() {
  audioPlayer.value?.pause()
  if (audioPlayer.value)
    audioPlayer.value.currentTime = 0
  if (audioUrl.value) {
    URL.revokeObjectURL(audioUrl.value)
    audioUrl.value = ''
  }
}

onUnmounted(() => {
  if (audioUrl.value)
    URL.revokeObjectURL(audioUrl.value)
})

function updateCustomVoiceName(value: string | undefined) {
  if (!value) {
    activeSpeechVoice.value = undefined
    return
  }
  activeSpeechVoice.value = {
    id: value,
    name: value,
    description: value,
    previewURL: value,
    languages: [{ code: 'en', title: 'English' }],
    provider: activeSpeechProvider.value,
    gender: 'male',
  }
}

function updateCustomModelName(value: string | undefined) {
  activeSpeechModel.value = value || ''
}

function handleDeleteProvider(providerId: string) {
  if (providerId === 'speech-noop')
    return
  if (activeSpeechProvider.value === providerId) {
    activeSpeechProvider.value = 'speech-noop'
    activeSpeechModel.value = ''
    activeSpeechVoiceId.value = ''
    activeSpeechVoice.value = undefined
  }
  providersStore.deleteProvider(providerId)
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <section v-if="shouldShowVoicePackSection" class="rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white/50 dark:bg-white/[0.03] backdrop-blur-2xl p-5 transition-all duration-300 hover:shadow-sm hover:shadow-black/[0.02] dark:hover:shadow-black/[0.08]">
      <h3 class="mb-1.5 text-[15px] font-medium text-neutral-800 dark:text-neutral-100">
        {{ t('settings.pages.modules.speech.sections.section.voice-pack.title') }}
      </h3>
      <p class="mb-4 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
        {{ t('settings.pages.modules.speech.sections.section.voice-pack.description') }}
      </p>

      <div v-if="isLoadingVoicePacks" class="flex items-center gap-2 text-[13px] text-neutral-500 dark:text-neutral-400">
        <div class="i-solar:spinner-line-duotone animate-spin size-4" />
        <span>{{ t('settings.pages.modules.speech.sections.section.voice-pack.loading') }}</span>
      </div>

      <ErrorContainer
        v-else-if="voicePacksError"
        :title="t('settings.pages.modules.speech.sections.section.voice-pack.error')"
        :error="voicePacksError"
      />

      <div v-else-if="voicePacks.length > 0" class="flex flex-col gap-2">
        <button
          v-for="pack in voicePacks"
          :key="pack.id"
          type="button"
          class="flex items-center justify-between gap-3 w-full p-3 rounded-md text-left cursor-pointer transition-colors border border-black/[0.06] dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.04] text-neutral-800 dark:text-neutral-100 hover:border-primary-500/40"
          :class="{ '!border-primary-500/60 !bg-primary-500/8': personaStore.activeCard?.extensions.kitsune.modules.speech.voicePack?.packId === pack.id }"
          @click="bindVoicePack(pack)"
        >
          <div class="flex flex-col gap-1 min-w-0">
            <div class="text-[13px] font-medium">
              {{ pack.name }}
            </div>
            <div class="text-xs text-neutral-500 dark:text-neutral-400">
              {{ pack.ttsModelId }} / {{ pack.voiceId }}
            </div>
          </div>
          <span class="shrink-0 px-2 py-0.5 rounded text-[11px] bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400">{{ formatCostMultiplier(pack.costMultiplier) }}</span>
        </button>
      </div>
    </section>

    <section class="rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white/50 dark:bg-white/[0.03] backdrop-blur-2xl p-5 transition-all duration-300 hover:shadow-sm hover:shadow-black/[0.02] dark:hover:shadow-black/[0.08]">
      <h3 class="mb-1.5 text-[15px] font-medium text-neutral-800 dark:text-neutral-100">
        {{ t('settings.pages.modules.speech.sections.section.provider-selection.title') }}
      </h3>
      <p class="mb-4 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
        {{ t('settings.pages.modules.speech.sections.section.provider-selection.description') }}
      </p>

      <div v-if="selectableSpeechProvidersMetadata.length > 0" class="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5" role="radiogroup">
        <RadioCardSimple
          v-for="metadata in selectableSpeechProvidersMetadata"
          :id="metadata.id"
          :key="metadata.id"
          v-model="activeSpeechProvider"
          name="speech-provider"
          :value="metadata.id"
          :title="metadata.localizedName || 'Unknown'"
          :description="metadata.localizedDescription"
          @click="trackProviderClick(metadata.id, 'speech')"
        >
          <template #topRight>
            <button
              v-if="metadata.id !== 'speech-noop'"
              type="button"
              class="flex items-center justify-center w-[26px] h-[26px] p-0 border-none rounded-[5px] cursor-pointer bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-300 dark:hover:bg-neutral-600 hover:text-neutral-800 dark:hover:text-neutral-100 transition-colors"
              @click.stop.prevent="handleDeleteProvider(metadata.id)"
            >
              <div class="i-solar:trash-bin-trash-bold-duotone size-3.5" />
            </button>
          </template>
        </RadioCardSimple>
        <RouterLink to="/settings/providers#speech" class="flex flex-col items-center justify-center gap-2 p-4 border border-dashed rounded-lg text-neutral-500 dark:text-neutral-400 no-underline text-xs transition-colors border-neutral-300 dark:border-neutral-600 hover:border-primary-500/50 hover:text-primary-500">
          <div class="i-solar:add-circle-line-duotone size-6" />
          <span>{{ t('settings.pages.modules.speech.sections.section.provider-selection.add') }}</span>
        </RouterLink>
      </div>

      <RouterLink v-else to="/settings/providers" class="flex items-center gap-3 p-4 border border-dashed rounded-lg no-underline transition-colors border-neutral-300 dark:border-neutral-600 text-neutral-800 dark:text-neutral-100 hover:border-primary-500/50">
        <div class="i-solar:warning-circle-line-duotone size-6 shrink-0 text-amber-500" />
        <div class="flex flex-col gap-0.5 flex-1 min-w-0">
          <span class="text-sm font-medium">{{ t('settings.pages.modules.speech.sections.section.provider-selection.empty-title') }}</span>
          <span class="text-xs text-neutral-500 dark:text-neutral-400">{{ t('settings.pages.modules.speech.sections.section.provider-selection.empty-description') }}</span>
        </div>
        <div class="i-solar:arrow-right-line-duotone" />
      </RouterLink>
    </section>

    <section v-if="activeSpeechProvider && activeSpeechProvider !== 'speech-noop'" class="rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white/50 dark:bg-white/[0.03] backdrop-blur-2xl p-5 transition-all duration-300 hover:shadow-sm hover:shadow-black/[0.02] dark:hover:shadow-black/[0.08]">
      <h3 class="mb-1.5 text-[15px] font-medium text-neutral-800 dark:text-neutral-100">
        {{ t('settings.models') }}
      </h3>
      <p class="mb-4 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
        {{ t('settings.pages.modules.speech.sections.section.model-input.subtitle') }}
      </p>

      <div v-if="activeSpeechProvider === 'openai-compatible-audio-speech'">
        <FieldInput
          :model-value="activeSpeechModel || ''"
          :label="t('settings.pages.modules.speech.sections.section.model-input.label')"
          :description="t('settings.pages.modules.speech.sections.section.model-input.placeholder')"
          placeholder="tts-1"
          @update:model-value="updateCustomModelName"
        />
      </div>

      <div v-else-if="supportsModelListing" class="flex flex-col gap-3">
        <div v-if="isLoadingActiveProviderModels" class="flex items-center gap-2 text-[13px] text-neutral-500 dark:text-neutral-400">
          <div class="i-solar:spinner-line-duotone animate-spin size-4" />
          <span>{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.loading') }}</span>
        </div>

        <template v-else-if="activeProviderModelError">
          <ErrorContainer
            :title="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.error')"
            :error="activeProviderModelError"
          />
          <FieldInput
            :model-value="activeSpeechModel || ''"
            :label="t('settings.pages.modules.speech.sections.section.model-input.label')"
            :description="t('settings.pages.modules.speech.sections.section.model-input.error-description')"
            :placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.manual_model_placeholder')"
            @update:model-value="updateCustomModelName"
          />
        </template>

        <template v-else-if="providerModels.length === 0 && !isLoadingActiveProviderModels">
          <Alert type="warning">
            <template #title>
              {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_models') }}
            </template>
            <template #content>
              {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_models_description') }}
            </template>
          </Alert>
          <FieldInput
            :model-value="activeSpeechModel || ''"
            :label="t('settings.pages.modules.speech.sections.section.model-input.label')"
            :description="t('settings.pages.modules.speech.sections.section.model-input.empty-description')"
            :placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.manual_model_placeholder')"
            @update:model-value="updateCustomModelName"
          />
        </template>

        <button
          v-else-if="providerModels.length > 0"
          type="button"
          class="w-full flex items-center justify-between rounded-lg px-4 py-3 text-left transition-colors border border-black/[0.06] dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.04] hover:border-primary-400"
          @click="showModelDialog = true"
        >
          <span class="font-medium">{{ activeSpeechModel || t('settings.pages.modules.speech.sections.section.model-input.select-button') }}</span>
          <div i-solar:alt-arrow-right-bold-duotone class="text-neutral-400 dark:text-neutral-500" />
        </button>
        <ProviderModelSelectionDialog
          v-if="providerModels.length > 0"
          v-model:open="showModelDialog"
          v-model:model-value="activeSpeechModel"
          v-model:search-query="modelSearchQuery"
          :title="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.title')"
          :subtitle="t('settings.pages.modules.speech.sections.section.model-input.subtitle')"
          :current-model="activeSpeechModel"
          :current-model-label="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.current_model_label')"
          :items="providerModels"
          :loading="isLoadingActiveProviderModels"
          :supports-model-listing="supportsModelListing"
          :search-placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.search_placeholder')"
          :search-no-results-title="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_search_results')"
          :search-no-results-description="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_search_results_description', { query: modelSearchQuery })"
          :search-results-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.search_results', { count: '{count}', total: '{total}' })"
          :custom-input-placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.custom_model_placeholder')"
          :expand-button-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.expand')"
          :collapse-button-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.collapse')"
          @update:custom-value="updateCustomModelName"
        />
      </div>
    </section>

    <section v-if="activeSpeechProvider && activeSpeechProvider !== 'speech-noop'" class="rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white/50 dark:bg-white/[0.03] backdrop-blur-2xl p-5 transition-all duration-300 hover:shadow-sm hover:shadow-black/[0.02] dark:hover:shadow-black/[0.08]">
      <h3 class="mb-1.5 text-[15px] font-medium text-neutral-800 dark:text-neutral-100">
        {{ t('settings.providers.common.section.voice.title') }}
      </h3>
      <p class="mb-4 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
        {{ t('settings.pages.modules.speech.sections.section.provider-voice-selection.description') }}
      </p>

      <div v-if="isLoadingSpeechProviderVoices" class="flex flex-col gap-2.5">
        <Skeleton v-for="i in 4" :key="i" class="w-full p-3 rounded-md">
          <div class="h-1lh" />
        </Skeleton>
      </div>

      <div
        v-else-if="activeSpeechProvider !== 'openai-compatible-audio-speech' && availableVoices[activeSpeechProvider] && availableVoices[activeSpeechProvider].length > 0"
        class="mb-4"
      >
        <div class="flex gap-1 mb-2">
          <button
            v-for="opt in voiceLangFilterOptions"
            :key="opt.value"
            @click="voiceLangFilter = opt.value"
            class="text-xs px-2 py-0.5 rounded transition-colors"
            :class="voiceLangFilter === opt.value ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-muted'"
          >
            {{ opt.label }}
          </button>
        </div>
        <VoiceCardManySelect
          v-model:search-query="voiceSearchQuery"
          v-model:voice-id="activeSpeechVoiceId"
          :show-visualizer="false"
          :voices="availableVoices[activeSpeechProvider]?.filter(voice => {
            if (!activeSpeechModel) return true
            return !voice.compatibleModels || voice.compatibleModels.includes(activeSpeechModel)
          }).filter(voice => {
            if (voiceLangFilter === 'all') return true
            const langCode = voice.languages?.[0]?.code || 'zh'
            return langCode === voiceLangFilter
          }).map(voice => ({
            id: voice.id,
            name: voice.name,
            description: voice.description,
            previewURL: voice.previewURL,
            customizable: false,
          }))"
          :searchable="true"
          :search-placeholder="t('settings.pages.modules.speech.sections.section.provider-voice-selection.search_voices_placeholder')"
          :search-no-results-title="t('settings.pages.modules.speech.sections.section.provider-voice-selection.no_voices')"
          :search-no-results-description="t('settings.pages.modules.speech.sections.section.provider-voice-selection.no_voices_description')"
          :search-results-text="t('settings.pages.modules.speech.sections.section.provider-voice-selection.search_voices_results', { count: '{count}', total: '{total}' })"
          :unsupported-voice-warning-title="t('settings.pages.modules.speech.sections.section.provider-voice-selection.unsupported_voice_warning_title')"
          :unsupported-voice-warning-content="t('settings.pages.modules.speech.sections.section.provider-voice-selection.unsupported_voice_warning_content')"
          :custom-input-placeholder="t('settings.pages.modules.speech.sections.section.provider-voice-selection.custom_voice_placeholder')"
          :expand-button-text="t('settings.pages.modules.speech.sections.section.provider-voice-selection.show_more')"
          :collapse-button-text="t('settings.pages.modules.speech.sections.section.provider-voice-selection.show_less')"
          :play-button-text="t('settings.pages.modules.speech.sections.section.provider-voice-selection.play_sample')"
          :pause-button-text="t('settings.pages.modules.speech.sections.section.provider-voice-selection.pause')"
          @update:custom-value="updateCustomVoiceName"
        />

        <div v-if="isStageTamagotchi() && activeSpeechProvider === GENIE_TTS_PROVIDER_ID" class="flex gap-2 mt-2">
          <Button
            variant="outline"
            size="sm"
            :disabled="isImportingVoice"
            @click="importVoicePack"
          >
            <span class="i-solar:import-bold-duotone mr-1" />
            {{ isImportingVoice ? '导入中...' : '导入声线包 (.zip)' }}
          </Button>
        </div>
      </div>

      <ErrorContainer
        v-else-if="speechProviderError"
        class="mb-2"
        :title="t('settings.pages.modules.speech.sections.section.voice-settings.load-error')"
        :error="speechProviderError"
      />

      <Alert v-else type="warning" icon="i-solar:info-circle-line-duotone" class="mb-2">
        <template #title>
          {{ t('settings.pages.modules.speech.sections.section.provider-voice-selection.no_voices') }}
        </template>
        <template #content>
          {{ t('settings.pages.modules.speech.sections.section.provider-voice-selection.no_voices_description') }}.
          {{ t('settings.pages.modules.speech.sections.section.provider-voice-selection.no_voices_hint') }}
        </template>
      </Alert>

      <div class="flex flex-col gap-4 mt-4 pt-4 border-t border-black/[0.06] dark:border-white/[0.06]">
        <FieldRange
          v-model="pitch"
          :label="t('settings.providers.common.fields.field.pitch.label')"
          :description="t('settings.providers.common.fields.field.pitch.description')"
          :min="-100" :max="100" :step="1"
          :format-value="value => `${value}%`"
        />
        <FieldCheckbox
          v-model="ssmlEnabled"
          :label="t('settings.pages.modules.speech.sections.section.voice-settings.use-ssml.label')"
          :description="t('settings.pages.modules.speech.sections.section.voice-settings.use-ssml.description')"
        />
      </div>

      <div v-if="activeSpeechProvider === 'openai-compatible-audio-speech' || !availableVoices[activeSpeechProvider] || availableVoices[activeSpeechProvider].length === 0" class="flex flex-col gap-4 mt-4">
        <FieldInput
          type="text"
          :model-value="activeSpeechVoiceId || ''"
          :label="t('settings.pages.modules.speech.sections.section.voice-settings.name')"
          :description="t('settings.pages.modules.speech.sections.section.voice-settings.name-description')"
          :placeholder="t('settings.pages.modules.speech.sections.section.voice-settings.name-placeholder')"
          @update:model-value="updateCustomVoiceName"
        />

        <div v-if="activeSpeechProvider === 'elevenlabs'">
          <label class="block mb-1.5 text-[13px] font-medium text-neutral-800 dark:text-neutral-100">{{ t('settings.pages.modules.speech.sections.section.model-input.label') }}</label>
          <select v-model="activeSpeechModel" class="w-full py-2 px-2.5 rounded-md text-[13px] border border-black/[0.06] dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.04] text-neutral-800 dark:text-neutral-100">
            <option value="eleven_monolingual_v1">
              Monolingual v1
            </option>
            <option value="eleven_multilingual_v1">
              Multilingual v1
            </option>
            <option value="eleven_multilingual_v2">
              Multilingual v2
            </option>
          </select>
        </div>
      </div>
    </section>

    <section class="rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white/50 dark:bg-white/[0.03] backdrop-blur-2xl p-5 transition-all duration-300 hover:shadow-sm hover:shadow-black/[0.02] dark:hover:shadow-black/[0.08]">
      <h3 class="mb-1.5 text-[15px] font-medium text-neutral-800 dark:text-neutral-100">
        {{ t('settings.pages.modules.speech.sections.section.playground.title') }}
      </h3>
      <p class="mb-4 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
        {{ t('settings.pages.modules.speech.sections.section.playground.description') }}
      </p>

      <ErrorContainer v-if="errorMessage" :title="t('settings.pages.modules.speech.sections.section.playground.error')" :error="errorMessage" class="mb-4" />

      <Alert v-if="activeSpeechProvider === GENIE_TTS_PROVIDER_ID" type="info" class="mb-4">
        <template #title>GPT-SoVITS 使用本地 IPC 协议</template>
        <template #description>
          GPT-SoVITS 通过本地 IPC 协议与应用主进程通信，支持网页端语音测试。
          点击"测试声音"按钮将通过本地 sidecar 进行语音合成。
        </template>
      </Alert>

      <div class="flex flex-col gap-3.5">
        <FieldCheckbox
          v-model="useSSML"
          :label="t('settings.pages.modules.speech.sections.section.voice-settings.use-ssml.label')"
          :description="t('settings.pages.modules.speech.sections.section.voice-settings.use-ssml.description')"
        />

        <Textarea
          v-if="!useSSML"
          v-model="testText"
          class="min-h-[80px]"
          :placeholder="t('settings.pages.providers.provider.elevenlabs.playground.fields.field.input.placeholder')"
        />
        <textarea
          v-else
          v-model="ssmlText"
          class="min-h-[120px] p-2.5 rounded-md font-mono text-[13px] resize-y border border-black/[0.06] dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.04] text-neutral-800 dark:text-neutral-100"
          :placeholder="t('settings.pages.modules.speech.sections.section.voice-settings.input-ssml.placeholder')"
        />

        <div class="flex flex-wrap gap-2.5">
          <Button
            variant="primary"
            :disabled="isGenerating || (!testText.trim() && !useSSML) || (useSSML && !ssmlText.trim()) || !activeSpeechVoice"
            class="inline-flex items-center gap-1.5"
            @click="generateTestSpeech"
          >
            <div class="i-solar:play-circle-bold-duotone size-4" />
            <span>{{ isGenerating ? t('settings.pages.modules.speech.sections.section.playground.generating') : t('settings.pages.modules.speech.sections.section.playground.test-speech') }}</span>
          </Button>
          <Button v-if="audioUrl" variant="secondary" class="inline-flex items-center gap-1.5" @click="stopTestAudio">
            <div class="i-solar:stop-circle-bold-duotone size-4" />
            <span>{{ t('settings.pages.modules.speech.sections.section.playground.buttons.stop.label') }}</span>
          </Button>
        </div>
        <audio v-if="audioUrl" ref="audioPlayer" :src="audioUrl" controls class="w-full mt-1" />
      </div>
    </section>
  </div>
</template>

<style scoped>
:deep(.h-1lh) {
  height: 1lh;
}
</style>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.speech.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
