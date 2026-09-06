<script setup lang="ts">
import type { LogLevel } from '../../../../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@kitsune/electron-vueuse'
import { Button, Callout, FieldSelect } from '@kitsune/ui'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  electronLogLevelGet,
  electronLogLevelSet,
} from '../../../../../shared/eventa'
import { useEnvironmentI18n } from './use-environment-i18n'

const { tn } = useEnvironmentI18n()
const { t } = useI18n()
const invokeLogLevelGet = useElectronEventaInvoke(electronLogLevelGet)
const invokeLogLevelSet = useElectronEventaInvoke(electronLogLevelSet)

const PANEL = 'settings-panel'

const logLevel = ref<LogLevel>('INFO')
const logLevelApplying = ref(false)
const logLevelApplied = ref(false)
const errorMessage = ref('')

const LOG_LEVEL_OPTIONS: Array<{ label: string, value: LogLevel }> = [
  { label: 'DEBUG', value: 'DEBUG' },
  { label: 'INFO', value: 'INFO' },
  { label: 'WARN', value: 'WARN' },
  { label: 'ERROR', value: 'ERROR' },
]

async function loadLogLevel() {
  try {
    const level = await invokeLogLevelGet()
    if (level)
      logLevel.value = level
  }
  catch (e) {
    errorMessage.value = errorMessageFrom(e) ?? 'Unknown error'
  }
}

async function applyLogLevel(next: LogLevel) {
  logLevelApplying.value = true
  logLevelApplied.value = false
  errorMessage.value = ''
  try {
    await invokeLogLevelSet({ level: next })
    logLevelApplied.value = true
    setTimeout(() => {
      logLevelApplied.value = false
    }, 3000)
  }
  catch (e) {
    errorMessage.value = errorMessageFrom(e) ?? 'Unknown error'
  }
  finally {
    logLevelApplying.value = false
  }
}

onMounted(loadLogLevel)
</script>

<template>
  <section :class="PANEL">
    <Callout v-if="errorMessage" theme="orange" :label="tn('log-level.error-title')">
      {{ errorMessage }}
    </Callout>
    <div flex="~ col gap-1">
      <h3 class="text-sm font-semibold">
        {{ tn('log-level.title') }}
      </h3>
      <p class="text-xs text-neutral-500 dark:text-neutral-400">
        {{ tn('log-level.description') }}
      </p>
    </div>
    <div class="flex items-end gap-3">
      <div class="flex-1">
        <FieldSelect
          v-model="logLevel"
          :label="tn('log-level.label')"
          :options="LOG_LEVEL_OPTIONS"
        />
      </div>
      <Button
        variant="primary" size="md"
        :loading="logLevelApplying"
        :disabled="logLevelApplying"
        :label="t('settings.common.save')"
        icon="i-solar:check-circle-bold-duotone"
        @click="applyLogLevel(logLevel)"
      />
    </div>
    <Callout v-if="logLevelApplied" theme="lime">
      {{ tn('log-level.applied') }}
    </Callout>
  </section>
</template>
