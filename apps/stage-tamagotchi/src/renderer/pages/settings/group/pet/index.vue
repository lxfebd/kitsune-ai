<script setup lang="ts">
import SettingsGroupHub from '../../components/settings-group-hub.vue'
</script>

<template>
  <SettingsGroupHub group-id="pet" />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.nav.group.pet
  descriptionKey: settings.groups.pet.description
  stageTransition:
    name: slide
</route>
