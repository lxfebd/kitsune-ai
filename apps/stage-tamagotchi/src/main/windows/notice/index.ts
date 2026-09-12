import type { BrowserWindow } from 'electron'

import type { RequestWindowPayload } from '../../../shared/eventa'
import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/kitsune/channel-server'

import { join, resolve } from 'node:path'

import { defineInvokeHandler } from '@moeru/eventa'
import { safeClose } from '@kitsune/electron-vueuse/main'
import { BrowserWindow as ElectronBrowserWindow, shell } from 'electron'

import icon from '../../../../resources/icon.png?asset'

import { noticeWindowEventa } from '../../../shared/eventa'
import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { createReferencedWindowManager } from '../shared/referenced-window'

export interface NoticeWindowManager {
  open: (payload: RequestWindowPayload) => Promise<boolean>
}

export function setupNoticeWindowManager(params: {
  i18n: I18n
  serverChannel: ServerChannel
}): NoticeWindowManager {
  const rendererBase = baseUrl(resolve(getElectronMainDirname(), '..', 'renderer'))

  function createWindow(_id: string): BrowserWindow {
    const window = new ElectronBrowserWindow({
      title: 'Notice',
      width: 1020,
      height: 600,
      show: false,
      icon,
      webPreferences: {
        preload: join(getElectronMainDirname(), '../preload/index.mjs'),
        sandbox: false,
      },
    })

    window.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    return window
  }

  async function loadNoticeRoute(window: BrowserWindow, payload: RequestWindowPayload & { id: string }) {
    const routeWithId = `${payload.route}?id=${payload.id}`
    await load(window, withHashRoute(rendererBase, routeWithId))
  }

  const manager = createReferencedWindowManager({
    eventa: noticeWindowEventa,
    i18n: params.i18n,
    serverChannel: params.serverChannel,
    createWindow,
    loadRoute: loadNoticeRoute,
  })

  return {
    open: async (payload: RequestWindowPayload) => {
      const handle = await manager.open(payload)
      return await new Promise<boolean>((resolve) => {
        // NOTICE: The notice page resolves this promise only when the user
        // clicks a confirm/cancel button (windowAction). If the window is
        // closed any other way (e.g. the OS close button), no action is ever
        // sent and the caller's await would hang forever. Resolve as "not
        // confirmed" when the underlying window session is disposed, with a
        // timeout as a final safety net.
        let settled = false
        let windowClosedTimeout: ReturnType<typeof setTimeout> | undefined

        const finish = (confirmed: boolean) => {
          if (settled)
            return
          settled = true
          clearTimeout(windowClosedTimeout)
          resolve(confirmed)
        }

        windowClosedTimeout = setTimeout(() => {
          safeClose(handle.window)
          finish(false)
        }, 60_000)

        const offline = handle.sessionDisposed(() => finish(false))

        defineInvokeHandler(handle.context, noticeWindowEventa.windowAction, (action) => {
          if (!action?.id || action.id !== handle.id)
            return
          offline()
          finish(action.action === 'confirm')
          safeClose(handle.window)
        })
      })
    },
  }
}
