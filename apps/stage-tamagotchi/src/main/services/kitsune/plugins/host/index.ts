import type { TamagotchiToolRegistry } from '@kitsune/plugin-sdk-tamagotchi/tools'

import type {
  PluginHostDebugSnapshot,
  PluginRegistrySnapshot,
} from '../../../../../shared/eventa/plugin/host'
import type {
  ExtensionAssetCookie,
  ExtensionAssetSession,
  ExtensionAssetSnapshotService,
} from '../features/static-assets'
import type { ExtensionHostService, SetupExtensionHostOptions } from '../types'

import { mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import { useLogg } from '@guiiai/logg'
import {
  ExtensionHost,
} from '@kitsune/plugin-sdk/plugin-host'
import type { ModulePermissionDeclaration, ModulePermissionGrant } from '@kitsune/plugin-sdk/plugin-host'
import { app, session as electronSession } from 'electron'

import { createExtensionAutoReloadFeature } from '../features/auto-reload'
import { createExtensionAssetService } from '../features/static-assets'
import { createBuiltInExtensionKitRuntime } from '../kits'
import { createExtensionHostConfigStore } from './config'
import { buildPluginHostDebugSnapshot } from './debug'
import {
  buildPluginRegistrySnapshot,
  createExtensionHostRegistry,
  createManifestForLoad,
  manifestIdOf,
  resolvePluginRuntimeEntrypointPath,
} from './registry'

const extensionAssetSessionTtlMs = 30 * 24 * 60 * 60 * 1000

// NOTICE:
// Plugins are loaded into the main process (see plugin-sdk node/fs loader), so
// granting a permission is equivalent to trusting a plugin with host privileges.
// Auto-approved permission namespaces:
// 1. `kitsune:plugin-sdk:apis:protocol:*` — protocol discovery (devtools sample plugin)
// 2. `kitsune:plugin-sdk:apis:kits:*` — built-in kit APIs (gamelet, widget)
// 3. `kitsune:plugin-sdk:resources:kits:*` — built-in kit resources (widget bindings)
// Everything else is denied. This keeps built-in local extensions and kits working
// while denying arbitrary plugin permission escalation.
const SAFE_PROTOCOL_PERMISSION_PREFIXES = [
  'kitsune:plugin-sdk:apis:protocol:',
  'kitsune:plugin-sdk:apis:kits:',
  'kitsune:plugin-sdk:resources:kits:',
  // Built-in kit permissions (gamelet, widget) use short keys like 'kit.gamelet' or 'kit.gamelet.runtime'
  'kit.gamelet',
  'kit.widget',
]

interface PermissionScopeEntry {
  key: string
  actions: string[]
}

function isSafeProtocolScope(scope: { key: string }): boolean {
  return SAFE_PROTOCOL_PERMISSION_PREFIXES.some(prefix => scope.key.startsWith(prefix))
}

function narrowScopes<T extends PermissionScopeEntry>(scopes: T[] | undefined): T[] | undefined {
  if (!scopes)
    return undefined
  const narrowed = scopes.filter(isSafeProtocolScope)
  return narrowed.length > 0 ? narrowed : undefined
}

/**
 * Decides the granted permission set for one extension session.
 *
 * Auto-approves only protocol-discovery permissions; returns an empty grant for
 * privileged areas (filesystem, network, shell/exec, system). Keeps built-in
 * local extensions working while denying arbitrary plugin permission escalation.
 */
function resolvePluginPermissionGrant(_payload: {
  requested: ModulePermissionDeclaration
}): ModulePermissionGrant {
  const { requested } = _payload
  return {
    apis: narrowScopes(requested.apis),
    resources: narrowScopes(requested.resources),
    capabilities: narrowScopes(requested.capabilities),
    processors: narrowScopes(requested.processors),
    pipelines: narrowScopes(requested.pipelines),
  }
}

function createElectronExtensionAssetCookieAdapter() {
  return {
    async setCookie(cookie: ExtensionAssetCookie) {
      await electronSession.defaultSession.cookies.set({
        url: cookie.url,
        name: cookie.name,
        value: cookie.value,
        path: cookie.path,
        httpOnly: true,
        sameSite: 'no_restriction',
        secure: true,
        expirationDate: Math.floor(cookie.expiresAt / 1000),
      })
    },
    async removeCookie(cookie: ExtensionAssetCookie) {
      await electronSession.defaultSession.cookies.remove(cookie.url, cookie.name)
    },
  }
}

/**
 * Internal extension host bootstrap service used by the public `setupExtensionHost(...)` facade.
 *
 * Use when:
 * - `plugins/index.ts` needs a smaller orchestration layer with the same caller-facing API
 * - Host wiring should stay separate from config, registry, and snapshot helpers
 *
 * Expects:
 * - Consumers treat this as an internal bootstrap surface and keep the public facade unchanged
 * - `widgetsManager` is ready before startup begins
 *
 * Returns:
 * - The plain `ExtensionHostService` fields plus internal helpers for list/load/unload/inspect/dispose
 */
export interface ExtensionHostServiceInternal extends ExtensionHostService {
  /** Tamagotchi-owned extension tool registry used by IPC tool bridges. */
  tools: TamagotchiToolRegistry

  /**
   * Lists the current extension registry snapshot.
   *
   * Use when:
   * - IPC callers need the latest discovered plugin entries and enablement state
   * - Host operations need a refreshed renderer-facing registry view
   *
   * Expects:
   * - Manifest discovery can be refreshed before the snapshot is built
   *
   * Returns:
   * - The latest extension registry snapshot for renderer consumption
   */
  list: () => Promise<PluginRegistrySnapshot>

  /**
   * Persists whether one plugin is enabled.
   *
   * Use when:
   * - Renderer controls toggle plugin enablement
   * - Host state must remember a known manifest path for a plugin name
   *
   * Expects:
   * - `payload.extensionId` matches a discovered or previously known extension
   * - `payload.path` is only needed when the manifest is not currently discoverable
   *
   * Returns:
   * - The updated extension registry snapshot after persistence
   */
  setEnabled: (payload: { extensionId: string, enabled: boolean, path?: string }) => Promise<PluginRegistrySnapshot>

  /**
   * Persists whether one loaded plugin should use auto-reload.
   *
   * Use when:
   * - Renderer controls toggle plugin file watching during development
   * - Host features need to resync optional watcher state after config changes
   *
   * Expects:
   * - `payload.extensionId` matches one extension entry in config or discovery state
   *
   * Returns:
   * - The updated extension registry snapshot after persistence
   */
  setAutoReload: (payload: { extensionId: string, enabled: boolean }) => Promise<PluginRegistrySnapshot>

  /**
   * Loads every plugin currently marked as enabled.
   *
   * Use when:
   * - App startup wants to restore persisted enabled plugins
   * - Renderer requests a bulk load after configuration changes
   *
   * Expects:
   * - Discovery state is current before load begins
   *
   * Returns:
   * - The extension registry snapshot after load attempts finish
   */
  loadEnabled: () => Promise<PluginRegistrySnapshot>

  /**
   * Loads one extension by manifest id.
   *
   * Use when:
   * - Renderer explicitly requests one plugin to start
   * - Host features need to restart a plugin after manifest or entrypoint changes
   *
   * Expects:
   * - `extensionId` resolves to a manifest entry in the current registry
   *
   * Returns:
   * - The extension registry snapshot after the load completes
   */
  load: (extensionId: string) => Promise<PluginRegistrySnapshot>

  /**
   * Stops one loaded extension by manifest id.
   *
   * Use when:
   * - Renderer explicitly requests one plugin to stop
   * - Host features need to stop a plugin before reload or disposal
   *
   * Expects:
   * - `extensionId` identifies an extension that may or may not currently be loaded
   *
   * Returns:
   * - The extension registry snapshot after unload bookkeeping completes
   */
  unload: (extensionId: string) => Promise<PluginRegistrySnapshot>

  /**
   * Builds the full extension host debug snapshot.
   *
   * Use when:
   * - Devtools need sessions, kits, bindings, capabilities, and rewritten asset URLs
   * - Host debugging needs a fresh runtime snapshot after registry refresh
   *
   * Expects:
   * - The host and extension asset service are both initialized
   *
   * Returns:
   * - The full debug snapshot exposed through plugin inspection IPC
   */
  inspect: () => Promise<PluginHostDebugSnapshot>

  /**
   * Returns the mounted base URL for plugin-served assets.
   *
   * Use when:
   * - Renderer code needs to construct extension asset URLs
   * - Snapshot consumers need the current loopback asset mount base
   *
   * Expects:
   * - The extension asset service may be started before this is called
   *
   * Returns:
   * - The current extension asset base URL, or an empty string when unavailable
   */
  getAssetBaseUrl: () => string

  /**
   * Disposes optional host features and asset hosting resources.
   *
   * Use when:
   * - Electron shutdown needs to stop extension-owned background work
   * - Tests need to release watchers and local asset servers deterministically
   *
   * Expects:
   * - Disposal may be called after partial startup or after prior plugin failures
   *
   * Returns:
   * - A promise that resolves after feature and asset cleanup finish
   */
  dispose: () => Promise<void>

  /**
   * Performs deferred initialization after the main window is created.
   *
   * Starts the extension asset HTTP server, refreshes manifests, and loads
   * enabled extensions. Idempotent — safe to call multiple times.
   */
  init: () => Promise<void>
}

/**
 * Builds the extracted Electron extension host bootstrap used by the public facade.
 *
 * Use when:
 * - The public extension service wants one internal bootstrap entrypoint
 * - Tests need direct access to the internal host bootstrap helper
 *
 * Expects:
 * - Electron `app.getPath('userData')` is available
 * - Extension manifests live under `<userData>/extensions/v1`
 *
 * Returns:
 * - The internal bootstrap service that powers the public extension-host IPC facade
 */
export async function setupExtensionHostServiceInternal(
  options: SetupExtensionHostOptions,
): Promise<ExtensionHostServiceInternal> {
  const log = useLogg('main/extension-host').useGlobalConfig()

  // Config
  const extensionConfig = createExtensionHostConfigStore()
  extensionConfig.setup()

  // In development, point the extension host at the workspace plugin source so
  // built-in extensions (local-llm / local-tts) are discoverable without packaging.
  // Production still uses the per-user extensions directory.
  const profile = process.env.KITSUNE_PROFILE || 'default'
  const extensionsRoot = app.isPackaged
    ? join(app.getPath('userData'), 'extensions', 'v1')
    : resolve(join(app.getAppPath(), '..', '..', 'plugins', profile))

  // NOTICE: 确保插件目录存在，否则 list() 返回空且无法安装插件。
  // 生产路径 userData/extensions/v1 首次启动时不存在，需主动创建。
  await mkdir(extensionsRoot, { recursive: true })

  // Auto-enable built-in local plugins in development only on the very first
  // run (empty config). Once the user toggles enablement, their choice sticks.
  if (!app.isPackaged) {
    const config = extensionConfig.get()
    const isFreshConfig = config.enabled.length === 0 && Object.keys(config.known).length === 0
    if (isFreshConfig) {
      const builtInLocalIds = [`${profile}.local-llm`, `${profile}.local-tts`]
      extensionConfig.update({
        ...config,
        enabled: builtInLocalIds,
      })
    }
  }

  // Kit API, Host
  const builtInKitRuntime = createBuiltInExtensionKitRuntime(options)
  const host = new ExtensionHost({
    runtime: 'electron',
    // NOTICE:
    // Previously no `permissionResolver` was passed, so every manifest-declared
    // permission was auto-approved (see ExtensionHost.startExtension fallback).
    // Plugins are loaded with full host process privileges (see node/fs loader),
    // so a resolver must exist as the last line of defense. Only the non-privileged
    // protocol namespace is auto-approved; privileged areas (filesystem, network,
    // shell/exec, system) are denied unless a trusted built-in explicitly requests
    // them and is added to the allowlist below.
    permissionResolver: resolvePluginPermissionGrant,
  })
  log.withFields({ extensionsRoot }).log('loading extension manifests')
  builtInKitRuntime.registerHostKits(host)

  // extension registry
  const extensionRegistry = createExtensionHostRegistry({ extensionsRoot, log })

  await extensionRegistry.refresh()
  log.withFields({ count: extensionRegistry.listEntries().length }).log('extension manifests loaded')
  for (const entry of extensionRegistry.listEntries()) {
    log.withFields({ name: manifestIdOf(entry.manifest), path: entry.path }).log('extension manifest found')
  }

  // Extension feature: Static Assets serving
  // Asset server start is deferred to init() to avoid blocking the injeca dependency chain.
  const extensionAssetService = createExtensionAssetService({
    getManifestEntryByExtensionId: () => extensionRegistry.getManifestEntryByExtensionId(),
    cookieAdapter: createElectronExtensionAssetCookieAdapter(),
  })

  const loaded = new Set<string>()
  const loadedSessionIds = new Map<string, string>()
  const moduleAssetSessionCache = new Map<string, ExtensionAssetSession>()

  const clearModuleAssetSessionCacheByExtensionId = (extensionId: string) => {
    for (const key of moduleAssetSessionCache.keys()) {
      if (key.startsWith(`${extensionId}:`)) {
        moduleAssetSessionCache.delete(key)
      }
    }
  }

  const clearModuleAssetSessionCacheByOwnerSessionId = (ownerSessionId: string) => {
    for (const key of moduleAssetSessionCache.keys()) {
      const segments = key.split(':')
      if (segments[2] === ownerSessionId) {
        moduleAssetSessionCache.delete(key)
      }
    }
  }

  const refreshManifests = async () => {
    await extensionRegistry.refresh()
  }

  const getConfig = () => extensionConfig.get()

  const listSnapshot = (): PluginRegistrySnapshot => {
    return buildPluginRegistrySnapshot({
      extensionsRoot,
      entries: extensionRegistry.listEntries(),
      config: getConfig(),
      loaded,
    })
  }

  const createModuleAssetSession = async (input: {
    extensionId: string
    version: string
    ownerSessionId: string
    routeAssetPath: string
    pathPrefix: string
  }) => {
    const { extensionId, version, ownerSessionId, routeAssetPath, pathPrefix } = input
    const cacheKey = `${extensionId}:${version}:${ownerSessionId}:${routeAssetPath}:${pathPrefix}`
    const cachedSession = moduleAssetSessionCache.get(cacheKey)
    if (cachedSession) {
      return cachedSession
    }

    const session = await extensionAssetService.createAssetSession({
      extensionId,
      version,
      ownerSessionId,
      routeAssetPath,
      pathPrefix,
      ttlMs: extensionAssetSessionTtlMs,
    })
    moduleAssetSessionCache.set(cacheKey, session)
    return session
  }

  const extensionAssetSnapshotService: ExtensionAssetSnapshotService = {
    getBaseUrl: extensionAssetService.getBaseUrl,
    createAssetSession: ({ extensionId, version, ownerSessionId, routeAssetPath, pathPrefix }) => {
      return createModuleAssetSession({
        extensionId,
        version,
        ownerSessionId,
        routeAssetPath,
        pathPrefix,
      })
    },
  }

  const inspectSnapshot = async (): Promise<PluginHostDebugSnapshot> => {
    return await buildPluginHostDebugSnapshot({
      host,
      extensionsRoot,
      entries: extensionRegistry.listEntries(),
      config: getConfig(),
      loaded,
      manifestEntryByExtensionId: extensionRegistry.getManifestEntryByExtensionId(),
      extensionAssetService: extensionAssetSnapshotService,
    })
  }

  const loadExtensionById = async (
    extensionId: string,
    loadOptions: { cacheBustKey?: string } = {},
  ) => {
    if (loaded.has(extensionId)) {
      return
    }

    const entry = extensionRegistry.findManifestEntry(extensionId)
    if (!entry) {
      throw new Error(`Extension manifest not found: ${extensionId}`)
    }

    const manifestForLoad = createManifestForLoad(entry, loadOptions)
    const session = await host.start(manifestForLoad, { cwd: dirname(entry.path) })
    loaded.add(extensionId)
    loadedSessionIds.set(extensionId, session.id)
    log.withFields({ extensionId, sessionId: session.id }).log('extension loaded')
  }

  const stopLoadedExtensionById = async (extensionId: string) => {
    const sessionId = loadedSessionIds.get(extensionId)
    if (!sessionId) {
      loaded.delete(extensionId)
      return
    }

    await host.stop(sessionId)
    loadedSessionIds.delete(extensionId)
    loaded.delete(extensionId)

    clearModuleAssetSessionCacheByOwnerSessionId(sessionId)
    await extensionAssetService.revokeByOwnerSessionId(sessionId)

    log.withFields({ extensionId, sessionId }).log('extension unloaded')
  }

  const resolveAutoReloadWatchPaths = (extensionId: string) => {
    const entry = extensionRegistry.findManifestEntry(extensionId)
    if (!entry) {
      return []
    }

    const entrypointPath = resolvePluginRuntimeEntrypointPath(entry)
    return [...new Set([entry.path, entrypointPath].filter((path): path is string => Boolean(path)))]
  }

  // Extension feature: Auto-reload for plugins
  const autoReloadFeature = createExtensionAutoReloadFeature({
    log,
    getConfig,
    listEntries: () => extensionRegistry.listEntries(),
    isLoaded: extensionId => loaded.has(extensionId),
    resolveWatchPaths: resolveAutoReloadWatchPaths,
    reload: async (extensionId) => {
      await stopLoadedExtensionById(extensionId)
      await refreshManifests()
      await loadExtensionById(extensionId, { cacheBustKey: `auto-reload-${Date.now()}` })
    },
  })

  const unloadExtensionById = async (extensionId: string) => {
    autoReloadFeature.clearExtension(extensionId)
    await stopLoadedExtensionById(extensionId)
  }

  const loadEnabledExtensions = async () => {
    const config = getConfig()
    for (const entry of extensionRegistry.listEntries()) {
      const extensionId = manifestIdOf(entry.manifest)
      if (!config.enabled.includes(extensionId)) {
        continue
      }
      if (loaded.has(extensionId)) {
        continue
      }

      try {
        await loadExtensionById(extensionId)
      }
      catch (error) {
        log.withError(error).withFields({ extensionId }).error('extension failed to start')
      }
    }

    autoReloadFeature.sync()
  }

  // Deferred initialization state: the build phase only creates the manager object.
  // init() is called after the main window is created to avoid blocking the injeca
  // dependency chain with plugin loading and HTTP server startup.
  let initialized = false
  let initializing = false

  const init = async () => {
    if (initialized || initializing) {
      return
    }
    initializing = true
    try {
      await extensionAssetService.start()
      await refreshManifests()
      await loadEnabledExtensions()
      autoReloadFeature.sync()
      initialized = true
    }
    catch (error) {
      log.withError(error).error('plugin host deferred initialization failed')
    }
    finally {
      initializing = false
    }
  }

  return {
    host,
    // REVIEW: Tool registry ownership is currently hidden inside the built-in kit runtime even though
    // the host service also exposes it for IPC listing/invocation. Consider moving registry ownership
    // to this host service and passing it into kit registration as a dependency.
    tools: builtInKitRuntime.tools,
    get manifests() {
      return extensionRegistry.listManifests()
    },
    init,
    async list() {
      if (!initialized) {
        return {
          root: extensionsRoot,
          plugins: [],
          loading: true,
        }
      }
      await refreshManifests()
      autoReloadFeature.sync()
      return listSnapshot()
    },
    async setEnabled(payload) {
      await refreshManifests()

      const config = getConfig()
      const enabled = new Set(config.enabled)
      if (payload.enabled) {
        enabled.add(payload.extensionId)
      }
      else {
        enabled.delete(payload.extensionId)
        clearModuleAssetSessionCacheByExtensionId(payload.extensionId)
        await extensionAssetService.revokeByExtensionId(payload.extensionId)
      }

      const entry = extensionRegistry.findManifestEntry(payload.extensionId)
      const manifestPath = entry?.path ?? payload.path ?? ''
      extensionConfig.update({
        enabled: [...enabled],
        autoReload: config.autoReload,
        known: {
          ...config.known,
          [payload.extensionId]: { path: manifestPath },
        },
      })

      autoReloadFeature.sync()
      return listSnapshot()
    },
    async setAutoReload(payload) {
      await refreshManifests()

      const config = getConfig()
      const autoReload = new Set(config.autoReload)
      if (payload.enabled) {
        autoReload.add(payload.extensionId)
      }
      else {
        autoReload.delete(payload.extensionId)
      }

      extensionConfig.update({
        ...config,
        autoReload: [...autoReload],
      })

      autoReloadFeature.sync()
      return listSnapshot()
    },
    async loadEnabled() {
      await refreshManifests()
      await loadEnabledExtensions()
      autoReloadFeature.sync()
      return listSnapshot()
    },
    async load(extensionId) {
      await refreshManifests()
      await loadExtensionById(extensionId)
      autoReloadFeature.sync()
      return listSnapshot()
    },
    async unload(extensionId) {
      await unloadExtensionById(extensionId)
      autoReloadFeature.sync()
      return listSnapshot()
    },
    async inspect() {
      if (!initialized) {
        return {
          registry: {
            root: extensionsRoot,
            plugins: [],
            loading: true,
          },
          sessions: [],
          kits: host.listKits(),
          modules: [],
          capabilities: host.listCapabilities(),
          refreshedAt: Date.now(),
        }
      }
      await refreshManifests()
      autoReloadFeature.sync()
      return await inspectSnapshot()
    },
    getAssetBaseUrl() {
      return extensionAssetService.getBaseUrl() ?? ''
    },
    async dispose() {
      autoReloadFeature.dispose()
      builtInKitRuntime.dispose()

      moduleAssetSessionCache.clear()
      await extensionAssetService.revokeAll()
      await extensionAssetService.stop()
    },
  }
}
