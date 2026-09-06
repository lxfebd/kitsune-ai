<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

onMounted(() => {
  router.replace('/settings/system/general')
})
</script>

<template>
  <div />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.title
  stageTransition:
    name: slide
</route>
