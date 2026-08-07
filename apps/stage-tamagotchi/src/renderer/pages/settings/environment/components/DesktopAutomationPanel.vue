<script setup lang="ts">
import { useElectronEventaInvoke } from '@kitsune/electron-vueuse'
import { Button, Callout, FieldInput } from '@kitsune/ui'
import { ref } from 'vue'

import { electronDesktopAutomationInvoke } from '../../../../../shared/eventa'
import { useEnvironmentI18n } from './use-environment-i18n'

const { tn } = useEnvironmentI18n()
const invokeDesktopAutomation = useElectronEventaInvoke(electronDesktopAutomationInvoke)

const PANEL = 'settings-panel'

const desktopTestX = ref(960)
const desktopTestY = ref(540)
const desktopTestText = ref('hello')
const desktopLastResult = ref<string | null>(null)
const desktopBusy = ref(false)
const errorMessage = ref('')

async function desktopAutomationAction(action: 'click' | 'moveTo' | 'type' | 'screenshot' | 'getCursorPosition') {
  desktopBusy.value = true
  desktopLastResult.value = null
  errorMessage.value = ''
  try {
    const params: Record<string, unknown> = {}
    if (action === 'moveTo' || action === 'click') {
      params.x = desktopTestX.value
      params.y = desktopTestY.value
    }
    if (action === 'type')
      params.text = desktopTestText.value
    const result = await invokeDesktopAutomation({ action, params })
    if (result?.ok) {
      if (action === 'getCursorPosition')
        desktopLastResult.value = JSON.stringify(result.result)
      else if (action === 'screenshot')
        desktopLastResult.value = tn('desktop-automation.result.screenshot-saved')
      else
        desktopLastResult.value = tn('desktop-automation.result.ok')
    }
    else {
      errorMessage.value = tn('desktop-automation.result.error', { error: result?.error ?? '未知错误' })
    }
  }
  catch (e) {
    errorMessage.value = tn('desktop-automation.result.exception', { error: String(e) })
  }
  finally {
    desktopBusy.value = false
  }
}
</script>

<template>
  <section :class="PANEL">
    <Callout v-if="errorMessage" theme="orange" :label="tn('desktop-automation.error-title')">
      {{ errorMessage }}
    </Callout>
    <div flex="~ col gap-1">
      <h3 class="text-sm font-semibold">
        {{ tn('desktop-automation.title') }}
      </h3>
      <p class="text-xs text-neutral-500 dark:text-neutral-400">
        {{ tn('desktop-automation.description') }}
      </p>
    </div>

    <div class="flex flex-wrap items-end gap-2">
      <FieldInput
        v-model="desktopTestX"
        :label="tn('desktop-automation.fields.x')"
        type="number"
        class="w-20"
      />
      <FieldInput
        v-model="desktopTestY"
        :label="tn('desktop-automation.fields.y')"
        type="number"
        class="w-20"
      />
      <Button
        variant="secondary" size="sm"
        :loading="desktopBusy"
        :label="tn('desktop-automation.actions.move')"
        icon="i-solar:mouse-bold-duotone"
        @click="desktopAutomationAction('moveTo')"
      />
      <Button
        variant="primary" size="sm"
        :loading="desktopBusy"
        :label="tn('desktop-automation.actions.click')"
        icon="i-solar:cursor-bold-duotone"
        @click="desktopAutomationAction('click')"
      />
      <Button
        variant="secondary" size="sm"
        :loading="desktopBusy"
        :label="tn('desktop-automation.actions.get-position')"
        icon="i-solar:target-bold-duotone"
        @click="desktopAutomationAction('getCursorPosition')"
      />
      <Button
        variant="secondary" size="sm"
        :loading="desktopBusy"
        :label="tn('desktop-automation.actions.screenshot')"
        icon="i-solar:gallery-bold-duotone"
        @click="desktopAutomationAction('screenshot')"
      />
    </div>

    <div class="flex items-end gap-2">
      <FieldInput
        v-model="desktopTestText"
        :label="tn('desktop-automation.fields.text')"
        type="text"
        class="flex-1"
        :placeholder="tn('desktop-automation.fields.placeholder-text')"
      />
      <Button
        variant="secondary" size="sm"
        :loading="desktopBusy"
        :label="tn('desktop-automation.actions.type')"
        icon="i-solar:keyboard-bold-duotone"
        @click="desktopAutomationAction('type')"
      />
    </div>

    <div v-if="desktopLastResult" class="text-xs text-neutral-600 dark:text-neutral-300">
      {{ desktopLastResult }}
    </div>
  </section>
</template>
