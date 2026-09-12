<script setup lang="ts">
import SettingsGroupHub from '../../components/settings-group-hub.vue'
</script>

<template>
  <SettingsGroupHub group-id="senses" />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.nav.group.senses
  descriptionKey: settings.groups.senses.description
  stageTransition:
    name: slide
</route>
