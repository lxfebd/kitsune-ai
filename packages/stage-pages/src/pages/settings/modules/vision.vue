<script setup lang="ts">
import { Alert, ErrorContainer, RadioCardSimple } from '@kitsune/stage-ui/components'
import { ProviderModelSelectionDialog } from '@kitsune/stage-ui/components/scenarios/providers'
import { useAnalytics } from '@kitsune/stage-ui/composables'
import { usePersonaStore } from '@kitsune/stage-ui/stores/modules/persona'
import { useVisionProcessingStore, useVisionStore } from '@kitsune/stage-ui/stores/modules/vision'
import { useProvidersStore } from '@kitsune/stage-ui/stores/providers'
import { FieldCheckbox, FieldRange } from '@kitsune/ui'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

const providersStore = useProvidersStore()
const personaStore = usePersonaStore()
const visionStore = useVisionStore()
const visionProcessingStore = useVisionProcessingStore()
const { persistedVisionProvidersMetadata, configuredProviders } = storeToRefs(providersStore)
const {
  activeProvider,
  activeModel,
  customModelName,
  ollamaThinkingEnabled,
  modelSearchQuery,
  supportsModelListing,
  providerModels,
  isLoadingActiveProviderModels,
  activeProviderModelError,
} = storeToRefs(visionStore)
const {
  captureIntervalMs,
  captureCount,
  contextUpdateCount,
  lastCaptureAt,
  lastContextUpdateAt,
  isRunning,
} = storeToRefs(visionProcessingStore)

const { t } = useI18n()
const { trackProviderClick } = useAnalytics()

const showModelDialog = ref(false)

watch(activeProvider, async (provider, oldProvider) => {
  if (!provider)
    return

  if (oldProvider !== undefined && oldProvider !== provider) {
    visionStore.resetModelSelection()
  }

  await visionStore.loadModelsForProvider(provider)
}, { immediate: true })

watch([activeProvider, activeModel], ([provider, model]) => {
  personaStore.updateActiveCardVision({ provider, model })
})

function updateCustomModelName(value: string) {
  customModelName.value = value
}

function handleDeleteProvider(providerId: string) {
  if (activeProvider.value === providerId) {
    activeProvider.value = ''
    activeModel.value = ''
  }
  providersStore.deleteProvider(providerId)
}

const formattedLastCapture = computed(() => formatRelativeTime(lastCaptureAt.value))
const formattedLastContextUpdate = computed(() => formatRelativeTime(lastContextUpdateAt.value))
const isOllamaVisionProvider = computed(() => activeProvider.value === 'vision-ollama')

function canDeleteProvider(_providerId: string) {
  return true
}

function formatRelativeTime(timestamp: number | null) {
  if (!timestamp)
    return t('settings.pages.modules.vision.capture_cadence.never')

  const diffMs = Date.now() - timestamp
  const diffSeconds = Math.max(0, Math.floor(diffMs / 1000))
  if (diffSeconds < 60)
    return t('settings.pages.modules.vision.capture_cadence.seconds_ago', { count: diffSeconds })
  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60)
    return t('settings.pages.modules.vision.capture_cadence.minutes_ago', { count: diffMinutes })
  const diffHours = Math.floor(diffMinutes / 60)
  return t('settings.pages.modules.vision.capture_cadence.hours_ago', { count: diffHours })
}
</script>

<template>
  <div :class="['flex', 'flex-col', 'gap-6']">
    <div :class="['rounded-2xl', 'bg-white/50', 'dark:bg-white/[0.03]', 'backdrop-blur-2xl', 'p-4', 'border', 'border-black/[0.06]', 'dark:border-white/[0.06]', 'transition-all', 'duration-300', 'hover:shadow-sm']">
      <div :class="['flex', 'flex-col', 'gap-4']">
        <div>
          <h2 :class="['text-lg', 'text-neutral-500', 'md:text-2xl', 'dark:text-neutral-500']">
            {{ t('settings.pages.providers.title') }}
          </h2>
          <div :class="['text-neutral-400', 'dark:text-neutral-400']">
            <span>{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.description') }}</span>
          </div>
        </div>
        <div :class="['max-w-full']">
          <fieldset
            v-if="persistedVisionProvidersMetadata.length > 0"
            :class="['flex', 'min-w-0', 'flex-row', 'gap-4', 'overflow-x-auto', 'scroll-smooth']"
            role="radiogroup"
          >
            <RadioCardSimple
              v-for="metadata in persistedVisionProvidersMetadata"
              :id="metadata.id"
              :key="metadata.id"
              v-model="activeProvider"
              name="provider"
              :value="metadata.id"
              :title="metadata.localizedName || 'Unknown'"
              :description="metadata.localizedDescription"
              @click="trackProviderClick(metadata.id, 'vision')"
            >
              <template v-if="canDeleteProvider(metadata.id)" #topRight>
                <button
                  type="button"
                  :class="[
                    'rounded',
                    'bg-neutral-100',
                    'p-1',
                    'text-neutral-600',
                    'transition-colors',
                    'hover:bg-neutral-200',
                    'dark:bg-neutral-800/60',
                    'dark:text-neutral-300',
                    'dark:hover:bg-neutral-700/60',
                  ]"
                  @click.stop.prevent="handleDeleteProvider(metadata.id)"
                >
                  <div :class="['text-base', 'i-solar:trash-bin-trash-bold-duotone']" />
                </button>
              </template>

              <template v-if="configuredProviders[metadata.id] === false" #bottomRight>
                <div
                  :class="[
                    'rounded',
                    'bg-amber-100',
                    'px-2',
                    'py-0.5',
                    'text-xs',
                    'font-medium',
                    'text-amber-700',
                    'dark:bg-amber-900/30',
                    'dark:text-amber-300',
                  ]"
                >
                  {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.health_check_failed') }}
                </div>
              </template>
            </RadioCardSimple>
            <RouterLink
              to="/settings/providers#vision"
              :class="[
                'relative',
                'min-w-50',
                'w-fit',
                'rounded-xl',
                'border-2',
                'border-neutral-100',
                'bg-white',
                'p-4',
                'transition',
                'duration-200',
                'ease-in-out',
                'hover:border-primary-500/30',
                'dark:border-neutral-900',
                'dark:bg-neutral-900/20',
                'dark:hover:border-primary-400/30',
                'flex',
                'items-center',
                'justify-center',
              ]"
            >
              <div :class="['text-2xl', 'text-neutral-500', 'dark:text-neutral-500', 'i-solar:add-circle-line-duotone']" />
              <div
                :class="['absolute', 'inset-0', 'z--1', 'bg-dotted-neutral-200/80', 'dark:bg-dotted-neutral-700/50']"
                :style="{ 'background-size': '10px 10px', 'mask-image': 'linear-gradient(165deg, white 30%, transparent 50%)' }"
              />
            </RouterLink>
          </fieldset>
          <div v-else>
            <RouterLink
              to="/settings/providers#vision"
              :class="[
                'flex',
                'items-center',
                'gap-3',
                'rounded-lg',
                'border-2',
                'border-dashed',
                'border-neutral-200',
                'bg-neutral-50',
                'p-4',
                'transition',
                'duration-200',
                'ease-in-out',
                'dark:border-neutral-800',
                'dark:bg-neutral-800',
              ]"
            >
              <div :class="['text-2xl', 'text-amber-500', 'dark:text-amber-400', 'i-solar:warning-circle-line-duotone']" />
              <div :class="['flex', 'flex-col']">
                <span :class="['font-medium']">
                  {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_providers_configured_title') }}
                </span>
                <span :class="['text-sm', 'text-neutral-400', 'dark:text-neutral-500']">
                  {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_providers_configured_description') }}
                </span>
              </div>
              <div :class="['ml-auto', 'text-xl', 'text-neutral-400', 'dark:text-neutral-500', 'i-solar:arrow-right-line-duotone']" />
            </RouterLink>
          </div>
        </div>
      </div>
    </div>

    <div v-if="activeProvider && supportsModelListing" :class="['rounded-2xl', 'bg-white/50', 'dark:bg-white/[0.03]', 'backdrop-blur-2xl', 'p-4', 'border', 'border-black/[0.06]', 'dark:border-white/[0.06]', 'transition-all', 'duration-300', 'hover:shadow-sm']">
      <div :class="['flex', 'flex-col', 'gap-4']">
        <div>
          <h2 :class="['text-lg', 'md:text-2xl']">
            {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.title') }}
          </h2>
          <div :class="['text-neutral-400', 'dark:text-neutral-400']">
            <span>{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.subtitle') }}</span>
          </div>
        </div>

        <div v-if="isLoadingActiveProviderModels" :class="['flex', 'items-center', 'justify-center', 'py-4']">
          <div :class="['mr-2', 'animate-spin']">
            <div :class="['text-xl', 'i-solar:spinner-line-duotone']" />
          </div>
          <span>{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.loading') }}</span>
        </div>

        <ErrorContainer
          v-else-if="activeProviderModelError"
          :title="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.error')"
          :error="activeProviderModelError"
        />

        <Alert
          v-else-if="providerModels.length === 0 && !isLoadingActiveProviderModels"
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
          v-else-if="providerModels.length > 0"
          type="button"
          :class="['flex', 'w-full', 'items-center', 'justify-between', 'rounded-xl', 'border', 'border-black/[0.06]', 'dark:border-white/[0.06]', 'bg-white/60', 'dark:bg-white/[0.04]', 'px-4', 'py-3', 'text-left', 'transition-all', 'duration-300', 'hover:border-primary-400', 'dark:hover:border-primary-400', 'hover:shadow-sm']"
          @click="showModelDialog = true"
        >
          <span :class="['font-medium']">{{ activeModel || t('settings.pages.modules.consciousness.sections.section.provider-model-selection.subtitle') }}</span>
          <div :class="['text-neutral-400', 'dark:text-neutral-500', 'i-solar:alt-arrow-right-bold-duotone']" />
        </button>
        <ProviderModelSelectionDialog
          v-if="providerModels.length > 0"
          v-model:open="showModelDialog"
          v-model:model-value="activeModel"
          v-model:search-query="modelSearchQuery"
          :title="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.title')"
          :subtitle="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.subtitle')"
          :current-model="activeModel"
          :current-model-label="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.current_model_label')"
          :items="providerModels"
          :loading="isLoadingActiveProviderModels"
          :supports-model-listing="supportsModelListing"
          :allow-custom="true"
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
    </div>

    <div v-else-if="activeProvider && !supportsModelListing" :class="['rounded-2xl', 'bg-white/50', 'dark:bg-white/[0.03]', 'backdrop-blur-2xl', 'p-4', 'border', 'border-black/[0.06]', 'dark:border-white/[0.06]', 'transition-all', 'duration-300', 'hover:shadow-sm']">
      <div :class="['flex', 'flex-col', 'gap-4']">
        <div>
          <h2 :class="['text-lg', 'text-neutral-500', 'md:text-2xl', 'dark:text-neutral-400']">
            {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.title') }}
          </h2>
          <div :class="['text-neutral-400', 'dark:text-neutral-500']">
            <span>{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.subtitle') }}</span>
          </div>
        </div>

        <div
          :class="[
            'flex',
            'items-center',
            'gap-3',
            'rounded-lg',
            'border',
            'border-primary-200',
            'bg-primary-50',
            'p-4',
            'dark:border-primary-800',
            'dark:bg-primary-900/20',
          ]"
        >
          <div :class="['text-2xl', 'text-primary-500', 'dark:text-primary-400', 'i-solar:info-circle-line-duotone']" />
          <div :class="['flex', 'flex-col']">
            <span :class="['font-medium']">
              {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.not_supported') }}
            </span>
            <span :class="['text-sm', 'text-primary-600', 'dark:text-primary-400']">
              {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.not_supported_description') }}
            </span>
          </div>
        </div>

        <div :class="['mt-2']">
          <label :class="['mb-1', 'block', 'text-sm', 'font-medium']">
            {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.manual_model_name') }}
          </label>
          <input
            v-model="activeModel"
            type="text"
            :class="[
              'w-full',
              'rounded',
              'border',
              'border-neutral-300',
              'bg-white',
              'px-3',
              'py-2',
              'dark:border-neutral-700',
              'dark:bg-neutral-900',
            ]"
            :placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.manual_model_placeholder')"
          >
        </div>
      </div>
    </div>

    <div :class="['rounded-2xl', 'bg-white/50', 'dark:bg-white/[0.03]', 'backdrop-blur-2xl', 'p-4', 'border', 'border-black/[0.06]', 'dark:border-white/[0.06]', 'transition-all', 'duration-300', 'hover:shadow-sm']">
      <div :class="['flex', 'flex-col', 'gap-4']">
        <div>
          <h2 :class="['text-lg', 'text-neutral-500', 'md:text-2xl', 'dark:text-neutral-400']">
            {{ t('settings.pages.modules.vision.capture_cadence.title') }}
          </h2>
          <div :class="['text-neutral-400', 'dark:text-neutral-400']">
            {{ t('settings.pages.modules.vision.capture_cadence.description') }}
          </div>
        </div>

        <FieldRange
          v-model="captureIntervalMs"
          :label="t('settings.pages.modules.vision.capture_cadence.capture_interval.label')"
          :description="t('settings.pages.modules.vision.capture_cadence.capture_interval.description')"
          :min="500"
          :max="15000"
          :step="250"
          :format-value="value => `${(value / 1000).toFixed(2)}s`"
        />

        <div :class="['grid', 'gap-4', 'md:grid-cols-3']">
          <div :class="['rounded-lg', 'border', 'border-neutral-200', 'bg-white', 'p-3', 'dark:border-neutral-800', 'dark:bg-neutral-900']">
            <div :class="['text-xs', 'uppercase', 'tracking-wide', 'text-neutral-400']">
              {{ t('settings.pages.modules.vision.capture_cadence.ticker.label') }}
            </div>
            <div :class="['text-sm', 'font-medium', 'text-neutral-600', 'dark:text-neutral-200']">
              {{ isRunning ? t('settings.pages.modules.vision.capture_cadence.ticker.active') : t('settings.pages.modules.vision.capture_cadence.ticker.idle') }}
            </div>
            <div :class="['text-xs', 'text-neutral-400']">
              {{ t('settings.pages.modules.vision.capture_cadence.ticker.last_capture', { time: formattedLastCapture }) }}
            </div>
          </div>

          <div :class="['rounded-lg', 'border', 'border-neutral-200', 'bg-white', 'p-3', 'dark:border-neutral-800', 'dark:bg-neutral-900']">
            <div :class="['text-xs', 'uppercase', 'tracking-wide', 'text-neutral-400']">
              {{ t('settings.pages.modules.vision.capture_cadence.captures.label') }}
            </div>
            <div :class="['text-sm', 'font-medium', 'text-neutral-600', 'dark:text-neutral-200']">
              {{ captureCount }}
            </div>
            <div :class="['text-xs', 'text-neutral-400']">
              {{ t('settings.pages.modules.vision.capture_cadence.captures.last_update', { time: formattedLastCapture }) }}
            </div>
          </div>

          <div :class="['rounded-lg', 'border', 'border-neutral-200', 'bg-white', 'p-3', 'dark:border-neutral-800', 'dark:bg-neutral-900']">
            <div :class="['text-xs', 'uppercase', 'tracking-wide', 'text-neutral-400']">
              {{ t('settings.pages.modules.vision.capture_cadence.context_updates.label') }}
            </div>
            <div :class="['text-sm', 'font-medium', 'text-neutral-600', 'dark:text-neutral-200']">
              {{ contextUpdateCount }}
            </div>
            <div :class="['text-xs', 'text-neutral-400']">
              {{ t('settings.pages.modules.vision.capture_cadence.context_updates.last_update', { time: formattedLastContextUpdate }) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="isOllamaVisionProvider"
      :class="['rounded-2xl', 'bg-white/50', 'dark:bg-white/[0.03]', 'backdrop-blur-2xl', 'p-4', 'border', 'border-black/[0.06]', 'dark:border-white/[0.06]', 'transition-all', 'duration-300', 'hover:shadow-sm']"
    >
      <div :class="['flex', 'flex-col', 'gap-4']">
        <div>
          <h2 :class="['text-lg', 'text-neutral-500', 'md:text-2xl', 'dark:text-neutral-400']">
            {{ t('settings.pages.modules.vision.provider_toggles.title') }}
          </h2>
          <div :class="['text-neutral-400', 'dark:text-neutral-400']">
            {{ t('settings.pages.modules.vision.provider_toggles.description') }}
          </div>
        </div>

        <FieldCheckbox
          v-model="ollamaThinkingEnabled"
          :label="t('settings.pages.modules.vision.provider_toggles.thinking_ollama.label')"
          :description="t('settings.pages.modules.vision.provider_toggles.thinking_ollama.description')"
        />
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.vision.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
