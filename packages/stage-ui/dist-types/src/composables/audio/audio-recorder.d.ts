import type { MaybeRefOrGetter } from 'vue';
export declare function useAudioRecorder(media: MaybeRefOrGetter<MediaStream | undefined>): {
    startRecord: () => Promise<void>;
    stopRecord: () => Promise<Blob | undefined>;
    onStopRecord: (callback: (recording: Blob | undefined) => Promise<void>) => () => void;
    recording: import("vue").ShallowRef<Blob | undefined, Blob | undefined>;
};
