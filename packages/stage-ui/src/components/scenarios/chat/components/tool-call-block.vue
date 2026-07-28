<script setup lang="ts">
import { Collapsible, ContainerError } from '@kitsune/ui'
import { computed } from 'vue'

import { createToolResultError } from './tool-call-display'

const props = defineProps<{
  toolName: string
  args: string
  state?: 'executing' | 'done' | 'error'
  result?: unknown
}>()

const resultError = computed(() => props.state === 'error' ? createToolResultError(props.result) : undefined)

const formattedArgs = computed(() => {
  try {
    const parsed = JSON.parse(props.args)
    return JSON.stringify(parsed, null, 2).trim()
  }
  catch {
    return props.args
  }
})
</script>

<template>
  <Collapsible
    :class="[
      'bg-black/[0.03] dark:bg-white/[0.03] backdrop-blur-xl rounded-xl px-2.5 pb-1.5 pt-1.5 border border-black/[0.04] dark:border-white/[0.04]',
      'flex flex-col gap-2 items-start',
    ]"
  >
    <template #trigger="{ visible, setVisible }">
      <button
        :class="[
          'w-full text-start',
          'inline-flex items-center',
        ]"
        @click="setVisible(!visible)"
      >
        <div
          v-if="state === 'executing'"
          i-eos-icons:loading class="mr-1.5 inline-block op-50 text-[11px]"
        />
        <div
          v-else-if="state === 'error'"
          i-solar:danger-circle-bold-duotone class="mr-1.5 inline-block text-red-500 text-[11px]"
        />
        <div
          v-else-if="state === 'done'"
          i-solar:check-circle-bold-duotone class="mr-1.5 inline-block text-emerald-500 text-[11px]"
        />
        <div
          v-else
          i-solar:sledgehammer-bold-duotone class="mr-1.5 inline-block translate-y-0.5 op-50 text-[11px]"
        />
        <code class="text-[11px] text-neutral-500 dark:text-neutral-400">{{ toolName }}</code>
      </button>
    </template>
    <div
      :class="[
        'rounded-lg p-2 w-full',
        'bg-black/[0.02] dark:bg-white/[0.02] text-[12px] text-neutral-800 dark:text-neutral-200',
      ]"
    >
      <template v-if="resultError">
        <ContainerError
          :error="resultError"
          :include-stack="false"
          :show-feedback-button="false"
          height-preset="auto"
        />
        <div
          :class="[
            'mt-2 whitespace-pre-wrap break-words font-mono',
          ]"
        >
          {{ formattedArgs }}
        </div>
      </template>
      <div v-else class="whitespace-pre-wrap break-words font-mono">
        {{ formattedArgs }}
      </div>
    </div>
  </Collapsible>
</template>
