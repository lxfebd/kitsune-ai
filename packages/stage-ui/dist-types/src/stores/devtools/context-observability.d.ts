import type { ContextUpdateStrategy } from '@kitsune/server-sdk';
import type { Message } from '@xsai/shared-chat';
import type { ContextMessage } from '../../types/chat';
export type ContextLifecyclePhase = 'server-received' | 'input-context-update' | 'broadcast-posted' | 'broadcast-received' | 'store-ingested' | 'store-ingest-rejected' | 'before-compose' | 'prompt-context-built' | 'after-compose';
export interface ContextLifecycleRecord {
    id: string;
    timestamp: number;
    phase: ContextLifecyclePhase;
    channel: 'server' | 'broadcast' | 'chat' | 'input';
    sourceKey?: string;
    sessionId?: string;
    strategy?: ContextUpdateStrategy;
    lane?: string;
    contextId?: string;
    eventId?: string;
    mutation?: 'replace' | 'append';
    textPreview?: string;
    sourceLabel?: string;
    details?: unknown;
}
export interface PromptProjectionSnapshot {
    capturedAt: number;
    sessionId: string;
    message: string;
    contexts: Record<string, ContextMessage[]>;
    promptText: string;
    promptMessage?: Message;
    composedMessage?: Message[];
}
export declare const useContextObservabilityStore: import("pinia").StoreDefinition<"devtools:context-observability", Pick<{
    history: import("vue").Ref<{
        id: string;
        timestamp: number;
        phase: ContextLifecyclePhase;
        channel: "server" | "broadcast" | "chat" | "input";
        sourceKey?: string | undefined;
        sessionId?: string | undefined;
        strategy?: ContextUpdateStrategy | undefined;
        lane?: string | undefined;
        contextId?: string | undefined;
        eventId?: string | undefined;
        mutation?: "replace" | "append" | undefined;
        textPreview?: string | undefined;
        sourceLabel?: string | undefined;
        details?: unknown;
    }[], ContextLifecycleRecord[] | {
        id: string;
        timestamp: number;
        phase: ContextLifecyclePhase;
        channel: "server" | "broadcast" | "chat" | "input";
        sourceKey?: string | undefined;
        sessionId?: string | undefined;
        strategy?: ContextUpdateStrategy | undefined;
        lane?: string | undefined;
        contextId?: string | undefined;
        eventId?: string | undefined;
        mutation?: "replace" | "append" | undefined;
        textPreview?: string | undefined;
        sourceLabel?: string | undefined;
        details?: unknown;
    }[]>;
    maxHistory: import("vue").Ref<number, number>;
    lastPromptProjection: import("vue").Ref<PromptProjectionSnapshot | undefined, PromptProjectionSnapshot | undefined>;
    lastBroadcastPostedAt: import("vue").Ref<number | undefined, number | undefined>;
    lastBroadcastReceivedAt: import("vue").Ref<number | undefined, number | undefined>;
    recordLifecycle: (record: Omit<ContextLifecycleRecord, "id" | "timestamp" | "textPreview"> & {
        textPreview?: string;
    }) => ContextLifecycleRecord;
    capturePromptProjection: (payload: {
        sessionId: string;
        message: string;
        contexts: Record<string, ContextMessage[]>;
        promptMessage?: Message | null;
        composedMessage?: Message[];
    }) => void;
    clearHistory: () => void;
}, "history" | "maxHistory" | "lastPromptProjection" | "lastBroadcastPostedAt" | "lastBroadcastReceivedAt">, Pick<{
    history: import("vue").Ref<{
        id: string;
        timestamp: number;
        phase: ContextLifecyclePhase;
        channel: "server" | "broadcast" | "chat" | "input";
        sourceKey?: string | undefined;
        sessionId?: string | undefined;
        strategy?: ContextUpdateStrategy | undefined;
        lane?: string | undefined;
        contextId?: string | undefined;
        eventId?: string | undefined;
        mutation?: "replace" | "append" | undefined;
        textPreview?: string | undefined;
        sourceLabel?: string | undefined;
        details?: unknown;
    }[], ContextLifecycleRecord[] | {
        id: string;
        timestamp: number;
        phase: ContextLifecyclePhase;
        channel: "server" | "broadcast" | "chat" | "input";
        sourceKey?: string | undefined;
        sessionId?: string | undefined;
        strategy?: ContextUpdateStrategy | undefined;
        lane?: string | undefined;
        contextId?: string | undefined;
        eventId?: string | undefined;
        mutation?: "replace" | "append" | undefined;
        textPreview?: string | undefined;
        sourceLabel?: string | undefined;
        details?: unknown;
    }[]>;
    maxHistory: import("vue").Ref<number, number>;
    lastPromptProjection: import("vue").Ref<PromptProjectionSnapshot | undefined, PromptProjectionSnapshot | undefined>;
    lastBroadcastPostedAt: import("vue").Ref<number | undefined, number | undefined>;
    lastBroadcastReceivedAt: import("vue").Ref<number | undefined, number | undefined>;
    recordLifecycle: (record: Omit<ContextLifecycleRecord, "id" | "timestamp" | "textPreview"> & {
        textPreview?: string;
    }) => ContextLifecycleRecord;
    capturePromptProjection: (payload: {
        sessionId: string;
        message: string;
        contexts: Record<string, ContextMessage[]>;
        promptMessage?: Message | null;
        composedMessage?: Message[];
    }) => void;
    clearHistory: () => void;
}, never>, Pick<{
    history: import("vue").Ref<{
        id: string;
        timestamp: number;
        phase: ContextLifecyclePhase;
        channel: "server" | "broadcast" | "chat" | "input";
        sourceKey?: string | undefined;
        sessionId?: string | undefined;
        strategy?: ContextUpdateStrategy | undefined;
        lane?: string | undefined;
        contextId?: string | undefined;
        eventId?: string | undefined;
        mutation?: "replace" | "append" | undefined;
        textPreview?: string | undefined;
        sourceLabel?: string | undefined;
        details?: unknown;
    }[], ContextLifecycleRecord[] | {
        id: string;
        timestamp: number;
        phase: ContextLifecyclePhase;
        channel: "server" | "broadcast" | "chat" | "input";
        sourceKey?: string | undefined;
        sessionId?: string | undefined;
        strategy?: ContextUpdateStrategy | undefined;
        lane?: string | undefined;
        contextId?: string | undefined;
        eventId?: string | undefined;
        mutation?: "replace" | "append" | undefined;
        textPreview?: string | undefined;
        sourceLabel?: string | undefined;
        details?: unknown;
    }[]>;
    maxHistory: import("vue").Ref<number, number>;
    lastPromptProjection: import("vue").Ref<PromptProjectionSnapshot | undefined, PromptProjectionSnapshot | undefined>;
    lastBroadcastPostedAt: import("vue").Ref<number | undefined, number | undefined>;
    lastBroadcastReceivedAt: import("vue").Ref<number | undefined, number | undefined>;
    recordLifecycle: (record: Omit<ContextLifecycleRecord, "id" | "timestamp" | "textPreview"> & {
        textPreview?: string;
    }) => ContextLifecycleRecord;
    capturePromptProjection: (payload: {
        sessionId: string;
        message: string;
        contexts: Record<string, ContextMessage[]>;
        promptMessage?: Message | null;
        composedMessage?: Message[];
    }) => void;
    clearHistory: () => void;
}, "recordLifecycle" | "capturePromptProjection" | "clearHistory">>;
