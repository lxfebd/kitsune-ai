<script setup lang="ts">
defineProps<{
  title: string
  description: string
  icon?: string
  iconTemplate?: boolean
  to: string
}>()
</script>

<template>
  <RouterLink
    :class="[
      'group flex flex-row items-center gap-3 w-full p-4 text-left cursor-pointer',
      'border border-black/[0.06] dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl',
      'transition-all ease-in-out',
      'hover:border-primary-500/30 dark:hover:border-primary-400/30',
      'hover:bg-white/80 dark:hover:bg-white/[0.06]',
    ]"
    :style="{
      borderRadius: 'calc(var(--settings-card-radius, 1rem) * 0.625)',
      transitionDuration: 'var(--settings-motion-duration, 0.2s)',
    }"
    :to="to"
  >
    <div
      v-if="typeof icon === 'string'"
      :class="[
        'shrink-0 size-5 text-neutral-400 dark:text-neutral-500',
        'transition-colors duration-200',
        'group-hover:text-primary-500 dark:group-hover:text-primary-400',
        icon,
      ]"
    />
    <template v-else-if="iconTemplate">
      <slot name="icon" />
    </template>
    <div class="flex-1 min-w-0">
      <div class="text-sm font-medium text-neutral-800 dark:text-neutral-100 transition-colors duration-200 group-hover:text-primary-600 dark:group-hover:text-primary-300">
        {{ title }}
      </div>
      <div class="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
        {{ description }}
      </div>
    </div>
  </RouterLink>
</template>
