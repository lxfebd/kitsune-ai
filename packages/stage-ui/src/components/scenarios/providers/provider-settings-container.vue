<script setup lang="ts">
defineProps<{
  /** Optional extra classes for stagger animation delay */
  delay?: string
}>()
</script>

<template>
  <div
    class="flex flex-col gap-5 rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.04] backdrop-blur-2xl p-5 transition-all duration-300 hover:shadow-sm hover:shadow-black/[0.02] dark:hover:shadow-black/[0.08]"
    :class="delay"
  >
    <slot />
  </div>
</template>
