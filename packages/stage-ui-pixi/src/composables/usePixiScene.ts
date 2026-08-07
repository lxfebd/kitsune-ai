import type { Ref } from 'vue'

import { Container } from 'pixi.js'
import { onUnmounted, shallowRef, watch } from 'vue'

export interface UsePixiSceneOptions {
  stage: Ref<Container | null>
  isReady: Ref<boolean>
}

export interface UsePixiSceneReturn {
  scene: Ref<Container | null>
  addChild: (child: Container) => void
  removeChild: (child: Container) => void
  clear: () => void
}

/**
 * Composable for managing a Pixi.js scene container.
 *
 * Provides a convenient way to manage child containers within a Pixi.js scene,
 * with automatic cleanup on unmount.
 *
 * @example
 * ```vue
 * <script setup>
 * import { usePixiApp, usePixiScene } from '@kitsune/stage-ui-pixi'
 *
 * const canvas = ref(null)
 * const { stage, isReady } = usePixiApp({ canvas })
 * const { scene, addChild, removeChild } = usePixiScene({ stage, isReady })
 * </script>
 * ```
 */
export function usePixiScene(options: UsePixiSceneOptions): UsePixiSceneReturn {
  const { stage, isReady } = options

  const scene = shallowRef<Container | null>(null)

  function createScene() {
    if (scene.value) {
      scene.value.destroy({ children: true })
    }

    const container = new Container()
    container.label = 'scene'
    scene.value = container
  }

  function addChild(child: Container) {
    if (scene.value) {
      scene.value.addChild(child)
    }
  }

  function removeChild(child: Container) {
    if (scene.value) {
      scene.value.removeChild(child)
    }
  }

  function clear() {
    if (scene.value) {
      scene.value.removeChildren().forEach(child => child.destroy())
    }
  }

  watch(isReady, (ready) => {
    if (ready && stage.value) {
      createScene()
      if (scene.value) {
        stage.value.addChild(scene.value)
      }
    }
  }, { immediate: true })

  onUnmounted(() => {
    if (scene.value) {
      scene.value.destroy({ children: true })
      scene.value = null
    }
  })

  return {
    scene,
    addChild,
    removeChild,
    clear,
  }
}
