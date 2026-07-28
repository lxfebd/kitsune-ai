export type SpeechOutputStopReason = 'manual-chat';
/**
 * Represents a user-requested stop-speaking command for the stage output host.
 */
export interface SpeechOutputStopRequest {
    /** Monotonic sequence number so repeated requests with the same reason still notify watchers. */
    id: number;
    /** Source of the stop-speaking request. */
    reason: SpeechOutputStopReason;
}
export declare const useSpeechOutputControlStore: import("pinia").StoreDefinition<"speech-output-control", Pick<{
    latestStopRequest: import("vue").Ref<SpeechOutputStopRequest | undefined, SpeechOutputStopRequest | undefined>;
    requestStopSpeaking: (reason: SpeechOutputStopReason) => void;
}, "latestStopRequest">, Pick<{
    latestStopRequest: import("vue").Ref<SpeechOutputStopRequest | undefined, SpeechOutputStopRequest | undefined>;
    requestStopSpeaking: (reason: SpeechOutputStopReason) => void;
}, never>, Pick<{
    latestStopRequest: import("vue").Ref<SpeechOutputStopRequest | undefined, SpeechOutputStopRequest | undefined>;
    requestStopSpeaking: (reason: SpeechOutputStopReason) => void;
}, "requestStopSpeaking">>;
