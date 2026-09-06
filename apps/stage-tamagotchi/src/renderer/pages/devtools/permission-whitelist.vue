<script setup lang="ts">
import type { PermissionWhitelistEntry } from '../../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@kitsune/electron-vueuse'
import { Button } from '@kitsune/ui'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  electronPermissionWhitelistClear,
  electronPermissionWhitelistList,
  electronPermissionWhitelistRemove,
} from '../../../shared/eventa'

const { t } = useI18n()

const listWhitelist = useElectronEventaInvoke(electronPermissionWhitelistList)
const removeWhitelist = useElectronEventaInvoke(electronPermissionWhitelistRemove)
const clearWhitelist = useElectronEventaInvoke(electronPermissionWhitelistClear)

const entries = ref<PermissionWhitelistEntry[]>([])
const lastError = ref('')
const busy = ref(false)

async function refresh() {
  busy.value = true
  lastError.value = ''
  try {
    entries.value = await listWhitelist()
  }
  catch (error) {
    lastError.value = errorMessageFrom(error) ?? 'Failed to list whitelist'
  }
  finally {
    busy.value = false
  }
}

async function removeEntry(key: string) {
  lastError.value = ''
  try {
    await removeWhitelist({ key })
    await refresh()
  }
  catch (error) {
    lastError.value = errorMessageFrom(error) ?? 'Failed to remove entry'
  }
}

async function clearAll() {
  lastError.value = ''
  try {
    await clearWhitelist()
    await refresh()
  }
  catch (error) {
    lastError.value = errorMessageFrom(error) ?? 'Failed to clear whitelist'
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString()
}

onMounted(refresh)
</script>

<template>
  <div :class="['flex', 'flex-col', 'gap-4', 'pb-8']">
    <div :class="['flex', 'flex-wrap', 'items-center', 'gap-2']">
      <Button
        variant="secondary"
        icon="i-solar:refresh-outline"
        :loading="busy"
        :label="t('tamagotchi.settings.devtools.pages.permission-whitelist.refresh')"
        @click="refresh()"
      />
      <Button
        variant="secondary"
        icon="i-solar:trash-bin-trash-outline"
        :disabled="entries.length === 0"
        :label="t('tamagotchi.settings.devtools.pages.permission-whitelist.clear-all')"
        @click="clearAll()"
      />
      <div :class="['ml-auto', 'text-xs', 'text-neutral-400']">
        {{ entries.length }} {{ t('tamagotchi.settings.devtools.pages.permission-whitelist.entries') }}
      </div>
    </div>

    <div
      v-if="lastError"
      :class="[
        'rounded-lg', 'bg-amber-100', 'p-3',
        'text-sm', 'text-amber-700',
        'dark:bg-amber-900/30', 'dark:text-amber-300',
      ]"
    >
      {{ lastError }}
    </div>

    <section
      :class="[
        'rounded-2xl', 'border-2', 'p-4',
        'border-neutral-200', 'bg-white/70',
        'dark:border-neutral-700/60', 'dark:bg-neutral-950/40',
      ]"
    >
      <div :class="['mb-3', 'text-sm', 'text-neutral-600', 'dark:text-neutral-400']">
        {{ t('tamagotchi.settings.devtools.pages.permission-whitelist.description') }}
      </div>

      <div
        v-if="entries.length === 0"
        :class="[
          'flex', 'flex-col', 'items-center', 'justify-center', 'gap-2',
          'rounded-xl', 'border-2', 'border-dashed', 'border-neutral-200/70',
          'px-4', 'py-10', 'text-sm', 'text-neutral-500',
          'dark:border-neutral-800/40',
        ]"
      >
        <div :class="['i-solar:shield-check-line-duotone', 'text-2xl']" />
        <div>{{ t('tamagotchi.settings.devtools.pages.permission-whitelist.empty') }}</div>
      </div>

      <div v-else :class="['flex', 'flex-col', 'gap-2']">
        <div
          v-for="entry in entries"
          :key="entry.key"
          :class="[
            'flex', 'items-center', 'gap-3', 'rounded-lg', 'p-3',
            'bg-white/60', 'dark:bg-neutral-900/40',
            'border', 'border-transparent',
            'hover:border-neutral-200', 'dark:hover:border-neutral-700',
            'transition', 'duration-150',
          ]"
        >
          <div :class="['i-solar:shield-keyhole-line-duotone', 'h-5', 'w-5', 'shrink-0', 'text-neutral-400']" />
          <div :class="['flex', 'flex-1', 'flex-col', 'gap-1', 'min-w-0']">
            <div :class="['text-sm', 'font-mono', 'text-neutral-800', 'dark:text-neutral-100', 'truncate']">
              {{ entry.key }}
            </div>
            <div :class="['text-xs', 'text-neutral-400']">
              {{ t('tamagotchi.settings.devtools.pages.permission-whitelist.created-at') }}: {{ formatTime(entry.createdAt) }}
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon="i-solar:close-circle-outline"
            :label="t('tamagotchi.settings.devtools.pages.permission-whitelist.remove')"
            @click="removeEntry(entry.key)"
          />
        </div>
      </div>
    </section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.devtools.pages.permission-whitelist.title
  subtitleKey: tamagotchi.settings.devtools.title
</route>
