<script setup lang="ts">
import type { DataSettingsStatusEmits } from '../status'

import { useDataMaintenance } from '@kitsune/stage-ui/composables/use-data-maintenance'
import { Button, DoubleCheckButton } from '@kitsune/ui'
import { shallowRef, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { createDataSettingsStatusHelpers } from '../status'

const emit = defineEmits<DataSettingsStatusEmits>()
const { t } = useI18n()
const importFileInput = useTemplateRef<HTMLInputElement>('importFileInput')
const importError = shallowRef('')
const {
  deleteAllChatSessions,
  exportChatSessions,
  importChatSessions,
} = useDataMaintenance()
const { emitStatus, handleActionError } = createDataSettingsStatusHelpers(emit)

function triggerImportPicker() {
  importFileInput.value?.click()
}

async function triggerExport() {
  try {
    const blob = await exportChatSessions()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `kitsune-chat-sessions-${new Date().toISOString()}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    emitStatus(t('settings.pages.data.status.exported'))
  }
  catch (error) {
    handleActionError(error)
  }
}

function deleteChats() {
  try {
    deleteAllChatSessions()
    emitStatus(t('settings.pages.data.status.chats_deleted'))
  }
  catch (error) {
    handleActionError(error)
  }
}

async function handleImport(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file)
    return

  try {
    const raw = await file.text()
    const parsed = JSON.parse(raw) as Record<string, unknown>
    await importChatSessions(parsed)
    importError.value = ''
    emitStatus(t('settings.pages.data.status.imported'))
  }
  catch (error) {
    importError.value = t('settings.pages.data.status.import_error')
    handleActionError(error)
  }
  finally {
    target.value = ''
  }
}
</script>

<template>
  <section class="grid grid-cols-[1fr_auto] gap-5 items-start p-5 rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white/50 dark:bg-white/[0.03] backdrop-blur-2xl transition-all duration-300 hover:shadow-sm hover:shadow-black/[0.02] dark:hover:shadow-black/[0.08] max-sm:grid-cols-1">
    <div class="flex flex-col gap-1.5 min-w-0">
      <h3 class="m-0 text-[15px] font-medium text-neutral-800 dark:text-neutral-100">{{ t('settings.pages.data.sections.chats.title') }}</h3>
      <p class="m-0 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">{{ t('settings.pages.data.sections.chats.description') }}</p>
    </div>
    <div class="flex flex-col items-end gap-2.5 max-sm:items-start">
      <div class="flex flex-wrap gap-2">
        <Button variant="secondary" @click="triggerExport">
          {{ t('settings.pages.data.sections.chats.export') }}
        </Button>
        <Button variant="primary" @click="triggerImportPicker">
          {{ t('settings.pages.data.sections.chats.import') }}
        </Button>
      </div>
      <DoubleCheckButton variant="danger" @confirm="deleteChats">
        {{ t('settings.pages.data.sections.chats.delete') }}
        <template #confirm>
          {{ t('settings.pages.data.confirmations.yes') }}
        </template>
        <template #cancel>
          {{ t('settings.pages.card.cancel') }}
        </template>
      </DoubleCheckButton>
    </div>
    <input ref="importFileInput" type="file" accept="application/json" class="hidden" @change="handleImport">
    <p v-if="importError" class="col-[1/-1] mt-2 text-[13px] text-red-500">
      {{ importError }}
    </p>
  </section>
</template>

