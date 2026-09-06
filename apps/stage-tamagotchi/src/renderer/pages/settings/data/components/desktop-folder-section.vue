<script setup lang="ts">
import type { DataSettingsStatusEmits } from '@kitsune/stage-pages/pages/settings/data/status'

import { defineInvoke } from '@moeru/eventa'
import { createDataSettingsStatusHelpers } from '@kitsune/stage-pages/pages/settings/data/status'
import { getElectronEventaContext } from '@kitsune/electron-vueuse'
import { isElectronWindow } from '@kitsune/stage-shared'
import { Button } from '@kitsune/ui'
import { useI18n } from 'vue-i18n'

import { electronAppOpenUserDataFolder } from '../../../../../shared/eventa'

const emit = defineEmits<DataSettingsStatusEmits>()
const { t } = useI18n()
const { handleActionError } = createDataSettingsStatusHelpers(emit)

async function triggerOpenDesktopUserDataFolder() {
  if (typeof window === 'undefined' || !isElectronWindow(window))
    return

  try {
    const context = getElectronEventaContext()
    const openUserDataFolder = defineInvoke(context, electronAppOpenUserDataFolder)

    await openUserDataFolder()
  }
  catch (error) {
    handleActionError(error)
  }
}
</script>

<template>
  <div class="grid grid-cols-[1fr_auto] gap-5 items-start p-5 rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white/50 dark:bg-white/[0.03] backdrop-blur-2xl transition-all duration-300 hover:shadow-sm hover:shadow-black/[0.02] dark:hover:shadow-black/[0.08]">
    <div class="flex flex-col gap-1.5 min-w-0">
      <h3 class="m-0 text-[15px] font-medium text-neutral-900 dark:text-neutral-100">
        {{ t('settings.pages.data.sections.desktop-folder.title') }}
      </h3>
      <p class="m-0 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
        {{ t('settings.pages.data.sections.desktop-folder.description') }}
      </p>
    </div>
    <div class="flex flex-col items-end gap-2">
      <Button variant="secondary" @click="triggerOpenDesktopUserDataFolder">
        {{ t('settings.pages.data.sections.desktop-folder.open') }}
      </Button>
    </div>
  </div>
</template>
