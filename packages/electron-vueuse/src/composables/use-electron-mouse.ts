import type { UseMouseOptions } from '@vueuse/core'

import { defineInvoke } from '@moeru/eventa'
import { cursorScreenPoint, startLoopGetCursorScreenPoint } from '@kitsune/electron-eventa'
import { useMouse } from '@vueuse/core'
import { ref } from 'vue'

import { getElectronEventaContext } from './use-electron-eventa-context'

let sharedEventTarget: EventTarget | undefined
let startedTracking = false

export function useElectronMouseEventTarget() {
  let context: ReturnType<typeof getElectronEventaContext> | undefined
  try {
    context = getElectronEventaContext()
  }
  catch (error) {
    // NOTICE: In non-Electron environments (browser preview / tests) there is no
    // ipcRenderer. Return a bare EventTarget so useMouse still works; cursor
    // events simply never arrive from the main process.
    console.warn('[electron-vueuse] IPC bridge unavailable, cursor tracking disabled.', error)
    sharedEventTarget ??= new EventTarget()
    return ref(sharedEventTarget)
  }

  if (!sharedEventTarget) {
    sharedEventTarget = new EventTarget()

    context.on(cursorScreenPoint, (event) => {
      const e = new MouseEvent('mousemove', { screenX: event.body?.x, screenY: event.body?.y })
      sharedEventTarget?.dispatchEvent(e)
    })
  }

  if (!startedTracking) {
    startedTracking = true
    void defineInvoke(context, startLoopGetCursorScreenPoint)()
  }

  return ref(sharedEventTarget)
}

export function useElectronMouse(options?: UseMouseOptions) {
  const eventTarget = useElectronMouseEventTarget()
  return useMouse({ ...options, target: eventTarget, type: 'screen' })
}
