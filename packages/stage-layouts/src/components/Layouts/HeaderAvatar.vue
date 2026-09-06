<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <RouterLink
    border="2 solid neutral-100/60 dark:neutral-800/30"
    bg="neutral-50/70 dark:neutral-800/70"
    w-fit flex items-center justify-center rounded-xl p-2 backdrop-blur-md
    title="Settings"
    to="/settings"
  >
    <div i-solar:settings-minimalistic-bold-duotone size-5 text="neutral-500 dark:neutral-400" />
  </RouterLink>
</template>
