/**
 * @kitsune/desktop-platform
 *
 * 跨平台桌面自动化底层实现，供桌宠主进程 (apps/stage-tamagotchi) 与
 * computer-use-mcp 服务共享，消除两份互相独立的桌面控制实现。
 *
 * 平台实现：
 * - win32: koffi FFI 直接调 user32.dll / kernel32.dll（不依赖 PowerShell/.NET/COM）
 * - darwin: osascript (AppleScript/JXA) + cliclick
 * - linux: xdotool + wmctrl
 */

export type { PlatformAutomation, PlatformOptions, WindowInfo } from './platform/index'
export type { PlatformType } from './platform/factory'
export { createPlatformAutomation, isPlatformSupported, getCurrentPlatform } from './platform/factory'
export { WindowsKoffiAutomation } from './platform/windows-koffi'
export { MacAutomation } from './platform/macos'
export { LinuxAutomation } from './platform/linux'
export { enumerateWindows } from './platform/window-enumerator'
export type { EnumeratedWindow, Rect } from './platform/window-enumerator'