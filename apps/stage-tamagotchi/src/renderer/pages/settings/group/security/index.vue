<script setup lang="ts">
import SettingsGroupHub from '../../components/settings-group-hub.vue'
</script>

<template>
  <SettingsGroupHub group-id="security" />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.nav.group.security
  descriptionKey: settings.groups.security.description
  stageTransition:
    name: slide
</route>
