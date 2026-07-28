import type { IOSubsystem, IOTurn } from '@kitsune/stage-shared';
export declare const useIOTracerStore: import("pinia").StoreDefinition<"devtools:io-tracer", Pick<{
    turns: import("vue").Ref<{
        id: string;
        startTs: number;
        endTs?: number | undefined;
        inputText?: string | undefined;
        outputText?: string | undefined;
        spans: {
            id: string;
            traceId: string;
            parentSpanId?: string | undefined;
            startTs: number;
            endTs?: number | undefined;
            ttsCorrelationId?: string | undefined;
            subsystem: IOSubsystem;
            name: string;
            meta: Record<string, any>;
            events?: {
                name: string;
                timeTs: number;
                meta: Record<string, unknown>;
            }[] | undefined;
        }[];
    }[], IOTurn[] | {
        id: string;
        startTs: number;
        endTs?: number | undefined;
        inputText?: string | undefined;
        outputText?: string | undefined;
        spans: {
            id: string;
            traceId: string;
            parentSpanId?: string | undefined;
            startTs: number;
            endTs?: number | undefined;
            ttsCorrelationId?: string | undefined;
            subsystem: IOSubsystem;
            name: string;
            meta: Record<string, any>;
            events?: {
                name: string;
                timeTs: number;
                meta: Record<string, unknown>;
            }[] | undefined;
        }[];
    }[]>;
    activeTurn: import("vue").ComputedRef<{
        id: string;
        startTs: number;
        endTs?: number | undefined;
        inputText?: string | undefined;
        outputText?: string | undefined;
        spans: {
            id: string;
            traceId: string;
            parentSpanId?: string | undefined;
            startTs: number;
            endTs?: number | undefined;
            ttsCorrelationId?: string | undefined;
            subsystem: IOSubsystem;
            name: string;
            meta: Record<string, any>;
            events?: {
                name: string;
                timeTs: number;
                meta: Record<string, unknown>;
            }[] | undefined;
        }[];
    } | undefined>;
    isRecording: import("vue").Ref<boolean, boolean>;
    rawSpanCount: import("vue").Ref<number, number>;
    recordingStartTs: import("vue").Ref<number, number>;
    selectedSpanId: import("vue").Ref<string | null, string | null>;
    selectedSpan: import("vue").ComputedRef<{
        span: {
            id: string;
            traceId: string;
            parentSpanId?: string | undefined;
            startTs: number;
            endTs?: number | undefined;
            ttsCorrelationId?: string | undefined;
            subsystem: IOSubsystem;
            name: string;
            meta: Record<string, any>;
            events?: {
                name: string;
                timeTs: number;
                meta: Record<string, unknown>;
            }[] | undefined;
        };
        turn: {
            id: string;
            startTs: number;
            endTs?: number | undefined;
            inputText?: string | undefined;
            outputText?: string | undefined;
            spans: {
                id: string;
                traceId: string;
                parentSpanId?: string | undefined;
                startTs: number;
                endTs?: number | undefined;
                ttsCorrelationId?: string | undefined;
                subsystem: IOSubsystem;
                name: string;
                meta: Record<string, any>;
                events?: {
                    name: string;
                    timeTs: number;
                    meta: Record<string, unknown>;
                }[] | undefined;
            }[];
        };
    } | undefined>;
    startRecording: () => void;
    stopRecording: () => void;
    clear: () => void;
    selectSpan: (spanId: string | null) => void;
    exportOTLP: () => void;
}, "turns" | "isRecording" | "rawSpanCount" | "recordingStartTs" | "selectedSpanId">, Pick<{
    turns: import("vue").Ref<{
        id: string;
        startTs: number;
        endTs?: number | undefined;
        inputText?: string | undefined;
        outputText?: string | undefined;
        spans: {
            id: string;
            traceId: string;
            parentSpanId?: string | undefined;
            startTs: number;
            endTs?: number | undefined;
            ttsCorrelationId?: string | undefined;
            subsystem: IOSubsystem;
            name: string;
            meta: Record<string, any>;
            events?: {
                name: string;
                timeTs: number;
                meta: Record<string, unknown>;
            }[] | undefined;
        }[];
    }[], IOTurn[] | {
        id: string;
        startTs: number;
        endTs?: number | undefined;
        inputText?: string | undefined;
        outputText?: string | undefined;
        spans: {
            id: string;
            traceId: string;
            parentSpanId?: string | undefined;
            startTs: number;
            endTs?: number | undefined;
            ttsCorrelationId?: string | undefined;
            subsystem: IOSubsystem;
            name: string;
            meta: Record<string, any>;
            events?: {
                name: string;
                timeTs: number;
                meta: Record<string, unknown>;
            }[] | undefined;
        }[];
    }[]>;
    activeTurn: import("vue").ComputedRef<{
        id: string;
        startTs: number;
        endTs?: number | undefined;
        inputText?: string | undefined;
        outputText?: string | undefined;
        spans: {
            id: string;
            traceId: string;
            parentSpanId?: string | undefined;
            startTs: number;
            endTs?: number | undefined;
            ttsCorrelationId?: string | undefined;
            subsystem: IOSubsystem;
            name: string;
            meta: Record<string, any>;
            events?: {
                name: string;
                timeTs: number;
                meta: Record<string, unknown>;
            }[] | undefined;
        }[];
    } | undefined>;
    isRecording: import("vue").Ref<boolean, boolean>;
    rawSpanCount: import("vue").Ref<number, number>;
    recordingStartTs: import("vue").Ref<number, number>;
    selectedSpanId: import("vue").Ref<string | null, string | null>;
    selectedSpan: import("vue").ComputedRef<{
        span: {
            id: string;
            traceId: string;
            parentSpanId?: string | undefined;
            startTs: number;
            endTs?: number | undefined;
            ttsCorrelationId?: string | undefined;
            subsystem: IOSubsystem;
            name: string;
            meta: Record<string, any>;
            events?: {
                name: string;
                timeTs: number;
                meta: Record<string, unknown>;
            }[] | undefined;
        };
        turn: {
            id: string;
            startTs: number;
            endTs?: number | undefined;
            inputText?: string | undefined;
            outputText?: string | undefined;
            spans: {
                id: string;
                traceId: string;
                parentSpanId?: string | undefined;
                startTs: number;
                endTs?: number | undefined;
                ttsCorrelationId?: string | undefined;
                subsystem: IOSubsystem;
                name: string;
                meta: Record<string, any>;
                events?: {
                    name: string;
                    timeTs: number;
                    meta: Record<string, unknown>;
                }[] | undefined;
            }[];
        };
    } | undefined>;
    startRecording: () => void;
    stopRecording: () => void;
    clear: () => void;
    selectSpan: (spanId: string | null) => void;
    exportOTLP: () => void;
}, "activeTurn" | "selectedSpan">, Pick<{
    turns: import("vue").Ref<{
        id: string;
        startTs: number;
        endTs?: number | undefined;
        inputText?: string | undefined;
        outputText?: string | undefined;
        spans: {
            id: string;
            traceId: string;
            parentSpanId?: string | undefined;
            startTs: number;
            endTs?: number | undefined;
            ttsCorrelationId?: string | undefined;
            subsystem: IOSubsystem;
            name: string;
            meta: Record<string, any>;
            events?: {
                name: string;
                timeTs: number;
                meta: Record<string, unknown>;
            }[] | undefined;
        }[];
    }[], IOTurn[] | {
        id: string;
        startTs: number;
        endTs?: number | undefined;
        inputText?: string | undefined;
        outputText?: string | undefined;
        spans: {
            id: string;
            traceId: string;
            parentSpanId?: string | undefined;
            startTs: number;
            endTs?: number | undefined;
            ttsCorrelationId?: string | undefined;
            subsystem: IOSubsystem;
            name: string;
            meta: Record<string, any>;
            events?: {
                name: string;
                timeTs: number;
                meta: Record<string, unknown>;
            }[] | undefined;
        }[];
    }[]>;
    activeTurn: import("vue").ComputedRef<{
        id: string;
        startTs: number;
        endTs?: number | undefined;
        inputText?: string | undefined;
        outputText?: string | undefined;
        spans: {
            id: string;
            traceId: string;
            parentSpanId?: string | undefined;
            startTs: number;
            endTs?: number | undefined;
            ttsCorrelationId?: string | undefined;
            subsystem: IOSubsystem;
            name: string;
            meta: Record<string, any>;
            events?: {
                name: string;
                timeTs: number;
                meta: Record<string, unknown>;
            }[] | undefined;
        }[];
    } | undefined>;
    isRecording: import("vue").Ref<boolean, boolean>;
    rawSpanCount: import("vue").Ref<number, number>;
    recordingStartTs: import("vue").Ref<number, number>;
    selectedSpanId: import("vue").Ref<string | null, string | null>;
    selectedSpan: import("vue").ComputedRef<{
        span: {
            id: string;
            traceId: string;
            parentSpanId?: string | undefined;
            startTs: number;
            endTs?: number | undefined;
            ttsCorrelationId?: string | undefined;
            subsystem: IOSubsystem;
            name: string;
            meta: Record<string, any>;
            events?: {
                name: string;
                timeTs: number;
                meta: Record<string, unknown>;
            }[] | undefined;
        };
        turn: {
            id: string;
            startTs: number;
            endTs?: number | undefined;
            inputText?: string | undefined;
            outputText?: string | undefined;
            spans: {
                id: string;
                traceId: string;
                parentSpanId?: string | undefined;
                startTs: number;
                endTs?: number | undefined;
                ttsCorrelationId?: string | undefined;
                subsystem: IOSubsystem;
                name: string;
                meta: Record<string, any>;
                events?: {
                    name: string;
                    timeTs: number;
                    meta: Record<string, unknown>;
                }[] | undefined;
            }[];
        };
    } | undefined>;
    startRecording: () => void;
    stopRecording: () => void;
    clear: () => void;
    selectSpan: (spanId: string | null) => void;
    exportOTLP: () => void;
}, "clear" | "startRecording" | "stopRecording" | "selectSpan" | "exportOTLP">>;
