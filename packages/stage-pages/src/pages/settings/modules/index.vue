<script setup lang="ts">
import { IconStatusItem } from '@kitsune/stage-ui/components'
import { useModulesList } from '@kitsune/stage-ui/composables/use-modules-list'

const { categorizedModules, categoryNames } = useModulesList()
</script>

<template>
  <div class="modules-settings">
    <section
      v-for="category in Object.keys(categoryNames)"
      :key="category"
      class="module-category"
    >
      <h3 class="m-0 mb-3 text-xs font-semibold tracking-wider uppercase text-neutral-500 dark:text-neutral-400">
        {{ categoryNames[category] }}
      </h3>
      <div class="category-grid">
        <IconStatusItem
          v-for="module in categorizedModules[category]"
          :key="module.id"
          :title="module.name"
          :description="module.description"
          :icon="module.icon"
          :icon-color="module.iconColor"
          :icon-image="module.iconImage"
          :to="module.to"
          :configured="module.configured"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.modules-settings {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.module-category {
  display: flex;
  flex-direction: column;
}

.category-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

.category-grid > * {
  animation: settings-fade-in 0.4s ease-out both;
}

.category-grid > *:nth-child(1) { animation-delay: 0ms; }
.category-grid > *:nth-child(2) { animation-delay: 50ms; }
.category-grid > *:nth-child(3) { animation-delay: 100ms; }
.category-grid > *:nth-child(4) { animation-delay: 150ms; }
.category-grid > *:nth-child(5) { animation-delay: 200ms; }
.category-grid > *:nth-child(6) { animation-delay: 250ms; }
.category-grid > *:nth-child(7) { animation-delay: 300ms; }
.category-grid > *:nth-child(8) { animation-delay: 350ms; }

@keyframes settings-fade-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.modules.description
  icon: i-solar:layers-bold-duotone
  settingsEntry: true
  order: 2
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
