<script setup lang="ts">
import type { DataSettingsStatusTone } from '../status'

interface Props {
  message: string
  tone: DataSettingsStatusTone
}

defineProps<Props>()
</script>

<template>
  <div
    :class="[
      'p-3 px-4 rounded-lg text-[13px] leading-relaxed',
      tone === 'success' && 'border border-[rgba(16,185,129,0.3)] bg-[rgba(16,185,129,0.08)] text-emerald-400 dark:text-emerald-300',
      tone === 'error' && 'border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] text-red-300',
      tone === 'neutral' && 'border border-black/[0.06] dark:border-white/[0.06] bg-white/50 dark:bg-white/[0.03] backdrop-blur-2xl text-neutral-500 dark:text-neutral-400',
    ]"
  >
    {{ message }}
  </div>
</template>
