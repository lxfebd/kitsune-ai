import type { Rectangle } from 'electron'
import type { InferOutput } from 'valibot'

import type { I18n } from '../../libs/i18n'
import type { WindowAuthManager } from '../../services/kitsune/auth'
import type { ServerChannel } from '../../services/kitsune/channel-server'
import type { GodotStageManager } from '../../services/kitsune/godot-stage'
import type { McpStdioManager } from '../../services/kitsune/mcp-servers'
import type { AutoUpdater } from '../../services/electron/auto-updater'
import type { NoticeWindowManager } from '../notice'
import type { OnboardingWindowManager } from '../onboarding'
import type { SettingsWindowManager } from '../settings'
import type { WidgetsWindowManager } from '../widgets'

import { dirname, join, resolve } from 'node:path'
import { env } from 'node:process'
import { fileURLToPath } from 'node:url'

import clickDragPlugin from 'electron-click-drag-plugin'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { initScreenCaptureForWindow } from '@kitsune/electron-screen-capture/main'
import { defu } from 'defu'
import { app, BrowserWindow, ipcMain, Menu, screen, shell } from 'electron'
import { isLinux, isMacOS } from 'std-env'
import { array, number, object, optional, string } from 'valibot'

import icon from '../../../../resources/icon.png?asset'

import { electronStartDraggingWindow } from '../../../shared/eventa'
import { onAppBeforeQuit } from '../../libs/bootkit/lifecycle'
import { baseUrl, getElectronMainDirname } from '../../libs/electron/location'
import { createConfig } from '../../libs/electron/persistence'
import { toggleWindowShow, transparentWindowConfig } from '../shared'
import { setupMainWindowElectronInvokes } from './rpc/index.electron'

const appConfigSchema = object({
  windows: optional(array(object({
    title: optional(string()),
    tag: string(),
    x: optional(number()),
    y: optional(number()),
    width: optional(number()),
    height: optional(number()),
  }))),
})

type AppConfig = InferOutput<typeof appConfigSchema>

// NOTICE:
// Main window may restore a size/position larger than the display's work area
// (e.g. a previous oversized session persisted into app config.json). When the
// window is taller than the visible work area, the bottom controls island is
// pushed off-screen and becomes unreachable.
//
// Why we measure from the renderer instead of `screen.getDisplayMatching(bounds)`:
// on Windows with DPI scaling, `screen.workArea` is reported in physical pixels
// while `BrowserWindow.getBounds()` is in DIP (CSS) pixels. Comparing them
// directly (min() no-ops) let an oversized 815px window survive, cutting off the
// whole controls island. Querying `window.screen.availHeight` (physical) and
// `devicePixelRatio` from the renderer and dividing gives the DIP work area in
// the same unit as getBounds(), making the clamp reliable.
// Removal condition: When main-window sizing is changed to always fit the display.
async function clampWindowToWorkArea(window: BrowserWindow): Promise<void> {
  if (window.isDestroyed())
    return
  const bounds = window.getBounds()
  if (bounds.width === 0 || bounds.height === 0)
    return

  let maxWidth = bounds.width
  let maxHeight = bounds.height
  try {
    const view = await window.webContents.executeJavaScript(
      `({ availW: window.screen.availWidth, availH: window.screen.availHeight, dpr: window.devicePixelRatio })`,
      true,
    ) as { availW: number, availH: number, dpr: number }
    // Physical -> DIP so it is comparable with getBounds() units.
    maxWidth = Math.round(view.availW / view.dpr)
    maxHeight = Math.round(view.availH / view.dpr)
  }
  catch (err) {
    // Renderer not ready yet; fall back to a DIP approximation of the work area.
    console.warn('[main-window] clamp fallback to screen module:', err)
    const area = screen.getDisplayMatching(bounds).workArea
    maxWidth = area.width
    maxHeight = area.height
  }

  const width = Math.min(bounds.width, maxWidth)
  const height = Math.min(bounds.height, maxHeight)
  const area = screen.getDisplayMatching(bounds).workArea
  const x = Math.min(Math.max(bounds.x, area.x), area.x + area.width - width)
  const y = Math.min(Math.max(bounds.y, area.y), area.y + area.height - height)
  if (x === bounds.x && y === bounds.y && width === bounds.width && height === bounds.height)
    return
  window.setBounds({ x, y, width, height })
}

export async function setupMainWindow(params: {
  settingsWindow: SettingsWindowManager
  chatWindow: () => Promise<BrowserWindow>
  widgetsManager: WidgetsWindowManager
  noticeWindow: NoticeWindowManager
  autoUpdater: AutoUpdater
  aboutWindow: () => Promise<BrowserWindow>
  onWindowCreated?: (window: BrowserWindow) => void
  serverChannel: ServerChannel
  godotStageManager: GodotStageManager
  mcpStdioManager: McpStdioManager
  i18n: I18n
  onboardingWindowManager: OnboardingWindowManager
  windowAuthManager: WindowAuthManager
}) {
  const {
    setup: setupConfig,
    get: getConfigRaw,
    update: updateConfig,
  } = createConfig('app', 'config.json', appConfigSchema, {
    default: { windows: [] },
    autoHeal: true,
  })
  const getConfig = (): AppConfig => getConfigRaw() ?? { windows: [] }

  setupConfig()

  const mainWindowConfig = getConfig().windows?.find(w => w.title === 'Kitsune' && w.tag === 'main')

  const window = new BrowserWindow({
    title: 'Kitsune',
    width: mainWindowConfig?.width ?? 450.0,
    height: mainWindowConfig?.height ?? 600.0,
    x: mainWindowConfig?.x,
    y: mainWindowConfig?.y,
    show: false,
    icon,
    webPreferences: {
      preload: join(dirname(fileURLToPath(import.meta.url)), '../preload/index.mjs'),
      sandbox: false,
      // NOTICE: Required for @huggingface/transformers to download ONNX models via fetch()
      // in Web Workers. Without this, Chromium blocks cross-origin requests from file:// origin.
      // Removal condition: When models are exclusively served from localhost or custom protocol.
      webSecurity: false,
    },
    // Thanks to [@HeartArmy](https://github.com/HeartArmy) for the tip implementation.
    //
    // https://github.com/electron/electron/issues/10078#issuecomment-3410164802
    // https://stackoverflow.com/questions/39835282/set-browserwindow-always-on-top-even-other-app-is-in-fullscreen-electron-mac
    type: 'panel',
    ...transparentWindowConfig(),
  })

  if (params.onWindowCreated) {
    params.onWindowCreated(window)
  }

  // 右键菜单：在桌宠上右键提供设置/切换模型/退出等快捷操作
  window.webContents.on('context-menu', () => {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '设置',
        click: () => void params.settingsWindow.openWindow('/settings'),
      },
      {
        label: '切换模型',
        click: () => void params.settingsWindow.openWindow('/settings/models'),
      },
      { type: 'separator' },
      {
        label: '关于',
        click: () => params.aboutWindow().then(w => toggleWindowShow(w)),
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          allowClose = true
          app.quit()
        },
      },
    ])
    contextMenu.popup({ window })
  })

  let allowClose = false
  onAppBeforeQuit(() => {
    allowClose = true
  })

  // NOTICE: in development mode, open devtools by default
  const isDevMode = env.ELECTRON_RENDERER_URL || env.MAIN_APP_DEBUG || env.APP_DEBUG
  if (isDevMode) {
    try {
      window.webContents.openDevTools({ mode: 'detach' })
    }
    catch (err) {
      console.error('failed to open devtools:', err)
    }
  }

  function handleNewBounds(newBounds: Rectangle) {
    const config = getConfig()
    if (!config.windows || !Array.isArray(config.windows)) {
      config.windows = []
    }

    const existingConfigIndex = config.windows.findIndex(w => w.title === 'Kitsune' && w.tag === 'main')

    if (existingConfigIndex === -1) {
      config.windows.push({
        title: 'Kitsune',
        tag: 'main',
        x: newBounds.x,
        y: newBounds.y,
        width: newBounds.width,
        height: newBounds.height,
      })
    }
    else {
      const mainWindowConfig = defu(config.windows[existingConfigIndex], { title: 'Kitsune', tag: 'main' })

      mainWindowConfig.x = newBounds.x
      mainWindowConfig.y = newBounds.y
      mainWindowConfig.width = newBounds.width
      mainWindowConfig.height = newBounds.height

      config.windows[existingConfigIndex] = mainWindowConfig
    }

    updateConfig(config)
  }

  // NOTICE: Debounce resize so we only persist the final size after the user
  // finishes dragging, not every intermediate frame. This prevents mid-gesture
  // bounds from being persisted and avoids fighting with the clamp below.
  let resizePersistTimer: NodeJS.Timeout | undefined
  window.on('resize', () => {
    clearTimeout(resizePersistTimer)
    resizePersistTimer = setTimeout(() => handleNewBounds(window.getBounds()), 300)
  })
  window.on('move', () => {
    clearTimeout(resizePersistTimer)
    resizePersistTimer = setTimeout(() => handleNewBounds(window.getBounds()), 300)
  })
  // NOTICE: Do NOT clamp on every resize event. `clampWindowToWorkArea` resolves
  // the DIP work area from the renderer, which has rounding differences vs the
  // real work area; running it on every resize would call setBounds on slight
  // discrepancies, which fires resize again and produces an endless
  // grow/shrink feedback loop (the "pulsing window" symptom). Clamp once on
  // ready-to-show / did-finish-load (see below) and otherwise trust the user's
  // manual resize.
  window.on('close', (event) => {
    if (allowClose) {
      return
    }

    event.preventDefault()
    window.hide()
  })

  // Thanks to [@HeartArmy](https://github.com/HeartArmy) for the tip implementation.
  //
  // https://github.com/electron/electron/issues/10078#issuecomment-3410164802
  // https://stackoverflow.com/questions/39835282/set-browserwindow-always-on-top-even-other-app-is-in-fullscreen-electron-mac
  window.setAlwaysOnTop(true, 'screen-saver', 1)
  window.setFullScreenable(false)
  window.setVisibleOnAllWorkspaces(true)
  if (isMacOS) {
    window.setWindowButtonVisibility(false)
  }

  window.on('ready-to-show', () => {
    clampWindowToWorkArea(window).then(() => window!.show())
    window!.show()
  })
  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  await setupMainWindowElectronInvokes({
    window,
    settingsWindow: params.settingsWindow,
    chatWindow: params.chatWindow,
    widgetsManager: params.widgetsManager,
    noticeWindow: params.noticeWindow,
    autoUpdater: params.autoUpdater,
    serverChannel: params.serverChannel,
    godotStageManager: params.godotStageManager,
    mcpStdioManager: params.mcpStdioManager,
    i18n: params.i18n,
    onboardingWindowManager: params.onboardingWindowManager,
    windowAuthManager: params.windowAuthManager,
  })

  // NOTICE: Non-blocking renderer load to avoid blocking window display (R2).
  // The previous `await load(...)` waited for the renderer to fully load before
  // continuing, which delayed window display. We now call loadURL/loadFile
  // directly without awaiting and defer post-load initialization to the
  // did-finish-load callback so the window can show as soon as ready-to-show fires.
  const urlConfig = baseUrl(resolve(getElectronMainDirname(), '..', 'renderer'))
  if ('url' in urlConfig) {
    window.loadURL(urlConfig.url, urlConfig.options).catch(error => console.error('failed to load main window:', error))
  }
  else {
    window.loadFile(urlConfig.file, urlConfig.options).catch(error => console.error('failed to load main window:', error))
  }

  window.webContents.once('did-finish-load', () => {
    clampWindowToWorkArea(window)
    /**
     * This is a know issue (or expected behavior maybe) to Electron.
     *
     * Discussion: https://github.com/electron/electron/issues/37789
     * Workaround: https://github.com/noobfromph/electron-click-drag-plugin
     */
    if (!isLinux) {
      function handleStartDraggingWindow() {
        try {
          const windowId = window.getNativeWindowHandle()
          clickDragPlugin.startDrag(windowId)
        }
        catch (error) {
          console.error(error)
        }
      }

      // TODO: once we refactored eventa to support window-namespaced contexts,
      // we can remove the setMaxListeners call below since eventa will be able to dispatch and
      // manage events within eventa's context system.
      ipcMain.setMaxListeners(0)

      const { context } = createContext(ipcMain, window)
      const cleanUpWindowDraggingInvokeHandler = defineInvokeHandler(context, electronStartDraggingWindow, handleStartDraggingWindow)

      window.on('closed', () => {
        cleanUpWindowDraggingInvokeHandler()
      })
    }

    initScreenCaptureForWindow(window)
  })

  return window
}
