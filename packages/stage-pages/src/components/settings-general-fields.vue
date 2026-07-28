<script setup lang="ts">
import { all } from '@kitsune/i18n'
import { useAnalytics } from '@kitsune/stage-ui/composables/use-analytics'
import { isPosthogAvailableInBuild } from '@kitsune/stage-ui/stores/analytics'
import { useSettings } from '@kitsune/stage-ui/stores/settings'
import {
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  SIDEBAR_WIDTH_STEP,
} from '@kitsune/stage-ui/stores/settings'
import { FieldCheckbox, FieldCombobox, FieldRange, useTheme } from '@kitsune/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(defineProps<{
  needsControlsIslandIconSizeSetting?: boolean
}>(), {
  needsControlsIslandIconSizeSetting: import.meta.env.RUNTIME_ENVIRONMENT === 'electron',
})

const settings = useSettings()

const showControlsIsland = computed(() => props.needsControlsIslandIconSizeSetting)
const showAnalyticsSettings = computed(() => isPosthogAvailableInBuild())
const analyticsToggleValue = computed({
  get: () => showAnalyticsSettings.value ? settings.analyticsEnabled : false,
  set: (value: boolean) => settings.analyticsEnabled = value,
})

const { t } = useI18n()
const { isDark: dark } = useTheme()
const { privacyPolicyUrl } = useAnalytics()

const languages = computed(() => {
  return Object.entries(all).map(([value, label]) => ({ value, label }))
})

const contentMaxWidthOptions = computed(() => [
  { value: 'compact', label: t('settings.appearance.content-max-width.compact') },
  { value: 'normal', label: t('settings.appearance.content-max-width.normal') },
  { value: 'wide', label: t('settings.appearance.content-max-width.wide') },
])

const cardRadiusOptions = computed(() => [
  { value: 'sharp', label: t('settings.appearance.card-radius.sharp') },
  { value: 'normal', label: t('settings.appearance.card-radius.normal') },
  { value: 'round', label: t('settings.appearance.card-radius.round') },
])

const densityOptions = computed(() => [
  { value: 'compact', label: t('settings.appearance.density.compact') },
  { value: 'normal', label: t('settings.appearance.density.normal') },
  { value: 'comfortable', label: t('settings.appearance.density.comfortable') },
])

const motionOptions = computed(() => [
  { value: 'off', label: t('settings.appearance.motion-intensity.off') },
  { value: 'reduced', label: t('settings.appearance.motion-intensity.reduced') },
  { value: 'normal', label: t('settings.appearance.motion-intensity.normal') },
])
</script>

<template>
  <div class="flex flex-col gap-6">
    <section class="settings-panel">
      <FieldCheckbox
        v-model="dark"
        :label="t('settings.theme.title')"
        :description="t('settings.theme.description')"
      />

      <FieldCombobox
        v-model="settings.language"
        :label="t('settings.language.title')"
        :description="t('settings.language.description')"
        layout="horizontal"
        :options="languages"
      />

      <FieldCombobox
        v-if="showControlsIsland"
        v-model="settings.controlsIslandIconSize"
        :label="t('settings.controls-island.icon-size.title')"
        :description="t('settings.controls-island.icon-size.description')"
        :options="[
          { value: 'auto', label: t('settings.controls-island.icon-size.auto') },
          { value: 'large', label: t('settings.controls-island.icon-size.large') },
          { value: 'small', label: t('settings.controls-island.icon-size.small') },
        ]"
      />
    </section>

    <section class="settings-panel">
      <div class="text-sm font-medium text-neutral-800 dark:text-neutral-100">
        {{ t('settings.appearance.title') }}
      </div>
      <p class="text-xs text-neutral-500 dark:text-neutral-400">
        {{ t('settings.appearance.description') }}
      </p>

      <FieldRange
        v-model="settings.appearanceSidebarWidth"
        :label="t('settings.appearance.sidebar-width.title')"
        :description="t('settings.appearance.sidebar-width.description')"
        :min="SIDEBAR_WIDTH_MIN"
        :max="SIDEBAR_WIDTH_MAX"
        :step="SIDEBAR_WIDTH_STEP"
      />

      <FieldCombobox
        v-model="settings.appearanceContentMaxWidth"
        :label="t('settings.appearance.content-max-width.title')"
        :description="t('settings.appearance.content-max-width.description')"
        :options="contentMaxWidthOptions"
      />

      <FieldCombobox
        v-model="settings.appearanceCardRadius"
        :label="t('settings.appearance.card-radius.title')"
        :description="t('settings.appearance.card-radius.description')"
        :options="cardRadiusOptions"
      />

      <FieldCombobox
        v-model="settings.appearanceDensity"
        :label="t('settings.appearance.density.title')"
        :description="t('settings.appearance.density.description')"
        :options="densityOptions"
      />

      <FieldCombobox
        v-model="settings.appearanceMotionIntensity"
        :label="t('settings.appearance.motion-intensity.title')"
        :description="t('settings.appearance.motion-intensity.description')"
        :options="motionOptions"
      />
    </section>

    <section v-if="showAnalyticsSettings" class="settings-panel">
      <div class="text-sm font-medium text-neutral-800 dark:text-neutral-100">{{ t('settings.analytics.toggle.title') }}</div>

      <FieldCheckbox
        v-model="analyticsToggleValue"
        :label="t('settings.analytics.toggle.title')"
      >
        <template #description>
          <div class="flex flex-col gap-2 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            <p>{{ t('settings.analytics.notice.description') }}</p>
            <p>
              {{ t('settings.analytics.notice.privacyPrefix') }}
              <a
                :href="privacyPolicyUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="text-primary-500 underline dotted underline-offset-2 hover:text-primary-400"
              >
                {{ t('settings.analytics.notice.privacyLink') }}
              </a>.
            </p>
            <p>{{ t('settings.analytics.notice.settingsHint') }}</p>
          </div>
        </template>
      </FieldCheckbox>
    </section>

    <slot name="additional-fields" />
  </div>
</template>
