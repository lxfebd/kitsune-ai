import type { MaybeRefOrGetter } from 'vue';
import type { BaseVADConfig } from '../../../libs/audio/vad';
interface UseVADOptions {
    threshold?: MaybeRefOrGetter<number>;
    minSilenceDurationMs?: MaybeRefOrGetter<number>;
    onSpeechStart?: () => void;
    onSpeechEnd?: () => void;
}
export declare function resolveVADConfig(threshold?: number, minSilenceDurationMs?: number): Pick<BaseVADConfig, 'speechThreshold' | 'exitThreshold' | 'minSilenceDurationMs'>;
export declare function useVAD(workerUrl: string, options?: UseVADOptions): {
    isSpeech: import("vue").Ref<boolean, boolean>;
    isSpeechProb: import("vue").Ref<number, number>;
    isSpeechHistory: import("vue").Ref<number[], number[]>;
    loaded: import("vue").Ref<boolean, boolean>;
    loading: import("vue").Ref<boolean, boolean>;
    inferenceError: import("vue").Ref<string | undefined, string | undefined>;
    threshold: import("vue").Ref<number, number> | import("vue").Ref<number, number> | import("vue").ShallowRef<number, number> | import("vue").WritableComputedRef<number, number> | import("vue").ComputedRef<number> | import("vue").Ref<undefined, undefined> | Readonly<import("vue").Ref<number, number>>;
    minSilenceDurationMs: import("vue").Ref<number, number> | import("vue").Ref<number, number> | import("vue").ShallowRef<number, number> | import("vue").WritableComputedRef<number, number> | import("vue").ComputedRef<number> | import("vue").Ref<undefined, undefined> | Readonly<import("vue").Ref<number, number>>;
    init: () => Promise<void>;
    start: (stream: MediaStream) => Promise<void>;
    dispose: () => void;
};

