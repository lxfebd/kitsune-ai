import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

type MainContext = ReturnType<typeof createContext>['context']

/**
 * Auth manager stub: user login/OIDC flows have been removed.
 */
export interface WindowAuthManager {
  registerWindow: (params: { context: MainContext, window: BrowserWindow }) => void
  broadcastAuthCallback: (_tokens: unknown) => void
  broadcastAuthError: (_error: string) => void
}

export function createWindowAuthManagerService(): WindowAuthManager {
  return {
    registerWindow() {},
    broadcastAuthCallback() {},
    broadcastAuthError() {},
  }
}

/**
 * Auth service stub: user login/OIDC flows have been removed.
 */
export function createAuthService(_params: {
  context: MainContext
  window: BrowserWindow
  windowAuthManager: WindowAuthManager
}): void {
  // no-op
}
