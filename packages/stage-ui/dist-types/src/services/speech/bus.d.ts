export interface SpeechIntentStartPayload {
    originId: string;
    turnId?: string;
    intentId: string;
    streamId: string;
    ownerId?: string;
    priority?: number;
    behavior?: 'queue' | 'interrupt' | 'replace';
}
export interface SpeechIntentTokenPayload {
    originId: string;
    turnId?: string;
    intentId: string;
    streamId: string;
    sequence: number;
    value?: string;
}
export interface SpeechIntentEndPayload {
    originId: string;
    turnId?: string;
    intentId: string;
    streamId: string;
}
export interface SpeechIntentCancelPayload {
    originId: string;
    turnId?: string;
    intentId: string;
    streamId: string;
    reason?: string;
}
export declare const speechIntentStartEvent: import("@moeru/eventa").Eventa<SpeechIntentStartPayload, undefined, undefined>;
export declare const speechIntentLiteralEvent: import("@moeru/eventa").Eventa<SpeechIntentTokenPayload, undefined, undefined>;
export declare const speechIntentSpecialEvent: import("@moeru/eventa").Eventa<SpeechIntentTokenPayload, undefined, undefined>;
export declare const speechIntentFlushEvent: import("@moeru/eventa").Eventa<SpeechIntentTokenPayload, undefined, undefined>;
export declare const speechIntentEndEvent: import("@moeru/eventa").Eventa<SpeechIntentEndPayload, undefined, undefined>;
export declare const speechIntentCancelEvent: import("@moeru/eventa").Eventa<SpeechIntentCancelPayload, undefined, undefined>;
export declare function getSpeechBusContext(): import("@moeru/eventa").EventContext<any, {
    raw: {
        message?: MessageEvent;
        messageError?: MessageEvent;
        error?: unknown;
    };
}>;
