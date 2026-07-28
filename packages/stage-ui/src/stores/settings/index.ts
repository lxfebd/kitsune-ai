import { defineStore, storeToRefs } from 'pinia'

import { useSettingsAnalytics } from './analytics'
import { useSettingsAppearance } from './appearance'
import { useSettingsControlsIsland } from './controls-island'
import { useSettingsDeveloper } from './developer'
import { useSettingsGeneral } from './general'
import { useSettingsSpine } from './spine'
import { useSettingsStageModel } from './stage-model'
import { useSettingsVrm } from './vrm'
import { useSettingsTheme } from './theme'

export * from './analytics'
export * from './appearance'
// Export sub-stores
export * from './audio-device'
export * from './beat-sync'
export * from './controls-island'
export * from './developer'
export * from './general'
export * from './llm-routing'
export * from './spine'
export * from './stage-model'
export * from './vrm'
export * from './theme'
// Export constants
export { DEFAULT_THEME_COLORS_HUE } from './theme'
export {
  APPEARANCE_DEFAULTS,
  SIDEBAR_WIDTH_MIN,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_STEP,
  CONTENT_MAX_WIDTH_PX,
  CARD_RADIUS_VALUE,
  DENSITY_SCALE,
  MOTION_DURATION,
} from './appearance'
export type {
  ContentMaxWidth,
  CardRadius,
  Density,
  MotionIntensity,
} from './appearance'

/**
 * Unified settings store for backward compatibility.
 * This aggregates all sub-stores into one interface.
 *
 * @deprecated Use individual setting stores (useSettingsCore, useSettingsTheme, etc.) instead.
 * This store exists only for backward compatibility and will be removed in a future version.
 */
export const useSettings = defineStore('settings', () => {
  const general = useSettingsGeneral()
  const analytics = useSettingsAnalytics()
  const stageModel = useSettingsStageModel()
  const spine = useSettingsSpine()
  const vrm = useSettingsVrm()
  const theme = useSettingsTheme()
  const controlsIsland = useSettingsControlsIsland()
  const developer = useSettingsDeveloper()
  const appearance = useSettingsAppearance()

  async function resetState() {
    await stageModel.resetState()
    analytics.resetState()
    general.resetState()
    spine.resetState()
    vrm.resetState()
    theme.resetState()
    controlsIsland.resetState()
    developer.resetState()
    appearance.resetState()
  }

  // Extract refs from sub-stores to maintain proper reactivity
  const generalRefs = storeToRefs(general)
  const analyticsRefs = storeToRefs(analytics)
  const stageModelRefs = storeToRefs(stageModel)
  const spineRefs = storeToRefs(spine)
  const vrmRefs = storeToRefs(vrm)
  const themeRefs = storeToRefs(theme)
  const controlsIslandRefs = storeToRefs(controlsIsland)
  const developerRefs = storeToRefs(developer)
  const appearanceRefs = storeToRefs(appearance)

  return {
    // Core settings
    disableTransitions: generalRefs.disableTransitions,
    usePageSpecificTransitions: generalRefs.usePageSpecificTransitions,
    language: generalRefs.language,
    analyticsEnabled: analyticsRefs.analyticsEnabled,
    websocketSecureEnabled: generalRefs.websocketSecureEnabled,

    // Stage model settings
    stageModelRenderer: stageModelRefs.stageModelRenderer,
    stageModelSelected: stageModelRefs.stageModelSelected,
    stageModelSelectedUrl: stageModelRefs.stageModelSelectedUrl,
    stageModelSelectedDisplayModel: stageModelRefs.stageModelSelectedDisplayModel,
    stageViewControlsEnabled: stageModelRefs.stageViewControlsEnabled,

    // Spine settings
    spinePremultipliedAlpha: spineRefs.spinePremultipliedAlpha,
    spineDefaultMixDuration: spineRefs.spineDefaultMixDuration,
    spineIdleAnimationEnabled: spineRefs.spineIdleAnimationEnabled,
    spineMaxFps: spineRefs.spineMaxFps,
    spineRenderScale: spineRefs.spineRenderScale,

    // VRM (Three.js) settings
    vrmMaxFps: vrmRefs.vrmMaxFps,

    // Theme settings
    themeColorsHue: themeRefs.themeColorsHue,
    themeColorsHueDynamic: themeRefs.themeColorsHueDynamic,

    // UI settings
    allowVisibleOnAllWorkspaces: controlsIslandRefs.allowVisibleOnAllWorkspaces,
    alwaysOnTop: controlsIslandRefs.alwaysOnTop,
    controlsIslandIconSize: controlsIslandRefs.controlsIslandIconSize,
    inspectUpdaterDiagnostics: developerRefs.inspectUpdaterDiagnostics,

    // Appearance settings (sidebar width, content width, card radius, density, motion)
    appearanceSidebarWidth: appearanceRefs.sidebarWidth,
    appearanceContentMaxWidth: appearanceRefs.contentMaxWidth,
    appearanceCardRadius: appearanceRefs.cardRadius,
    appearanceDensity: appearanceRefs.density,
    appearanceMotionIntensity: appearanceRefs.motionIntensity,

    // Methods
    setThemeColorsHue: theme.setThemeColorsHue,
    applyPrimaryColorFrom: theme.applyPrimaryColorFrom,
    isColorSelectedForPrimary: theme.isColorSelectedForPrimary,
    initializeStageModel: stageModel.initializeStageModel,
    restoreBuiltInStageModelRenderer: stageModel.restoreBuiltInStageModelRenderer,
    setStageModelRenderer: stageModel.setStageModelRenderer,
    updateStageModel: stageModel.updateStageModel,
    resetState,
  }
})
