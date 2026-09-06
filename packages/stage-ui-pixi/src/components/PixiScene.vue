<script setup lang="ts">
import type { Application, Container } from 'pixi.js'

import { ref, toRef } from 'vue'

import { usePixiApp } from '../composables/usePixiApp'
import { usePixiScene } from '../composables/usePixiScene'

export interface PixiSceneProps {
  width?: number
  height?: number
  backgroundColor?: number
  antialias?: boolean
  resolution?: number
  autoDensity?: boolean
}

const props = withDefaults(defineProps<PixiSceneProps>(), {
  width: 800,
  height: 600,
  backgroundColor: 0x1a1a2e,
  antialias: true,
  resolution: () => window.devicePixelRatio || 1,
  autoDensity: true,
})

defineEmits<{
  ready: [app: Application, stage: Container]
}>()

const canvas = ref<HTMLCanvasElement | null>(null)

const { app, stage, isReady } = usePixiApp({
  canvas: toRef(canvas),
  width: props.width,
  height: props.height,
  backgroundColor: props.backgroundColor,
  antialias: props.antialias,
  resolution: props.resolution,
  autoDensity: props.autoDensity,
})

const { scene, addChild, removeChild, clear } = usePixiScene({ stage, isReady })

defineExpose({
  app,
  stage,
  scene,
  isReady,
  addChild,
  removeChild,
  clear,
})
</script>

<template>
  <div class="pixi-scene-container">
    <canvas ref="canvas" />
    <div v-if="!isReady" class="pixi-scene-loading">
      <slot name="loading">
        Loading...
      </slot>
    </div>
  </div>
</template>

<style scoped>
.pixi-scene-container {
  position: relative;
  width: 100%;
  height: 100%;
}

.pixi-scene-container canvas {
  width: 100%;
  height: 100%;
}

.pixi-scene-loading {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.5);
  color: white;
}
</style>
