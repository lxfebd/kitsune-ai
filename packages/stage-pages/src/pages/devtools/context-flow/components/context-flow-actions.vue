<script setup lang="ts">
import { ContextUpdateStrategy } from '@kitsune/server-sdk'
import { Section } from '@kitsune/stage-ui/components'
import { Button, FieldInput, FieldTextArea, SelectTab } from '@kitsune/ui'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const emit = defineEmits<{
  (event: 'sendContextUpdate'): void
  (event: 'sendSparkNotify'): void
}>()
const testStrategy = defineModel<ContextUpdateStrategy>('testStrategy', { required: true })
const testPayload = defineModel<string>('testPayload', { required: true })
const testSparkNotifyPayload = defineModel<string>('testSparkNotifyPayload', { required: true })
const attentionTickInterval = defineModel<number>('attentionTickInterval', { required: true })
const attentionTaskWindow = defineModel<number>('attentionTaskWindow', { required: true })
const attentionRequeueDelay = defineModel<number>('attentionRequeueDelay', { required: true })
const attentionMaxAttempts = defineModel<number>('attentionMaxAttempts', { required: true })

const strategyOptions = [
  { label: t('tamagotchi.settings.devtools.pages.context-flow.replace'), value: ContextUpdateStrategy.ReplaceSelf },
  { label: t('tamagotchi.settings.devtools.pages.context-flow.append'), value: ContextUpdateStrategy.AppendSelf },
]
</script>

<template>
  <div :class="['flex', 'flex-col', 'gap-2']">
    <Section :title="t('tamagotchi.settings.devtools.pages.context-flow.send')" icon="i-solar:plain-2-bold-duotone" inner-class="gap-3" :expand="false">
      <div :class="['flex', 'flex-col', 'gap-2']">
        <div :class="['text-xs', 'font-medium', 'text-neutral-500', 'dark:text-neutral-400']">
          {{ t('tamagotchi.settings.devtools.pages.context-flow.strategy') }}
        </div>
        <SelectTab
          v-model="testStrategy"
          size="sm"
          :options="strategyOptions"
        />
        <FieldTextArea
          v-model="testPayload"
          :label="t('tamagotchi.settings.devtools.pages.context-flow.payload')"
          :description="t('tamagotchi.settings.devtools.pages.context-flow.payload-description')"
          :input-class="['font-mono', 'min-h-32']"
        />
        <div :class="['flex', 'justify-end']">
          <Button :label="t('tamagotchi.settings.devtools.pages.context-flow.send-context-update')" icon="i-solar:plain-2-bold-duotone" size="sm" @click="emit('sendContextUpdate')" />
        </div>
      </div>
    </Section>
    <Section :title="t('tamagotchi.settings.devtools.pages.context-flow.attention')" icon="i-solar:settings-bold-duotone" inner-class="gap-3" :expand="false">
      <div :class="['grid', 'gap-3', 'sm:grid-cols-2']">
        <FieldInput
          v-model.number="attentionTickInterval"
          :label="t('tamagotchi.settings.devtools.pages.context-flow.tick-interval')"
          :description="t('tamagotchi.settings.devtools.pages.context-flow.tick-interval-description')"
          type="number"
        />
        <FieldInput
          v-model.number="attentionTaskWindow"
          :label="t('tamagotchi.settings.devtools.pages.context-flow.task-notify-window')"
          :description="t('tamagotchi.settings.devtools.pages.context-flow.task-notify-window-description')"
          type="number"
        />
        <FieldInput
          v-model.number="attentionRequeueDelay"
          :label="t('tamagotchi.settings.devtools.pages.context-flow.requeue-delay')"
          :description="t('tamagotchi.settings.devtools.pages.context-flow.requeue-delay-description')"
          type="number"
        />
        <FieldInput
          v-model.number="attentionMaxAttempts"
          :label="t('tamagotchi.settings.devtools.pages.context-flow.max-attempts')"
          :description="t('tamagotchi.settings.devtools.pages.context-flow.max-attempts-description')"
          type="number"
        />
      </div>
    </Section>
    <Section :title="t('tamagotchi.settings.devtools.pages.context-flow.simulate-incoming')" icon="i-solar:plain-2-bold-duotone" inner-class="gap-3" :expand="false">
      <FieldTextArea
        v-model="testSparkNotifyPayload"
        label="spark:notify"
        :description="t('tamagotchi.settings.devtools.pages.context-flow.spark-notify-description')"
        :input-class="['font-mono', 'min-h-44', 'overflow-hidden']"
      />
      <div :class="['flex', 'justify-end']">
        <Button
          :label="t('tamagotchi.settings.devtools.pages.context-flow.send-spark-notify')"
          icon="i-solar:bell-bing-bold-duotone"
          size="sm"
          @click="emit('sendSparkNotify')"
        />
      </div>
    </Section>
  </div>
</template>
