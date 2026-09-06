<script setup lang="ts">
import type { PermissionConfirmPayload, PermissionConfirmResult } from '../../../../../shared/eventa'

import { getElectronEventaContext, useElectronEventaInvoke } from '@kitsune/electron-vueuse'
import { Button, Checkbox } from '@kitsune/ui'
import { onScopeDispose, ref } from 'vue'

import { electronPermissionConfirm, electronPermissionResult } from '../../../../../shared/eventa'
import { useEnvironmentI18n } from './use-environment-i18n'

const { tn } = useEnvironmentI18n()
const invokePermissionResult = useElectronEventaInvoke(electronPermissionResult)

const PANEL = 'settings-panel'

const pendingPermission = ref<PermissionConfirmPayload | null>(null)
const permissionAutoWhitelist = ref(false)

let eventaContext: ReturnType<typeof getElectronEventaContext> | undefined
try {
  eventaContext = getElectronEventaContext()
}
catch (e) {
  console.warn('[environment/permission] IPC bridge unavailable:', e)
}

const offPermissionConfirm = eventaContext?.on(electronPermissionConfirm, (event) => {
  if (!event?.body)
    return
  pendingPermission.value = event.body
  permissionAutoWhitelist.value = false
})
onScopeDispose(() => offPermissionConfirm?.())

async function confirmPermission(approved: boolean) {
  if (!pendingPermission.value)
    return
  try {
    await invokePermissionResult({
      taskId: pendingPermission.value.taskId,
      approved,
      addToWhitelist: permissionAutoWhitelist.value,
    } satisfies PermissionConfirmResult)
  }
  catch (e) {
    console.error('[environment/permission] failed to send result:', e)
  }
  pendingPermission.value = null
}
</script>

<template>
  <div
    v-if="pendingPermission"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
  >
    <div :class="PANEL" class="max-w-lg w-full mx-4">
      <h3 class="text-sm font-semibold">
        {{ tn('executor.permission-confirm.title') }}
      </h3>
      <div
        v-if="pendingPermission.highRisk"
        class="flex items-center gap-2 mt-2 p-2 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded text-xs text-red-700 dark:text-red-300"
      >
        <span class="i-solar:danger-triangle-bold text-sm" />
        <span class="font-medium">高风险操作 — 请仔细确认后再执行</span>
      </div>
      <div class="flex flex-col gap-2 text-xs mt-2">
        <div>
          <span class="font-medium">{{ tn('executor.permission-confirm.source') }}:</span>
          <code class="bg-neutral-200/60 dark:bg-neutral-800 px-1 rounded">{{ pendingPermission.source }}</code>
        </div>
        <div>
          <span class="font-medium">{{ tn('executor.permission-confirm.type') }}:</span>
          <code class="bg-neutral-200/60 dark:bg-neutral-800 px-1 rounded">{{ pendingPermission.assertionType }}</code>
        </div>
        <div v-if="pendingPermission.summary" class="border-t border-neutral-200/70 dark:border-neutral-800 pt-2 mt-1">
          <p class="text-neutral-700 dark:text-neutral-200">{{ pendingPermission.summary }}</p>
        </div>
      </div>
      <label
        class="flex items-center gap-2 mt-3 cursor-pointer text-xs"
        :class="pendingPermission.highRisk ? 'text-neutral-400 dark:text-neutral-600 cursor-not-allowed' : 'text-neutral-600 dark:text-neutral-300'"
      >
        <Checkbox
          :model-value="permissionAutoWhitelist"
          :disabled="pendingPermission.highRisk"
          @update:model-value="(v: boolean) => permissionAutoWhitelist = v"
        />
        <span>{{ tn('executor.permission-confirm.add-to-whitelist') }}</span>
        <span v-if="pendingPermission.highRisk" class="text-red-500 dark:text-red-400">(高风险操作不可加入白名单)</span>
      </label>
      <div class="flex items-center justify-end gap-2 mt-4">
        <Button
          variant="secondary" size="sm"
          :label="tn('executor.permission-confirm.reject')"
          @click="confirmPermission(false)"
        />
        <Button
          variant="primary" size="sm"
          :label="tn('executor.permission-confirm.approve')"
          @click="confirmPermission(true)"
        />
      </div>
    </div>
  </div>
</template>
