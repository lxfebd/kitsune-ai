import type { I18n } from '../../libs/i18n'
import type { WindowAuthManager } from '../../services/kitsune/auth'
import type { ServerChannel } from '../../services/kitsune/channel-server'
import type { GodotStageManager } from '../../services/kitsune/godot-stage'
import type { McpStdioManager } from '../../services/kitsune/mcp-servers'
import type { AutoUpdater } from '../../services/electron/auto-updater'
import type { GlobalShortcutService } from '../../services/electron/global-shortcut'
import type { DevtoolsWindowManager } from '../devtools'
import type { SpotlightWindowManager } from '../spotlight'
import type { WidgetsWindowManager } from '../widgets'

import { join, resolve } from 'node:path'

import { initScreenCaptureForWindow } from '@kitsune/electron-screen-capture/main'
import { BrowserWindow, shell } from 'electron'
import { isMacOS } from 'std-env'

import icon from '../../../../resources/icon.png?asset'

import { electronSettingsNavigate } from '../../../shared/eventa'
import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { createReusableWindow } from '../../libs/electron/window-manager'
import { toggleWindowShow } from '../shared'
import { setupSettingsWindowInvokes } from './rpc/index.electron'

export interface SettingsWindowManager {
  getWindow: () => Promise<BrowserWindow>
  openWindow: (route?: string) => Promise<void>
}

export function setupSettingsWindowReusableFunc(params: {
  widgetsManager: WidgetsWindowManager
  autoUpdater: AutoUpdater
  devtoolsWindow: DevtoolsWindowManager
  onWindowCreated?: (window: BrowserWindow) => void
  serverChannel: ServerChannel
  godotStageManager: GodotStageManager
  mcpStdioManager: McpStdioManager
  i18n: I18n
  windowAuthManager: WindowAuthManager
  globalShortcut: GlobalShortcutService
  spotlightWindow: SpotlightWindowManager
}): SettingsWindowManager {
  const rendererBase = baseUrl(resolve(getElectronMainDirname(), '..', 'renderer'))
  const defaultRoute = '/settings/models'
  let currentRoute = defaultRoute
  let settingsContext: Awaited<ReturnType<typeof setupSettingsWindowInvokes>> | undefined

  const reusable = createReusableWindow(async () => {
    const window = new BrowserWindow({
      title: 'Settings',
      width: 900.0,
      height: 640.0,
      show: false,
      frame: false,
      skipTaskbar: false,
      titleBarStyle: isMacOS ? 'hidden' : undefined,
      vibrancy: 'under-window',
      backgroundMaterial: 'acrylic',
      backgroundColor: '#00000000',
      transparent: isMacOS,
      icon,
      webPreferences: {
        preload: join(getElectronMainDirname(), '../preload/index.mjs'),
        sandbox: false,
        // NOTICE: Required for @huggingface/transformers to download ONNX models via fetch()
        // in Web Workers. Without this, Chromium blocks cross-origin requests from file:// origin.
        // Removal condition: When models are exclusively served from localhost or custom protocol.
        webSecurity: false,
      },
    })

    window.setMenuBarVisibility(false)

    if (params.onWindowCreated) {
      params.onWindowCreated(window)
    }

    window.on('ready-to-show', () => window.show())
    window.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    window.webContents.on('ipc-message', (_event, channel) => {
      if (channel === 'settings-window-close') {
        window.close()
      }
      else if (channel === 'settings-window-minimize') {
        window.minimize()
      }
      else if (channel === 'settings-window-maximize') {
        if (window.isMaximized())
          window.unmaximize()
        else
          window.maximize()
      }
    })

    settingsContext = await setupSettingsWindowInvokes({
      settingsWindow: window,
      widgetsManager: params.widgetsManager,
      autoUpdater: params.autoUpdater,
      devtoolsWindow: params.devtoolsWindow,
      serverChannel: params.serverChannel,
      godotStageManager: params.godotStageManager,
      mcpStdioManager: params.mcpStdioManager,
      i18n: params.i18n,
      windowAuthManager: params.windowAuthManager,
      globalShortcut: params.globalShortcut,
      spotlightWindow: params.spotlightWindow,
    })

    await load(window, withHashRoute(rendererBase, currentRoute))

    window.on('closed', () => {
      if (settingsContext)
        settingsContext = undefined
    })

    initScreenCaptureForWindow(window)

    return window
  })

  async function openWindow(route?: string) {
    if (route) {
      currentRoute = route
    }

    const window = await reusable.getWindow()

    if (route && settingsContext) {
      settingsContext.emit(electronSettingsNavigate, { route })
    }

    toggleWindowShow(window)
  }

  return {
    getWindow: reusable.getWindow,
    openWindow,
  }
}
