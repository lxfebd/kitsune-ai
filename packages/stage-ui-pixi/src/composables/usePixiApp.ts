import type { Ref } from 'vue'

import { onUnmounted, shallowRef, watch } from 'vue'

import { Application, Container } from 'pixi.js'

export interface UsePixiAppOptions {
  canvas: Ref<HTMLCanvasElement | null>
  width?: number
  height?: number
  backgroundColor?: number
  antialias?: boolean
  resolution?: number
  autoDensity?: boolean
}

export interface UsePixiAppReturn {
  app: Ref<Application | null>
  stage: Ref<Container | null>
  isReady: Ref<boolean>
}

/**
 * Composable for managing a Pixi.js Application instance.
 *
 * Creates and manages the lifecycle of a Pixi.js application,
 * automatically cleaning up when the component unmounts.
 *
 * @example
 * ```vue
 * <script setup>
 * import { ref } from 'vue'
 * import { usePixiApp } from '@kitsune/stage-ui-pixi'
 *
 * const canvas = ref(null)
 * const { app, stage, isReady } = usePixiApp({ canvas })
 * </script>
 *
 * <template>
 *   <canvas ref="canvas" />
 * </template>
 * ```
 */
export function usePixiApp(options: UsePixiAppOptions): UsePixiAppReturn {
  const { canvas, width = 800, height = 600, backgroundColor = 0x1a1a2e, antialias = true, resolution = window.devicePixelRatio || 1, autoDensity = true } = options

  const app = shallowRef<Application | null>(null)
  const stage = shallowRef<Container | null>(null)
  const isReady = shallowRef(false)

  async function initPixiApp(canvasElement: HTMLCanvasElement) {
    if (app.value) {
      await app.value.destroy(true)
    }

    const pixiApp = new Application()

    await pixiApp.init({
      canvas: canvasElement,
      width,
      height,
      backgroundColor,
      antialias,
      resolution,
      autoDensity,
    })

    app.value = pixiApp
    stage.value = pixiApp.stage
    isReady.value = true
  }

  watch(canvas, async (newCanvas) => {
    if (newCanvas) {
      await initPixiApp(newCanvas)
    }
  }, { immediate: true })

  onUnmounted(async () => {
    if (app.value) {
      await app.value.destroy(true)
      app.value = null
      stage.value = null
      isReady.value = false
    }
  })

  return {
    app,
    stage,
    isReady,
  }
}
