<script setup lang="ts">
import SettingsGroupHub from '../../components/settings-group-hub.vue'
</script>

<template>
  <SettingsGroupHub group-id="run" />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.nav.group.run
  descriptionKey: settings.groups.run.description
  stageTransition:
    name: slide
</route>
