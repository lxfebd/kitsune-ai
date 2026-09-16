<script setup lang="ts">
import type { ConnectorInfo, ConnectorTaskResult } from '../../../../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { getElectronEventaContext, useElectronEventaInvoke } from '@kitsune/electron-vueuse'
import { Button, Callout, Checkbox, FieldInput, FieldSelect, FieldTextArea } from '@kitsune/ui'
import { onMounted, onScopeDispose, ref, watch } from 'vue'

import {
  electronConnectorChanged,
  electronConnectorList,
  electronConnectorSendTask,
  electronConnectorTaskResult,
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

// ── 发送任务表单（按连接器实例） ──
interface TaskFormState {
  expanded: boolean
  action: string
  path: string
  line: string
  code: string
  command: string
  args: string
  position: string
  sending: boolean
}

type ConnectorReceipt = ConnectorTaskResult & { at: number, timedOut?: boolean }

const taskFormByConnector = ref<Record<string, TaskFormState>>({})
const taskResultsByConnector = ref<Record<string, ConnectorReceipt[]>>({})

const IDE_ACTIONS = [
  { label: 'open_file', value: 'open_file' },
  { label: 'insert_code', value: 'insert_code' },
  { label: 'run_command', value: 'run_command' },
]

function createTaskForm(): TaskFormState {
  return {
    expanded: false,
    action: 'open_file',
    path: '',
    line: '',
    code: '',
    command: '',
    args: '',
    position: '',
    sending: false,
  }
}

// 连接器列表变化时预初始化表单与回执容器，模板中只做无副作用的下标访问
watch(connectors, (list) => {
  for (const connector of list) {
    if (!taskFormByConnector.value[connector.id])
      taskFormByConnector.value[connector.id] = createTaskForm()
    taskResultsByConnector.value[connector.id] ??= []
  }
}, { immediate: true })

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
    await invokeConnectorSendTask({ id: connector.id, task: { type: 'disconnect', payload: {} } })
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

async function sendTask(connector: ConnectorInfo) {
  const form = taskFormByConnector.value[connector.id]!
  if (form.sending)
    return
  form.sending = true
  errorMessage.value = ''

  // 按动作组装 payload（与 overseer planGenerator 的 IdeTask.payload 对齐）
  const payload: Record<string, unknown> = {}
  if (form.action === 'open_file') {
    payload.path = form.path.trim()
    if (!payload.path) {
      errorMessage.value = tn('connectors.task.path-missing')
      form.sending = false
      return
    }
    if (form.line.trim())
      payload.line = Number(form.line)
  }
  else if (form.action === 'insert_code') {
    payload.code = form.code
    if (!payload.code) {
      errorMessage.value = tn('connectors.task.code-missing')
      form.sending = false
      return
    }
    if (form.position)
      payload.position = form.position
  }
  else {
    payload.command = form.command.trim()
    if (!payload.command) {
      errorMessage.value = tn('connectors.task.command-missing')
      form.sending = false
      return
    }
    if (form.args.trim())
      payload.args = form.args.trim().split(/\s+/)
  }

  try {
    const res = await invokeConnectorSendTask({ id: connector.id, task: { type: form.action, payload } })
    if (!res?.ok) {
      errorMessage.value = res?.error ?? tn('connectors.actions.task-fail')
      return
    }
    taskResultsByConnector.value[connector.id] ??= []
    taskResultsByConnector.value[connector.id].push({
      taskId: res.taskId ?? String(Date.now()),
      success: true,
      at: Date.now(),
      timedOut: false,
      error: '',
    })
  }
  catch (e) {
    errorMessage.value = errorMessageFrom(e) ?? 'Unknown error'
  }
  finally {
    form.sending = false
  }
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

// task:result 回执 — 与发送的任务匹配后展示（失败/成功/超时占位）
const offTaskResult = eventaContext?.on(electronConnectorTaskResult, (event) => {
  if (!event?.body)
    return
  const result = event.body
  for (const list of Object.values(taskResultsByConnector.value)) {
    const hit = list.find(r => r.taskId === result.taskId && r.success)
    if (hit) {
      hit.success = result.success
      hit.error = result.error
      hit.at = Date.now()
      break
    }
  }
})
onScopeDispose(() => {
  offConnectorChanged?.()
  offTaskResult?.()
})

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

      <!-- 发送任务（桌宠控制 IDE 验证入口） -->
      <div class="mt-2 border-t border-neutral-200/70 pt-2 dark:border-neutral-800">
        <Button
          variant="ghost" size="sm"
          :label="taskFormByConnector[connector.id].expanded ? tn('connectors.actions.collapse-task') : tn('connectors.actions.send-task')"
          icon="i-solar:paper-plane-bold-duotone"
          @click="taskFormByConnector[connector.id].expanded = !taskFormByConnector[connector.id].expanded"
        />
        <div v-if="taskFormByConnector[connector.id].expanded" class="mt-2 flex flex-col gap-2">
          <p class="text-xs text-neutral-500 dark:text-neutral-400">
            {{ tn('connectors.actions.task-placeholder') }}
          </p>
          <FieldSelect
            v-model="taskFormByConnector[connector.id].action"
            :label="tn('connectors.task.action')"
            :options="IDE_ACTIONS.map(a => ({ label: tn(`connectors.task.actions.${a.value}`), value: a.value }))"
          />
          <template v-if="taskFormByConnector[connector.id].action === 'open_file'">
            <FieldInput v-model="taskFormByConnector[connector.id].path" :label="tn('connectors.task.path')" />
            <FieldInput v-model="taskFormByConnector[connector.id].line" :label="tn('connectors.task.line')" />
          </template>
          <template v-else-if="taskFormByConnector[connector.id].action === 'insert_code'">
            <FieldTextArea v-model="taskFormByConnector[connector.id].code" :label="tn('connectors.task.code')" />
            <FieldInput v-model="taskFormByConnector[connector.id].position" :label="tn('connectors.task.position')" />
          </template>
          <template v-else>
            <FieldInput v-model="taskFormByConnector[connector.id].command" :label="tn('connectors.task.command')" />
            <FieldInput v-model="taskFormByConnector[connector.id].args" :label="tn('connectors.task.args')" />
          </template>
          <Button
            variant="primary" size="sm"
            :loading="taskFormByConnector[connector.id].sending"
            :label="taskFormByConnector[connector.id].sending ? tn('connectors.actions.sending') : tn('connectors.actions.send-task')"
            icon="i-solar:paper-plane-bold-duotone"
            @click="sendTask(connector)"
          />
        </div>

        <!-- 回执列表 -->
        <div v-if="taskResultsByConnector[connector.id]?.length" class="mt-2 flex flex-col gap-1">
          <div class="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            {{ tn('connectors.actions.send-task') }} · {{ taskResultsByConnector[connector.id].length }}
          </div>
          <div
            v-for="(r, idx) in [...taskResultsByConnector[connector.id]].reverse()"
            :key="`${r.taskId}-${idx}`"
            class="flex items-center gap-2 rounded-lg border border-black/[0.06] bg-white/40 px-2 py-1 text-xs dark:border-white/[0.06] dark:bg-white/[0.02]"
          >
            <span
              :class="[
                'inline-flex size-2 shrink-0 rounded-full',
                r.success ? 'bg-emerald-500' : 'bg-red-500',
              ]"
            />
            <span class="min-w-0 truncate text-neutral-700 dark:text-neutral-200">
              {{ r.success ? tn('connectors.actions.task-ok') : tn('connectors.actions.task-fail') }}
              {{ r.error ? `: ${r.error}` : '' }}
            </span>
          </div>
        </div>
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