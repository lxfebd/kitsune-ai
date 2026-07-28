<script setup lang="ts">
defineProps<{
  text: string
  description?: string
}>()
</script>

<template>
  <label
    :class="[
      'w-full flex cursor-pointer items-center justify-between px-4 py-3.5 text-sm outline-none',
      'transition-all ease-in-out',
      'border border-black/[0.06] dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.04] backdrop-blur-2xl',
      'hover:bg-white/80 dark:hover:bg-white/[0.08] hover:shadow-sm hover:shadow-black/[0.02] dark:hover:shadow-black/[0.08]',
      'hover:border-black/[0.1] dark:hover:border-white/[0.1] active:scale-[0.98]',
    ]"
    :style="{
      borderRadius: 'var(--settings-card-radius, 1rem)',
      transitionDuration: 'var(--settings-motion-duration, 0.2s)',
    }"
  >
    <div>
      {{ $t(text) }}
      <div v-if="description" class="text-sm text-neutral-400">
        {{ $t(description) }}
      </div>
    </div>
    <slot />
  </label>
</template>
