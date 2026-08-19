import { defineInvoke } from '@moeru/eventa'
import { bounds, startLoopGetBounds } from '@kitsune/electron-eventa'
import { ref } from 'vue'

import { getElectronEventaContext } from './use-electron-eventa-context'

const windowBoundsX = ref(0)
const windowBoundsY = ref(0)
const windowBoundsWidth = ref(0)
const windowBoundsHeight = ref(0)

let initialized = false

function initializeWindowBoundsTracking() {
  if (initialized) {
    return
  }

  initialized = true

  let context: ReturnType<typeof getElectronEventaContext> | undefined
  try {
    context = getElectronEventaContext()
  }
  catch (error) {
    // NOTICE: In non-Electron environments (browser preview / tests) there is no
    // ipcRenderer; window bounds simply stay at their initial defaults.
    console.warn('[electron-vueuse] IPC bridge unavailable, window bounds tracking disabled.', error)
    return
  }

  context.on(bounds, (event) => {
    if (!event || !event.body)
      return

    windowBoundsX.value = event.body.x
    windowBoundsY.value = event.body.y
    windowBoundsWidth.value = event.body.width
    windowBoundsHeight.value = event.body.height
  })

  void defineInvoke(context, startLoopGetBounds)()
}

export function useElectronWindowBounds() {
  initializeWindowBoundsTracking()

  return {
    x: windowBoundsX,
    y: windowBoundsY,
    width: windowBoundsWidth,
    height: windowBoundsHeight,
  }
}
