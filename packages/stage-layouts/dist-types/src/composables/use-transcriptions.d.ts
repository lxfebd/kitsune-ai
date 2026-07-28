import type { MaybeRefOrGetter, Ref } from 'vue';
interface TranscriptionOptions {
    messageInputRef: Ref<string>;
    sendMessage: () => void;
    isStageTamagotchi: MaybeRefOrGetter<boolean>;
}
export declare function useTranscriptions(options: TranscriptionOptions): {
    startStreamingTranscription: () => Promise<void>;
    stopStreamingTranscription: () => Promise<void>;
    isListening: Ref<boolean, boolean>;
    autoSendEnabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
};

