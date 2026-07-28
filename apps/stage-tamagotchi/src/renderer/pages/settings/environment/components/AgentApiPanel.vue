<script setup lang="ts">
import type { AgentApiProvider, AgentConfig } from '../../../../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@kitsune/electron-vueuse'
import { Button, Callout, Checkbox, FieldInput } from '@kitsune/ui'
import { onMounted, ref } from 'vue'

import {
  electronAgentApiList,
  electronAgentApiSetKey,
} from '../../../../../shared/eventa'
import { useEnvironmentI18n } from './use-environment-i18n'

const { tn } = useEnvironmentI18n()
const invokeAgentApiList = useElectronEventaInvoke(electronAgentApiList)
const invokeAgentApiSetKey = useElectronEventaInvoke(electronAgentApiSetKey)

const PANEL = 'settings-panel'
const CARD = 'settings-card'

const agents = ref<AgentConfig[]>([])
const editingAgentId = ref<string | null>(null)
const editDraft = ref<{ name: string, baseUrl: string, key: string, enabled: boolean }>({
  name: '',
  baseUrl: '',
  key: '',
  enabled: true,
})
const agentBusyId = ref<string | null>(null)
const errorMessage = ref('')
const infoMessage = ref('')

async function loadAgents() {
  try {
    const list = await invokeAgentApiList()
    agents.value = list ?? []
  }
  catch (e) {
    errorMessage.value = errorMessageFrom(e) ?? 'Unknown error'
  }
}

function beginEditAgent(agent: AgentConfig) {
  editingAgentId.value = agent.id
  editDraft.value = {
    name: agent.name,
    baseUrl: agent.baseUrl ?? '',
    key: '',
    enabled: agent.enabled,
  }
}

function cancelEditAgent() {
  editingAgentId.value = null
  editDraft.value = { name: '', baseUrl: '', key: '', enabled: true }
}

async function saveAgent(agent: AgentConfig) {
  agentBusyId.value = agent.id
  try {
    const updated = await invokeAgentApiSetKey({
      id: agent.id,
      name: editDraft.value.name,
      baseUrl: editDraft.value.baseUrl,
      key: editDraft.value.key,
      enabled: editDraft.value.enabled,
    })
    infoMessage.value = updated?.plaintextFallback
      ? tn('agent-api.plaintext-warning')
      : tn('agent-api.saved')
    // 重新拉取以反映最新 key 状态
    await loadAgents()
    cancelEditAgent()
  }
  catch (e) {
    errorMessage.value = errorMessageFrom(e) ?? 'Unknown error'
  }
  finally {
    agentBusyId.value = null
  }
}

function providerLabel(provider: AgentApiProvider) {
  return provider
}

function maskAgentKey(agent: AgentConfig) {
  if (!agent.hasKey && !agent.key)
    return tn('agent-api.status.no-key')
  const raw = agent.key ?? '••••••••'
  return `${raw.slice(0, 3)}••••${raw.slice(-2)}`
}

onMounted(loadAgents)
</script>

<template>
  <section :class="PANEL">
    <Callout v-if="errorMessage" theme="orange" :label="tn('agent-api.error-title')">
      {{ errorMessage }}
    </Callout>
    <Callout v-if="infoMessage" theme="lime" :label="tn('agent-api.info-title')">
      {{ infoMessage }}
    </Callout>
    <div flex="~ col gap-1">
      <h3 class="text-sm font-semibold">
        {{ tn('agent-api.title') }}
      </h3>
      <p class="text-xs text-neutral-500 dark:text-neutral-400">
        {{ tn('agent-api.description') }}
      </p>
    </div>

    <div v-if="!agents.length" class="border-2 border-neutral-200 rounded-lg border-dashed p-6 text-center text-xs text-neutral-500 dark:border-neutral-800">
      {{ tn('agent-api.empty') }}
    </div>

    <article
      v-for="agent in agents"
      :key="agent.id"
      :class="CARD"
    >
      <template v-if="editingAgentId === agent.id">
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm font-medium">{{ providerLabel(agent.provider) }}</span>
          <Button variant="ghost" size="sm" :label="tn('agent-api.actions.cancel')" @click="cancelEditAgent" />
        </div>
        <FieldInput
          v-model="editDraft.name"
          :label="tn('agent-api.fields.name')"
          type="text"
        />
        <FieldInput
          v-model="editDraft.baseUrl"
          :label="tn('agent-api.fields.base-url')"
          type="text"
          placeholder="https://api.example.com/v1"
        />
        <FieldInput
          v-model="editDraft.key"
          :label="tn('agent-api.fields.api-key')"
          type="password"
          placeholder="sk-..."
        />
        <label class="flex cursor-pointer items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
          <span>{{ tn('agent-api.status.enabled') }}</span>
          <Checkbox v-model="editDraft.enabled" />
        </label>
        <div class="flex justify-end">
          <Button
            variant="primary" size="sm"
            :loading="agentBusyId === agent.id"
            :label="tn('agent-api.actions.save')"
            icon="i-solar:diskette-bold-duotone"
            @click="saveAgent(agent)"
          />
        </div>
      </template>
      <template v-else>
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0 flex flex-col gap-0.5">
            <div class="flex items-center gap-2">
              <span class="truncate text-sm font-medium">{{ agent.name }}</span>
              <span class="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase text-violet-700 dark:text-violet-300">
                {{ providerLabel(agent.provider) }}
              </span>
            </div>
            <div class="text-xs text-neutral-500 dark:text-neutral-400">
              {{ tn('agent-api.fields.api-key') }}: <span class="font-mono">{{ maskAgentKey(agent) }}</span>
            </div>
          </div>
          <span
            :class="[
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase',
              agent.enabled
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : 'bg-neutral-400/20 text-neutral-600 dark:text-neutral-300',
            ]"
          >
            <span class="size-1 rounded-full bg-current opacity-80" />
            {{ agent.enabled ? tn('agent-api.status.enabled') : tn('agent-api.status.disabled') }}
          </span>
        </div>
        <div class="flex justify-end border-t border-neutral-200/70 pt-2 dark:border-neutral-800">
          <Button
            variant="secondary" size="sm"
            :label="tn('agent-api.actions.edit')"
            icon="i-solar:pen-2-bold-duotone"
            @click="beginEditAgent(agent)"
          />
        </div>
      </template>
    </article>
  </section>
</template>
