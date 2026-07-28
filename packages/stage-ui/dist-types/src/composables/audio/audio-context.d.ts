import type { MaybeRefOrGetter } from 'vue';
export declare function useAudioContextFromStream(media: MaybeRefOrGetter<MediaStream | undefined>): {
    audioContext: import("vue").ShallowRef<AudioContext | undefined, AudioContext | undefined>;
    initialize: () => Promise<AudioContext>;
    pause: () => void;
    resume: () => void;
    dispose: () => void;
};
