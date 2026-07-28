export * from './analytics';
export * from './audio-device';
export * from './beat-sync';
export * from './controls-island';
export * from './developer';
export * from './general';
export * from './llm-routing';
export * from './spine';
export * from './stage-model';
export * from './theme';
export { DEFAULT_THEME_COLORS_HUE } from './theme';
/**
 * Unified settings store for backward compatibility.
 * This aggregates all sub-stores into one interface.
 *
 * @deprecated Use individual setting stores (useSettingsCore, useSettingsTheme, etc.) instead.
 * This store exists only for backward compatibility and will be removed in a future version.
 */
export declare const useSettings: import("pinia").StoreDefinition<"settings", Pick<{
    disableTransitions: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    usePageSpecificTransitions: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    language: import("@vueuse/shared").ManualResetRefReturn<string>;
    analyticsEnabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    websocketSecureEnabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    stageModelRenderer: import("@vueuse/shared").ManualResetRefReturn<import("./stage-model").StageModelRenderer>;
    stageModelSelected: import("vue").WritableComputedRef<string, string>;
    stageModelSelectedUrl: import("@vueuse/shared").ManualResetRefReturn<string | undefined>;
    stageModelSelectedDisplayModel: import("@vueuse/shared").ManualResetRefReturn<import("..").DisplayModel | undefined>;
    stageViewControlsEnabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    spinePremultipliedAlpha: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    spineDefaultMixDuration: import("@vueuse/shared").ManualResetRefReturn<number>;
    spineIdleAnimationEnabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    spineMaxFps: import("@vueuse/shared").ManualResetRefReturn<number>;
    spineRenderScale: import("@vueuse/shared").ManualResetRefReturn<number>;
    themeColorsHue: import("@vueuse/shared").ManualResetRefReturn<number>;
    themeColorsHueDynamic: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    allowVisibleOnAllWorkspaces: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    alwaysOnTop: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    controlsIslandIconSize: import("@vueuse/shared").ManualResetRefReturn<"small" | "auto" | "large">;
    inspectUpdaterDiagnostics: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    setThemeColorsHue: (hue?: number) => void;
    applyPrimaryColorFrom: (color?: string) => void;
    isColorSelectedForPrimary: (hexColor?: string) => boolean;
    initializeStageModel: () => Promise<void>;
    restoreBuiltInStageModelRenderer: () => void;
    setStageModelRenderer: (renderer: import("./stage-model").StageModelRenderer) => void;
    updateStageModel: () => Promise<void>;
    resetState: () => Promise<void>;
}, "stageModelRenderer" | "stageModelSelectedUrl" | "stageModelSelectedDisplayModel" | "stageViewControlsEnabled" | "language" | "disableTransitions" | "usePageSpecificTransitions" | "websocketSecureEnabled" | "analyticsEnabled" | "allowVisibleOnAllWorkspaces" | "alwaysOnTop" | "controlsIslandIconSize" | "inspectUpdaterDiagnostics" | "spinePremultipliedAlpha" | "spineDefaultMixDuration" | "spineIdleAnimationEnabled" | "spineMaxFps" | "spineRenderScale" | "themeColorsHue" | "themeColorsHueDynamic">, Pick<{
    disableTransitions: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    usePageSpecificTransitions: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    language: import("@vueuse/shared").ManualResetRefReturn<string>;
    analyticsEnabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    websocketSecureEnabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    stageModelRenderer: import("@vueuse/shared").ManualResetRefReturn<import("./stage-model").StageModelRenderer>;
    stageModelSelected: import("vue").WritableComputedRef<string, string>;
    stageModelSelectedUrl: import("@vueuse/shared").ManualResetRefReturn<string | undefined>;
    stageModelSelectedDisplayModel: import("@vueuse/shared").ManualResetRefReturn<import("..").DisplayModel | undefined>;
    stageViewControlsEnabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    spinePremultipliedAlpha: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    spineDefaultMixDuration: import("@vueuse/shared").ManualResetRefReturn<number>;
    spineIdleAnimationEnabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    spineMaxFps: import("@vueuse/shared").ManualResetRefReturn<number>;
    spineRenderScale: import("@vueuse/shared").ManualResetRefReturn<number>;
    themeColorsHue: import("@vueuse/shared").ManualResetRefReturn<number>;
    themeColorsHueDynamic: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    allowVisibleOnAllWorkspaces: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    alwaysOnTop: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    controlsIslandIconSize: import("@vueuse/shared").ManualResetRefReturn<"small" | "auto" | "large">;
    inspectUpdaterDiagnostics: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    setThemeColorsHue: (hue?: number) => void;
    applyPrimaryColorFrom: (color?: string) => void;
    isColorSelectedForPrimary: (hexColor?: string) => boolean;
    initializeStageModel: () => Promise<void>;
    restoreBuiltInStageModelRenderer: () => void;
    setStageModelRenderer: (renderer: import("./stage-model").StageModelRenderer) => void;
    updateStageModel: () => Promise<void>;
    resetState: () => Promise<void>;
}, "stageModelSelected">, Pick<{
    disableTransitions: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    usePageSpecificTransitions: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    language: import("@vueuse/shared").ManualResetRefReturn<string>;
    analyticsEnabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    websocketSecureEnabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    stageModelRenderer: import("@vueuse/shared").ManualResetRefReturn<import("./stage-model").StageModelRenderer>;
    stageModelSelected: import("vue").WritableComputedRef<string, string>;
    stageModelSelectedUrl: import("@vueuse/shared").ManualResetRefReturn<string | undefined>;
    stageModelSelectedDisplayModel: import("@vueuse/shared").ManualResetRefReturn<import("..").DisplayModel | undefined>;
    stageViewControlsEnabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    spinePremultipliedAlpha: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    spineDefaultMixDuration: import("@vueuse/shared").ManualResetRefReturn<number>;
    spineIdleAnimationEnabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    spineMaxFps: import("@vueuse/shared").ManualResetRefReturn<number>;
    spineRenderScale: import("@vueuse/shared").ManualResetRefReturn<number>;
    themeColorsHue: import("@vueuse/shared").ManualResetRefReturn<number>;
    themeColorsHueDynamic: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    allowVisibleOnAllWorkspaces: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    alwaysOnTop: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    controlsIslandIconSize: import("@vueuse/shared").ManualResetRefReturn<"small" | "auto" | "large">;
    inspectUpdaterDiagnostics: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    setThemeColorsHue: (hue?: number) => void;
    applyPrimaryColorFrom: (color?: string) => void;
    isColorSelectedForPrimary: (hexColor?: string) => boolean;
    initializeStageModel: () => Promise<void>;
    restoreBuiltInStageModelRenderer: () => void;
    setStageModelRenderer: (renderer: import("./stage-model").StageModelRenderer) => void;
    updateStageModel: () => Promise<void>;
    resetState: () => Promise<void>;
}, "initializeStageModel" | "restoreBuiltInStageModelRenderer" | "setStageModelRenderer" | "updateStageModel" | "resetState" | "setThemeColorsHue" | "applyPrimaryColorFrom" | "isColorSelectedForPrimary">>;
