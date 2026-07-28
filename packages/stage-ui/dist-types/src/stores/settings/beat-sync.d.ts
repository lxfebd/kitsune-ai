import type { AnalyserWorkletParameters, BeatSyncSpectrumScale } from '@kitsune/stage-shared/beat-sync';
export declare const useSettingsBeatSync: import("pinia").StoreDefinition<"settings-beat-sync", Pick<{
    parameters: import("@vueuse/shared").ManualResetRefReturn<AnalyserWorkletParameters>;
    spectrumScale: import("@vueuse/shared").ManualResetRefReturn<BeatSyncSpectrumScale>;
    resetState: () => void;
}, "parameters" | "spectrumScale">, Pick<{
    parameters: import("@vueuse/shared").ManualResetRefReturn<AnalyserWorkletParameters>;
    spectrumScale: import("@vueuse/shared").ManualResetRefReturn<BeatSyncSpectrumScale>;
    resetState: () => void;
}, never>, Pick<{
    parameters: import("@vueuse/shared").ManualResetRefReturn<AnalyserWorkletParameters>;
    spectrumScale: import("@vueuse/shared").ManualResetRefReturn<BeatSyncSpectrumScale>;
    resetState: () => void;
}, "resetState">>;
