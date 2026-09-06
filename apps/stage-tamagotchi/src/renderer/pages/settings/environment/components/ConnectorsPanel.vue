<script setup lang="ts">
import type { ConnectorInfo } from '../../../../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { getElectronEventaContext, useElectronEventaInvoke } from '@kitsune/electron-vueuse'
import { Button, Callout, Checkbox } from '@kitsune/ui'
import { onMounted, onScopeDispose, ref } from 'vue'

import {
  electronConnectorChanged,
  electronConnectorList,
  electronConnectorSendTask,
} from '../../../../../shared/eventa'
import { useEnvironmentI18n } from './use-environment-i18n'

const { tn } = useEnvironmentI18n()
const invokeConnectorList = useElectronEventaInvoke(electronConnectorList)
const invokeConnectorSendTask = useElectronEventaInvoke(electronConnectorSendTask)

const PANEL = 'settings-panel'
const CARD = 'settings-card'

const connectors = ref<ConnectorInfo[]>([])
const disabledConnectorIds = ref<Set<string>>(new Set())
const connectorBusyId = ref<string | null>(null)
const errorMessage = ref('')

async function loadConnectors() {
  try {
    const list = await invokeConnectorList()
    connectors.value = list ?? []
  }
  catch (e) {
    errorMessage.value = errorMessageFrom(e) ?? 'Unknown error'
  }
}

async function sendConnectorDisconnect(connector: ConnectorInfo) {
  connectorBusyId.value = connector.id
  try {
    await invokeConnectorSendTask({ id: connector.id, action: 'disconnect' })
    await loadConnectors()
  }
  catch (e) {
    errorMessage.value = errorMessageFrom(e) ?? 'Unknown error'
  }
  finally {
    connectorBusyId.value = null
  }
}

function toggleConnectorEnabled(connector: ConnectorInfo, value: boolean) {
  if (value)
    disabledConnectorIds.value.delete(connector.id)
  else
    disabledConnectorIds.value.add(connector.id)
  disabledConnectorIds.value = new Set(disabledConnectorIds.value)
}

function isConnectorEnabled(connector: ConnectorInfo) {
  return !disabledConnectorIds.value.has(connector.id)
}

function connectorTypeLabel(type: ConnectorInfo['type']) {
  return type
}

function formatLastContextAt(ts: number | null) {
  if (!ts)
    return tn('connectors.fields.never')
  return new Date(ts).toLocaleString()
}

let eventaContext: ReturnType<typeof getElectronEventaContext> | undefined
try {
  eventaContext = getElectronEventaContext()
}
catch (e) {
  console.warn('[environment/connectors] IPC bridge unavailable:', e)
}

const offConnectorChanged = eventaContext?.on(electronConnectorChanged, (event) => {
  if (!event?.body)
    return
  connectors.value = event.body
})
onScopeDispose(() => offConnectorChanged?.())

onMounted(loadConnectors)
</script>

<template>
  <section :class="PANEL">
    <Callout v-if="errorMessage" theme="orange" :label="tn('connectors.error-title')">
      {{ errorMessage }}
    </Callout>
    <div flex="~ col gap-1">
      <h3 class="text-sm font-semibold">
        {{ tn('connectors.title') }}
      </h3>
      <p class="text-xs text-neutral-500 dark:text-neutral-400">
        {{ tn('connectors.description') }}
      </p>
    </div>

    <div v-if="!connectors.length" class="border-2 border-neutral-200 rounded-lg border-dashed p-6 text-center text-xs text-neutral-500 dark:border-neutral-800">
      {{ tn('connectors.empty') }}
    </div>

    <article
      v-for="connector in connectors"
      :key="connector.id"
      :class="CARD"
    >
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 flex flex-col gap-0.5">
          <div class="flex items-center gap-2">
            <span class="truncate text-sm font-medium">{{ connector.name }}</span>
            <span class="rounded-full bg-primary-500/15 px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase text-primary-700 dark:text-primary-300">
              {{ connectorTypeLabel(connector.type) }}
            </span>
          </div>
          <div class="text-xs text-neutral-500 dark:text-neutral-400">
            {{ tn('connectors.fields.last-context') }}: {{ formatLastContextAt(connector.lastContextAt) }}
          </div>
        </div>
        <span
          :class="[
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase',
            isConnectorEnabled(connector)
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
              : 'bg-neutral-400/20 text-neutral-600 dark:text-neutral-300',
          ]"
        >
          <span class="size-1 rounded-full bg-current opacity-80" />
          {{ isConnectorEnabled(connector) ? tn('connectors.status.connected') : tn('connectors.status.disconnected') }}
        </span>
      </div>

      <div class="flex items-center justify-between gap-2 border-t border-neutral-200/70 pt-2 dark:border-neutral-800">
        <label class="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
          <span>{{ tn('connectors.actions.enable') }}</span>
          <Checkbox
            :model-value="isConnectorEnabled(connector)"
            @update:model-value="(v: boolean) => toggleConnectorEnabled(connector, v)"
          />
        </label>
        <Button
          variant="danger" size="sm"
          :loading="connectorBusyId === connector.id"
          :label="tn('connectors.actions.disconnect')"
          icon="i-solar:logout-3-bold-duotone"
          @click="sendConnectorDisconnect(connector)"
        />
      </div>
    </article>
  </section>
</template>
