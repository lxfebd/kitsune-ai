import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/kitsune/channel-server'
import type { McpStdioManager } from '../../services/kitsune/mcp-servers'
import type { WidgetsWindowManager } from '../widgets'

import { join, resolve } from 'node:path'

import { BrowserWindow, shell } from 'electron'
import { isMacOS } from 'std-env'

import icon from '../../../../resources/icon.png?asset'

import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { createReusableWindow } from '../../libs/electron/window-manager'
import { setupChatWindowElectronInvokes } from './rpc/index.electron'

export function setupChatWindowReusableFunc(params: {
  widgetsManager: WidgetsWindowManager
  serverChannel: ServerChannel
  mcpStdioManager: McpStdioManager
  i18n: I18n
}) {
  return createReusableWindow(async () => {
    const window = new BrowserWindow({
      title: 'Chat',
      width: 600.0,
      height: 800.0,
      show: false,
      frame: false,
      titleBarStyle: isMacOS ? 'hidden' : undefined,
      vibrancy: 'under-window',
      backgroundMaterial: 'acrylic',
      backgroundColor: '#00000000',
      transparent: isMacOS,
      icon,
      webPreferences: {
        preload: join(getElectronMainDirname(), '../preload/index.mjs'),
        sandbox: false,
      },
    })

    window.on('ready-to-show', () => window.show())
    window.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    window.webContents.on('ipc-message', (_event, channel) => {
      if (channel === 'chat-window-close') {
        window.close()
      }
      else if (channel === 'chat-window-minimize') {
        window.minimize()
      }
      else if (channel === 'chat-window-maximize') {
        if (window.isMaximized())
          window.unmaximize()
        else
          window.maximize()
      }
    })

    await setupChatWindowElectronInvokes({
      window,
      widgetsManager: params.widgetsManager,
      serverChannel: params.serverChannel,
      mcpStdioManager: params.mcpStdioManager,
      i18n: params.i18n,
    })

    await load(window, withHashRoute(baseUrl(resolve(getElectronMainDirname(), '..', 'renderer')), '/chat'))

    return window
  }).getWindow
}
