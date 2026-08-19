<script setup lang="ts">
import { defineInvokeHandler } from '@moeru/eventa'
import { useElectronEventaContext, useElectronEventaInvoke } from '@kitsune/electron-vueuse'
import { themeColorFromValue, useThemeColor } from '@kitsune/stage-layouts/composables/theme-color'
import { artistrySyncConfig } from '@kitsune/stage-shared'
import { ToasterRoot, ToasterInferenceProgress } from '@kitsune/stage-ui/components'
import { useInferencePreload } from '@kitsune/stage-ui/composables'
import { useSharedAnalyticsStore } from '@kitsune/stage-ui/stores/analytics'
import { useCharacterOrchestratorStore } from '@kitsune/stage-ui/stores/character'
import { useChatSessionStore } from '@kitsune/stage-ui/stores/chat/session-store'
import { usePluginHostInspectorStore } from '@kitsune/stage-ui/stores/devtools/plugin-host-debug'
import { useDisplayModelsStore } from '@kitsune/stage-ui/stores/display-models'
import { useModsServerChannelStore } from '@kitsune/stage-ui/stores/mods/api/channel-server'
import { useContextBridgeStore } from '@kitsune/stage-ui/stores/mods/api/context-bridge'
import { usePersonaStore } from '@kitsune/stage-ui/stores/modules/persona'
import { useArtistryStore } from '@kitsune/stage-ui/stores/modules/artistry'
import { usePerfTracerBridgeStore } from '@kitsune/stage-ui/stores/perf-tracer-bridge'
import { listProvidersForPluginHost, shouldPublishPluginHostCapabilities } from '@kitsune/stage-ui/stores/plugin-host-capabilities'
import { useSettings, useSettingsAudioDevice } from '@kitsune/stage-ui/stores/settings'
import {
  CARD_RADIUS_VALUE,
  CONTENT_MAX_WIDTH_PX,
  DENSITY_SCALE,
  MOTION_DURATION,
} from '@kitsune/stage-ui/stores/settings'
import { useTheme } from '@kitsune/ui'
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { toast, Toaster } from 'vue-sonner'

import ResizeHandler from './components/ResizeHandler.vue'

import {
  electronGetServerChannelConfig,
  electronGodotStageGetStatus,
  electronGodotStageStatusChanged,
  electronSettingsNavigate,
  electronStartTrackMousePosition,
  i18nGetLocale,
  i18nSetLocale,
} from '../shared/eventa'
import {
  electronPluginUpdateCapability,
  pluginProtocolListProviders,
  pluginProtocolListProvidersEventName,
} from '../shared/eventa/plugin/capabilities'
import {
  electronPluginInspect,
  electronPluginList,
  electronPluginLoad,
  electronPluginLoadEnabled,
  electronPluginSetAutoReload,
  electronPluginSetEnabled,
  electronPluginUnload,
} from '../shared/eventa/plugin/host'
import { electronPluginToolsChanged } from '../shared/eventa/plugin/tools'
import { initializeStageThreeRuntimeTraceBridge } from './bridges/stage-three-runtime-trace'
import { useLanguage } from './composables/use-language'
import { useExecutorEmotion } from './composables/useExecutorEmotion'
import { createChatSyncWindowLifecycle, resolveInitialChatSyncRoutePath } from './stores/chat-sync-lifecycle'
import { useLlmToolsStore } from '@kitsune/stage-ui/stores/llm-tools'
import { desktopAutomationTools } from './stores/tools/builtin/desktop-automation'
import { useTamagotchiMcpToolsStore } from './stores/mcp-tools'
import { useTamagotchiPluginToolsStore } from './stores/plugin-tools'
import { useServerChannelSettingsStore } from './stores/settings/server-channel'
import { useStageWindowLifecycleStore } from './stores/stage-window-lifecycle'

const { isDark: dark } = useTheme()
const settingsStore = useSettings()
const {
  language,
  themeColorsHue,
  themeColorsHueDynamic,
  appearanceSidebarWidth,
  appearanceContentMaxWidth,
  appearanceCardRadius,
  appearanceDensity,
  appearanceMotionIntensity,
} = storeToRefs(settingsStore)
const router = useRouter()
const route = useRoute()
const chatSessionStore = useChatSessionStore()
const context = useElectronEventaContext()
const getMainLocale = useElectronEventaInvoke(i18nGetLocale)
const setLocale = useElectronEventaInvoke(i18nSetLocale)
const initialWindowRoutePath = resolveInitialChatSyncRoutePath(route.path)
const chatSyncLifecycle = createChatSyncWindowLifecycle(route.path)
const isSpotlightWindowRoute = initialWindowRoutePath === '/spotlight'
const isSettingsWindowRoute = initialWindowRoutePath.startsWith('/settings')

function createFullStageRuntime() {
  const contextBridgeStore = useContextBridgeStore()
  const displayModelsStore = useDisplayModelsStore()
  const serverChannelSettingsStore = useServerChannelSettingsStore()
  const cardStore = usePersonaStore()
  const serverChannelStore = useModsServerChannelStore()
  const characterOrchestratorStore = useCharacterOrchestratorStore()
  const analyticsStore = useSharedAnalyticsStore()
  const inferencePreload = useInferencePreload()
  const pluginHostInspectorStore = usePluginHostInspectorStore()
  const mcpToolsStore = useTamagotchiMcpToolsStore()
  const pluginToolsStore = useTamagotchiPluginToolsStore()
  const stageWindowLifecycleStore = useStageWindowLifecycleStore()
  const settingsAudioDeviceStore = useSettingsAudioDevice()
  const artistryStore = useArtistryStore()
  const { activeProvider, artistryGlobals, activeModel, defaultPromptPrefix, providerOptions } = storeToRefs(artistryStore)
  const getServerChannelConfig = useElectronEventaInvoke(electronGetServerChannelConfig)
  const listPlugins = useElectronEventaInvoke(electronPluginList)
  const setPluginEnabled = useElectronEventaInvoke(electronPluginSetEnabled)
  const setPluginAutoReload = useElectronEventaInvoke(electronPluginSetAutoReload)
  const loadEnabledPlugins = useElectronEventaInvoke(electronPluginLoadEnabled)
  const loadPlugin = useElectronEventaInvoke(electronPluginLoad)
  const unloadPlugin = useElectronEventaInvoke(electronPluginUnload)
  const inspectPluginHost = useElectronEventaInvoke(electronPluginInspect)
  const startTrackingCursorPoint = useElectronEventaInvoke(electronStartTrackMousePosition)
  const reportPluginCapability = useElectronEventaInvoke(electronPluginUpdateCapability)
  const getGodotStageStatus = useElectronEventaInvoke(electronGodotStageGetStatus)
  const syncArtistryConfig = useElectronEventaInvoke(artistrySyncConfig)
  const isAuxiliaryChatRoute = initialWindowRoutePath === '/chat'
  const isGodotStageRoute = () => route.path === '/' || route.path.startsWith('/settings')
  const isWidgetsWindowRoute = () => route.path === '/widgets'

  function syncGodotStageRenderer(state: { state: 'stopped' | 'starting' | 'running' | 'stopping' | 'error' }) {
    if (state.state === 'running') {
      settingsStore.setStageModelRenderer('godot')
      return
    }

    if ((state.state === 'stopped' || state.state === 'error') && settingsStore.stageModelRenderer === 'godot')
      settingsStore.restoreBuiltInStageModelRenderer()
  }

  async function refreshPluginRuntimeTools() {
    try {
      await pluginToolsStore.refresh()
    }
    catch (error) {
      console.warn('[App] Failed to refresh plugin runtime tools:', error)
    }
  }

  usePerfTracerBridgeStore()
  initializeStageThreeRuntimeTraceBridge()
  useExecutorEmotion()
  void stageWindowLifecycleStore.initializeWindowLifecycleBridge()

  watch(() => route.path, () => {
    contextBridgeStore.setSparkNotifyHostRole(isWidgetsWindowRoute() ? 'client' : 'main')
  }, { immediate: true })

  // NOTICE: register plugin host bridge during setup to avoid race with pages using it in immediate watchers.
  pluginHostInspectorStore.setBridge({
    list: () => listPlugins(),
    setEnabled: async (payload) => {
      const result = await setPluginEnabled(payload)
      await refreshPluginRuntimeTools()
      return result
    },
    setAutoReload: payload => setPluginAutoReload(payload),
    loadEnabled: async () => {
      const result = await loadEnabledPlugins()
      await refreshPluginRuntimeTools()
      return result
    },
    load: async (payload) => {
      const result = await loadPlugin(payload)
      await refreshPluginRuntimeTools()
      return result
    },
    unload: async (payload) => {
      const result = await unloadPlugin(payload)
      await refreshPluginRuntimeTools()
      return result
    },
    inspect: () => inspectPluginHost(),
  })

  // NOTICE: Runtime tool stores must register during setup so renderer consumers can see them
  // before `onMounted()` finishes the rest of the startup flow.
  void mcpToolsStore.refresh().catch((error) => {
    console.warn('[App] Failed to refresh MCP runtime tools:', error)
  })
  void refreshPluginRuntimeTools()

  // Register desktop automation tools globally so AI can use them in any chat
  const llmToolsStore = useLlmToolsStore()
  void desktopAutomationTools().then((tools) => {
    llmToolsStore.registerTools('desktop-automation', tools)
  }).catch((error) => {
    console.warn('[App] Failed to register desktop automation tools:', error)
  })

  watch([activeProvider, artistryGlobals, activeModel, defaultPromptPrefix, providerOptions], () => {
    if (activeProvider.value) {
      void syncArtistryConfig({
        provider: activeProvider.value as string,
        globals: JSON.parse(JSON.stringify(artistryGlobals.value)),
        model: activeModel.value,
        promptPrefix: defaultPromptPrefix.value,
        options: providerOptions.value,
      })
    }
  }, { deep: true, immediate: true })

  // NOTICE: In non-Electron environments (e.g. browser preview / tests) the
  // eventa context is undefined; only register listeners when IPC is available.
  context.value?.on(electronGodotStageStatusChanged, (event) => {
    if (!event.body) {
      return
    }

    syncGodotStageRenderer(event.body)
  })

  context.value?.on(electronPluginToolsChanged, () => {
    void refreshPluginRuntimeTools()
  })

  return {
    async initialize() {
      // Phase 1: Parallel initialization of independent stores
      await Promise.all([
        displayModelsStore.initialize(),
        settingsStore.initializeStageModel(),
        settingsAudioDeviceStore.initialize(),
      ])

      // Phase 2: Dependent initializations (sequential)
      analyticsStore.initialize()
      cardStore.initialize()
      await displayModelsStore.loadDisplayModelsFromIndexedDB()

      if (isGodotStageRoute()) {
        try {
          syncGodotStageRenderer(await getGodotStageStatus())
        }
        catch (error) {
          console.warn('[App] Failed to fetch Godot stage status:', error)
        }
      }

      const serverChannelConfig = await getServerChannelConfig()
      if (serverChannelConfig) {
        serverChannelSettingsStore.tlsConfig = serverChannelConfig.tlsConfig ?? null
        serverChannelSettingsStore.hostname = serverChannelConfig.hostname
        serverChannelSettingsStore.authToken = serverChannelConfig.authToken
      }

      await serverChannelStore.initialize({
        token: serverChannelConfig?.authToken || undefined,
        possibleEvents: ['ui:configure'],
      }).catch(err => console.error('Failed to initialize Mods Server Channel in App.vue:', err))
      if (!isAuxiliaryChatRoute) {
        contextBridgeStore.initialize()
        if (!isWidgetsWindowRoute()) {
          characterOrchestratorStore.initialize()
          await startTrackingCursorPoint()
        }
      }

      if (context.value) {
        defineInvokeHandler(context.value, pluginProtocolListProviders, async () => listProvidersForPluginHost())
      }

      if (shouldPublishPluginHostCapabilities()) {
        await reportPluginCapability({
          key: pluginProtocolListProvidersEventName,
          state: 'ready',
          metadata: {
            source: 'stage-ui',
          },
        })
      }

      inferencePreload.triggerPreload()
    },
    dispose() {
      if (!isAuxiliaryChatRoute)
        contextBridgeStore.dispose()
      mcpToolsStore.dispose()
      pluginToolsStore.dispose()
    },
  }
}

const fullStageRuntime = isSpotlightWindowRoute ? null : createFullStageRuntime()

const { restore: restoreLocale } = useLanguage(language, getMainLocale, setLocale)

const { updateThemeColor } = useThemeColor(themeColorFromValue({ light: 'rgb(255 255 255)', dark: 'rgb(18 18 18)' }))
watch(dark, () => updateThemeColor(), { immediate: true })
watch(route, () => updateThemeColor(), { immediate: true })
onMounted(() => updateThemeColor())

if (isSettingsWindowRoute) {
  context.value?.on(electronSettingsNavigate, (event) => {
    const targetRoute = event?.body?.route
    if (!targetRoute || route.fullPath === targetRoute) {
      return
    }

    void router.push(targetRoute).catch((error) => {
      console.warn('Failed to navigate settings window:', error)
    })
  })
}

onMounted(async () => {
  chatSyncLifecycle.initialize()

  // NOTICE: Issue #1658
  // When Electron restarts, renderer localStorage may not be flushed to disk.
  // The store's onMounted hook falls back to navigator.language, which triggers
  // watch(language) and overwrites the main-process config with the OS locale.
  // We must restore the correct locale from main process before allowing sync.
  // NOTICE: 原项目历史链接，待 Kitsune 仓库确定后更新
  // https://github.com/moeru-ai/airi/issues/1658
  await restoreLocale()

  // Parallelize independent initializations
  await Promise.all([
    chatSessionStore.initialize(),
    fullStageRuntime?.initialize(),
  ].filter(Boolean))
})

onUnmounted(() => {
  chatSyncLifecycle.dispose()
})

watch(themeColorsHue, () => {
  document.documentElement.style.setProperty('--chromatic-hue', themeColorsHue.value.toString())
}, { immediate: true })

watch(themeColorsHueDynamic, () => {
  document.documentElement.classList.toggle('dynamic-hue', themeColorsHueDynamic.value)
}, { immediate: true })

// NOTICE: Appearance CSS variables are injected on documentElement so that
// both the settings layout (sidebar/content width) and UnoCSS shortcuts
// (card radius/density/motion) can consume them from anywhere in the tree.
// All values resolve through the lookup tables in appearance.ts, keeping
// the mapping single-sourced.
watch(appearanceSidebarWidth, () => {
  document.documentElement.style.setProperty('--settings-sidebar-width', `${appearanceSidebarWidth.value}px`)
}, { immediate: true })

watch(appearanceContentMaxWidth, () => {
  document.documentElement.style.setProperty('--settings-content-max-width', CONTENT_MAX_WIDTH_PX[appearanceContentMaxWidth.value])
}, { immediate: true })

watch(appearanceCardRadius, () => {
  document.documentElement.style.setProperty('--settings-card-radius', CARD_RADIUS_VALUE[appearanceCardRadius.value])
}, { immediate: true })

watch(appearanceDensity, () => {
  document.documentElement.style.setProperty('--settings-density-scale', DENSITY_SCALE[appearanceDensity.value])
}, { immediate: true })

watch(appearanceMotionIntensity, () => {
  document.documentElement.style.setProperty('--settings-motion-duration', MOTION_DURATION[appearanceMotionIntensity.value])
}, { immediate: true })

onUnmounted(() => {
  fullStageRuntime?.dispose()
})
</script>

<template>
  <ToasterRoot @close="id => toast.dismiss(id)">
    <Toaster />
  </ToasterRoot>
  <ToasterInferenceProgress />
  <ResizeHandler v-if="!isSpotlightWindowRoute" />
  <RouterView />
</template>

<style>
/* We need this to properly animate the CSS variable */
@property --chromatic-hue {
  syntax: '<number>';
  initial-value: 0;
  inherits: true;
}

@keyframes hue-anim {
  from {
    --chromatic-hue: 0;
  }
  to {
    --chromatic-hue: 360;
  }
}

.dynamic-hue {
  animation: hue-anim 10s linear infinite;
}
</style>
