<script setup lang="ts">
import workletUrl from '@kitsune/stage-ui/workers/vad/process.worklet?worker&url'

import { errorMessageFromValue } from '@kitsune/stage-shared'
import { Alert, ErrorContainer, LevelMeter, RadioCardSimple, ThresholdMeter, TimeSeriesChart } from '@kitsune/stage-ui/components'
import { ProviderModelSelectionDialog } from '@kitsune/stage-ui/components/scenarios/providers'
import { useAnalytics, useAudioAnalyzer, useAudioRecorder } from '@kitsune/stage-ui/composables'
import { useVAD } from '@kitsune/stage-ui/stores/ai/models/vad'
import { useAudioContext } from '@kitsune/stage-ui/stores/audio'
import { CONFIDENCE_THRESHOLD_DISABLED, useHearingSpeechInputPipeline, useHearingStore } from '@kitsune/stage-ui/stores/modules/hearing'
import { useProvidersStore } from '@kitsune/stage-ui/stores/providers'
import { useSettingsAudioDevice } from '@kitsune/stage-ui/stores/settings'
import { Button, FieldCheckbox, FieldCombobox, FieldInput, FieldRange } from '@kitsune/ui'
import { until } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const hearingStore = useHearingStore()
const {
  activeTranscriptionProvider,
  activeTranscriptionModel,
  providerModels,
  activeProviderModelError,
  isLoadingActiveProviderModels,
  supportsModelListing,
  transcriptionModelSearchQuery,
  activeCustomModelName,
  autoSendEnabled,
  autoSendDelay,
  confidenceThreshold,
  verboseJsonNotSupported,
} = storeToRefs(hearingStore)
const providersStore = useProvidersStore()
const { allAudioTranscriptionProvidersMetadata } = storeToRefs(providersStore)

const { trackProviderClick } = useAnalytics()
const { stopStream, startStream } = useSettingsAudioDevice()
const { audioInputs, selectedAudioInput, stream } = storeToRefs(useSettingsAudioDevice())
const { startRecord, stopRecord, onStopRecord } = useAudioRecorder(stream)
const { startAnalyzer, stopAnalyzer, onAnalyzerUpdate, volumeLevel } = useAudioAnalyzer()
const { audioContext } = storeToRefs(useAudioContext())
const hearingSpeechInputPipeline = useHearingSpeechInputPipeline()
const {
  transcribeForRecording,
  transcribeForMediaStream,
  stopStreamingTranscription,
} = hearingSpeechInputPipeline
const {
  supportsStreamInput,
  error: transcriptionPipelineError,
} = storeToRefs(hearingSpeechInputPipeline)

const animationFrame = ref<number>()

const error = ref<string>('')
const isMonitoring = ref(false)
const showModelDialog = ref(false)

const transcriptions = ref<string[]>([])
const audios = ref<Blob[]>([])
const audioCleanups = ref<(() => void)[]>([])
const audioURLs = computed(() => {
  return audios.value.map((blob) => {
    const url = URL.createObjectURL(blob)
    audioCleanups.value.push(() => URL.revokeObjectURL(url))
    return url
  })
})

// Speech-to-Text test state
const isTestingSTT = ref(false)
const testTranscriptionText = ref<string>('')
const testTranscriptionError = ref<string>('')
const isTranscribing = ref(false)
const testStreamingText = ref<string>('')
const testStatusMessage = ref<string>('')
const testStreamWasStarted = ref(false) // Track if we started the stream for testing

const useVADThreshold = ref(0.6) // 0.1 - 0.9
const useVADMinSilenceDurationMs = ref(800)
const useVADModel = ref(true) // Toggle between VAD and volume-based detection
const shouldUseStreamInput = computed(() => supportsStreamInput.value && !!stream.value)

function formatVADThreshold(value: number) {
  return value.toFixed(2)
}

async function handleSpeechStart() {
  if (shouldUseStreamInput.value && stream.value) {
    // Use both callbacks to support incremental updates and final transcript replacement.
    // ChatArea uses only onSentenceEnd to avoid re-adding deleted text.
    await transcribeForMediaStream(stream.value, {
      onSentenceEnd: (delta) => {
        transcriptions.value.push(delta)
      },
      onSpeechEnd: (text) => {
        transcriptions.value = [text]
      },
    })
    return
  }

  startRecord()
}

async function handleSpeechEnd() {
  if (shouldUseStreamInput.value) {
    // For streaming providers, keep the session alive; idle timer will handle teardown.
    return
  }

  stopRecord()
}

const {
  init: initVAD,
  dispose: disposeVAD,
  isSpeech: isSpeechVAD,
  isSpeechProb,
  isSpeechHistory,
  inferenceError: vadModelError,
  start: startVAD,
  loaded: loadedVAD,
  loading: loadingVAD,
} = useVAD(workletUrl, {
  threshold: useVADThreshold,
  minSilenceDurationMs: useVADMinSilenceDurationMs,
  onSpeechStart: () => {
    void handleSpeechStart()
  },
  onSpeechEnd: () => {
    void handleSpeechEnd()
  },
})

const isSpeechVolume = ref(false) // Volume-based speaking detection
const isSpeech = computed(() => {
  if (useVADModel.value && loadedVAD.value) {
    return isSpeechVAD.value
  }

  return isSpeechVolume.value
})

async function setupAudioMonitoring() {
  try {
    if (!selectedAudioInput.value) {
      console.warn('No audio input device selected')
      return
    }

    await stopAudioMonitoring()

    await startStream()
    if (!stream.value) {
      console.warn('No audio stream available')
      return
    }

    const source = audioContext.value.createMediaStreamSource(stream.value)

    // Fallback speaking detection (when VAD model is not used)
    const analyzer = startAnalyzer(audioContext.value)
    onAnalyzerUpdate((volumeLevel) => {
      if (!useVADModel.value || !loadedVAD.value) {
        isSpeechVolume.value = volumeLevel > useVADThreshold.value
      }
    })
    if (analyzer)
      source.connect(analyzer)

    if (useVADModel.value) {
      await initVAD()
      await startVAD(stream.value)
    }
  }
  catch (error) {
    console.error('Error setting up audio monitoring:', error)
    vadModelError.value = errorMessageFromValue(error)
  }
}

async function stopAudioMonitoring() {
  if (animationFrame.value) { // Stop animation frame
    cancelAnimationFrame(animationFrame.value)
    animationFrame.value = undefined
  }

  await stopStreamingTranscription(true, activeTranscriptionProvider.value)
  if (stream.value) { // Stop media stream
    stopStream()
  }

  stopAnalyzer()
  disposeVAD()
}

// Monitoring toggle
async function toggleMonitoring() {
  if (!isMonitoring.value) {
    await setupAudioMonitoring()
    isMonitoring.value = true
  }
  else {
    await stopAudioMonitoring()
    isMonitoring.value = false
  }
}

// Speaking indicator with enhanced VAD visualization
const speakingIndicatorClass = computed(() => {
  if (!useVADModel.value || !loadedVAD.value) {
    return isSpeechVolume.value
      ? 'bg-primary-500 shadow-lg shadow-primary-500/50'
      : 'bg-neutral-200 dark:bg-neutral-800 border-2 border-neutral-300 dark:border-neutral-600'
  }

  const prob = isSpeechProb.value
  const threshold = useVADThreshold.value

  if (prob > threshold) {
    return 'bg-primary-500 shadow-lg shadow-primary-500/50'
  }
  else if (prob > threshold * 0.5) {
    return 'bg-primary-300 shadow-lg shadow-primary-500/20'
  }
  else {
    return 'bg-neutral-200 dark:bg-neutral-800 border-2 border-neutral-300 dark:border-neutral-600'
  }
})

function updateCustomModelName(value: string | undefined) {
  const modelValue = value || ''
  activeCustomModelName.value = modelValue
  activeTranscriptionModel.value = modelValue
}

// Sync OpenAI Compatible model from provider config
function syncOpenAICompatibleSettings() {
  if (activeTranscriptionProvider.value !== 'openai-compatible-audio-transcription')
    return

  const providerConfig = providersStore.getProviderConfig(activeTranscriptionProvider.value)
  // Always sync model from provider config (override any existing value from previous provider)
  if (providerConfig?.model) {
    activeTranscriptionModel.value = providerConfig.model as string
    updateCustomModelName(providerConfig.model as string)
  }
  else {
    // If no model in provider config, use default
    const defaultModel = 'whisper-1'
    activeTranscriptionModel.value = defaultModel
    updateCustomModelName(defaultModel)
  }
}

onStopRecord(async (recording) => {
  if (shouldUseStreamInput.value)
    return

  if (!recording || recording.size === 0)
    return

  // Handle STT test transcription directly here
  if (isTestingSTT.value) {
    testStatusMessage.value = t('settings.pages.modules.hearing.sections.section.stt-test.transcribing-recording')
    isTranscribing.value = true

    try {
      const result = await transcribeForRecording(recording)
      if (result) {
        testTranscriptionText.value = result
        testStatusMessage.value = t('settings.pages.modules.hearing.sections.section.stt-test.status.complete')
        console.info('STT test transcription result:', result)
      }
      else {
        testTranscriptionError.value = transcriptionPipelineError.value || t('settings.pages.modules.hearing.sections.section.stt-test.status.failed')
        testStatusMessage.value = t('settings.pages.modules.hearing.sections.section.stt-test.status.failed')
      }
    }
    catch (err) {
      testTranscriptionError.value = errorMessageFromValue(err)
      testStatusMessage.value = t('settings.pages.modules.hearing.sections.section.stt-test.error-with-message', { error: testTranscriptionError.value })
      console.error('STT test transcription error:', err)
    }
    finally {
      isTranscribing.value = false
      isTestingSTT.value = false
    }
    return
  }

  // Normal monitoring mode - add to audios and transcribe
  audios.value.push(recording)

  const res = await transcribeForRecording(recording)

  if (res) {
    transcriptions.value.push(res)
    error.value = ''
  }
  else if (transcriptionPipelineError.value) {
    error.value = transcriptionPipelineError.value
  }
})

// Speech-to-Text test functions
async function startSTTTest() {
  if (!activeTranscriptionProvider.value) {
    testTranscriptionError.value = t('settings.pages.modules.hearing.sections.section.stt-test.select-provider-first')
    return
  }

  if (!selectedAudioInput.value) {
    testTranscriptionError.value = t('settings.pages.modules.hearing.sections.section.stt-test.select-device-first')
    return
  }

  testTranscriptionError.value = ''
  testTranscriptionText.value = ''
  testStreamingText.value = ''
  testStatusMessage.value = ''
  error.value = ''
  isTestingSTT.value = true
  isTranscribing.value = true

  try {
    // Ensure audio stream is available
    if (!stream.value) {
      testStatusMessage.value = t('settings.pages.modules.hearing.sections.section.stt-test.status.starting-stream')
      testStreamWasStarted.value = true
      await startStream()

      // Wait for the stream to become available with a 3-second timeout.
      try {
        await until(stream).toBeTruthy({ timeout: 3000, throwOnTimeout: true })
      }
      catch {
        handleStreamStartError()
        return
      }

      // Type guard: until guarantees stream.value is truthy, but TypeScript doesn't know this
      if (!stream.value) {
        handleStreamStartError()
        return
      }
    }
    else {
      testStreamWasStarted.value = false // Stream was already running
    }

    // Check if provider supports streaming input
    if (shouldUseStreamInput.value && stream.value) {
      testStatusMessage.value = t('settings.pages.modules.hearing.sections.section.stt-test.status.starting-streaming')
      console.info('Starting STT test with streaming input for provider:', activeTranscriptionProvider.value)

      await transcribeForMediaStream(stream.value, {
        onSentenceEnd: (delta) => {
          if (delta && delta.trim()) {
            testStreamingText.value += `${delta} `
            testStatusMessage.value = t('settings.pages.modules.hearing.sections.section.stt-test.status.transcribing-streaming')
            isTranscribing.value = true
            console.info('STT test received sentence:', delta)
          }
        },
        onSpeechEnd: (text) => {
          if (text) {
            testTranscriptionText.value = text
            testStreamingText.value = ''
            testStatusMessage.value = t('settings.pages.modules.hearing.sections.section.stt-test.status.complete')
            isTranscribing.value = false
            console.info('STT test completed with text:', text)
          }
          else {
            testStatusMessage.value = t('settings.pages.modules.hearing.sections.section.stt-test.status.waiting-for-speech')
            isTranscribing.value = false
          }
        },
      })

      testStatusMessage.value = t('settings.pages.modules.hearing.sections.section.stt-test.status.listening')
      isTranscribing.value = false // Not actively transcribing yet, just listening
    }
    else {
      // Fallback to recording-based transcription
      testStatusMessage.value = t('settings.pages.modules.hearing.sections.section.stt-test.status.recording')
      console.info('Starting STT test with recording-based transcription for provider:', activeTranscriptionProvider.value)

      startRecord()

      // Wait a bit for recording to start, then stop it after a delay
      setTimeout(async () => {
        stopRecord()
        testStatusMessage.value = t('settings.pages.modules.hearing.sections.section.stt-test.status.processing')
      }, 3000) // Record for 3 seconds
    }
  }
  catch (err) {
    testTranscriptionError.value = errorMessageFromValue(err)
    testStatusMessage.value = t('settings.pages.modules.hearing.sections.section.stt-test.error-with-message', { error: testTranscriptionError.value })
    isTranscribing.value = false
    isTestingSTT.value = false
    console.error('STT test error:', err)
  }
}

async function stopSTTTest() {
  isTestingSTT.value = false
  isTranscribing.value = false
  testStatusMessage.value = t('settings.pages.modules.hearing.sections.section.stt-test.status.stopped')

  try {
    // Stop streaming transcription if active
    if (shouldUseStreamInput.value) {
      await stopStreamingTranscription(false, activeTranscriptionProvider.value)
    }
    else {
      stopRecord()
    }
  }
  catch (err) {
    console.error('Error stopping STT test:', err)
  }

  // Finalize transcription if we have streaming text
  if (testStreamingText.value.trim() && !testTranscriptionText.value) {
    testTranscriptionText.value = testStreamingText.value.trim()
  }

  // Stop the stream if we started it for testing (and monitoring is not active)
  if (testStreamWasStarted.value && !isMonitoring.value) {
    try {
      stopStream()
      testStreamWasStarted.value = false
    }
    catch (err) {
      console.error('Error stopping test stream:', err)
    }
  }
}

// Note: STT test transcription is now handled directly in onStopRecord handler above
// This watch is kept for potential future use but is no longer needed for STT tests

watch(selectedAudioInput, async () => isMonitoring.value && await setupAudioMonitoring())

function handleStreamStartError() {
  const startStreamError = t('settings.pages.modules.hearing.sections.section.stt-test.start-stream-error')
  testTranscriptionError.value = startStreamError
  testStatusMessage.value = t('settings.pages.modules.hearing.sections.section.stt-test.error-with-message', { error: startStreamError })
  isTranscribing.value = false
  isTestingSTT.value = false
  testStreamWasStarted.value = false
}

watch(activeTranscriptionProvider, async (provider) => {
  if (!provider)
    return

  await hearingStore.loadModelsForProvider(provider)
  syncOpenAICompatibleSettings()

  // Auto-select first model for Web Speech API if no model is selected
  if (provider === 'browser-web-speech-api' && !activeTranscriptionModel.value) {
    const models = providerModels.value
    if (models.length > 0) {
      activeTranscriptionModel.value = models[0].id
      console.info('Auto-selected Web Speech API model:', models[0].id)
    }
  }
}, { immediate: true })

onMounted(async () => {
  // Audio devices are loaded on demand when user requests them
  syncOpenAICompatibleSettings()
})

onUnmounted(() => {
  stopSTTTest()
  stopAudioMonitoring()
  disposeVAD()

  // Clean up any active transcription sessions when leaving the page
  // This prevents stale sessions from interfering with other pages
  if (shouldUseStreamInput.value) {
    stopStreamingTranscription(true, activeTranscriptionProvider.value).catch((err) => {
      console.warn('[Hearing Module] Error cleaning up transcription session on unmount:', err)
    })
  }

  audioCleanups.value.forEach(cleanup => cleanup())
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <section class="rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white/50 dark:bg-white/[0.03] backdrop-blur-2xl p-5 transition-all duration-300 hover:shadow-sm hover:shadow-black/[0.02] dark:hover:shadow-black/[0.08]">
      <h3 class="mb-1.5 text-[15px] font-medium text-neutral-800 dark:text-neutral-100">
        {{ t('settings.pages.modules.hearing.sections.section.audio-input.title') }}
      </h3>
      <p class="mb-4 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
        {{ t('settings.pages.modules.hearing.sections.section.audio-input.description') }}
      </p>
      <FieldCombobox
        v-model="selectedAudioInput"
        :label="t('settings.pages.modules.hearing.sections.section.audio-input.title')"
        :options="audioInputs.map(input => ({
          label: input.label || input.deviceId,
          value: input.deviceId,
        }))"
        :placeholder="t('settings.pages.modules.hearing.sections.section.audio-input.title')"
        layout="vertical"
      />
    </section>

    <section class="rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white/50 dark:bg-white/[0.03] backdrop-blur-2xl p-5 transition-all duration-300 hover:shadow-sm hover:shadow-black/[0.02] dark:hover:shadow-black/[0.08]">
      <h3 class="mb-1.5 text-[15px] font-medium text-neutral-800 dark:text-neutral-100">
        {{ t('settings.pages.modules.hearing.sections.section.provider-selection.title') }}
      </h3>
      <p class="mb-4 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
        {{ t('settings.pages.modules.hearing.sections.section.provider-selection.description') }}
      </p>
      <div v-if="allAudioTranscriptionProvidersMetadata.length > 0" class="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5" role="radiogroup">
        <RadioCardSimple
          v-for="metadata in allAudioTranscriptionProvidersMetadata"
          :id="metadata.id"
          :key="metadata.id"
          v-model="activeTranscriptionProvider"
          name="provider"
          :value="metadata.id"
          :title="metadata.localizedName || 'Unknown'"
          :description="metadata.localizedDescription"
          @click="trackProviderClick(metadata.id, 'hearing')"
        />
        <RouterLink to="/settings/providers#transcription" class="flex flex-col items-center justify-center gap-2 border border-dashed border-neutral-300 dark:border-neutral-600 rounded-lg p-4 text-neutral-500 dark:text-neutral-400 no-underline text-xs transition-colors hover:border-primary-500/50 hover:text-primary-500 min-h-[88px]">
          <div class="i-solar:add-circle-line-duotone w-6 h-6" />
          <span>{{ t('settings.pages.modules.hearing.sections.section.provider-selection.add') }}</span>
        </RouterLink>
      </div>
      <RouterLink v-else to="/settings/providers" class="flex items-center gap-3 p-4 border border-dashed border-neutral-300 dark:border-neutral-600 rounded-lg text-neutral-800 dark:text-neutral-100 no-underline transition-colors hover:border-primary-500/50">
        <div class="i-solar:warning-circle-line-duotone text-amber-500 w-6 h-6 flex-none" />
        <div class="flex flex-col gap-0.5 flex-1 min-w-0">
          <span class="text-sm font-medium">{{ t('settings.pages.modules.hearing.sections.section.provider-selection.empty-title') }}</span>
          <span class="text-xs text-neutral-500 dark:text-neutral-400">{{ t('settings.pages.modules.hearing.sections.section.provider-selection.empty-description') }}</span>
        </div>
        <div class="i-solar:arrow-right-line-duotone" />
      </RouterLink>
    </section>

    <section v-if="activeTranscriptionProvider" class="rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white/50 dark:bg-white/[0.03] backdrop-blur-2xl p-5 transition-all duration-300 hover:shadow-sm hover:shadow-black/[0.02] dark:hover:shadow-black/[0.08]">
      <h3 class="mb-1.5 text-[15px] font-medium text-neutral-800 dark:text-neutral-100">
        {{ t('settings.pages.modules.hearing.sections.section.provider-model-selection.title') }}
      </h3>
      <p class="mb-4 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
        <span v-if="supportsModelListing && providerModels.length > 0">
          {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.subtitle') }}
        </span>
        <span v-else>{{ t('settings.pages.modules.hearing.sections.section.provider-model-selection.manual-description') }}</span>
      </p>
      <div v-if="activeTranscriptionModel" class="mb-4 text-sm text-neutral-400 font-medium dark:text-neutral-400">
        {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.current_model_label') }} {{ activeTranscriptionModel }}
      </div>

      <div v-if="isLoadingActiveProviderModels && supportsModelListing" class="flex items-center gap-2 text-[13px] text-neutral-500 dark:text-neutral-400">
        <div class="i-solar:spinner-line-duotone animate-spin text-xl w-4 h-4" />
        <span>{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.loading') }}</span>
      </div>

      <ErrorContainer
        v-else-if="activeProviderModelError && supportsModelListing"
        :title="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.error')"
        :error="activeProviderModelError"
      />

      <div
        v-else-if="!supportsModelListing || (activeTranscriptionProvider === 'openai-compatible-audio-transcription' && providerModels.length === 0 && !isLoadingActiveProviderModels)"
        class="mt-2"
      >
        <FieldInput
          :model-value="activeTranscriptionModel || activeCustomModelName || ''"
          placeholder="whisper-1"
          @update:model-value="updateCustomModelName"
        />
      </div>

      <Alert
        v-else-if="providerModels.length === 0 && !isLoadingActiveProviderModels && supportsModelListing"
        type="warning"
      >
        <template #title>
          {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_models') }}
        </template>
        <template #content>
          {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_models_description') }}
        </template>
      </Alert>

      <button
        v-else-if="providerModels.length > 0 && supportsModelListing"
        type="button"
        class="w-full flex items-center justify-between rounded-lg px-4 py-3 text-left transition-colors hover:border-primary-400 border border-black/[0.06] dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.04]"
        @click="showModelDialog = true"
      >
        <span class="font-medium">{{ activeTranscriptionModel || t('settings.dialogs.onboarding.select-model') }}</span>
        <div i-solar:alt-arrow-right-bold-duotone class="text-neutral-400 dark:text-neutral-500" />
      </button>
      <ProviderModelSelectionDialog
        v-if="providerModels.length > 0 && supportsModelListing"
        v-model:open="showModelDialog"
        v-model:model-value="activeTranscriptionModel"
        v-model:search-query="transcriptionModelSearchQuery"
        :title="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.title')"
        :subtitle="t('settings.pages.modules.hearing.sections.section.provider-model-selection.manual-description')"
        :current-model="activeTranscriptionModel"
        :current-model-label="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.current_model_label')"
        :items="providerModels"
        :loading="isLoadingActiveProviderModels"
        :supports-model-listing="supportsModelListing"
        :search-placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.search_placeholder')"
        :search-no-results-title="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_search_results')"
        :search-no-results-description="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_search_results_description', { query: transcriptionModelSearchQuery })"
        :search-results-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.search_results', { count: '{count}', total: '{total}' })"
        :custom-input-placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.custom_model_placeholder')"
        :expand-button-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.expand')"
        :collapse-button-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.collapse')"
        @update:custom-value="updateCustomModelName"
      />
    </section>

    <section v-if="!supportsStreamInput" class="rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white/50 dark:bg-white/[0.03] backdrop-blur-2xl p-5 transition-all duration-300 hover:shadow-sm hover:shadow-black/[0.02] dark:hover:shadow-black/[0.08]">
      <h3 class="mb-1.5 text-[15px] font-medium text-neutral-800 dark:text-neutral-100">
        {{ t('settings.pages.modules.hearing.sections.section.confidence-threshold.title') }}
      </h3>
      <p class="mb-4 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
        {{ t('settings.pages.modules.hearing.sections.section.confidence-threshold.description') }}
      </p>
      <FieldRange
        v-model="confidenceThreshold"
        :min="CONFIDENCE_THRESHOLD_DISABLED"
        :max="0"
        :step="0.1"
        :format-value="value => value <= CONFIDENCE_THRESHOLD_DISABLED ? t('settings.pages.modules.hearing.sections.section.confidence-threshold.disabled') : value.toFixed(1)"
      />
      <div v-if="confidenceThreshold > CONFIDENCE_THRESHOLD_DISABLED" class="mt-2 text-xs text-neutral-400 dark:text-neutral-500">
        {{ t('settings.pages.modules.hearing.sections.section.confidence-threshold.verbose-json-note') }}
      </div>
      <div v-if="verboseJsonNotSupported" class="mt-2 flex items-center gap-1.5 text-xs text-amber-500 dark:text-amber-400">
        <div class="i-solar:warning-circle-line-duotone shrink-0" />
        {{ t('settings.pages.modules.hearing.sections.section.confidence-threshold.verbose-json-unsupported') }}
      </div>
    </section>

    <section class="rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white/50 dark:bg-white/[0.03] backdrop-blur-2xl p-5 transition-all duration-300 hover:shadow-sm hover:shadow-black/[0.02] dark:hover:shadow-black/[0.08]">
      <h3 class="mb-1.5 text-[15px] font-medium text-neutral-800 dark:text-neutral-100">
        {{ t('settings.pages.modules.hearing.sections.section.auto-send.title') }}
      </h3>
      <p class="mb-4 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
        {{ t('settings.pages.modules.hearing.sections.section.auto-send.description') }}
      </p>

      <div class="space-y-4">
        <FieldCheckbox
          v-model="autoSendEnabled"
          :label="t('settings.pages.modules.hearing.sections.section.auto-send.enabled.label')"
          :description="t('settings.pages.modules.hearing.sections.section.auto-send.enabled.description')"
        />

        <FieldRange
          v-if="autoSendEnabled"
          v-model="autoSendDelay"
          :label="t('settings.pages.modules.hearing.sections.section.auto-send.delay.label')"
          :description="t('settings.pages.modules.hearing.sections.section.auto-send.delay.description')"
          :min="0"
          :max="10000"
          :step="100"
          :format-value="value => value === 0 ? t('settings.pages.modules.hearing.sections.section.auto-send.delay.immediate') : `${(value / 1000).toFixed(1)}s`"
        />
      </div>
    </section>

    <section class="rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white/50 dark:bg-white/[0.03] backdrop-blur-2xl p-5 transition-all duration-300 hover:shadow-sm hover:shadow-black/[0.02] dark:hover:shadow-black/[0.08]">
      <h3 class="mb-1.5 text-[15px] font-medium text-neutral-800 dark:text-neutral-100">
        {{ t('settings.pages.modules.hearing.sections.section.monitoring.title') }}
      </h3>
      <p class="mb-4 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
        {{ t('settings.pages.modules.hearing.sections.section.monitoring.description') }}
      </p>

      <ErrorContainer v-if="error" :title="t('settings.pages.modules.hearing.sections.section.monitoring.error-title')" :error="error" mb-4 />

      <Button class="mb-4" w-full @click="toggleMonitoring">
        {{ isMonitoring ? t('settings.pages.modules.hearing.sections.section.monitoring.stop') : t('settings.pages.modules.hearing.sections.section.monitoring.start') }}
      </Button>

      <div>
        <div v-for="(transcription, index) in transcriptions" :key="index" class="mb-2">
          <audio v-if="audioURLs[index]" :src="audioURLs[index]" controls class="w-full" />
          <div v-if="transcription" class="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            {{ transcription }}
          </div>
        </div>
      </div>

      <div class="space-y-4">
        <LevelMeter :level="volumeLevel" :label="t('settings.pages.modules.hearing.sections.section.monitoring.input-level')" />

        <ThresholdMeter
          v-if="useVADModel && loadedVAD"
          :value="isSpeechProb"
          :threshold="useVADThreshold"
          :label="t('settings.pages.modules.hearing.sections.section.monitoring.voice-probability')"
          :below-label="t('settings.pages.modules.hearing.sections.section.monitoring.silence-label')"
          :above-label="t('settings.pages.modules.hearing.sections.section.monitoring.speech-label')"
          :threshold-label="t('settings.pages.modules.hearing.sections.section.monitoring.threshold-label')"
        />

        <div v-if="useVADModel && loadedVAD" class="space-y-3">
          <FieldRange
            v-model="useVADThreshold"
            :label="t('settings.pages.modules.hearing.sections.section.monitoring.sensitivity.label')"
            :description="t('settings.pages.modules.hearing.sections.section.monitoring.sensitivity.description')"
            :min="0.1"
            :max="0.9"
            :step="0.05"
            :format-value="formatVADThreshold"
          />

          <FieldRange
            v-model="useVADMinSilenceDurationMs"
            :label="t('settings.pages.modules.hearing.sections.section.monitoring.silence-duration.label')"
            :description="t('settings.pages.modules.hearing.sections.section.monitoring.silence-duration.description')"
            :min="200"
            :max="1500"
            :step="50"
            :format-value="value => `${value} ms`"
          />
        </div>

        <div v-else class="space-y-3">
          <FieldRange
            v-model="useVADThreshold"
            :label="t('settings.pages.modules.hearing.sections.section.monitoring.sensitivity.label')"
            :description="t('settings.pages.modules.hearing.sections.section.monitoring.sensitivity.description')"
            :min="1"
            :max="80"
            :step="1"
            :format-value="value => `${value}%`"
          />
        </div>

        <div class="flex items-center gap-3">
          <div
            class="h-4 w-4 rounded-full transition-all duration-200"
            :class="speakingIndicatorClass"
          />
          <span class="text-sm font-medium">
            {{ isSpeech ? t('settings.pages.modules.hearing.sections.section.monitoring.speaking') : t('settings.pages.modules.hearing.sections.section.monitoring.silent') }}
          </span>
          <span class="ml-auto text-xs text-neutral-500">
            {{ useVADModel && loadedVAD ? t('settings.pages.modules.hearing.sections.section.monitoring.mode.model') : t('settings.pages.modules.hearing.sections.section.monitoring.mode.volume') }}
          </span>
        </div>

        <div class="border-t border-neutral-200 pt-3 dark:border-neutral-700">
          <FieldCheckbox
            v-model="useVADModel"
            :label="t('settings.pages.modules.hearing.sections.section.monitoring.mode.model')"
            :description="t('settings.pages.modules.hearing.sections.section.monitoring.mode.model-description')"
          />

          <div v-if="useVADModel" class="mt-3 space-y-2">
            <div v-if="loadingVAD" class="flex items-center gap-2 text-primary-600 dark:text-primary-400">
              <div class="i-solar:spinner-line-duotone animate-spin text-sm" />
              <span class="text-sm">{{ t('settings.pages.modules.hearing.sections.section.monitoring.model.loading') }}</span>
            </div>

            <ErrorContainer
              v-else-if="vadModelError"
              :title="t('settings.pages.modules.hearing.sections.section.monitoring.model.error-title')"
              :error="vadModelError"
            />

            <div v-else-if="loadedVAD" class="flex items-center gap-2 text-primary-600 dark:text-primary-400">
              <div class="i-solar:check-circle-bold-duotone text-sm" />
              <span class="text-sm">{{ t('settings.pages.modules.hearing.sections.section.monitoring.model.loaded') }}</span>
              <span class="ml-auto text-xs text-neutral-500">
                {{ (isSpeechProb * 100).toFixed(1) }}%
              </span>
            </div>
          </div>
        </div>

        <TimeSeriesChart
          v-if="useVADModel && loadedVAD"
          :history="isSpeechHistory"
          :current-value="isSpeechProb"
          :threshold="useVADThreshold"
          :is-active="isSpeech"
          :title="t('settings.pages.modules.hearing.sections.section.monitoring.vad.title')"
          :subtitle="t('settings.pages.modules.hearing.sections.section.monitoring.vad.subtitle')"
          :active-label="t('settings.pages.modules.hearing.sections.section.monitoring.vad.active-label')"
          :active-legend-label="t('settings.pages.modules.hearing.sections.section.monitoring.vad.active-legend-label')"
          :inactive-legend-label="t('settings.pages.modules.hearing.sections.section.monitoring.vad.inactive-legend-label')"
          :threshold-label="t('settings.pages.modules.hearing.sections.section.monitoring.vad.threshold-label')"
          :format-threshold="formatVADThreshold"
        />
      </div>
    </section>

    <section class="rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white/50 dark:bg-white/[0.03] backdrop-blur-2xl p-5 transition-all duration-300 hover:shadow-sm hover:shadow-black/[0.02] dark:hover:shadow-black/[0.08]">
      <h3 class="mb-1.5 text-[15px] font-medium text-neutral-800 dark:text-neutral-100">
        {{ t('settings.pages.modules.hearing.sections.section.stt-test.title') }}
      </h3>
      <p class="mb-4 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
        {{ t('settings.pages.modules.hearing.sections.section.stt-test.description') }}
      </p>

      <div v-if="!activeTranscriptionProvider" class="border border-amber-200 rounded-lg bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
        <div class="flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <div class="i-solar:warning-circle-line-duotone text-lg" />
          <span class="text-sm font-medium">{{ t('settings.pages.modules.hearing.sections.section.stt-test.select-provider-first') }}</span>
        </div>
      </div>

      <div v-else-if="!selectedAudioInput" class="border border-amber-200 rounded-lg bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
        <div class="flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <div class="i-solar:warning-circle-line-duotone text-lg" />
          <span class="text-sm font-medium">{{ t('settings.pages.modules.hearing.sections.section.stt-test.select-device-first') }}</span>
        </div>
      </div>

      <div v-else class="flex flex-col gap-4">
        <div class="flex items-center gap-2">
          <Button
            :disabled="isTranscribing && !isTestingSTT"
            class="flex-1"
            @click="isTestingSTT ? stopSTTTest() : startSTTTest()"
          >
            <div v-if="isTranscribing" class="mr-2 animate-spin">
              <div class="i-solar:spinner-line-duotone text-lg" />
            </div>
            <div v-else-if="isTestingSTT" class="mr-2">
              <div class="i-solar:stop-circle-line-duotone text-lg" />
            </div>
            <div v-else class="mr-2">
              <div class="i-solar:microphone-line-duotone text-lg" />
            </div>
            {{ isTestingSTT ? t('settings.pages.modules.hearing.sections.section.stt-test.stop') : isTranscribing ? t('settings.pages.modules.hearing.sections.section.stt-test.transcribing') : t('settings.pages.modules.hearing.sections.section.stt-test.start') }}
          </Button>
        </div>

        <ErrorContainer v-if="testTranscriptionError" :title="t('settings.pages.modules.hearing.sections.section.stt-test.error-title')" :error="testTranscriptionError" />

        <div v-if="testStatusMessage" class="border border-primary-200 rounded-lg bg-primary-50 p-3 dark:border-primary-800 dark:bg-primary-900/20">
          <div class="flex items-center gap-2 text-primary-700 dark:text-primary-400">
            <div v-if="isTranscribing" class="i-solar:spinner-line-duotone animate-spin text-sm" />
            <div v-else class="i-solar:info-circle-line-duotone text-sm" />
            <span class="text-sm font-medium">{{ testStatusMessage }}</span>
          </div>
        </div>

        <div v-if="shouldUseStreamInput" class="border border-primary-200 rounded-lg bg-primary-50 p-3 dark:border-primary-800 dark:bg-primary-900/20">
          <div class="flex items-center gap-2 text-primary-700 dark:text-primary-400">
            <div class="i-solar:info-circle-line-duotone text-sm" />
            <span class="text-xs">{{ t('settings.pages.modules.hearing.sections.section.stt-test.streaming-mode-hint') }}</span>
          </div>
        </div>

        <div class="space-y-3">
          <div>
            <label class="mb-1 block text-sm text-neutral-700 font-medium dark:text-neutral-300">
              {{ t('settings.pages.modules.hearing.sections.section.stt-test.result.title') }}
            </label>
            <div
              v-if="testTranscriptionText || testStreamingText"
              class="min-h-[100px] border border-neutral-200 rounded-lg bg-white p-3 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            >
              <div v-if="testStreamingText && shouldUseStreamInput" class="text-neutral-600 dark:text-neutral-400">
                <div class="mb-2 font-medium">
                  {{ t('settings.pages.modules.hearing.sections.section.stt-test.result.streaming') }}
                </div>
                <div class="whitespace-pre-wrap">
                  {{ testStreamingText }}
                </div>
              </div>
              <div v-if="testTranscriptionText" class="text-neutral-700 dark:text-neutral-200">
                <div v-if="testStreamingText && shouldUseStreamInput" class="mb-2 mt-3 border-t border-neutral-200 pt-2 font-medium dark:border-neutral-700">
                  {{ t('settings.pages.modules.hearing.sections.section.stt-test.result.final') }}
                </div>
                <div class="whitespace-pre-wrap">
                  {{ testTranscriptionText }}
                </div>
              </div>
            </div>
            <div
              v-else
              class="min-h-[100px] border border-neutral-300 rounded-lg border-dashed bg-neutral-50 p-3 text-sm text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900/50 dark:text-neutral-500"
            >
              {{ t('settings.pages.modules.hearing.sections.section.stt-test.result.placeholder') }}
            </div>
          </div>

          <div v-if="activeTranscriptionProvider" class="text-xs text-neutral-500 dark:text-neutral-400">
            <div>{{ t('settings.pages.modules.hearing.sections.section.stt-test.provider') }}: <span class="font-medium">{{ allAudioTranscriptionProvidersMetadata.find(p => p.id === activeTranscriptionProvider)?.localizedName || activeTranscriptionProvider }}</span></div>
            <div v-if="activeTranscriptionModel">
              {{ t('settings.pages.modules.hearing.sections.section.stt-test.model') }}: <span class="font-medium">{{ activeTranscriptionModel }}</span>
            </div>
            <div>{{ t('settings.pages.modules.hearing.sections.section.stt-test.mode') }}: <span class="font-medium">{{ shouldUseStreamInput ? t('settings.pages.modules.hearing.sections.section.stt-test.mode.streaming') : t('settings.pages.modules.hearing.sections.section.stt-test.mode.recording') }}</span></div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>


<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.hearing.title
  subtitleKey: settings.title
  icon: i-solar:microphone-3-bold
  stageTransition:
    name: slide
</route>
