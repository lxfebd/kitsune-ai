import type { BrowserWindow } from 'electron'

import type { FileLoggerHandle } from './app/file-logger'

import { execSync } from 'node:child_process'
import process, { env, platform } from 'node:process'

import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import messages from '@kitsune/i18n/locales'

import { electronApp, optimizer } from '@electron-toolkit/utils'
import { Format, LogLevel, setGlobalFormat, setGlobalHookPostLog, setGlobalLogLevel, useLogg } from '@guiiai/logg'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { defineInvokeHandler, defineStreamInvokeHandler } from '@moeru/eventa'
import { initScreenCaptureForMain } from '@kitsune/electron-screen-capture/main'
import { app, dialog, ipcMain, session } from 'electron'
import { noop } from 'es-toolkit'
import { createLoggLogger, injeca, lifecycle } from 'injeca'
import { errorMessageFrom } from '@moeru/std'
import { isLinux } from 'std-env'

import icon from '../../resources/icon.png?asset'

import { openDebugger, setupDebugger } from './app/debugger'
import { nullFileLoggerHandle, setupFileLogger } from './app/file-logger'
import { initFileLogger } from './services/kitsune/logger'
import { installSingleInstanceGuard } from './app/single-instance'
import { createArtistryConfig } from './configs/artistry'
import { createGlobalAppConfig } from './configs/global'
import type { OverseerService } from './services/kitsune/overseer'
import type { SidecarService } from './services/kitsune/sidecar'
import { emitAppBeforeQuit, emitAppReady, emitAppWindowAllClosed } from './libs/bootkit/lifecycle'
import { setElectronMainDirname } from './libs/electron/location'
import { createI18n } from './libs/i18n'
import { createWindowAuthManagerService } from './services/kitsune/auth'
import { setupServerChannel } from './services/kitsune/channel-server'
import { setupBuiltInServer } from './services/kitsune/http-server'
import { setupAutoUpdater } from './services/electron/auto-updater'
import { setupGlobalShortcutService } from './services/electron/global-shortcut'
import { setupTray } from './tray'
import { setupAboutWindowReusable } from './windows/about'
import { setupBeatSync } from './windows/beat-sync'
import { setupCaptionWindowManager } from './windows/caption'
import { setupChatWindowReusableFunc } from './windows/chat'
import { isDesktopOverlayEnabled } from './windows/desktop-overlay/is-desktop-overlay-enabled'
import { type DevtoolsWindowManager, setupDevtoolsWindow } from './windows/devtools'
import { registerLive2dModelIpc } from './libs/live2d-file-server'
import { hasLocalModels, startModelFileServer } from './libs/model-file-server'
import { setupMainWindow } from './windows/main'
import { setupNoticeWindowManager } from './windows/notice'
import { setupOnboardingWindowManager } from './windows/onboarding'
import { setupSettingsWindowReusableFunc } from './windows/settings'
import { setupSpotlightWindowManager } from './windows/spotlight'
import { setupWidgetsWindowManager } from './windows/widgets'
import {
  electronComfyuiSetConfig,
  electronComfyuiStart,
  electronComfyuiStatus,
  electronComfyuiStatusChanged,
  electronComfyuiStop,
  electronDialogChooseDirectory,
  electronDialogChooseFile,
  electronSidecarStatusChanged,
  electronTtsCloneVoice,
  electronTtsCurrentEngine,
  electronTtsGetEngines,
  electronTtsListVoices,
  electronTtsImportVoicePack,
  electronTtsDeleteVoice,
  electronTtsRemoveVoice,
  electronTtsSetConfig,
  electronTtsSetEngine,
  electronTtsStart,
  electronTtsStop,
  electronTtsSynthesize,
  electronTtsStream,
  electronTtsGetConfig,
} from '../shared/eventa'

// TODO: once we refactored eventa to support window-namespaced contexts,
// we can remove the setMaxListeners call below since eventa will be able to dispatch and
// manage events within eventa's context system.
ipcMain.setMaxListeners(100)

setElectronMainDirname(dirname(fileURLToPath(import.meta.url)))

// NOTICE:
// Set Windows console code page to UTF-8 so Chinese characters and emojis
// display correctly in the terminal. Without this, PowerShell uses the
// system default code page 936 (GBK), which garbles UTF-8 output from
// Node.js console.log (e.g. "启动" → "鍚", "合成" → "鍚堟垚", 🚀 → "馃殌").
if (process.platform === 'win32') {
  try { execSync('chcp 65001', { stdio: 'ignore' }) }
  catch { /* non-critical, ignore if chcp is unavailable */ }
}

// Swallow EPIPE errors from console.log when pipe closes (e.g. terminal disconnect)
const originalConsoleLog = console.log.bind(console)
console.log = (...args: unknown[]) => {
  try { originalConsoleLog(...args) }
  catch { /* EPIPE when pipe closes */ }
}

setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Log)
setupDebugger()

const log = useLogg('main').useGlobalConfig()

const appUserDataPath = env.APP_USER_DATA_PATH?.trim()
if (appUserDataPath) {
  app.setPath('userData', appUserDataPath)
}

// Thanks to [@blurymind](https://github.com/blurymind),
//
// When running Electron on Linux, navigator.gpu.requestAdapter() fails.
// In order to enable WebGPU and process the shaders fast enough, we need the following
// command line switches to be set.
//
// https://github.com/electron/electron/issues/41763#issuecomment-2051725363
// https://github.com/electron/electron/issues/41763#issuecomment-3143338995
if (isLinux) {
  app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer')
  app.commandLine.appendSwitch('enable-unsafe-webgpu')
  app.commandLine.appendSwitch('enable-features', 'Vulkan')

  // NOTICE: we need UseOzonePlatform, WaylandWindowDecorations for working on Wayland.
  // Partially related to https://github.com/electron/electron/issues/41551, since X11 is deprecating now,
  // we can safely remove the feature flags for Electron once they made it default supported.
  // Fixes: https://github.com/kitsune-ai/kitsune-ai/issues/757
  // Ref: https://github.com/mmaura/poe2linuxcompanion/blob/90664607a147ea5ccea28df6139bd95fb0ebab0e/electron/main/index.ts#L28-L46
  if (env.XDG_SESSION_TYPE === 'wayland') {
    app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal')

    app.commandLine.appendSwitch('enable-features', 'UseOzonePlatform')
    app.commandLine.appendSwitch('enable-features', 'WaylandWindowDecorations')
  }
}

app.dock?.setIcon(icon)
electronApp.setAppUserModelId('ai.kitsune.desktop')

// Track the real user-facing Kitsune window because the process also owns hidden utility windows.
// The second-instance handler should restore the main UI instead of accidentally surfacing internals.
let userFacingMainWindow: BrowserWindow | undefined
const shouldStartMainProcess = installSingleInstanceGuard({ app, getWindow: () => userFacingMainWindow })

if (shouldStartMainProcess) {
  initScreenCaptureForMain()
}

let fileLogger: FileLoggerHandle = nullFileLoggerHandle
let skipFileLogging = false

app.whenReady().then(async () => {
  if (!shouldStartMainProcess) {
    return
  }

  // NOTICE: @huggingface/transformers downloads ONNX models via fetch() in Web Workers.
  // Chromium enforces CORS even with `webSecurity: false` on Workers.
  // We inject Access-Control-Allow-Origin headers into responses from model CDNs,
  // so the Worker's fetch passes CORS checks.
  // Removal condition: When models are exclusively served from localhost or custom protocol.
  const HF_HOSTS = ['hf-mirror.com', 'huggingface.co']
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const url = details.url
    const responseHeaders = details.responseHeaders
    if (responseHeaders && HF_HOSTS.some(host => url.includes(host))) {
      responseHeaders['access-control-allow-origin'] = ['*']
      responseHeaders['access-control-allow-methods'] = ['GET', 'HEAD', 'OPTIONS']
      responseHeaders['access-control-allow-headers'] = ['*']
    }
    callback({ responseHeaders: details.responseHeaders })
  })
  fileLogger = await setupFileLogger()

  // Register the global hook for file logging
  setGlobalHookPostLog((_, formatted) => {
    if (skipFileLogging || fileLogger.logFileFd === null)
      return
    void fileLogger.appendLog(formatted)
  })

  // Daily-rotating file logger for key link instrumentation (main-YYYY-MM-DD.log, 7-day retention)
  await initFileLogger()

  injeca.setLogger(createLoggLogger(useLogg('injeca').useGlobalConfig()))

  const appConfig = injeca.provide('configs:app', () => createGlobalAppConfig())
  const artistryConfig = injeca.provide('configs:artistry', () => createArtistryConfig())
  const electronApp = injeca.provide('host:electron:app', () => app)
  const autoUpdater = injeca.provide('services:auto-updater', {
    dependsOn: { appConfig },
    build: ({ dependsOn }) => setupAutoUpdater({
      getStoredUpdateLane: () => dependsOn.appConfig.get()?.updateChannel,
      setStoredUpdateLane: (lane) => {
        const currentConfig = dependsOn.appConfig.get()
        dependsOn.appConfig.update({
          language: currentConfig?.language ?? 'en',
          updateChannel: lane,
        })
      },
    }),
  })

  const i18n = injeca.provide('libs:i18n', {
    dependsOn: { appConfig },
    build: ({ dependsOn }) => createI18n({ messages, locale: dependsOn.appConfig.get()?.language }),
  })

  const serverChannel = injeca.provide('modules:channel-server', {
    dependsOn: { app: electronApp, lifecycle },
    build: async ({ dependsOn }) => setupServerChannel(dependsOn),
  })

  const kitsuneHttpServer = injeca.provide('modules:kitsune-http-server', {
    build: async () => setupBuiltInServer({ servers: [] }),
  })

  const godotStageManager = injeca.provide('modules:godot-stage-manager', {
    build: async () => {
      const { setupGodotStageManager } = await import('./services/kitsune/godot-stage')
      return setupGodotStageManager()
    },
  })

  const mcpStdioManager = injeca.provide('modules:mcp-stdio-manager', {
    build: async () => {
      const { setupMcpStdioManager } = await import('./services/kitsune/mcp-servers')
      return setupMcpStdioManager()
    },
  })

  // ComfyUI 改为手动启动：用户在设置页通过 electronComfyuiStart IPC 触发启动，
  // provide 仅占位保持依赖图完整，不再在 build 阶段调用 startComfyUI。
  // sidecarServiceRef 供 IPC handler 读取 sidecarService 引用（在下方 invoke 回调中赋值）。
  injeca.provide('services:comfyui', {
    build: async () => ({ ready: true }),
  })

  const memoryService = injeca.provide('services:memory', {
    build: async () => ({ ready: true }),
  })

  const widgetsManager = injeca.provide('windows:widgets', {
    dependsOn: { serverChannel, i18n },
    build: ({ dependsOn }) => setupWidgetsWindowManager(dependsOn),
  })

  const pluginHost = injeca.provide('modules:plugin-host', {
    dependsOn: { serverChannel, widgetsManager },
    build: async ({ dependsOn }) => {
      const { setupExtensionHost } = await import('./services/kitsune/plugins')
      return setupExtensionHost(dependsOn)
    },
  })

  const windowAuthManager = injeca.provide('services:window-auth-manager', () => createWindowAuthManagerService())

  const globalShortcut = injeca.provide('services:global-shortcut', () => setupGlobalShortcutService())

  // BeatSync manager — the background audio-capture window is created lazily
  // on first call to ensureWindow(), not at startup.
  const beatSync = injeca.provide('windows:beat-sync', () => setupBeatSync())

  // Devtools windows are dev-only — skip manager creation in production to avoid
  // unnecessary setup. A no-op manager keeps the settings window dependency satisfied.
  const devtoolsMarkdownStressWindow = injeca.provide('windows:devtools:markdown-stress', (): DevtoolsWindowManager => {
    if (app.isPackaged) {
      return {
        openWindow: async () => {
          throw new Error('Devtools window is not available in production builds')
        },
      }
    }
    return setupDevtoolsWindow()
  })

  const onboardingWindowManager = injeca.provide('windows:onboarding', {
    dependsOn: { serverChannel, i18n, windowAuthManager },
    build: ({ dependsOn }) => setupOnboardingWindowManager(dependsOn),
  })

  const noticeWindow = injeca.provide('windows:notice', {
    dependsOn: { i18n, serverChannel },
    build: ({ dependsOn }) => setupNoticeWindowManager(dependsOn),
  })

  const aboutWindow = injeca.provide('windows:about', {
    dependsOn: { autoUpdater, i18n, serverChannel },
    build: ({ dependsOn }) => setupAboutWindowReusable(dependsOn),
  })

  const chatWindow = injeca.provide('windows:chat', {
    dependsOn: { widgetsManager, serverChannel, mcpStdioManager, i18n },
    build: ({ dependsOn }) => setupChatWindowReusableFunc(dependsOn),
  })

  const spotlightWindow = injeca.provide('windows:spotlight', {
    dependsOn: { serverChannel, i18n, chatWindow, globalShortcut, appConfig },
    build: ({ dependsOn }) => setupSpotlightWindowManager(dependsOn),
  })

  const settingsWindow = injeca.provide('windows:settings', {
    dependsOn: { widgetsManager, beatSync, autoUpdater, devtoolsWindow: devtoolsMarkdownStressWindow, serverChannel, godotStageManager, mcpStdioManager, i18n, windowAuthManager, globalShortcut, spotlightWindow },
    build: async ({ dependsOn }) => setupSettingsWindowReusableFunc(dependsOn),
  })

  const mainWindow = injeca.provide('windows:main', {
    dependsOn: { settingsWindow, chatWindow, widgetsManager, noticeWindow, beatSync, autoUpdater, serverChannel, godotStageManager, mcpStdioManager, i18n, onboardingWindowManager, windowAuthManager },
    build: async ({ dependsOn }) => setupMainWindow({
      ...dependsOn,
      onWindowCreated: (window) => {
        userFacingMainWindow = window
      },
    }),
  })

  const captionWindow = injeca.provide('windows:caption', {
    dependsOn: { mainWindow, serverChannel, i18n },
    build: async ({ dependsOn }) => setupCaptionWindowManager(dependsOn),
  })

  const tray = injeca.provide('app:tray', {
    dependsOn: { mainWindow, settingsWindow, captionWindow, widgetsWindow: widgetsManager, serverChannel, beatSyncBgWindow: beatSync, aboutWindow, i18n },
    build: async ({ dependsOn }) => setupTray(dependsOn),
  })

  // Desktop grounding overlay gated by KITSUNE_DESKTOP_OVERLAY=1
  if (isDesktopOverlayEnabled()) {
    const desktopOverlay = injeca.provide('windows:desktop-overlay', {
      dependsOn: { mcpStdioManager, serverChannel, i18n },
      build: async ({ dependsOn }) => {
        const { setupDesktopOverlayWindow } = await import('./windows/desktop-overlay')
        return setupDesktopOverlayWindow(dependsOn)
      },
    })

    // NOTICE: Separate invoke ensures the overlay is eagerly built.
    // Without this, injeca.start() would skip it because no other
    // provider depends on 'windows:desktop-overlay'.
    injeca.invoke({
      dependsOn: { desktopOverlay },
      callback: noop,
    })
  }

  injeca.invoke({
    dependsOn: { mainWindow, tray, serverChannel, kitsuneHttpServer, godotStageManager, pluginHost, mcpStdioManager, memoryService, onboardingWindow: onboardingWindowManager, widgetsWindow: widgetsManager, spotlightWindow, artistryConfig, appConfig },
    callback: async (deps) => {
      // Deferred plugin host initialization: starts the asset HTTP server and
      // loads enabled extensions without blocking the main window dependency chain.
      void deps.pluginHost.init()

      const { context } = createContext(ipcMain)
      const { createMemoryService } = await import('./services/kitsune/memory')
      const { createPersonaService } = await import('./services/kitsune/persona')
      const { setupArtistryBridge } = await import('./services/kitsune/widgets/artistry-bridge')
      const { createOverseerService, loadOverseerConfig } = await import('./services/kitsune/overseer')
      const { createConnectorService } = await import('./services/kitsune/connectors')
      const { createSidecarService } = await import('./services/kitsune/sidecar')
      const memoryService = createMemoryService({ context })
      const personaService = createPersonaService({ context, memoryStore: memoryService.longTermStore })
      await setupArtistryBridge({
        widgetsManager: deps.widgetsWindow,
        context,
        artistryConfig: deps.artistryConfig,
      })
      // Connectors — IDE 连接器管理，订阅 channel-server 的 WebSocket peer 事件
      const connectorService = createConnectorService({ context, serverChannel: deps.serverChannel })
      // Desktop Automation — 鼠标键盘模拟（桌面自动化），需在 Overseer 之前创建
      const { createDesktopAutomationService } = await import('./services/kitsune/desktop-automation')
      const { getDesktopOverlayWindow } = await import('./windows/desktop-overlay')
      const { electronDesktopAutomationInvoke, electronFindElementResult } = await import('../shared/eventa')
      const overlayWindow = getDesktopOverlayWindow()
      const desktopAutomation = await createDesktopAutomationService({
        overlayWindow: overlayWindow ?? undefined,
        context,
      })
      // Overseer 监工系统 — 加载配置后装配服务，传入 connectors 供执行层使用
      const overseerConfig = await loadOverseerConfig()
      overseerService = createOverseerService({
        context,
        config: overseerConfig,
        connectors: connectorService,
        memoryStore: memoryService.longTermStore,
        personaBuilder: personaService.personaBuilder,
        desktopAutomation,
      })
      // 注册桌面自动化 IPC 处理器
      defineInvokeHandler(context, electronDesktopAutomationInvoke, async (req) => {
        try {
          const { action, params } = req
          switch (action) {
            case 'click':
              await desktopAutomation.click(params.button)
              return { ok: true }
            case 'moveTo':
              if (params.x === undefined || params.y === undefined)
                return { ok: false, error: '缺少 x/y 坐标' }
              await desktopAutomation.moveTo(params.x, params.y)
              return { ok: true }
            case 'drag':
              if (!params.from || !params.to)
                return { ok: false, error: '缺少 from/to 坐标' }
              await desktopAutomation.drag(params.from, params.to)
              return { ok: true }
            case 'type':
              if (!params.text)
                return { ok: false, error: '缺少 text 内容' }
              await desktopAutomation.type(params.text)
              return { ok: true }
            case 'pressKey':
              if (!params.key)
                return { ok: false, error: '缺少 key' }
              await desktopAutomation.pressKey(params.key)
              return { ok: true }
            case 'scroll':
              if (!params.direction)
                return { ok: false, error: '缺少 direction' }
              await desktopAutomation.scroll(params.direction, params.amount, params.x, params.y)
              return { ok: true }
            case 'screenshot':
              return { ok: true, result: await desktopAutomation.screenshot() }
            case 'getCursorPosition':
              return { ok: true, result: await desktopAutomation.getCursorPosition() }
            case 'findElement':
              if (!params.description)
                return { ok: false, error: '缺少 description' }
              return { ok: true, result: await desktopAutomation.findElement(params.description) }
            case 'setOverlayInteractive':
              if (params.interactive === undefined)
                return { ok: false, error: '缺少 interactive' }
              await desktopAutomation.setOverlayInteractive(params.interactive)
              return { ok: true }
            // 窗口管理
            case 'listWindows':
              return { ok: true, result: await desktopAutomation.listWindows() }
            case 'focusWindow':
              return { ok: true, result: await desktopAutomation.focusWindow(params.title, params.processName) }
            case 'maximizeWindow':
              return { ok: true, result: await desktopAutomation.maximizeWindow(params.title, params.processName) }
            case 'minimizeWindow':
              return { ok: true, result: await desktopAutomation.minimizeWindow(params.title, params.processName) }
            case 'restoreWindow':
              return { ok: true, result: await desktopAutomation.restoreWindow(params.title, params.processName) }
            case 'closeWindow':
              return { ok: true, result: await desktopAutomation.closeWindow(params.title, params.processName) }
            // 应用管理
            case 'launchApp':
              if (!params.command)
                return { ok: false, error: '缺少 command' }
              return { ok: true, result: await desktopAutomation.launchApp(params.command, params.args) }
            default:
              return { ok: false, error: `未知操作: ${action}` }
          }
        }
        catch (error) {
          return { ok: false, error: String(error) }
        }
      })
      // 注册 findElement 视觉定位结果处理器（渲染进程回传）
      defineInvokeHandler(context, electronFindElementResult, async (result) => {
        desktopAutomation.handleFindElementResult(result)
        return result
      })
      // Sidecar — 本地子进程（GPT-SoVITS、ComfyUI 等）进程管理与 stdin/stdout 管道通信
      const sidecarService = createSidecarService({ context })
      // sidecarServiceRef 供 electronComfyuiStart/Stop IPC handler 读取最新引用
      sidecarServiceRef = sidecarService
      // 应用启动时自动拉起 GPT-SoVITS sidecar（后台、非阻塞），打开语音/声线面板即可见声线，
      // 无需手动点「启动」。失败（如模型缺失）仅记日志，不影响主进程启动。
      void (async () => {
        try {
          const { getGptSovitsStatus, startGptSovits } = await import('./services/kitsune/tts')
          const status = getGptSovitsStatus(sidecarService)
          if (status.running) {
            log.log('[GPT-SoVITS] 已在运行，跳过自动启动')
            return
          }
          log.log('[GPT-SoVITS] 应用启动，自动拉起 sidecar...')
          const result = await startGptSovits(sidecarService)
          if (!result.success)
            log.warn(`[GPT-SoVITS] 自动启动失败（可稍后在设置页手动启动）: ${result.message}`)
        }
        catch (error) {
          log.warn(`[GPT-SoVITS] 自动启动异常: ${errorMessageFrom(error) ?? 'unknown'}`)
        }
      })()
      // Doctor — 内置健康检查（9 大类别诊断 + 自动修复），依赖 sidecar/overseer/plugins 状态
      const { createDoctorService } = await import('./services/kitsune/doctor')
      createDoctorService({ context, sidecarService, overseerService, pluginHost: deps.pluginHost })
      // ComfyUI — 本地图像生成服务 IPC handler（进程由 SidecarService 管理，API 通信走 HTTP）。
      // sidecarServiceRef 在此回调内已赋值，但 invoke 可能在回调执行前被渲染进程触发，需 null 守卫。
      defineInvokeHandler(context, electronComfyuiStart, async () => {
        if (!sidecarServiceRef)
          throw new Error('sidecarService not ready')
        const { startComfyUI, getComfyUIStatus } = await import('./services/kitsune/comfyui')
        await startComfyUI(sidecarServiceRef)
        return getComfyUIStatus()
      })
      defineInvokeHandler(context, electronComfyuiStop, async () => {
        if (!sidecarServiceRef)
          throw new Error('sidecarService not ready')
        const { stopComfyUI, getComfyUIStatus } = await import('./services/kitsune/comfyui')
        await stopComfyUI(sidecarServiceRef)
        return getComfyUIStatus()
      })
      defineInvokeHandler(context, electronComfyuiStatus, async () => {
        const { getComfyUIStatus } = await import('./services/kitsune/comfyui')
        return getComfyUIStatus()
      })
      defineInvokeHandler(context, electronComfyuiSetConfig, async (payload) => {
        if (!payload?.dir && payload?.port === undefined)
          throw new Error('comfyui set-config requires dir or port')
        const { setComfyuiConfig } = await import('./services/kitsune/comfyui')
        return setComfyuiConfig(payload)
      })
      // TTS 引擎 — 列出可用引擎、读取/切换当前引擎、启停 GPT-SoVITS、配置数据目录与端口。
      // GPT-SoVITS 的 available 综合判断：sidecar 运行中视为可用；未运行但数据目录存在则
      // 标记不可用并附 reason 引导用户启动；目录缺失则提示配置路径。Edge TTS / 系统 TTS 始终可用。
      // 注意：TTS adapter 层在请求时读取 appConfig.ttsEngine，并在 GPT-SoVITS 不可用时
      // 由调用方自行降级（避免本 handler 触发循环依赖）。
      defineInvokeHandler(context, electronTtsGetEngines, async () => {
        const { listEngines, getEngineSidecarId } = await import('@kitsune/tts-hybrid')
        const registeredEngines = listEngines()
        return registeredEngines.map((engine) => {
          const sidecarId = getEngineSidecarId(engine.id)
          if (sidecarId) {
            const running = sidecarServiceRef?.getStatus(sidecarId)?.state === 'running'
            return {
              id: engine.id,
              name: engine.name,
              available: running,
              reason: running ? undefined : `${engine.name} 未启动`,
            }
          }
          // cloud-http / system-builtin 类型始终可用
          return { id: engine.id, name: engine.name, available: true }
        })
      })
      defineInvokeHandler(context, electronTtsSetEngine, async (payload) => {
        if (!payload?.engine)
          throw new Error('tts set-engine requires engine')
        // update 整体替换 persistenceMap，需显式保留现有字段避免丢失其它配置
        const current = deps.appConfig.get()
        deps.appConfig.update({
          language: current?.language ?? 'en',
          spotlightShortcutAccelerator: current?.spotlightShortcutAccelerator,
          updateChannel: current?.updateChannel,
          ttsEngine: payload.engine,
        })
      })
      defineInvokeHandler(context, electronTtsCurrentEngine, async () => {
        const { getDefaultEngineId } = await import('@kitsune/tts-hybrid')
        const engine = deps.appConfig.get()?.ttsEngine
        return engine ?? getDefaultEngineId()
      })
      // TTS 声线列表 — 扫描 voices/ 目录中的 manifest.json 动态获取
      defineInvokeHandler(context, electronTtsListVoices, async () => {
        const { resolveGptSovitsDir } = await import('./services/kitsune/tts')
        const dir = resolveGptSovitsDir()
        if (!dir)
          return { voices: [] }
        try {
          const { readdirSync, existsSync, readFileSync } = await import('node:fs')
          const { join } = await import('node:path')
          const voicesRoot = join(dir, 'voices')
          if (!existsSync(voicesRoot))
            return { voices: [] }
          const voices = []
          for (const sub of readdirSync(voicesRoot)) {
            const manifestPath = join(voicesRoot, sub, 'manifest.json')
            if (!existsSync(manifestPath))
              continue
            const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
            voices.push({
              id: manifest.display_name ?? manifest.id ?? sub,
              name: manifest.display_name ?? sub,
              lang: manifest.language ?? 'zh',
            })
          }
          return { voices }
        }
        catch {
          return { voices: [] }
        }
      })
      // GPT-SoVITS 启停与配置 — 参照 electronComfyuiStart/Stop/SetConfig 模式，
      // 进程由 SidecarService 管理，adapter 层负责解析安装目录、Python 路径与端口。
      defineInvokeHandler(context, electronTtsStart, async () => {
        if (!sidecarServiceRef)
          throw new Error('sidecarService not ready')
        const { startGptSovits } = await import('./services/kitsune/tts')
        return startGptSovits(sidecarServiceRef)
      })
      defineInvokeHandler(context, electronTtsStop, async () => {
        if (!sidecarServiceRef)
          throw new Error('sidecarService not ready')
        const { stopGptSovits } = await import('./services/kitsune/tts')
        return stopGptSovits(sidecarServiceRef)
      })
      defineInvokeHandler(context, electronTtsGetConfig, async () => {
        const { getGptSovitsConfig } = await import('./services/kitsune/tts')
        return getGptSovitsConfig()
      })
      defineInvokeHandler(context, electronTtsSetConfig, async (payload) => {
        if (!payload?.dir && payload?.port === undefined && payload?.device === undefined)
          throw new Error('tts set-config requires dir, port, or device')
        const { setGptSovitsConfig } = await import('./services/kitsune/tts')
        return setGptSovitsConfig({
          dir: payload.dir,
          port: payload.port,
          device: payload.device,
        })
      })
      // GPT-SoVITS 语音合成 — 通过 sidecar HTTP API 进行本地语音合成，返回 WAV 供前端播放。
      // 懒启动：首次合成时若 sidecar 未运行才拉起 Python 进程（避免启动期常驻 261MB + 143ms 阻塞）。
      defineInvokeHandler(context, electronTtsSynthesize, async (payload) => {
        if (!payload?.text)
          throw new Error('tts synthesize requires text')
        if (!sidecarServiceRef)
          throw new Error('sidecarService not ready')
        try {
          const { getEngineSidecarId } = await import('@kitsune/tts-hybrid')
          const sidecarId = getEngineSidecarId('gpt-sovits')
          if (sidecarId && sidecarServiceRef.getStatus(sidecarId)?.state !== 'running') {
            const { startGptSovits } = await import('./services/kitsune/tts')
            const result = await startGptSovits(sidecarServiceRef)
            if (!result.success)
              throw new Error(result.message)
          }
          const { synthesizeGptSovits } = await import('./services/kitsune/tts')
          // `speed` is supported by the sidecar but is not part of the shared
          // invoke contract in @kitsune/stage-shared yet, so read it defensively.
          const speed = (payload as { speed?: number }).speed
          const wavBuffer = await synthesizeGptSovits(sidecarServiceRef, payload.text, {
            voice: payload.voice,
            speed,
          })
          return { success: true, audioData: wavBuffer.buffer.slice(wavBuffer.byteOffset, wavBuffer.byteOffset + wavBuffer.byteLength) as ArrayBuffer }
        }
        catch (error) {
          return { success: false, error: errorMessageFrom(error) ?? 'GPT-SoVITS synthesis failed' }
        }
      })
      // GPT-SoVITS 流式语音合成 — 基于 api.py `-sm normal` 流式模式，
      // 主进程逐 OGG chunk 转发至渲染进程，前端逐块 decodeAudioData 播放。
      // 与 synthesize handler 不同：不等待整段合成完成，边合成边 yield chunk。
      defineStreamInvokeHandler(context, electronTtsStream, async function* (payload) {
        if (!payload?.text)
          throw new Error('tts stream requires text')
        if (!sidecarServiceRef)
          throw new Error('sidecarService not ready')

        const { getEngineSidecarId } = await import('@kitsune/tts-hybrid')
        const sidecarId = getEngineSidecarId('gpt-sovits')
        if (sidecarId && sidecarServiceRef.getStatus(sidecarId)?.state !== 'running') {
          const { startGptSovits } = await import('./services/kitsune/tts')
          const result = await startGptSovits(sidecarServiceRef)
          if (!result.success)
            throw new Error(result.message)
        }

        const { synthesizeGptSovitsStream } = await import('./services/kitsune/tts')
        const speed = (payload as { speed?: number }).speed
        let totalBytes = 0

        for await (const chunk of synthesizeGptSovitsStream(sidecarServiceRef, payload.text, {
          voice: payload.voice,
          speed,
        })) {
          totalBytes += chunk.data.byteLength
          yield { type: 'chunk' as const, data: chunk.data.buffer.slice(chunk.data.byteOffset, chunk.data.byteOffset + chunk.data.byteLength) as ArrayBuffer, sampleRate: chunk.sampleRate, format: chunk.format }
        }

        yield { type: 'end' as const, bytes: totalBytes }
      })
      // TTS 克隆声线 — 上传音频 + 文本标注，调用 sidecar set_reference_audio 注册自定义角色。
      // 克隆角色复用同语言预定义角色的 ONNX 模型作为推理引擎，但用用户上传的参考音频替换声音特征。
      defineInvokeHandler(context, electronTtsCloneVoice, async (payload) => {
        if (!payload?.characterName || !payload?.audioPath)
          throw new Error('clone voice requires characterName and audioPath')
        if (!sidecarServiceRef)
          throw new Error('sidecarService not ready')
        const { cloneVoice } = await import('./services/kitsune/tts')
        return cloneVoice(
          sidecarServiceRef,
          payload.characterName,
          payload.audioPath,
          payload.audioText || '',
          payload.language,
        )
      })
      // TTS 删除已克隆声线 — 从 sidecar 已注册角色中移除指定克隆角色（不能删除预定义角色）。
      defineInvokeHandler(context, electronTtsRemoveVoice, async (payload) => {
        if (!payload?.characterName)
          throw new Error('remove voice requires characterName')
        if (!sidecarServiceRef)
          throw new Error('sidecarService not ready')
        const { removeVoice } = await import('./services/kitsune/tts')
        return removeVoice(sidecarServiceRef, payload.characterName)
      })
      // 导入声线包 — 选择 zip 文件并解压到 voices/ 目录
      defineInvokeHandler(context, electronTtsImportVoicePack, async (payload) => {
        const { resolveGptSovitsDir } = await import('./services/kitsune/tts')
        const dir = resolveGptSovitsDir()
        if (!dir)
          return { success: false, error: 'GPT-SoVITS 目录未配置' }
        try {
          const zipPath = payload?.zipPath ?? (await dialog.showOpenDialog({
            title: '选择声线包 (.zip)',
            filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
            properties: ['openFile'],
          })).filePaths[0]
          if (!zipPath)
            return { success: false, error: '未选择文件' }

          const { default: yauzl } = await import('yauzl')
          const fs = await import('node:fs')
          const path = await import('node:path')

          const voicesDir = path.join(dir, 'voices')
          const tmpDir = path.join(voicesDir, '.import-tmp')
          fs.mkdirSync(tmpDir, { recursive: true })

          // 解压 zip
          await new Promise<void>((resolve, reject) => {
            yauzl.open(zipPath, { lazyEntries: true }, (err: any, zipfile: any) => {
              if (err) return reject(err)
              zipfile.readEntry()
              zipfile.on('entry', (entry: any) => {
                // NOTICE:
                // A malicious voice pack can declare entries like `../evil.js` to
                // escape `tmpDir`. Resolve the target and only allow entries that
                // stay inside `tmpDir`; escaping entries are skipped and logged.
                const targetPath = path.resolve(tmpDir, entry.fileName)
                if (targetPath !== tmpDir && !targetPath.startsWith(tmpDir + path.sep)) {
                  log.warn(`[语音包] 跳过越界条目: ${entry.fileName}`)
                  zipfile.readEntry()
                  return
                }
                if (entry.fileName.endsWith('/')) {
                  fs.mkdirSync(targetPath, { recursive: true })
                  zipfile.readEntry()
                }
                else {
                  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
                  zipfile.openReadStream(entry, (err2: any, readStream: any) => {
                    if (err2) return reject(err2)
                    const writeStream = fs.createWriteStream(targetPath)
                    readStream.on('error', (e: any) => reject(e))
                    writeStream.on('error', (e: any) => reject(e))
                    readStream.pipe(writeStream)
                    writeStream.on('close', () => zipfile.readEntry())
                  })
                }
              })
              zipfile.on('end', () => resolve())
              zipfile.on('error', (e: any) => reject(e))
            })
          })

          // 查找 manifest.json
          let manifestPath: string | null = null
          let voiceSubdir = tmpDir
          if (fs.existsSync(path.join(tmpDir, 'manifest.json'))) {
            manifestPath = path.join(tmpDir, 'manifest.json')
          }
          else {
            for (const sub of fs.readdirSync(tmpDir)) {
              const subM = path.join(tmpDir, sub, 'manifest.json')
              if (fs.existsSync(subM)) {
                manifestPath = subM; voiceSubdir = path.join(tmpDir, sub); break
              }
            }
          }

          let voiceId: string
          if (manifestPath) {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
            voiceId = manifest.id ?? manifest.display_name ?? path.basename(zipPath, '.zip')
          }
          else {
            voiceId = path.basename(zipPath, '.zip')
          }

          const targetDir = path.join(voicesDir, voiceId)
          fs.mkdirSync(targetDir, { recursive: true })
          for (const f of fs.readdirSync(voiceSubdir)) {
            const src = path.join(voiceSubdir, f)
            const dest = path.join(targetDir, f)
            if (!fs.existsSync(dest))
              fs.renameSync(src, dest)
          }

          // 无 manifest 时自动创建
          if (!fs.existsSync(path.join(targetDir, 'manifest.json'))) {
            const wavFiles = fs.readdirSync(targetDir).filter((f: string) => f.endsWith('.wav'))
            fs.writeFileSync(path.join(targetDir, 'manifest.json'), JSON.stringify({
              id: voiceId, display_name: voiceId, language: 'zh',
              default_reference: wavFiles[0] ?? '', default_prompt_text: '',
            }, null, 2), 'utf-8')
          }

          fs.rmSync(tmpDir, { recursive: true, force: true })
          return { success: true, voiceId }
        }
        catch (error) {
          return { success: false, error: String(error) }
        }
      })
      // 删除声线 — 从 voices/ 目录移除指定声线
      defineInvokeHandler(context, electronTtsDeleteVoice, async (payload) => {
        if (!payload?.voiceId)
          return { success: false, error: '未指定声线 ID' }
        const { resolveGptSovitsDir } = await import('./services/kitsune/tts')
        const dir = resolveGptSovitsDir()
        if (!dir)
          return { success: false, error: 'GPT-SoVITS 目录未配置' }
        try {
          const { existsSync, rmSync, readdirSync, readFileSync } = await import('node:fs')
          const { join } = await import('node:path')
          const voicesDir = join(dir, 'voices')
          // 按 ID 或 display_name 查找
          let targetDir: string | null = null
          const directDir = join(voicesDir, payload.voiceId)
          if (existsSync(directDir)) {
            targetDir = directDir
          }
          else {
            for (const sub of readdirSync(voicesDir)) {
              const manifestPath = join(voicesDir, sub, 'manifest.json')
              if (!existsSync(manifestPath))
                continue
              const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
              if (manifest.id === payload.voiceId || manifest.display_name === payload.voiceId) {
                targetDir = join(voicesDir, sub)
                break
              }
            }
          }
          if (!targetDir)
            return { success: false, error: `声线 "${payload.voiceId}" 不存在` }
          rmSync(targetDir, { recursive: true, force: true })
          return { success: true }
        }
        catch (error) {
          return { success: false, error: String(error) }
        }
      })
      // ASR 引擎 — 内存管线语音识别（sherpa-onnx, SenseVoice/Paraformer/Whisper）
      // 注册内置引擎并初始化默认引擎
      const { registerAsrIpcHandlers } = await import('./services/kitsune/asr/ipc-handlers')
      registerAsrIpcHandlers(context)
      // 状态转发：sidecar 进程状态变化时，若 id 为 comfyui 则查询 HTTP 详情并推送业务层状态。
      // sidecar 的 state 仅反映 spawn 层生命周期，ComfyUI 的 running/version/gpu 需另查 /system_stats。
      // eventa 的 on handler 收到的是 Eventa<P>（{ id, type, body: P }），业务 payload 在 body 字段。
      context.on(electronSidecarStatusChanged, async (event) => {
        if (event.body?.id !== 'comfyui')
          return
        const { getComfyUIStatus } = await import('./services/kitsune/comfyui')
        const comfyuiStatus = await getComfyUIStatus()
        context.emit(electronComfyuiStatusChanged, comfyuiStatus)
      })
      // Dialog — 文件夹选择对话框，供 sidecar 设置页等场景调用 Electron 原生 dialog
      defineInvokeHandler(context, electronDialogChooseDirectory, async (payload) => {
        const result = await dialog.showOpenDialog({
          title: payload?.title,
          properties: ['openDirectory'],
        })
        if (result.canceled || result.filePaths.length === 0)
          return { canceled: true, path: null }
        return { canceled: false, path: result.filePaths[0] }
      })
      // Dialog — 文件选择对话框，支持扩展名过滤（用于 TTS 克隆声线选择音频文件等场景）
      defineInvokeHandler(context, electronDialogChooseFile, async (payload) => {
        const extensions = payload?.extensions && payload.extensions.length > 0
          ? payload.extensions
          : ['wav', 'flac', 'ogg', 'aiff', 'aif']
        const result = await dialog.showOpenDialog({
          title: payload?.title,
          properties: ['openFile'],
          filters: [
            { name: 'Audio Files', extensions },
            { name: 'All Files', extensions: ['*'] },
          ],
        })
        if (result.canceled || result.filePaths.length === 0)
          return { canceled: true, path: null }
        return { canceled: false, path: result.filePaths[0] }
      })
      // Vision — 屏幕监控常驻服务，由 electronVisionStart IPC 触发定时截屏循环
      const { createVisionService } = await import('./services/kitsune/vision')
      createVisionService({ context })
      // Agent API — 直接对接开放 API 的 Agent（Cloud Code / OpenCode / Trae Builder）
      const { createAgentApiService } = await import('./services/kitsune/agent-api')
      createAgentApiService({ context })
      // Log level — 暴露 @guiiai/logg 全局级别给环境适配中心，运行时切换日志详细度
      const { electronLogLevelGet, electronLogLevelSet } = await import('../shared/eventa')
      type Level = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
      const logLevelToLogg: Record<Level, LogLevel> = {
        DEBUG: LogLevel.Debug,
        INFO: LogLevel.Log,
        WARN: LogLevel.Warning,
        ERROR: LogLevel.Error,
      }
      let currentLevel: Level = 'INFO'
      defineInvokeHandler(context, electronLogLevelGet, () => currentLevel)
      defineInvokeHandler(context, electronLogLevelSet, (req) => {
        const next = req?.level
        if (!next)
          return currentLevel
        currentLevel = next
        setGlobalLogLevel(logLevelToLogg[next])
        log.withFields({ level: next }).log('log level updated')
        return next
      })
    },
  })

  injeca.start().catch(err => console.error(err))

  // Lifecycle
  emitAppReady()

  // Extra
  openDebugger()

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  // Register IPC handler for direct model file access (bypasses HTTP).
  // The handler starts the HTTP file server on-demand on the first Live2D
  // model request (R8), so it is no longer started unconditionally here.
  registerLive2dModelIpc()

  // Start the local model file server if pre-downloaded models exist.
  // This allows the renderer to fetch ONNX models from localhost (bypassing CORS).
  if (hasLocalModels()) {
    startModelFileServer().catch(err => log.withError(err).error('Failed to start model file server'))
  }
}).catch((err) => {
  log.withError(err).error('Error during app initialization')
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  emitAppWindowAllClosed()

  if (platform !== 'darwin') {
    app.quit()
  }
})

let appExiting = false
let overseerService: OverseerService | null = null

// ComfyUI 的进程管理依赖 SidecarService。sidecarService 在 injeca.invoke 回调
// （app ready 后）才创建，而 electronComfyuiStart/Stop IPC handler 可能在回调执行前
// 被渲染进程触发，因此用 sidecarServiceRef 直接读取最新引用并 null 守卫。
// ComfyUI 改为手动启动后不再需要 deferred promise（原 sidecarServiceReady 已移除）。
let sidecarServiceRef: SidecarService | null = null

// Clean up server and intervals when app quits
async function handleAppExit() {
  if (appExiting)
    return

  appExiting = true

  let exitedNormally = true

  /**
   * Safely execute fn and log any errors that occur, marking the exit as abnormal
   * if an error is caught.
   *
   * @param operation - A verb phrase describing the operation.
   * @param fn - Any function to execute. It can be either sync or async.
   * @returns A promise that resolves when the operation is complete.
   */
  async function logIfError(operation: string, fn: () => unknown): Promise<void> {
    try {
      await fn()
    }
    catch (error) {
      exitedNormally = false
      log.withError(error).error(`[app-exit] Failed to ${operation}:`)
    }
  }

  await Promise.all([
    logIfError('execute onAppBeforeQuit hooks', () => emitAppBeforeQuit()),
    logIfError('stop overseer', () => overseerService?.stop()),
    logIfError('stop ComfyUI', async () => {
      // sidecarService 可能未创建（invoke 回调未执行就退出），此时跳过 stop
      if (!sidecarServiceRef)
        return
      const { stopComfyUI } = await import('./services/kitsune/comfyui')
      await stopComfyUI(sidecarServiceRef)
    }),
    logIfError('stop injeca', () => injeca.stop()),
  ])

  // Prevent the global log hook from trying to write to the file after close() is called,
  // which would cause a recursive failure if close() itself throws.
  skipFileLogging = true
  await logIfError('flush file logs', () => fileLogger.close()) // Ensure all logs are flushed

  app.exit(exitedNormally ? 0 : 1)
}

process.on('SIGINT', () => handleAppExit())

app.on('before-quit', (event) => {
  event.preventDefault()
  handleAppExit()
})
