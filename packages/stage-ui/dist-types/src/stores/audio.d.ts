declare function calculateVolume(analyser: AnalyserNode, mode?: 'linear' | 'minmax'): number;
export declare const useAudioContext: import("pinia").StoreDefinition<"audio-context", Pick<{
    audioContext: import("vue").ShallowRef<AudioContext, AudioContext>;
    calculateVolume: typeof calculateVolume;
}, "audioContext">, Pick<{
    audioContext: import("vue").ShallowRef<AudioContext, AudioContext>;
    calculateVolume: typeof calculateVolume;
}, never>, Pick<{
    audioContext: import("vue").ShallowRef<AudioContext, AudioContext>;
    calculateVolume: typeof calculateVolume;
}, "calculateVolume">>;
export declare const useSpeakingStore: import("pinia").StoreDefinition<"character-speaking", Pick<{
    mouthOpenSize: import("vue").Ref<number, number>;
    nowSpeaking: import("vue").Ref<boolean, boolean>;
    nowSpeakingAvatarBorderOpacity: import("vue").ComputedRef<number>;
}, "mouthOpenSize" | "nowSpeaking">, Pick<{
    mouthOpenSize: import("vue").Ref<number, number>;
    nowSpeaking: import("vue").Ref<boolean, boolean>;
    nowSpeakingAvatarBorderOpacity: import("vue").ComputedRef<number>;
}, "nowSpeakingAvatarBorderOpacity">, Pick<{
    mouthOpenSize: import("vue").Ref<number, number>;
    nowSpeaking: import("vue").Ref<boolean, boolean>;
    nowSpeakingAvatarBorderOpacity: import("vue").ComputedRef<number>;
}, never>>;

