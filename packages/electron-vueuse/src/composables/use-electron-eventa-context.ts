import type { InvokeEventa } from '@moeru/eventa'
import type { ShallowRef } from 'vue'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { shallowRef } from 'vue'

type EventaContext = ReturnType<typeof createContext>['context']
type IpcRendererLike = Parameters<typeof createContext>[0]

let sharedContext: EventaContext | undefined

function resolveIpcRenderer(ipcRenderer?: IpcRendererLike): IpcRendererLike {
  if (ipcRenderer) {
    return ipcRenderer
  }

  const globalIpcRenderer = (globalThis as { window?: { electron?: { ipcRenderer?: IpcRendererLike } } }).window?.electron?.ipcRenderer
  if (!globalIpcRenderer) {
    throw new Error('Electron ipcRenderer is not available. Pass it explicitly to useElectronEventaContext().')
  }

  return globalIpcRenderer
}

export function getElectronEventaContext(ipcRenderer?: IpcRendererLike): EventaContext {
  sharedContext ??= createContext(resolveIpcRenderer(ipcRenderer)).context
  return sharedContext
}

export function useElectronEventaContext(ipcRenderer?: IpcRendererLike): ShallowRef<EventaContext | undefined> {
  try {
    return shallowRef(getElectronEventaContext(ipcRenderer))
  }
  catch (error) {
    console.warn('[electron-vueuse] IPC bridge unavailable, context will be undefined:', error)
    return shallowRef(undefined)
  }
}

export function useElectronEventaInvoke<Res, Req = undefined, ResErr = Error, ReqErr = Error>(invoke: InvokeEventa<Res, Req, ResErr, ReqErr>, context?: EventaContext) {
  try {
    return defineInvoke(context ?? getElectronEventaContext(), invoke)
  }
  catch (error) {
    // NOTICE: If the Electron IPC bridge is not ready (e.g. preload script
    // delay, dev-tools open before bridge injects), the setup-phase call
    // throws and Vue renders nothing (blank page). Return a no-op invoke
    // so the component still mounts; actual IPC calls will fail at call-site.
    console.warn('[electron-vueuse] IPC bridge unavailable, invoke will be a no-op:', error)
    return (() => Promise.resolve(null)) as any
  }
}

export function resetElectronEventaContextForTesting() {
  sharedContext = undefined
}
