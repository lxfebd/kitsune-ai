<script setup lang="ts">
import type { DataSettingsStatusEmits } from '../status'

import { useDataMaintenance } from '@kitsune/stage-ui/composables/use-data-maintenance'
import { DoubleCheckButton } from '@kitsune/ui'
import { useI18n } from 'vue-i18n'

import { createDataSettingsStatusHelpers } from '../status'

const emit = defineEmits<DataSettingsStatusEmits>()
const { t } = useI18n()
const { deleteAllModels, resetModulesSettings } = useDataMaintenance()
const { emitStatus, handleActionError } = createDataSettingsStatusHelpers(emit)

async function deleteModels() {
  try {
    await deleteAllModels()
    emitStatus(t('settings.pages.data.status.models_deleted'))
  }
  catch (error) {
    handleActionError(error)
  }
}

function resetModules() {
  try {
    resetModulesSettings()
    emitStatus(t('settings.pages.data.status.modules_reset'))
  }
  catch (error) {
    handleActionError(error)
  }
}
</script>

<template>
  <section class="p-5 rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white/50 dark:bg-white/[0.03] backdrop-blur-2xl transition-all duration-300 hover:shadow-sm hover:shadow-black/[0.02] dark:hover:shadow-black/[0.08]">
    <div class="flex flex-col gap-5">
      <div class="grid grid-cols-[1fr_auto] gap-5 items-start max-sm:grid-cols-1">
        <div class="flex flex-col gap-1.5 min-w-0">
          <h4 class="m-0 text-[15px] font-medium text-neutral-800 dark:text-neutral-100">{{ t('settings.pages.data.sections.models.title') }}</h4>
          <p class="m-0 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">{{ t('settings.pages.data.sections.models.description') }}</p>
        </div>
        <div class="flex flex-col items-end max-sm:items-start">
          <DoubleCheckButton variant="danger" @confirm="deleteModels">
            {{ t('settings.pages.data.sections.models.delete') }}
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
          <h4 class="m-0 text-[15px] font-medium text-neutral-800 dark:text-neutral-100">{{ t('settings.pages.data.sections.modules.title') }}</h4>
          <p class="m-0 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">{{ t('settings.pages.data.sections.modules.description') }}</p>
        </div>
        <div class="flex flex-col items-end max-sm:items-start">
          <DoubleCheckButton variant="caution" @confirm="resetModules">
            {{ t('settings.pages.data.sections.modules.reset') }}
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

