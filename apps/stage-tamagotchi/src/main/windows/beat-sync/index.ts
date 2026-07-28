import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { initScreenCaptureForWindow } from '@kitsune/electron-screen-capture/main'
import { BrowserWindow } from 'electron'

import { load } from '../../libs/electron/location'

/**
 * Lazy manager for the BeatSync background window.
 *
 * The window is only created on the first call to {@link ensureWindow},
 * avoiding the audio-capture window startup cost during app boot.
 * Callers that only need the window reference (e.g. dev-only DevTools)
 * should call {@link ensureWindow}; {@link getWindow} returns `undefined`
 * until the window has been created.
 */
export interface BeatSyncWindowManager {
  ensureWindow: () => Promise<BrowserWindow>
  getWindow: () => BrowserWindow | undefined
}

export function setupBeatSync(): BeatSyncWindowManager {
  let window: BrowserWindow | undefined

  async function ensureWindow(): Promise<BrowserWindow> {
    if (window)
      return window

    window = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: join(dirname(fileURLToPath(import.meta.url)), '../preload/beat-sync.mjs'),
        sandbox: false,
      },
    })

    // Beat-sync is a background window that doesn't need the full index.html.
    // Use a minimal blank page in dev so it doesn't block the dependency chain.
    await load(window, { url: 'about:blank' })

    initScreenCaptureForWindow(window)

    return window
  }

  function getWindow(): BrowserWindow | undefined {
    return window
  }

  return { ensureWindow, getWindow }
}
