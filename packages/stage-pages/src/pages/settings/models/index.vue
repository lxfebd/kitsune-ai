<script setup lang="ts">
import { ModelSettings } from '@kitsune/stage-ui/components/scenarios/settings/model-settings'
import { Vibrant } from 'node-vibrant/browser'
import { ref } from 'vue'

const modelSettingsRef = ref<{ capturePreviewFrame: () => Promise<Blob | undefined> }>()
const palette = ref<string[]>([])

async function extractColorsFromModel() {
  const frame = await modelSettingsRef.value?.capturePreviewFrame()
  if (!frame) {
    console.error('No frame captured')
    return
  }

  const frameUrl = URL.createObjectURL(frame)
  try {
    const vibrant = new Vibrant(frameUrl)

    const paletteFromVibrant = await vibrant.getPalette()
    palette.value = Object.values(paletteFromVibrant).map(color => color?.hex).filter(it => typeof it === 'string')
  }
  finally {
    URL.revokeObjectURL(frameUrl)
  }
}
</script>

<template>
  <div class="models-settings">
    <ModelSettings
      ref="modelSettingsRef"
      settings-class="model-settings-panel"
      live-2d-scene-class="model-preview-scene"
      vrm-scene-class="model-preview-scene"
      :palette="palette" @extract-colors-from-model="extractColorsFromModel"
    />
  </div>
</template>

<style scoped>
.models-settings {
  display: grid;
  grid-template-columns: 400px minmax(0, 1fr);
  gap: 24px;
  align-items: start;
  min-height: 0;
}

:deep(.model-settings-panel) {
  height: fit-content;
  max-height: calc(100dvh - 160px);
  overflow-y: auto;
  padding-right: 8px;
}

:deep(.model-preview-scene) {
  position: sticky;
  top: 0;
  height: calc(100dvh - 160px);
  max-height: calc(100dvh - 160px);
}

@media (max-width: 1024px) {
  .models-settings {
    grid-template-columns: 1fr;
  }

  :deep(.model-settings-panel) {
    max-height: none;
  }

  :deep(.model-preview-scene) {
    position: relative;
    height: 360px;
  }
}
</style>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.models.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.models.description
  icon: i-solar:people-nearby-bold-duotone
  settingsEntry: true
  order: 4
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
