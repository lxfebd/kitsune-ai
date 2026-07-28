import type { TraceEvent } from '@kitsune/stage-shared';
interface RunSnapshot {
    startedAt: number;
    stoppedAt: number;
    events: TraceEvent[];
}
interface DevtoolsChatScenario {
    userMessages: Array<{
        atMs: number;
        text: string;
    }>;
    assistant: {
        text: string;
        firstTokenDelayMs?: number;
        rate?: {
            tokensPerSecond?: number;
            jitterMs?: number;
            maxChunkSize?: number;
        };
    };
}
export declare const useMarkdownStressStore: import("pinia").StoreDefinition<"markdownStress", Pick<{
    canRunOnline: import("vue").Ref<boolean, boolean>;
    capturing: import("vue").Ref<boolean, boolean>;
    events: import("vue").Ref<{
        tracerId: string;
        name: string;
        ts: number;
        duration?: number | undefined;
        meta?: Record<string, any> | undefined;
    }[], TraceEvent[] | {
        tracerId: string;
        name: string;
        ts: number;
        duration?: number | undefined;
        meta?: Record<string, any> | undefined;
    }[]>;
    lastRun: import("vue").Ref<RunSnapshot | undefined, RunSnapshot | undefined>;
    payloadPreview: import("vue").Ref<string, string>;
    scheduleDelayMs: import("vue").Ref<number, number>;
    runState: import("vue").Ref<"running" | "idle" | "scheduled", "running" | "idle" | "scheduled">;
    scenario: import("vue").Ref<{
        userMessages: {
            atMs: number;
            text: string;
        }[];
        assistant: {
            text: string;
            firstTokenDelayMs?: number | undefined;
            rate?: {
                tokensPerSecond?: number | undefined;
                jitterMs?: number | undefined;
                maxChunkSize?: number | undefined;
            } | undefined;
        };
    } | null, DevtoolsChatScenario | {
        userMessages: {
            atMs: number;
            text: string;
        }[];
        assistant: {
            text: string;
            firstTokenDelayMs?: number | undefined;
            rate?: {
                tokensPerSecond?: number | undefined;
                jitterMs?: number | undefined;
                maxChunkSize?: number | undefined;
            } | undefined;
        };
    } | null>;
    isMock: import("vue").Ref<boolean, boolean>;
    startCapture: () => void;
    stopCapture: () => void;
    scheduleRun: () => Promise<void>;
    cancelScheduledRun: () => void;
    generatePreview: () => void;
    setMockMode: (enabled: boolean) => void;
    toggleMockMode: () => void;
    exportCsv: (snapshot?: RunSnapshot) => void;
}, "scenario" | "canRunOnline" | "capturing" | "events" | "lastRun" | "payloadPreview" | "scheduleDelayMs" | "runState" | "isMock">, Pick<{
    canRunOnline: import("vue").Ref<boolean, boolean>;
    capturing: import("vue").Ref<boolean, boolean>;
    events: import("vue").Ref<{
        tracerId: string;
        name: string;
        ts: number;
        duration?: number | undefined;
        meta?: Record<string, any> | undefined;
    }[], TraceEvent[] | {
        tracerId: string;
        name: string;
        ts: number;
        duration?: number | undefined;
        meta?: Record<string, any> | undefined;
    }[]>;
    lastRun: import("vue").Ref<RunSnapshot | undefined, RunSnapshot | undefined>;
    payloadPreview: import("vue").Ref<string, string>;
    scheduleDelayMs: import("vue").Ref<number, number>;
    runState: import("vue").Ref<"running" | "idle" | "scheduled", "running" | "idle" | "scheduled">;
    scenario: import("vue").Ref<{
        userMessages: {
            atMs: number;
            text: string;
        }[];
        assistant: {
            text: string;
            firstTokenDelayMs?: number | undefined;
            rate?: {
                tokensPerSecond?: number | undefined;
                jitterMs?: number | undefined;
                maxChunkSize?: number | undefined;
            } | undefined;
        };
    } | null, DevtoolsChatScenario | {
        userMessages: {
            atMs: number;
            text: string;
        }[];
        assistant: {
            text: string;
            firstTokenDelayMs?: number | undefined;
            rate?: {
                tokensPerSecond?: number | undefined;
                jitterMs?: number | undefined;
                maxChunkSize?: number | undefined;
            } | undefined;
        };
    } | null>;
    isMock: import("vue").Ref<boolean, boolean>;
    startCapture: () => void;
    stopCapture: () => void;
    scheduleRun: () => Promise<void>;
    cancelScheduledRun: () => void;
    generatePreview: () => void;
    setMockMode: (enabled: boolean) => void;
    toggleMockMode: () => void;
    exportCsv: (snapshot?: RunSnapshot) => void;
}, never>, Pick<{
    canRunOnline: import("vue").Ref<boolean, boolean>;
    capturing: import("vue").Ref<boolean, boolean>;
    events: import("vue").Ref<{
        tracerId: string;
        name: string;
        ts: number;
        duration?: number | undefined;
        meta?: Record<string, any> | undefined;
    }[], TraceEvent[] | {
        tracerId: string;
        name: string;
        ts: number;
        duration?: number | undefined;
        meta?: Record<string, any> | undefined;
    }[]>;
    lastRun: import("vue").Ref<RunSnapshot | undefined, RunSnapshot | undefined>;
    payloadPreview: import("vue").Ref<string, string>;
    scheduleDelayMs: import("vue").Ref<number, number>;
    runState: import("vue").Ref<"running" | "idle" | "scheduled", "running" | "idle" | "scheduled">;
    scenario: import("vue").Ref<{
        userMessages: {
            atMs: number;
            text: string;
        }[];
        assistant: {
            text: string;
            firstTokenDelayMs?: number | undefined;
            rate?: {
                tokensPerSecond?: number | undefined;
                jitterMs?: number | undefined;
                maxChunkSize?: number | undefined;
            } | undefined;
        };
    } | null, DevtoolsChatScenario | {
        userMessages: {
            atMs: number;
            text: string;
        }[];
        assistant: {
            text: string;
            firstTokenDelayMs?: number | undefined;
            rate?: {
                tokensPerSecond?: number | undefined;
                jitterMs?: number | undefined;
                maxChunkSize?: number | undefined;
            } | undefined;
        };
    } | null>;
    isMock: import("vue").Ref<boolean, boolean>;
    startCapture: () => void;
    stopCapture: () => void;
    scheduleRun: () => Promise<void>;
    cancelScheduledRun: () => void;
    generatePreview: () => void;
    setMockMode: (enabled: boolean) => void;
    toggleMockMode: () => void;
    exportCsv: (snapshot?: RunSnapshot) => void;
}, "startCapture" | "stopCapture" | "scheduleRun" | "cancelScheduledRun" | "generatePreview" | "setMockMode" | "toggleMockMode" | "exportCsv">>;

