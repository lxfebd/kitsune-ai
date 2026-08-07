import type { Locale } from '@intlify/core'
import type { ServerOptions } from '@kitsune/server-runtime/server'
import type {
  ShortcutAccelerator,
  ShortcutBinding,
  ShortcutRegistrationResult,
} from '@kitsune/stage-shared/global-shortcut'
import type {
  StageViewErrorPayload,
  StageViewPatch,
  StageViewRequestAckPayload,
  StageViewSnapshotPayload,
} from '@kitsune/stage-shared/godot-stage'
import type { ServerChannelQrPayload } from '@kitsune/stage-shared/server-channel-qr'
export { electronTtsSynthesize } from '@kitsune/stage-shared'
import type {
  ThreeHitTestReadTracePayload,
  ThreeSceneRenderInfoTracePayload,
  VrmDisposeEndTracePayload,
  VrmDisposeStartTracePayload,
  VrmLoadEndTracePayload,
  VrmLoadErrorTracePayload,
  VrmLoadStartTracePayload,
  VrmUpdateFrameTracePayload,
} from '@kitsune/stage-ui-three/trace'

import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

export const electronStartTrackMousePosition = defineInvokeEventa('eventa:invoke:electron:start-tracking-mouse-position')
export const electronStartDraggingWindow = defineInvokeEventa('eventa:invoke:electron:start-dragging-window')

export const electronOpenMainDevtools = defineInvokeEventa('eventa:invoke:electron:windows:main:devtools:open')
export const electronOpenSettings = defineInvokeEventa<void, { route?: string }>('eventa:invoke:electron:windows:settings:open')
export const electronSettingsNavigate = defineEventa<{ route: string }>('eventa:event:electron:windows:settings:navigate')
export const electronOpenChat = defineInvokeEventa('eventa:invoke:electron:windows:chat:open')
export const electronSpotlightHide = defineInvokeEventa<void>('eventa:invoke:electron:windows:spotlight:hide')
export const electronSpotlightShowResultNotification = defineInvokeEventa<void, { body: string }>('eventa:invoke:electron:windows:spotlight:show-result-notification')
export const electronSpotlightShortcutGet = defineInvokeEventa<ShortcutAccelerator>('eventa:invoke:electron:windows:spotlight:shortcut:get')
export const electronSpotlightShortcutSet = defineInvokeEventa<ShortcutRegistrationResult, { accelerator: ShortcutAccelerator | null }>('eventa:invoke:electron:windows:spotlight:shortcut:set')
export const electronOpenSettingsDevtools = defineInvokeEventa('eventa:invoke:electron:windows:settings:devtools:open')
export const electronOpenDevtoolsWindow = defineInvokeEventa<void, { key: string, route?: string, width?: number, height?: number, x?: number, y?: number }>('eventa:invoke:electron:windows:devtools:open')

export interface ElectronServerChannelConfig {
  tlsConfig?: ServerOptions['tlsConfig'] | null
  authToken: string
  hostname: string
}
export const electronGetServerChannelConfig = defineInvokeEventa<ElectronServerChannelConfig>('eventa:invoke:electron:server-channel:get-config')
export const electronApplyServerChannelConfig = defineInvokeEventa<ElectronServerChannelConfig, Partial<ElectronServerChannelConfig>>('eventa:invoke:electron:server-channel:apply-config')
export const electronGetServerChannelQrPayload = defineInvokeEventa<ServerChannelQrPayload>('eventa:invoke:electron:server-channel:get-qr-payload')

export type ElectronUpdaterChannel = 'latest' | 'stable' | 'alpha' | 'beta' | 'nightly' | 'canary'

export interface ElectronUpdaterPreferences {
  channel?: ElectronUpdaterChannel
}

export const electronGetUpdaterPreferences = defineInvokeEventa<ElectronUpdaterPreferences>('eventa:invoke:electron:auto-updater:get-preferences')
export const electronSetUpdaterPreferences = defineInvokeEventa<ElectronUpdaterPreferences, ElectronUpdaterPreferences>('eventa:invoke:electron:auto-updater:set-preferences')

export * from './plugin/assets'
export * from './plugin/capabilities'
export * from './plugin/host'
export * from './plugin/tools'

export interface DesktopOverlayReadiness {
  state: 'booting' | 'ready' | 'degraded'
  error?: string
}

export const getDesktopOverlayReadinessContract = defineInvokeEventa<DesktopOverlayReadiness>('eventa:invoke:electron:windows:desktop-overlay:get-readiness')

export const captionIsFollowingWindowChanged = defineEventa<boolean>('eventa:event:electron:windows:caption-overlay:is-following-window-changed')
export const captionGetIsFollowingWindow = defineInvokeEventa<boolean>('eventa:invoke:electron:windows:caption-overlay:get-is-following-window')

export type RequestWindowActionDefault = 'confirm' | 'cancel' | 'close'
export interface RequestWindowPayload {
  id?: string
  route: string
  type?: string
  payload?: Record<string, any>
}
export interface RequestWindowPending {
  id: string
  type?: string
  payload?: Record<string, any>
}

// Reference window helpers are generic; callers can alias for clarity
export type NoticeAction = 'confirm' | 'cancel' | 'close'

export function createRequestWindowEventa(namespace: string) {
  const prefix = (name: string) => `eventa:${name}:electron:windows:${namespace}`
  return {
    openWindow: defineInvokeEventa<boolean, RequestWindowPayload>(prefix('invoke:open')),
    windowAction: defineInvokeEventa<void, { id: string, action: RequestWindowActionDefault }>(prefix('invoke:action')),
    pageMounted: defineInvokeEventa<RequestWindowPending | undefined, { id?: string }>(prefix('invoke:page-mounted')),
    pageUnmounted: defineInvokeEventa<void, { id?: string }>(prefix('invoke:page-unmounted')),
  }
}

// Notice window events built from generic factory
export const noticeWindowEventa = createRequestWindowEventa('notice')

// Widgets / Adhoc window events
export interface WidgetWindowSize {
  width?: number
  height?: number
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
}

export type WidgetGridSize = 's' | 'm' | 'l' | { cols?: number, rows?: number }

export interface WidgetsAddPayload {
  id?: string
  componentName: string
  componentProps?: Record<string, any>
  // size presets or explicit spans; renderer decides mapping
  size?: WidgetGridSize
  windowSize?: WidgetWindowSize | Record<string, unknown>
  // auto-dismiss in ms; if omitted, persistent until closed by user
  ttlMs?: number
}

export interface WidgetsUpdatePayload {
  id: string
  componentProps?: Record<string, any>
  size?: WidgetGridSize
  windowSize?: WidgetWindowSize | Record<string, unknown>
  ttlMs?: number
}

export interface WidgetSnapshot {
  id: string
  componentName: string
  componentProps: Record<string, any>
  size: WidgetGridSize
  windowSize?: WidgetWindowSize
  ttlMs: number
}

export interface PluginManifestSummary {
  extensionId: string
  entrypoints: Record<string, string | undefined>
  path: string
  enabled: boolean
  loaded: boolean
  isNew: boolean
}

export interface PluginRegistrySnapshot {
  root: string
  plugins: PluginManifestSummary[]
  /** Set to true while the extension host is still initializing (pre-init list() call). */
  loading?: boolean
}

// TODO: Replace these manually duplicated IPC types with re-exports from
// @kitsune/plugin-sdk (CapabilityDescriptor) once stage-ui and the shared
// eventa layer can depend on the SDK without introducing unwanted coupling.
export interface PluginCapabilityPayload {
  key: string
  state: 'announced' | 'ready' | 'degraded' | 'withdrawn'
  metadata?: Record<string, unknown>
}

export interface PluginCapabilityState {
  key: string
  state: 'announced' | 'ready' | 'degraded' | 'withdrawn'
  metadata?: Record<string, unknown>
  updatedAt: number
}

export interface PluginHostSessionSummary {
  id: string
  extensionId: string
  phase: string
  runtime: 'electron' | 'node' | 'web'
  moduleId: string
}

export interface PluginHostDebugSnapshot {
  registry: PluginRegistrySnapshot
  sessions: PluginHostSessionSummary[]
  capabilities: PluginCapabilityState[]
  refreshedAt: number
}

export interface ElectronMcpStdioServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  enabled?: boolean
}

export interface ElectronMcpStdioConfigFile {
  mcpServers: Record<string, ElectronMcpStdioServerConfig>
}

export interface ElectronMcpStdioApplyResult {
  path: string
  started: Array<{ name: string }>
  failed: Array<{ name: string, error: string }>
  skipped: Array<{ name: string, reason: string }>
}

export interface ElectronMcpStdioServerRuntimeStatus {
  name: string
  state: 'running' | 'stopped' | 'error'
  command: string
  args: string[]
  pid: number | null
  lastError?: string
}

export interface ElectronMcpStdioRuntimeStatus {
  path: string
  servers: ElectronMcpStdioServerRuntimeStatus[]
  updatedAt: number
}

export interface ElectronMcpToolDescriptor {
  serverName: string
  name: string
  toolName: string
  description?: string
  inputSchema: Record<string, unknown>
}

export interface ElectronMcpCallToolPayload {
  name: string
  arguments?: Record<string, unknown>
}

export interface ElectronMcpCallToolResult {
  content?: Array<Record<string, unknown>>
  structuredContent?: Record<string, unknown>
  toolResult?: unknown
  isError?: boolean
}

export interface ElectronMcpStdioConfigText {
  path: string
  text: string
}

export interface ElectronMcpStdioTestResult {
  ok: boolean
  error?: string
  tools?: string[]
  durationMs: number
}

export interface ElectronMcpStdioTestPayload {
  name: string
  config: ElectronMcpStdioServerConfig
}

export const electronMcpOpenConfigFile = defineInvokeEventa<{ path: string }>('eventa:invoke:electron:mcp:open-config-file')
export const electronMcpApplyAndRestart = defineInvokeEventa<ElectronMcpStdioApplyResult>('eventa:invoke:electron:mcp:apply-and-restart')
export const electronMcpGetRuntimeStatus = defineInvokeEventa<ElectronMcpStdioRuntimeStatus>('eventa:invoke:electron:mcp:get-runtime-status')
export const electronMcpListTools = defineInvokeEventa<ElectronMcpToolDescriptor[]>('eventa:invoke:electron:mcp:list-tools')
export const electronMcpCallTool = defineInvokeEventa<ElectronMcpCallToolResult, ElectronMcpCallToolPayload>('eventa:invoke:electron:mcp:call-tool')
export const electronMcpReadConfigText = defineInvokeEventa<ElectronMcpStdioConfigText>('eventa:invoke:electron:mcp:read-config-text')
export const electronMcpWriteConfigText = defineInvokeEventa<ElectronMcpStdioConfigText, { text: string }>('eventa:invoke:electron:mcp:write-config-text')
export const electronMcpTestServer = defineInvokeEventa<ElectronMcpStdioTestResult, ElectronMcpStdioTestPayload>('eventa:invoke:electron:mcp:test-server')

export interface MemoryEntry {
  id: string
  content: string
  type: string
  source?: string
  /** 会话隔离 — 同一 sessionId 的记忆只在同一会话中可见 */
  sessionId?: string
  created_at?: string
  updated_at?: string
  metadata?: Record<string, any>
}

export interface MemoryStats {
  totalEntries: number
  totalSizeBytes: number
  lastCleanedAt: string | null
  nextCleanupAt: string | null
}

export interface MemorySettings {
  retentionDays: number
  maxEntries: number
  autoCleanup: boolean
  autoExtract: boolean
  expirationDays: number
  retrievalTopK: number
  provider: 'local' | 'mem0'
  apiKey: string
  lastCleanedAt?: string
  nextCleanupAt?: string
}

export interface MemoryUserProfile {
  name: string
  preferences: Record<string, string>
  createdAt: string
  updatedAt: string
}

export type MemoryExtractRuleCategory = 'preference' | 'fact' | 'event' | 'emotion' | 'other'

export interface MemoryExtractRule {
  id: string
  name: string
  pattern: string
  category: MemoryExtractRuleCategory
  enabled: boolean
  priority: number
}

export const electronMemoryGetStats = defineInvokeEventa<MemoryStats>('eventa:invoke:electron:memory:get-stats')
export const electronMemoryListEntries = defineInvokeEventa<MemoryEntry[], { limit?: number, offset?: number, q?: string, type?: string, sessionId?: string }>('eventa:invoke:electron:memory:list-entries')
export const electronMemoryAddEntry = defineInvokeEventa<MemoryEntry, Omit<MemoryEntry, 'id' | 'created_at' | 'updated_at'>>('eventa:invoke:electron:memory:add-entry')
export const electronMemoryRemoveEntry = defineInvokeEventa<boolean, { id: string }>('eventa:invoke:electron:memory:remove-entry')
export const electronMemoryClearAll = defineInvokeEventa<{ cleared: number }>('eventa:invoke:electron:memory:clear-all')
export const electronMemoryCleanup = defineInvokeEventa<{ removed: number }>('eventa:invoke:electron:memory:cleanup')
export const electronMemoryImport = defineInvokeEventa<{ imported: number }, { entries: MemoryEntry[], userProfile?: MemoryUserProfile, settings?: MemorySettings, extractRules?: MemoryExtractRule[] }>('eventa:invoke:electron:memory:import')
export const electronMemoryExport = defineInvokeEventa<{ json: string }>('eventa:invoke:electron:memory:export')
export const electronMemoryGetSettings = defineInvokeEventa<MemorySettings>('eventa:invoke:electron:memory:get-settings')
export const electronMemorySetSettings = defineInvokeEventa<MemorySettings, Partial<MemorySettings>>('eventa:invoke:electron:memory:set-settings')
export const electronMemoryGetProfile = defineInvokeEventa<MemoryUserProfile | null>('eventa:invoke:electron:memory:get-profile')
export const electronMemorySetProfile = defineInvokeEventa<MemoryUserProfile, { name?: string, preferences?: Record<string, string> }>('eventa:invoke:electron:memory:set-profile')
export const electronMemoryGetRules = defineInvokeEventa<MemoryExtractRule[]>('eventa:invoke:electron:memory:get-rules')
export const electronMemorySetRules = defineInvokeEventa<MemoryExtractRule[], { rules: MemoryExtractRule[] }>('eventa:invoke:electron:memory:set-rules')
export const electronMemoryTestRules = defineInvokeEventa<Array<{ ruleId: string, ruleName: string, category: string, priority: number }>, { text: string, rules?: MemoryExtractRule[] }>('eventa:invoke:electron:memory:test-rules')
export const electronMemoryExtractAndSave = defineInvokeEventa<{ saved: number }, { userMessage: string, assistantMessage: string, sessionId: string }>('eventa:invoke:electron:memory:extract-and-save')
export const electronMemorySearchForChat = defineInvokeEventa<Array<{ content: string }>, { query: string, sessionId: string }>('eventa:invoke:electron:memory:search-for-chat')

export const electronShortTermMemoryGetStats = defineInvokeEventa<MemoryStats>('eventa:invoke:electron:short-term-memory:get-stats')
export const electronShortTermMemoryListEntries = defineInvokeEventa<MemoryEntry[], { limit?: number, offset?: number, q?: string, type?: string }>('eventa:invoke:electron:short-term-memory:list-entries')
export const electronShortTermMemoryAddEntry = defineInvokeEventa<MemoryEntry, Omit<MemoryEntry, 'id' | 'created_at' | 'updated_at'>>('eventa:invoke:electron:short-term-memory:add-entry')
export const electronShortTermMemoryRemoveEntry = defineInvokeEventa<boolean, { id: string }>('eventa:invoke:electron:short-term-memory:remove-entry')
export const electronShortTermMemoryClearAll = defineInvokeEventa<{ cleared: number }>('eventa:invoke:electron:short-term-memory:clear-all')
export const electronShortTermMemoryCleanup = defineInvokeEventa<{ removed: number }>('eventa:invoke:electron:short-term-memory:cleanup')
export const electronShortTermMemoryImport = defineInvokeEventa<{ imported: number }, { entries: MemoryEntry[], settings?: MemorySettings }>('eventa:invoke:electron:short-term-memory:import')
export const electronShortTermMemoryExport = defineInvokeEventa<{ json: string }>('eventa:invoke:electron:short-term-memory:export')
export const electronShortTermMemoryGetSettings = defineInvokeEventa<MemorySettings>('eventa:invoke:electron:short-term-memory:get-settings')
export const electronShortTermMemorySetSettings = defineInvokeEventa<MemorySettings, Partial<MemorySettings>>('eventa:invoke:electron:short-term-memory:set-settings')

export const widgetsOpenWindow = defineInvokeEventa<void, { id?: string }>('eventa:invoke:electron:windows:widgets:open')
export const widgetsHideWindow = defineInvokeEventa<void, { id?: string }>('eventa:invoke:electron:windows:widgets:hide')
export const widgetsAdd = defineInvokeEventa<string | undefined, WidgetsAddPayload>('eventa:invoke:electron:windows:widgets:add')
export const widgetsRemove = defineInvokeEventa<void, { id: string }>('eventa:invoke:electron:windows:widgets:remove')
export const widgetsClear = defineInvokeEventa('eventa:invoke:electron:windows:widgets:clear')
export const widgetsUpdate = defineInvokeEventa<void, WidgetsUpdatePayload>('eventa:invoke:electron:windows:widgets:update')
export const widgetsFetch = defineInvokeEventa<WidgetSnapshot | void, { id: string }>('eventa:invoke:electron:windows:widgets:fetch')
export const widgetsPrepareWindow = defineInvokeEventa<string | undefined, { id?: string }>('eventa:invoke:electron:windows:widgets:prepare')
export const widgetsIframePublish = defineInvokeEventa<void, { id: string, event: Record<string, unknown> }>('eventa:invoke:electron:windows:widgets:iframe-publish')

export const electronWindowClose = defineInvokeEventa<void>('eventa:invoke:electron:window:close')
export type ElectronWindowLifecycleReason
  = | 'initial'
    | 'snapshot'
    | 'show'
    | 'hide'
    | 'minimize'
    | 'restore'
    | 'focus'
    | 'blur'

export interface ElectronWindowLifecycleState {
  focused: boolean
  minimized: boolean
  reason: ElectronWindowLifecycleReason
  updatedAt: number
  visible: boolean
}

export const electronWindowLifecycleChanged = defineEventa<ElectronWindowLifecycleState>('eventa:event:electron:window:lifecycle-changed')
export const electronGetWindowLifecycleState = defineInvokeEventa<ElectronWindowLifecycleState>('eventa:invoke:electron:window:get-lifecycle-state')
export const electronWindowSetAlwaysOnTop = defineInvokeEventa<void, boolean>('eventa:invoke:electron:window:set-always-on-top')
export const electronAppOpenUserDataFolder = defineInvokeEventa<{ path: string }>('eventa:invoke:electron:app:open-user-data-folder')
export const electronAppQuit = defineInvokeEventa<void>('eventa:invoke:electron:app:quit')

export type ElectronGodotStageState = 'stopped' | 'starting' | 'running' | 'stopping' | 'error'

/**
 * Snapshot of the Godot sidecar lifecycle owned by Electron main.
 *
 * Use when:
 * - Renderer windows need to reflect whether the external Godot window is available
 * - Settings or stage pages need lifecycle feedback after start/stop actions
 *
 * Expects:
 * - `pid` is only set while the Godot child process exists
 * - `lastError` is present for the most recent lifecycle or scene-apply failure
 *
 * Returns:
 * - N/A
 */
export interface ElectronGodotStageStatus {
  state: ElectronGodotStageState
  pid: number | null
  lastError?: string
  updatedAt: number
}

/**
 * Serialized scene input payload forwarded from renderer to Electron main.
 *
 * Use when:
 * - The selected model should be materialized to disk and applied to the Godot scene
 *
 * Expects:
 * - `data` contains the full model file bytes
 * - `fileName` matches the original model asset name when available
 *
 * Returns:
 * - N/A
 */
export interface ElectronGodotStageSceneInputPayload {
  modelId: string
  format: 'vrm'
  name: string
  fileName: string
  data: Uint8Array
}

export const electronGodotStageStart = defineInvokeEventa<ElectronGodotStageStatus>('eventa:invoke:electron:godot-stage:start')
export const electronGodotStageStop = defineInvokeEventa<ElectronGodotStageStatus>('eventa:invoke:electron:godot-stage:stop')
export const electronGodotStageGetStatus = defineInvokeEventa<ElectronGodotStageStatus>('eventa:invoke:electron:godot-stage:get-status')
export const electronGodotStageApplySceneInput = defineInvokeEventa<void, ElectronGodotStageSceneInputPayload>('eventa:invoke:electron:godot-stage:apply-scene-input')
export const electronGodotStageGetViewSnapshot = defineInvokeEventa<StageViewSnapshotPayload | null>('eventa:invoke:electron:godot-stage:view-snapshot:get')
export const electronGodotStageApplyViewPatch = defineInvokeEventa<StageViewRequestAckPayload, StageViewPatch>('eventa:invoke:electron:godot-stage:view-state:apply-patch')
export const electronGodotStageRequestViewSnapshot = defineInvokeEventa<StageViewRequestAckPayload>('eventa:invoke:electron:godot-stage:view-state:request-snapshot')
export const electronGodotStageStatusChanged = defineEventa<ElectronGodotStageStatus>('eventa:event:electron:godot-stage:status-changed')
export const electronGodotStageViewSnapshotChanged = defineEventa<StageViewSnapshotPayload>('eventa:event:electron:godot-stage:view-snapshot-changed')
export const electronGodotStageViewStateError = defineEventa<StageViewErrorPayload>('eventa:event:electron:godot-stage:view-state-error')

// Global shortcut ->

/**
 * Phase of a shortcut trigger event.
 *
 * - `down` — key combination pressed
 * - `up`   — key combination released; only emitted by drivers that
 *            accepted a binding with `receiveKeyUps: true`
 */
export type ElectronShortcutTriggerPhase = 'down' | 'up'

/**
 * Payload broadcast to all subscribed windows when a registered shortcut
 * fires. Renderer composables filter by `id` to dispatch local handlers.
 */
export interface ElectronShortcutTriggerPayload {
  id: string
  phase: ElectronShortcutTriggerPhase
}

export const electronShortcutRegister = defineInvokeEventa<ShortcutRegistrationResult, ShortcutBinding>('eventa:invoke:electron:shortcut:register')
export const electronShortcutUnregister = defineInvokeEventa<void, { id: string }>('eventa:invoke:electron:shortcut:unregister')
export const electronShortcutUnregisterAll = defineInvokeEventa<void>('eventa:invoke:electron:shortcut:unregister-all')
export const electronShortcutList = defineInvokeEventa<ShortcutBinding[]>('eventa:invoke:electron:shortcut:list')
export const electronShortcutTriggered = defineEventa<ElectronShortcutTriggerPayload>('eventa:event:electron:shortcut:triggered')

// <- Global shortcut

export type StageThreeRuntimeTraceEnvelope
  = | { type: 'three-render-info', payload: ThreeSceneRenderInfoTracePayload }
    | { type: 'three-hit-test-read', payload: ThreeHitTestReadTracePayload }
    | { type: 'vrm-update-frame', payload: VrmUpdateFrameTracePayload }
    | { type: 'vrm-load-start', payload: VrmLoadStartTracePayload }
    | { type: 'vrm-load-end', payload: VrmLoadEndTracePayload }
    | { type: 'vrm-load-error', payload: VrmLoadErrorTracePayload }
    | { type: 'vrm-dispose-start', payload: VrmDisposeStartTracePayload }
    | { type: 'vrm-dispose-end', payload: VrmDisposeEndTracePayload }

export interface StageThreeRuntimeTraceForwardedPayload {
  envelope: StageThreeRuntimeTraceEnvelope
  origin: string
}

export interface StageThreeRuntimeTraceRemoteControlPayload {
  origin: string
}

export const stageThreeRuntimeTraceForwardedEvent = defineEventa<StageThreeRuntimeTraceForwardedPayload>('eventa:event:stage-three-runtime-trace:forwarded')
export const stageThreeRuntimeTraceRemoteEnableEvent = defineEventa<StageThreeRuntimeTraceRemoteControlPayload>('eventa:event:stage-three-runtime-trace:remote-enable')
export const stageThreeRuntimeTraceRemoteDisableEvent = defineEventa<StageThreeRuntimeTraceRemoteControlPayload>('eventa:event:stage-three-runtime-trace:remote-disable')

// Internal event from main -> widgets renderer when a widget should render
export const widgetsRenderEvent = defineEventa<WidgetSnapshot>('eventa:event:electron:windows:widgets:render')
export const widgetsRemoveEvent = defineEventa<{ id: string }>('eventa:event:electron:windows:widgets:remove')
export const widgetsClearEvent = defineEventa('eventa:event:electron:windows:widgets:clear')
export const widgetsUpdateEvent = defineEventa<WidgetsUpdatePayload>('eventa:event:electron:windows:widgets:update')

// Persona system events
export interface PersonaBuildContextPayload {
  sessionId?: string
  input?: string
}

export interface PersonaBuildContextResult {
  prompt: string
  mode: string
  source: string
  addressing?: string
  guidance?: { promptedForCustomName: boolean }
  sources: string[]
}

export const electronPersonaBuildContext = defineInvokeEventa<PersonaBuildContextResult, PersonaBuildContextPayload>('eventa:invoke:electron:persona:build-context')
export const electronPersonaGetConfig = defineInvokeEventa<Record<string, unknown>>('eventa:invoke:electron:persona:get-config')
export const electronPersonaGetProfile = defineInvokeEventa<Record<string, unknown>>('eventa:invoke:electron:persona:get-profile')
export const electronPersonaSetProfile = defineInvokeEventa<Record<string, unknown>, Record<string, unknown>>('eventa:invoke:electron:persona:set-profile')
export const electronPersonaGetMode = defineInvokeEventa<{ mode: string, source: string }>('eventa:invoke:electron:persona:get-mode')
export const electronPersonaSetMode = defineInvokeEventa<void, { mode: string }>('eventa:invoke:electron:persona:set-mode')

// Emotion mapper events
export const electronEmotionFromTool = defineInvokeEventa<string, { toolName: string }>('eventa:invoke:electron:emotion:from-tool')
export const electronEmotionFromText = defineInvokeEventa<string, { text: string }>('eventa:invoke:electron:emotion:from-text')
export const electronEmotionFromCategory = defineInvokeEventa<string, { category: string }>('eventa:invoke:electron:emotion:from-category')

// Character system events
export interface ElectronCharacter {
  id: string
  name: string
  personaId?: string
  soul?: string
  identity?: string
  voice?: { adapter: string, voiceId: string }
  model?: { engine: string, source: string }
  expressions?: Array<{ emotion: string }>
  metadata?: { description?: string, tags?: string[], avatar?: string }
  enabled?: boolean
}

export const electronCharacterList = defineInvokeEventa<ElectronCharacter[]>('eventa:invoke:electron:character:list')
export const electronCharacterGet = defineInvokeEventa<ElectronCharacter | null, { id: string }>('eventa:invoke:electron:character:get')
export const electronCharacterSetActive = defineInvokeEventa<boolean, { id: string }>('eventa:invoke:electron:character:set-active')
export const electronCharacterGetActive = defineInvokeEventa<ElectronCharacter | null>('eventa:invoke:electron:character:get-active')

// Onboarding window events
export const electronOnboardingClose = defineInvokeEventa('eventa:invoke:electron:windows:onboarding:close')
export const electronOpenOnboarding = defineInvokeEventa('eventa:invoke:electron:windows:onboarding:open')

export const i18nSetLocale = defineInvokeEventa<void, Locale>('eventa:invoke:electron:i18n:set-locale')
export const i18nGetLocale = defineInvokeEventa<string | undefined>('eventa:invoke:electron:i18n:get-locale')

// Overseer 监工系统 — schema 与 IPC 契约
// 事件 schema 权威定义在此（shared 契约所有方），main 侧 eventSchema.ts 重新导出。
export enum OverseerEventType {
  PermissionRequest = 'permission_request',
  TaskEnd = 'task_end',
  TaskFailed = 'task_failed',
  CompileFailed = 'compile_failed',
  TestFailed = 'test_failed',
  ProcessCrash = 'process_crash',
  Timeout = 'timeout',
  StatusUpdate = 'status_update',
}

export enum OverseerSeverity {
  Info = 'info',
  Warn = 'warn',
  Error = 'error',
}

export interface OverseerEvent<T = unknown> {
  id: string
  type: OverseerEventType
  source: string
  timestamp: number
  severity: OverseerSeverity
  data: T
}

export interface OverseerStatus {
  enabled: boolean
  running: boolean
  tools: Array<{ id: string, name: string, enabled: boolean, running: boolean }>
  updatedAt: number
}

export interface OverseerStats {
  eventsTotal: number
  eventsPushed: number
  eventsFiltered: number
  lastEventAt: number | null
  perTool: Record<string, { total: number, pushed: number }>
}

export const electronOverseerToggle = defineInvokeEventa<{ enabled: boolean }, { enabled: boolean }>('eventa:invoke:electron:overseer:toggle')
export const electronOverseerStatus = defineInvokeEventa<OverseerStatus>('eventa:invoke:electron:overseer:status')
export const electronOverseerStats = defineInvokeEventa<OverseerStats>('eventa:invoke:electron:overseer:stats')
export const electronOverseerEvent = defineEventa<OverseerEvent>('eventa:event:electron:overseer:event')

// Connectors — IDE 连接器管理（vscode / trae / idea 等）
export type ConnectorType = 'vscode' | 'trae' | 'idea' | 'unknown'

export interface ConnectorInfo {
  id: string
  type: ConnectorType
  name: string
  peerId: string
  connectedAt: number
  lastContext: unknown
  lastContextAt: number | null
}

export interface ConnectorTask {
  type: string
  payload?: Record<string, unknown>
}

export interface ConnectorSendTaskResult {
  ok: boolean
  error?: string
}

export const electronConnectorList = defineInvokeEventa<ConnectorInfo[]>('eventa:invoke:electron:connector:list')
export const electronConnectorStatus = defineInvokeEventa<ConnectorInfo | null, { id: string }>('eventa:invoke:electron:connector:status')
export const electronConnectorSendTask = defineInvokeEventa<ConnectorSendTaskResult, { id: string, task: ConnectorTask }>('eventa:invoke:electron:connector:send-task')
export const electronConnectorChanged = defineEventa<ConnectorInfo[]>('eventa:event:electron:connector:changed')

// Connector task result — IDE 执行任务后通过 WebSocket 回传结果
export interface ConnectorTaskResult {
  taskId: string
  success: boolean
  error?: string
}
export const electronConnectorTaskResult = defineEventa<ConnectorTaskResult>(
  'eventa:event:electron:connector:task-result',
)

// Sidecar — 本地子进程（GPT-SoVITS 等）通过 stdin/stdout 管道通信
export type SidecarState = 'stopped' | 'starting' | 'running' | 'stopping' | 'error' | 'degraded'

export interface SidecarStatus {
  id: string
  state: SidecarState
  pid: number | null
  restartCount: number
  lastError?: string
  updatedAt: number
}

export interface SidecarHealth {
  id: string
  healthy: boolean
  state: SidecarState
  pid: number | null
  reason?: string
}

/** 启动 sidecar 的可序列化配置（IPC 传输用，不含回调函数）。 */
export interface SidecarStartPayload {
  id: string
  /** 已知 id 可省略，由后端按 SIDECAR_DEFAULT_CONFIGS 解析；未知 id 必填。 */
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
}

export const electronSidecarStart = defineInvokeEventa<SidecarStatus, SidecarStartPayload>('eventa:invoke:electron:sidecar:start')
export const electronSidecarStop = defineInvokeEventa<SidecarStatus, { id: string }>('eventa:invoke:electron:sidecar:stop')
export const electronSidecarStatus = defineInvokeEventa<SidecarStatus[]>('eventa:invoke:electron:sidecar:status')
export const electronSidecarHealth = defineInvokeEventa<SidecarHealth, { id: string }>('eventa:invoke:electron:sidecar:health')
export const electronSidecarStatusChanged = defineEventa<SidecarStatus>('eventa:event:electron:sidecar:status-changed')

// ComfyUI — 本地图像生成服务，进程由 SidecarService 管理，API 通信走 HTTP
export interface ComfyUIStatus {
  running: boolean
  url: string
  version?: string
  gpu?: string
  vram?: string
  state: 'stopped' | 'starting' | 'running' | 'stopping' | 'error' | 'degraded'
}

export const electronComfyuiStart = defineInvokeEventa<ComfyUIStatus>('eventa:invoke:electron:comfyui:start')
export const electronComfyuiStop = defineInvokeEventa<ComfyUIStatus>('eventa:invoke:electron:comfyui:stop')
export const electronComfyuiStatus = defineInvokeEventa<ComfyUIStatus>('eventa:invoke:electron:comfyui:status')
export const electronComfyuiSetConfig = defineInvokeEventa<{ needsRestart: boolean }, { dir?: string, port?: number }>('eventa:invoke:electron:comfyui:set-config')
export const electronComfyuiStatusChanged = defineEventa<ComfyUIStatus>('eventa:event:electron:comfyui:status-changed')

// TTS 引擎选择 — 支持 GPT-SoVITS / Edge TTS / 系统 TTS 切换与自动降级。
// GPT-SoVITS 不可用时降级到 Edge TTS；Edge TTS 离线时降级到系统 TTS。
export type TtsEngine = string

export interface TtsEngineInfo {
  id: TtsEngine
  name: string
  available: boolean
  /** 不可用原因（available=false 时由后端填充，供 UI 展示诊断信息）。 */
  reason?: string
}

export const electronTtsGetEngines = defineInvokeEventa<TtsEngineInfo[]>('eventa:invoke:electron:tts:get-engines')
export const electronTtsSetEngine = defineInvokeEventa<void, { engine: TtsEngine }>('eventa:invoke:electron:tts:set-engine')
export const electronTtsCurrentEngine = defineInvokeEventa<TtsEngine>('eventa:invoke:electron:tts:current-engine')
export { electronTtsListVoices, electronTtsImportVoicePack, electronTtsDeleteVoice } from '@kitsune/stage-shared'
export const electronTtsStart = defineInvokeEventa<{ success: boolean, message: string }>('eventa:invoke:electron:tts:start')
export const electronTtsStop = defineInvokeEventa<{ success: boolean, message: string }>('eventa:invoke:electron:tts:stop')
// NOTE: the main-process handler returns `getGptSovitsConfig()`, whose data
// directory field is named `dir` (not `dataDir`) — keep the contract aligned.
export const electronTtsGetConfig = defineInvokeEventa<{ dir: string | null, port: number | undefined, device: string | undefined }>('eventa:invoke:electron:tts:get-config')
export const electronTtsSetConfig = defineInvokeEventa<{ needsRestart: boolean }, { dir?: string, port?: number, device?: 'auto' | 'cpu' | 'cuda' | 'cuda-half' }>('eventa:invoke:electron:tts:set-config')
export const electronTtsInstallProgress = defineEventa<{ message: string }>('eventa:event:electron:tts:install-progress')

// ============================================================================
// ASR — 本地语音识别（sherpa-onnx，SenseVoice/Paraformer/Whisper）
// ============================================================================

/** ASR 转录结果 */
export interface AsrTranscribeResult {
  text: string
  lang?: string
  emotion?: string
  event?: string
}

/** ASR 引擎信息 */
export interface AsrEngineInfo {
  id: string
  name: string
  type: string
}

/** ASR 转录 — 接收 Float32Array 音频，返回文本 + 情感 */
export const electronAsrTranscribe = defineInvokeEventa<
  AsrTranscribeResult,
  { audioSamples: Float32Array, sampleRate: number }
>('eventa:invoke:electron:asr:transcribe')

/** ASR 切换引擎 */
export const electronAsrSwitchEngine = defineInvokeEventa<
  { success: boolean },
  { engineId: string }
>('eventa:invoke:electron:asr:switch-engine')

/** ASR 获取状态 */
export const electronAsrGetStatus = defineInvokeEventa<
  { engineId: string | null, ready: boolean, modelsDir: string }
>('eventa:invoke:electron:asr:get-status')

/** ASR 列出可用引擎 */
export const electronAsrListEngines = defineInvokeEventa<
  AsrEngineInfo[]
>('eventa:invoke:electron:asr:list-engines')

// Dialog — 通用文件夹选择对话框，供 sidecar 设置页等场景调用 Electron dialog.showOpenDialog
export const electronDialogChooseDirectory = defineInvokeEventa<
  { canceled: boolean, path: string | null },
  { title?: string }
>('eventa:invoke:electron:dialog:choose-directory')

// Dialog — 通用文件选择对话框，支持扩展名过滤（用于 TTS 克隆声线选择音频文件等场景）
export const electronDialogChooseFile = defineInvokeEventa<
  { canceled: boolean, path: string | null },
  { title?: string, extensions?: string[] }
>('eventa:invoke:electron:dialog:choose-file')

// TTS 克隆声线 — 上传音频 + 文本标注，调用 sidecar set_reference_audio 注册自定义声线。
// 注册后即可用 character_name 调用 tts 合成，实现声音克隆。
export const electronTtsCloneVoice = defineInvokeEventa<
  { success: boolean, characterName: string, error?: string },
  { characterName: string, audioPath: string, audioText: string, language?: string }
>('eventa:invoke:electron:tts:clone-voice')

// TTS 删除已克隆声线 — 从 sidecar 已注册角色中移除指定角色（仅支持克隆角色，不能删除预定义角色）。
export const electronTtsRemoveVoice = defineInvokeEventa<
  { success: boolean, error?: string },
  { characterName: string }
>('eventa:invoke:electron:tts:remove-voice')

// Doctor — 内置健康检查（16 大类别诊断 + 自动修复），参考 Hermes Agent CLI doctor 设计
export type DoctorCategory = 'config' | 'connectivity' | 'sidecar' | 'permissions' | 'ports' | 'tls' | 'resources' | 'overseer' | 'plugins' | 'network' | 'gpu' | 'tts' | 'desktop' | 'sandbox' | 'comfyui'
export type DoctorLevel = 'PASS' | 'WARN' | 'FAIL' | 'INFO'
export type FixLevel = 'FIXED' | 'MANUAL'

/**
 * Structured repair data filled by check functions and consumed by fixOne,
 * replacing fragile regex parsing of the `detail` string.
 */
export interface DoctorFixPayload {
  /** Filled when a sidecar is unhealthy; fixOne uses it to call sidecar.restart. */
  sidecarId?: string
  /** Filled when a directory is missing; fixOne uses it to call mkdir. */
  dirPath?: string
  /** Filled when overseer tools are not running (reserved; fixOne currently returns MANUAL). */
  toolIds?: string[]
}

export interface DoctorResult {
  category: DoctorCategory
  level: DoctorLevel
  detail: string
  /** FAIL 级别必须附带修复建议；PASS/WARN/INFO 可选 */
  suggestion?: string
  /** Structured repair data consumed by fixOne; avoids regex-parsing `detail`. */
  fixPayload?: DoctorFixPayload
}

export interface FixResult {
  category: DoctorCategory
  /** FIXED 表示已自动修复，MANUAL 表示需要人工介入 */
  level: FixLevel
  detail: string
}

export const electronDoctorRun = defineInvokeEventa<DoctorResult[]>('eventa:invoke:electron:doctor:run')
export const electronDoctorFix = defineInvokeEventa<FixResult[]>('eventa:invoke:electron:doctor:fix')
export const electronDoctorStatus = defineInvokeEventa<DoctorResult[] | null>('eventa:invoke:electron:doctor:status')

// Agent API — 直接对接开放 API 的 Agent（Cloud Code / OpenCode / Trae Builder 等），无需连接器
export type AgentApiProvider = 'cloud_code' | 'opencode' | 'trae_builder'

/** Agent 运行时状态。pending=已推送未确认，running=Agent 反馈执行中，succeeded/failed=终态。 */
export type AgentTaskState = 'pending' | 'running' | 'succeeded' | 'failed'

export interface AgentConfig {
  id: string
  /** 对接的 Agent 类型，决定 API 端点形状与鉴权方式。 */
  provider: AgentApiProvider
  /** 用户可读名称，渲染进程展示用。 */
  name: string
  /** API 基础地址，例如 https://api.example.com。留空时按 provider 取内置默认。 */
  baseUrl?: string
  /** 是否已配置密钥（不暴露密钥本身）。 */
  hasKey: boolean
  /** 密钥明文（仅已配置时存在；安全场景可能不暴露）。 */
  key?: string
  /** 是否启用任务推送。 */
  enabled: boolean
  /** 密钥是否以明文落盘（safeStorage 不可用时降级）。前端应据此向用户告警。 */
  plaintextFallback?: boolean
}

export interface AgentTaskPayload {
  /** 任务标题或自然语言指令，由调用方组织。 */
  prompt: string
  /** 可选上下文附件（文件路径、片段等），由 Agent 自行解释。 */
  context?: Record<string, unknown>
}

export interface AgentTaskResult {
  taskId: string
  agentId: string
  state: AgentTaskState
  /** Agent 返回的产出文本或错误信息。 */
  output?: string
  /** 截屏校验建议（Trae Builder 模式联动屏幕监控产出）。 */
  visionHint?: string
  timestamp: number
}

export interface AgentApiSendTaskResult {
  ok: boolean
  /** 远端 Agent 分配的任务 id（推送成功时返回）。 */
  remoteTaskId?: string
  error?: string
}

export const electronAgentApiList = defineInvokeEventa<AgentConfig[]>('eventa:invoke:electron:agent-api:list')
export const electronAgentApiSendTask = defineInvokeEventa<AgentApiSendTaskResult, { id: string, task: AgentTaskPayload }>('eventa:invoke:electron:agent-api:send-task')
export const electronAgentApiSetKey = defineInvokeEventa<AgentConfig, { id: string, provider: AgentApiProvider, name?: string, baseUrl?: string, key: string, enabled?: boolean }>('eventa:invoke:electron:agent-api:set-key')
export const electronAgentApiResult = defineEventa<AgentTaskResult>('eventa:event:electron:agent-api:result')

// Log level — 运行时调整 @guiiai/logg 全局日志级别，环境适配中心用此控制日志详细度
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

export const electronLogLevelGet = defineInvokeEventa<LogLevel>('eventa:invoke:electron:log-level:get')
export const electronLogLevelSet = defineInvokeEventa<LogLevel, { level: LogLevel }>('eventa:invoke:electron:log-level:set')

// Permission whitelist — Task 10.9 的契约定义。
// Overseer 修正动作首次确认后，用户可勾选「此类修正自动执行」加入白名单，
// key 形如 `${source}:${assertion.type}`（例如 `trae:compile_success`）。
// NOTICE: handler 由 Task 10 的 overseer/permission.ts 模块注册；当前主进程未实现，
// 调用方需自行容错（UI 默认走 mock 数据 + 提示后端未就绪）。
export interface PermissionWhitelistEntry {
  key: string
  /** 白名单来源事件类型，便于按类型批量管理。 */
  assertionType?: string
  /** 来源工具或进程标识。 */
  source?: string
  createdAt: number
}

export const electronPermissionWhitelistList = defineInvokeEventa<PermissionWhitelistEntry[]>('eventa:invoke:electron:permission-whitelist:list')
export const electronPermissionWhitelistRemove = defineInvokeEventa<{ removed: number }, { key: string }>('eventa:invoke:electron:permission-whitelist:remove')
export const electronPermissionWhitelistClear = defineInvokeEventa<{ cleared: number }>('eventa:invoke:electron:permission-whitelist:clear')

// Vision — 屏幕监控常驻服务（主进程定时截屏 → 推送 frame 到渲染进程走 visionOrchestratorStore.processCapture）
export interface VisionServiceStatus {
  running: boolean
  intervalMs: number
  lastCapture: number | null
  lastError?: string
}

/** 主进程每完成一次截屏后通过此事件把帧下发到渲染进程。 */
export interface VisionFrameCapturedPayload {
  /** JPEG data URL，可直接喂给 visionOrchestratorStore.processCapture。 */
  imageDataUrl: string
  /** desktopCapturer 返回的源 id（screen:0 / window:xxx），用作 processCapture 的 sourceId。 */
  sourceId: string
  /** 截屏时间戳。 */
  capturedAt: number
}

export const electronVisionStart = defineInvokeEventa<VisionServiceStatus, { intervalMs?: number }>('eventa:invoke:electron:vision:start')
export const electronVisionStop = defineInvokeEventa<VisionServiceStatus>('eventa:invoke:electron:vision:stop')
export const electronVisionStatus = defineInvokeEventa<VisionServiceStatus>('eventa:invoke:electron:vision:status')
export const electronVisionFrameCaptured = defineEventa<VisionFrameCapturedPayload>('eventa:event:electron:vision:frame-captured')

// Permission confirm — 首次修正弹窗确认流程（主 → 渲染 → 主）。
// 白名单本身复用上方 PermissionWhitelistEntry 契约，此处仅定义弹窗交互。
/** 主 → 渲染：首次修正弹窗，展示 diff 与摘要请用户确认 */
export interface PermissionConfirmPayload {
  taskId: string
  source: string
  assertionType: string
  diff: string
  summary: string
  /** 高风险操作标记 — 高风险时弹窗显示红色警告，且禁用自动执行按钮 */
  highRisk?: boolean
}

/** 渲染 → 主：用户确认结果，approved=false 时跳过本次修正 */
export interface PermissionConfirmResult {
  taskId: string
  approved: boolean
  /** 用户勾选「此类修正自动执行」时为 true，主进程据此加入白名单 */
  addToWhitelist: boolean
}

export const electronPermissionConfirm = defineEventa<PermissionConfirmPayload>('eventa:event:electron:permission:confirm')
export const electronPermissionResult = defineInvokeEventa<PermissionConfirmResult, PermissionConfirmResult>('eventa:invoke:electron:permission:result')

// Vision check — 任务推送后主进程发起的视觉对比请求（主 → 渲染 → 主）
// 主进程截屏后把图与 expectedDescription 发给渲染进程的 vision orchestrator，
// 渲染进程推理后通过 invoke 回传结果，主进程用 requestId 关联请求与响应。
export interface VisionCheckRequestPayload {
  requestId: string
  imageDataUrl: string
  expectedDescription: string
}

export interface VisionCheckResult {
  requestId: string
  passed: boolean
  reason: string
}

export const electronOverseerVisionCheck = defineEventa<VisionCheckRequestPayload>('eventa:event:electron:overseer:vision-check')
export const electronOverseerVisionCheckResult = defineInvokeEventa<VisionCheckResult, VisionCheckResult>('eventa:invoke:electron:overseer:vision-check-result')

// Overseer correction — 任务推送 → 延迟截屏 → 对比预期 → 修正建议 → 再推送 的联动入口
export type OverseerCorrectionTaskType = 'compile' | 'test' | 'refactor' | 'edit' | 'unknown'

export type OverseerAssertionType = 'compile_success' | 'test_pass' | 'file_exists'

export interface OverseerCorrectionAssertion {
  type: OverseerAssertionType
  command?: string
  cwd?: string
  filePath?: string
}

export interface OverseerCorrectionTask {
  /** 任务唯一标识，用于死循环保护计数 */
  id: string
  /** 任务来源（claude / trae / cursor 等），与白名单 key 拼接 */
  source: string
  type: OverseerCorrectionTaskType
  /** 估算时长（秒），缺失时按 type 查默认表 */
  estimatedDuration?: number
  /** 程序化断言，优先于 expectedDescription */
  assertion?: OverseerCorrectionAssertion
  /** 自然语言预期描述，走视觉 LLM 对比 */
  expectedDescription?: string
  /** 推送到 IDE 的任务数据，原样下发给连接器 */
  payload?: unknown
}

export interface OverseerCorrectionResult {
  taskId: string
  state: 'passed' | 'corrected' | 'needs_manual' | 'rejected'
  attempts: number
  reason: string
}

export const electronOverseerPushWithVerification = defineInvokeEventa<OverseerCorrectionResult, { task: OverseerCorrectionTask }>('eventa:invoke:electron:overseer:push-with-verification')

export { electron } from '@kitsune/electron-eventa'
export * from '@kitsune/electron-eventa/electron-updater'

// Executor — 自主执行层 IPC 契约（Overseer 升级为执行者）
// 类型定义在 executor/planGenerator.ts，此处仅做类型导入
import type { Plan, TaskResult, ExecutorStatus, Task } from '../../main/services/kitsune/overseer/executor/planGenerator'

// Re-exported so renderer components can consume the executor types through the shared
// eventa barrel instead of reaching into main-process source paths.
export type { ExecutorStatus, Plan, Task, TaskResult } from '../../main/services/kitsune/overseer/executor/planGenerator'

export const electronExecutorGenerate = defineInvokeEventa<{ ok: boolean, plan?: Plan, error?: string }, { requirement: string, cwd: string }>(
  'eventa:invoke:electron:executor:generate',
)
export const electronExecutorRun = defineInvokeEventa<{ ok: boolean, error?: string }, { plan: Plan }>(
  'eventa:invoke:electron:executor:run',
)
export const electronExecutorStop = defineInvokeEventa<{ ok: boolean }>(
  'eventa:invoke:electron:executor:stop',
)
export const electronExecutorStatus = defineInvokeEventa<ExecutorStatus>(
  'eventa:invoke:electron:executor:status',
)

export interface ExecutorEventPayload {
  type: 'plan_started' | 'task_started' | 'task_completed' | 'task_failed'
    | 'plan_completed' | 'plan_aborted' | 'plan_stopped'
    | 'permission_request' | 'pet_alert'
    | 'dag_level_started' | 'plan_adjusted'
    | 'sub_plan_started' | 'sub_plan_completed'
  planId?: string
  taskId?: string
  attempt?: number
  result?: TaskResult
  error?: string
  permKey?: string
  task?: Task
  message?: string
  /** 人格化安抚话术 — 任务失败时由 personaBuilder 生成 */
  personaMessage?: string
  /** dag_level_started — DAG 层级索引 */
  levelIndex?: number
  /** dag_level_started — 当前层级任务数 */
  taskCount?: number
  /** plan_adjusted — 失败任务 ID */
  failedTaskId?: string
  /** plan_adjusted — 新增任务数 */
  newTaskCount?: number
  /** sub_plan_started / sub_plan_completed — 子计划 ID */
  subPlanId?: string
  /** sub_plan_started — 触发子计划的任务 ID */
  sourceTaskId?: string
  /** sub_plan_completed — 子计划完成状态 */
  status?: string
  /** permission_request — 是否高风险任务（需用户显式确认） */
  highRisk?: boolean
}
export const electronExecutorEvent = defineEventa<ExecutorEventPayload>(
  'eventa:event:electron:executor:event',
)

// ========== Desktop Automation 桌面自动化 ==========

export interface ElectronDesktopAutomationInvokePayload {
  action: 'click' | 'moveTo' | 'drag' | 'type' | 'pressKey' | 'scroll' | 'screenshot' | 'getCursorPosition' | 'findElement' | 'setOverlayInteractive'
    | 'listWindows' | 'focusWindow' | 'maximizeWindow' | 'minimizeWindow' | 'restoreWindow' | 'closeWindow'
    | 'launchApp'
  params: {
    x?: number
    y?: number
    text?: string
    key?: string
    button?: 'left' | 'right' | 'middle'
    description?: string
    from?: { x: number, y: number }
    to?: { x: number, y: number }
    interactive?: boolean
    title?: string
    processName?: string
    command?: string
    args?: string[]
    direction?: 'up' | 'down' | 'left' | 'right'
    amount?: number
  }
}

export interface ElectronDesktopAutomationResult {
  ok: boolean
  error?: string
  result?: unknown
}

export const electronDesktopAutomationInvoke = defineInvokeEventa<ElectronDesktopAutomationResult, ElectronDesktopAutomationInvokePayload>(
  'eventa:invoke:electron:desktop-automation:invoke',
)

// ========== Desktop Automation Find Element 视觉元素定位 ==========

/** 主进程 → 渲染进程：请求视觉定位 UI 元素 */
export interface FindElementRequestPayload {
  requestId: string
  imageDataUrl: string
  description: string
  /** 可选：限定搜索区域 */
  region?: { x: number, y: number, width: number, height: number }
}

/** 渲染进程 → 主进程：视觉定位结果 */
export interface FindElementResultPayload {
  requestId: string
  found: boolean
  elements: Array<{
    label: string
    type: string
    x: number
    y: number
    width: number
    height: number
    confidence: number
  }>
  reason?: string
}

export const electronFindElementRequest = defineEventa<FindElementRequestPayload>('eventa:event:electron:desktop-automation:find-element-request')
export const electronFindElementResult = defineInvokeEventa<FindElementResultPayload, FindElementResultPayload>('eventa:invoke:electron:desktop-automation:find-element-result')

// ========== Window Management 窗口管理 ==========

export interface WindowInfo {
  title: string
  processName: string
  pid: number
  x: number
  y: number
  width: number
  height: number
  isVisible: boolean
  isMinimized: boolean
  isMaximized: boolean
}

export interface WindowActionPayload {
  title?: string
  processName?: string
}

export interface LaunchAppPayload {
  command: string
  args?: string[]
}

// ========== Window Snap 窗口贴靠 ==========

/** 窗口贴靠状态。 */
export type WindowSnapState = 'idle' | 'snapped' | 'taskbar'

/** 贴靠目标窗口信息。 */
export interface WindowSnapTarget {
  hwnd: number
  title: string
  rect: { x: number, y: number, width: number, height: number }
  isTaskbar: boolean
}

/** 窗口贴靠状态快照。 */
export interface WindowSnapStatus {
  state: WindowSnapState
  target: WindowSnapTarget | null
  snapFraction: number
}

/** 贴靠状态变更事件。 */
export const windowSnapStatusChanged = defineEventa<WindowSnapStatus>('eventa:event:electron:window-snap:status-changed')

/** 获取当前贴靠状态。 */
export const windowSnapGetStatus = defineInvokeEventa<WindowSnapStatus>('eventa:invoke:electron:window-snap:get-status')

/** 尝试在指定屏幕坐标吸附。 */
export const windowSnapTrySnap = defineInvokeEventa<void, { screenX: number, screenY: number }>('eventa:invoke:electron:window-snap:try-snap')

/** 请求解吸。 */
export const windowSnapUnsnap = defineInvokeEventa<void>('eventa:invoke:electron:window-snap:unsnap')

/** 更新吸附比例（拖拽中水平位置）。 */
export const windowSnapSetFraction = defineInvokeEventa<void, { fraction: number }>('eventa:invoke:electron:window-snap:set-fraction')

// ========== Taskbar 任务栏感知 ==========

export type TaskbarPosition = 'bottom' | 'top' | 'left' | 'right'

export interface TaskbarInfoSnapshot {
  position: TaskbarPosition
  rect: { x: number, y: number, width: number, height: number }
  thickness: number
  /** 桌宠窗口是否与任务栏重叠。 */
  isOverlapping: boolean
}

/** 获取当前任务栏信息。 */
export const taskbarGetInfo = defineInvokeEventa<TaskbarInfoSnapshot | null>('eventa:invoke:electron:taskbar:get-info')
