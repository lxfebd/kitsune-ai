<script setup lang="ts">
import type { DataSettingsStatusEmits } from '../status'

import { useDataMaintenance } from '@kitsune/stage-ui/composables/use-data-maintenance'
import { DoubleCheckButton } from '@kitsune/ui'
import { useI18n } from 'vue-i18n'

import { createDataSettingsStatusHelpers } from '../status'

const emit = defineEmits<DataSettingsStatusEmits>()
const { t } = useI18n()
const { deleteAllData, resetProvidersSettings } = useDataMaintenance()
const { emitStatus, handleActionError } = createDataSettingsStatusHelpers(emit)

async function resetProviders() {
  try {
    await resetProvidersSettings()
    emitStatus(t('settings.pages.data.status.providers_reset'))
  }
  catch (error) {
    handleActionError(error)
  }
}

async function deleteAll() {
  try {
    await deleteAllData()
    emitStatus(t('settings.pages.data.status.all_deleted'))
  }
  catch (error) {
    handleActionError(error)
  }
}
</script>

<template>
  <section class="p-5 rounded-2xl border border-red-500/20 dark:border-red-500/10 bg-red-50/60 dark:bg-red-500/[0.04] backdrop-blur-2xl transition-all duration-300 hover:shadow-sm hover:shadow-red-500/[0.04]">
    <div class="flex flex-col gap-5">
      <div class="flex flex-col gap-1.5">
        <h3 class="m-0 text-[15px] font-medium text-neutral-800 dark:text-neutral-100">{{ t('settings.pages.data.sections.danger.title') }}</h3>
        <p class="m-0 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">{{ t('settings.pages.data.sections.danger.description') }}</p>
      </div>

      <div class="grid grid-cols-[1fr_auto] gap-5 items-start max-sm:grid-cols-1">
        <div class="flex flex-col gap-1.5 min-w-0">
          <h4 class="m-0 text-[14px] font-medium text-neutral-800 dark:text-neutral-100">{{ t('settings.pages.data.sections.providers.title') }}</h4>
          <p class="m-0 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">{{ t('settings.pages.data.sections.providers.description') }}</p>
        </div>
        <div class="flex flex-col items-end max-sm:items-start">
          <DoubleCheckButton variant="danger" @confirm="resetProviders">
            {{ t('settings.pages.data.sections.providers.reset') }}
            <template #confirm>
              {{ t('settings.pages.data.confirmations.yes') }}
            </template>
            <template #cancel>
              {{ t('settings.pages.card.cancel') }}
            </template>
          </DoubleCheckButton>
        </div>
      </div>

      <div class="grid grid-cols-[1fr_auto] gap-5 items-start max-sm:grid-cols-1">
        <div class="flex flex-col gap-1.5 min-w-0">
          <h4 class="m-0 text-[14px] font-medium text-neutral-800 dark:text-neutral-100">{{ t('settings.pages.data.sections.all.title') }}</h4>
          <p class="m-0 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">{{ t('settings.pages.data.sections.all.description') }}</p>
        </div>
        <div class="flex flex-col items-end max-sm:items-start">
          <DoubleCheckButton variant="danger" @confirm="deleteAll">
            {{ t('settings.pages.data.sections.all.delete') }}
            <template #confirm>
              {{ t('settings.pages.data.confirmations.yes') }}
            </template>
            <template #cancel>
              {{ t('settings.pages.card.cancel') }}
            </template>
          </DoubleCheckButton>
        </div>
      </div>
    </div>
  </section>
</template>

