<script setup lang="ts">
import SettingsGroupHub from '../../components/settings-group-hub.vue'
</script>

<template>
  <SettingsGroupHub group-id="ops" />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.nav.group.ops
  descriptionKey: settings.groups.ops.description
  stageTransition:
    name: slide
</route>
