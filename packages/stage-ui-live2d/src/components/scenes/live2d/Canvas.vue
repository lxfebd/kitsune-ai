<script setup lang="ts">
import { Application, Ticker } from 'pixi.js'
import { Live2DModel } from 'pixi-live2d-display/cubism4'
import { onMounted, onUnmounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  width: number
  height: number
  resolution?: number
  maxFps?: number
}>(), {
  resolution: 2,
  maxFps: 0,
})

const componentState = defineModel<'pending' | 'loading' | 'mounted'>('state', { default: 'pending' })

const containerRef = ref<HTMLDivElement>()
const isPixiCanvasReady = ref(false)
const pixiApp = ref<Application>()
const pixiAppCanvas = ref<HTMLCanvasElement>()

function resolveMaxFps(limit?: number) {
  if (!limit || limit <= 0)
    return 0

  return Math.max(1, Math.round(limit))
}

function installRenderGuard(app: Application) {
  let consecutiveErrors = 0
  const MAX_CONSECUTIVE_ERRORS = 5

  const guardedRender = () => {
    try {
      app.render()
      consecutiveErrors = 0
    }
    catch (error) {
      consecutiveErrors++
      console.error(`[Live2D] Pixi render error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}).`, error)
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error('[Live2D] Too many consecutive render errors, stopping ticker.')
        app.ticker.stop()
      }
    }
  }

  app.ticker.remove(app.render, app)
  app.ticker.add(guardedRender)
  app.ticker.maxFPS = resolveMaxFps(props.maxFps)
}

async function initLive2DPixiStage(parent: HTMLDivElement) {
  componentState.value = 'loading'
  isPixiCanvasReady.value = false

  // https://guansss.github.io/pixi-live2d-display/#package-importing
  Live2DModel.registerTicker(Ticker)
  // We handle the interactions (e.g., mouse-based focusing at) manually
  // extensions.add(InteractionManager)

  pixiApp.value = new Application({
    width: props.width * props.resolution,
    height: props.height * props.resolution,
    backgroundAlpha: 0,
    // NOTICE:
    // Required so `captureFrame()` below can read the rendered pixels via
    // `canvas.toBlob()`. WebGL clears the drawing buffer after compositing by
    // default, so without this flag every captured frame would be empty/black.
    //
    // The usual alternative is `app.renderer.plugins.extract.canvas(target)`
    // (returns an HTMLCanvasElement) or `.blob(target)` (returns a Blob), which
    // renders the target into a fresh framebuffer and reads it back with
    // `gl.readPixels`, avoiding the per-frame performance cost (20-40%) of
    // preserving the drawing buffer. That API is NOT available here:
    // `@pixi/extract` is not installed in this workspace (the catalog in
    // pnpm-workspace.yaml only pins `@pixi/app`, and `@pixi/core@6.5.10` does
    // not bundle the Extract plugin), so `renderer.plugins.extract` is
    // `undefined`. The offscreen-canvas + `drawImage` fallback has the same
    // constraint, because reading pixels from a WebGL canvas via `drawImage`
    // also depends on the drawing buffer being preserved.
    //
    // `packages/stage-ui-live2d/src/utils/live2d-preview.ts` uses the same
    // `preserveDrawingBuffer: true` + `toDataURL()` pattern for the same reason.
    //
    // Removal condition: once `@pixi/extract` is added as a dependency and
    // registered via `extensions.add(Extract)`, rewrite `captureFrame()` to use
    // `pixiApp.value.renderer.plugins.extract.canvas(pixiApp.value.stage)` (or
    // `.blob(...)`) and delete this flag.
    preserveDrawingBuffer: true,
    autoDensity: false,
    resolution: 1,
  })

  installRenderGuard(pixiApp.value)
  pixiApp.value.stage.scale.set(props.resolution)

  pixiAppCanvas.value = pixiApp.value.view as HTMLCanvasElement

  // Set CSS styles to make canvas responsive to container
  pixiAppCanvas.value.style.width = '100%'
  pixiAppCanvas.value.style.height = '100%'
  pixiAppCanvas.value.style.objectFit = 'cover'
  pixiAppCanvas.value.style.display = 'block'

  parent.appendChild(pixiApp.value.view as HTMLCanvasElement)

  // Handle WebGL context loss/restore to survive GPU memory pressure
  const canvas = pixiApp.value.view as HTMLCanvasElement
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault()
    console.warn('[Live2D] WebGL context lost.')
    pixiApp.value?.ticker?.stop()
  })
  canvas.addEventListener('webglcontextrestored', () => {
    console.info('[Live2D] WebGL context restored, restarting ticker.')
    // Respect the page-visibility gate so we don't resume rendering in the
    // background (mirrors Spine's `visibilityHidden` gate).
    if (!document.hidden)
      pixiApp.value?.ticker?.start()
  })

  isPixiCanvasReady.value = true
  componentState.value = 'mounted'
}

function handleResize() {
  if (pixiApp.value) {
    // Update the internal rendering resolution
    pixiApp.value.renderer.resize(props.width * props.resolution, props.height * props.resolution)
    pixiApp.value.stage.scale.set(props.resolution)
  }

  // The CSS styles handle the display size, so we don't need to manually set view dimensions
}

watch([() => props.width, () => props.height, () => props.resolution], handleResize)
watch(() => props.maxFps, (limit) => {
  if (pixiApp.value)
    pixiApp.value.ticker.maxFPS = resolveMaxFps(limit)
})

// Pause the Pixi ticker when the page is hidden so the Live2D render loop and
// model animation fully halt in the background (mirrors Spine's
// `visibilityHidden` gate — see packages/stage-ui-spine/.../Model.vue).
function handleVisibilityChange() {
  if (!pixiApp.value)
    return
  if (document.hidden)
    pixiApp.value.ticker.stop()
  else
    pixiApp.value.ticker.start()
}

onMounted(() => document.addEventListener('visibilitychange', handleVisibilityChange))
onMounted(async () => containerRef.value && await initLive2DPixiStage(containerRef.value))
onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  pixiApp.value?.destroy()
})

async function captureFrame() {
  const frame = new Promise<Blob | null>((resolve) => {
    if (!pixiAppCanvas.value || !pixiApp.value)
      return resolve(null)

    try {
      pixiApp.value.render()
    }
    catch (error) {
      console.error('[Live2D] Pixi render error during capture.', error)
      return resolve(null)
    }

    pixiAppCanvas.value.toBlob(resolve)
  })

  return frame
}

function canvasElement() {
  return pixiAppCanvas.value
}

defineExpose({
  captureFrame,
  canvasElement,
})

import.meta.hot?.dispose(() => {
  console.warn('[Dev] Reload on HMR dispose is active for this component. Performing a full reload.')
  window.location.reload()
})
</script>

<template>
  <div ref="containerRef" h-full w-full>
    <slot v-if="isPixiCanvasReady" :app="pixiApp" />
  </div>
</template>
