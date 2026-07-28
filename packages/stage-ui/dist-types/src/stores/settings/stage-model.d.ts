import type { DisplayModel } from '../display-models';
export type StageModelRenderer = 'live2d' | 'vrm' | 'spine' | 'godot' | 'disabled' | undefined;
export declare const useSettingsStageModel: import("pinia").StoreDefinition<"settings-stage-model", Pick<{
    stageModelRenderer: import("@vueuse/shared").ManualResetRefReturn<StageModelRenderer>;
    stageModelSelected: import("vue").WritableComputedRef<string, string>;
    stageModelSelectedUrl: import("@vueuse/shared").ManualResetRefReturn<string | undefined>;
    stageModelSelectedDisplayModel: import("@vueuse/shared").ManualResetRefReturn<DisplayModel | undefined>;
    stageViewControlsEnabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    initializeStageModel: () => Promise<void>;
    restoreBuiltInStageModelRenderer: () => void;
    setStageModelRenderer: (renderer: StageModelRenderer) => void;
    updateStageModel: () => Promise<void>;
    resetState: () => Promise<void>;
}, "stageModelRenderer" | "stageModelSelectedUrl" | "stageModelSelectedDisplayModel" | "stageViewControlsEnabled">, Pick<{
    stageModelRenderer: import("@vueuse/shared").ManualResetRefReturn<StageModelRenderer>;
    stageModelSelected: import("vue").WritableComputedRef<string, string>;
    stageModelSelectedUrl: import("@vueuse/shared").ManualResetRefReturn<string | undefined>;
    stageModelSelectedDisplayModel: import("@vueuse/shared").ManualResetRefReturn<DisplayModel | undefined>;
    stageViewControlsEnabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    initializeStageModel: () => Promise<void>;
    restoreBuiltInStageModelRenderer: () => void;
    setStageModelRenderer: (renderer: StageModelRenderer) => void;
    updateStageModel: () => Promise<void>;
    resetState: () => Promise<void>;
}, "stageModelSelected">, Pick<{
    stageModelRenderer: import("@vueuse/shared").ManualResetRefReturn<StageModelRenderer>;
    stageModelSelected: import("vue").WritableComputedRef<string, string>;
    stageModelSelectedUrl: import("@vueuse/shared").ManualResetRefReturn<string | undefined>;
    stageModelSelectedDisplayModel: import("@vueuse/shared").ManualResetRefReturn<DisplayModel | undefined>;
    stageViewControlsEnabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    initializeStageModel: () => Promise<void>;
    restoreBuiltInStageModelRenderer: () => void;
    setStageModelRenderer: (renderer: StageModelRenderer) => void;
    updateStageModel: () => Promise<void>;
    resetState: () => Promise<void>;
}, "initializeStageModel" | "restoreBuiltInStageModelRenderer" | "setStageModelRenderer" | "updateStageModel" | "resetState">>;
