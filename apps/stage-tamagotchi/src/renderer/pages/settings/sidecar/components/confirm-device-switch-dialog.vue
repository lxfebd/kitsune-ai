<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, TransitionVertical } from '@kitsune/ui'

type DeviceId = 'cpu' | 'auto' | 'cuda-half' | 'cuda'

const props = defineProps<{
  visible: boolean
  currentDevice: DeviceId
  targetDevice: DeviceId
  currentThreads?: number
  targetThreads?: number
  deviceOnlyThreadsChanged: boolean
  confirming?: boolean
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

// NOTICE: device_confirm.cpu / cuda / cuda_half / auto 的值是 YAML 数组
// （定性描述 bullet points）。vue-i18n 的 t() 只能返回字符串，遇到数组值会
// 退回返回 key 名，导致 v-for 遍历 key 字符串逐字渲染。
// 必须用 tm() 取原始数组消息。
const { t, tm } = useI18n()

const title = computed(() =>
  props.deviceOnlyThreadsChanged
    ? t('settings.tts.device_confirm.title_threads')
    : t('settings.tts.device_confirm.title_switch'),
)

const targetDetails = computed(() => {
  const key = props.targetDevice.replace('-', '_') as 'cpu' | 'cuda_half' | 'cuda' | 'auto'
  return tm(`settings.tts.device_confirm.${key}`) as unknown as string[]
})

const targetLine = computed(() => {
  const labels: Record<DeviceId, string> = {
    cpu: t('settings.tts.device_options.cpu'),
    auto: t('settings.tts.device_options.auto'),
    'cuda-half': t('settings.tts.device_options.cuda_half'),
    cuda: t('settings.tts.device_options.cuda'),
  }
  const base = labels[props.targetDevice]
  if (props.deviceOnlyThreadsChanged) {
    return `${t('settings.tts.threads_label')}: ${props.currentThreads ?? 4} → ${props.targetThreads ?? 4}`
  }
  if (props.targetDevice === 'cpu' && props.targetThreads) {
    return `${base}（${props.targetThreads} ${t('settings.tts.threads_label')}）`
  }
  return base
})

const currentLabel = computed(() => {
  const labels: Record<DeviceId, string> = {
    cpu: t('settings.tts.device_options.cpu'),
    auto: t('settings.tts.device_options.auto'),
    'cuda-half': t('settings.tts.device_options.cuda_half'),
    cuda: t('settings.tts.device_options.cuda'),
  }
  return labels[props.currentDevice]
})
</script>

<template>
  <TransitionVertical>
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      @click.self="emit('cancel')"
    >
      <div :class="['w-[420px] max-w-[90vw] rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 flex flex-col gap-3']">
        <h4 class="text-sm font-semibold">
          {{ title }}
        </h4>

        <div v-if="!deviceOnlyThreadsChanged" class="flex flex-col gap-1 text-xs">
          <div>
            <span class="text-neutral-500 dark:text-neutral-400">{{ t('settings.tts.device_confirm.current') }}：</span>
            <span>{{ currentLabel }}</span>
          </div>
          <div>
            <span class="text-neutral-500 dark:text-neutral-400">{{ t('settings.tts.device_confirm.target') }}：</span>
            <span class="font-medium">{{ targetLine }}</span>
          </div>
        </div>
        <div v-else class="text-xs">
          <span class="font-medium">{{ targetLine }}</span>
        </div>

        <ul class="flex flex-col gap-1 pl-1 text-xs text-neutral-600 dark:text-neutral-300">
          <li v-for="(line, i) in targetDetails" :key="i" class="flex gap-1">
            <span class="text-neutral-400">·</span>
            <span>{{ line }}</span>
          </li>
        </ul>

        <p class="text-[11px] text-neutral-500 dark:text-neutral-400">
          {{ t('settings.tts.device_confirm.restart_hint') }}
        </p>

        <div class="flex justify-end gap-2">
          <Button
            variant="secondary" size="sm"
            :label="t('settings.tts.device_confirm.cancel')"
            @click="emit('cancel')"
          />
          <Button
            variant="primary" size="sm"
            :loading="confirming"
            :disabled="confirming"
            :label="t('settings.tts.device_confirm.confirm')"
            @click="emit('confirm')"
          />
        </div>
      </div>
    </div>
  </TransitionVertical>
</template>