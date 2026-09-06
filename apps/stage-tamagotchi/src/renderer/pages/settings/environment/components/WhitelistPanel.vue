<script setup lang="ts">
import type { PermissionWhitelistEntry } from '../../../../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@kitsune/electron-vueuse'
import { Button, Callout } from '@kitsune/ui'
import { onMounted, ref } from 'vue'

import {
  electronPermissionWhitelistClear,
  electronPermissionWhitelistList,
  electronPermissionWhitelistRemove,
} from '../../../../../shared/eventa'
import { useEnvironmentI18n } from './use-environment-i18n'

const { tn } = useEnvironmentI18n()
const invokeWhitelistList = useElectronEventaInvoke(electronPermissionWhitelistList)
const invokeWhitelistRemove = useElectronEventaInvoke(electronPermissionWhitelistRemove)
const invokeWhitelistClear = useElectronEventaInvoke(electronPermissionWhitelistClear)

const PANEL = 'settings-panel'
const CARD = 'settings-card'

const whitelist = ref<PermissionWhitelistEntry[]>([])
const whitelistBusyKey = ref<string | null>(null)
const whitelistClearing = ref(false)
const errorMessage = ref('')
const infoMessage = ref('')

async function loadWhitelist() {
  errorMessage.value = ''
  try {
    const list = await invokeWhitelistList()
    whitelist.value = list ?? []
  }
  catch (e) {
    // 不再伪装成 mock 数据：明确告知用户加载失败
    errorMessage.value = errorMessageFrom(e) ?? 'Unknown error'
    whitelist.value = []
  }
}

async function removeWhitelist(entry: PermissionWhitelistEntry) {
  whitelistBusyKey.value = entry.key
  errorMessage.value = ''
  try {
    await invokeWhitelistRemove({ key: entry.key })
    await loadWhitelist()
    infoMessage.value = tn('whitelist.removed')
  }
  catch (e) {
    errorMessage.value = errorMessageFrom(e) ?? 'Unknown error'
  }
  finally {
    whitelistBusyKey.value = null
  }
}

async function clearWhitelist() {
  whitelistClearing.value = true
  errorMessage.value = ''
  try {
    await invokeWhitelistClear()
    await loadWhitelist()
    infoMessage.value = tn('whitelist.cleared')
  }
  catch (e) {
    errorMessage.value = errorMessageFrom(e) ?? 'Unknown error'
  }
  finally {
    whitelistClearing.value = false
  }
}

function formatWhitelistDate(ts: number) {
  return new Date(ts).toLocaleString()
}

onMounted(loadWhitelist)
</script>

<template>
  <section :class="PANEL">
    <Callout v-if="errorMessage" theme="orange" :label="tn('whitelist.error-title')">
      {{ errorMessage }}
    </Callout>
    <Callout v-if="infoMessage" theme="lime" :label="tn('whitelist.info-title')">
      {{ infoMessage }}
    </Callout>
    <div class="flex items-start justify-between gap-2">
      <div flex="~ col gap-1">
        <h3 class="text-sm font-semibold">
          {{ tn('whitelist.title') }}
        </h3>
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ tn('whitelist.description') }}
        </p>
      </div>
      <Button
        variant="danger" size="sm"
        :loading="whitelistClearing"
        :disabled="!whitelist.length || whitelistClearing"
        :label="tn('whitelist.actions.clear')"
        icon="i-solar:trash-bin-2-bold-duotone"
        @click="clearWhitelist"
      />
    </div>

    <div v-if="!whitelist.length" class="border-2 border-neutral-200 rounded-lg border-dashed p-4 text-center text-xs text-neutral-500 dark:border-neutral-800">
      {{ tn('whitelist.empty') }}
    </div>

    <article
      v-for="entry in whitelist"
      :key="entry.key"
      :class="CARD"
    >
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 flex flex-col gap-0.5">
          <div class="truncate text-xs font-mono font-medium">
            {{ entry.key }}
          </div>
          <div class="text-[10px] text-neutral-500 dark:text-neutral-400">
            <span v-if="entry.source">{{ tn('whitelist.fields.source') }}: {{ entry.source }} · </span>
            <span>{{ tn('whitelist.fields.created-at') }}: {{ formatWhitelistDate(entry.createdAt) }}</span>
          </div>
        </div>
        <Button
          variant="secondary-muted" size="sm"
          :loading="whitelistBusyKey === entry.key"
          :label="tn('whitelist.actions.remove')"
          icon="i-solar:close-circle-bold-duotone"
          @click="removeWhitelist(entry)"
        />
      </div>
    </article>
  </section>
</template>
