<script setup lang="ts">
import type { DataSettingsStatusEmits } from '@kitsune/stage-pages/pages/settings/data/status'

import { createDataSettingsStatusHelpers } from '@kitsune/stage-pages/pages/settings/data/status'
import { useDataMaintenance } from '@kitsune/stage-ui/composables/use-data-maintenance'
import { DoubleCheckButton } from '@kitsune/ui'
import { useI18n } from 'vue-i18n'

const emit = defineEmits<DataSettingsStatusEmits>()
const { t } = useI18n()
const { resetDesktopApplicationState } = useDataMaintenance()
const { emitStatus, handleActionError } = createDataSettingsStatusHelpers(emit)

async function resetDesktopState() {
  try {
    await resetDesktopApplicationState()
    emitStatus(t('settings.pages.data.status.desktop_reset'))
  }
  catch (error) {
    handleActionError(error)
  }
}
</script>

<template>
  <div class="grid grid-cols-[1fr_auto] gap-5 items-start p-5 rounded-2xl border border-amber-500/20 bg-amber-50/60 dark:bg-amber-500/[0.04] backdrop-blur-2xl transition-all duration-300 hover:shadow-sm hover:shadow-amber-500/[0.04]">
    <div class="flex flex-col gap-1.5 min-w-0">
      <h3 class="m-0 text-[15px] font-medium text-neutral-900 dark:text-neutral-100">
        {{ t('settings.pages.data.sections.desktop.title') }}
      </h3>
      <p class="m-0 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
        {{ t('settings.pages.data.sections.desktop.description') }}
      </p>
    </div>
    <div class="flex flex-col items-end gap-2">
      <DoubleCheckButton variant="caution" @confirm="resetDesktopState">
        {{ t('settings.pages.data.sections.desktop.reset') }}
        <template #confirm>
          {{ t('settings.pages.data.confirmations.yes') }}
        </template>
        <template #cancel>
          {{ t('settings.pages.card.cancel') }}
        </template>
      </DoubleCheckButton>
    </div>
  </div>
</template>
