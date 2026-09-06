import type EventEmitter from 'node:events'

import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

import { electronEvents } from '@kitsune/electron-eventa'
import { powerMonitor } from 'electron'

import { onAppBeforeQuit } from '../../libs/bootkit/lifecycle'

// 单例标志：powerMonitor 是进程级全局对象，事件只需注册一次。
// createPowerMonitorService 会在每个窗口创建时被调用，若不加以限制，
// 多窗口场景下 suspend/resume/lock-screen/unlock-screen 4 个事件会被重复订阅 N 次。
let initialized = false

export function createPowerMonitorService(params: { context: ReturnType<typeof createContext>['context'], window: BrowserWindow }) {
  // 单例判断：仅首次调用时注册事件，后续调用直接返回，避免重复订阅。
  if (initialized)
    return
  initialized = true

  function onOff<EM extends EventEmitter, E extends string>(eventEmitter: EM, event: E, listener: Parameters<EM['on']>[1]) {
    eventEmitter.on(event, listener)
    onAppBeforeQuit(() => {
      eventEmitter.off(event, listener)
    })
  }

  onOff(powerMonitor, 'suspend', () => params.context.emit(electronEvents.powerMonitor.suspended, undefined))
  onOff(powerMonitor, 'resume', () => params.context.emit(electronEvents.powerMonitor.resumed, undefined))
  onOff(powerMonitor, 'lock-screen', () => params.context.emit(electronEvents.powerMonitor.lockScreen, undefined))
  onOff(powerMonitor, 'unlock-screen', () => params.context.emit(electronEvents.powerMonitor.unlockScreen, undefined))
}
