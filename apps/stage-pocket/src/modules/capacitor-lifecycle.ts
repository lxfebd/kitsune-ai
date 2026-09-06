import type { App } from 'vue'

import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'

/**
 * Capacitor lifecycle integration for mobile apps.
 *
 * Handles app state changes, status bar configuration, and splash screen.
 * Only runs on native platforms (iOS/Android); web builds are unaffected.
 */
export function installCapacitorLifecycle(app: App) {
  if (!Capacitor.isNativePlatform())
    return

  // Configure status bar
  void configureStatusBar()

  // Hide splash screen after app is ready
  void hideSplashScreen()

  // Register app state listeners
  registerAppStateListeners(app)
}

async function configureStatusBar() {
  try {
    await StatusBar.setStyle({ style: Style.Dark })
    await StatusBar.setBackgroundColor({ color: '#00000000' })
  }
  catch (error) {
    console.warn('[capacitor-lifecycle] Failed to configure status bar:', error)
  }
}

async function hideSplashScreen() {
  try {
    await SplashScreen.hide()
  }
  catch (error) {
    console.warn('[capacitor-lifecycle] Failed to hide splash screen:', error)
  }
}

function registerAppStateListeners(app: App) {
  CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    app.config.globalProperties.$emit('app:stateChange', isActive)
  })

  CapacitorApp.addListener('appUrlOpen', (data) => {
    app.config.globalProperties.$emit('app:urlOpen', data)
  })

  CapacitorApp.addListener('appRestoredResult', (data) => {
    app.config.globalProperties.$emit('app:restoredResult', data)
  })

  CapacitorApp.addListener('backButton', ({ canGoBack }) => {
    app.config.globalProperties.$emit('app:backButton', canGoBack)
  })
}

/**
 * Check if the app is running on a native platform.
 */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform()
}

/**
 * Get the current platform (ios, android, web).
 */
export function getPlatform(): string {
  return Capacitor.getPlatform()
}
