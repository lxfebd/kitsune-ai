export declare function useAudioAnalyzer(): {
    volumeLevel: import("vue").Ref<number, number>;
    error: import("vue").Ref<string | undefined, string | undefined>;
    startAnalyzer: (audioContext: AudioContext) => AnalyserNode | undefined;
    stopAnalyzer: () => void;
    onAnalyzerUpdate: (callback: (volumeLevel: number) => void | Promise<void>) => () => void;
};
