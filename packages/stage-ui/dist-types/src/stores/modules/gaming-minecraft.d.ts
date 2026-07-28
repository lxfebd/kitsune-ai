import type { WebSocketBaseEvent, WebSocketEvents } from '@kitsune/server-sdk';
export interface MinecraftTrafficEntry {
    id: string;
    type: 'context:update' | 'spark:command';
    summary: string;
    source: string;
    receivedAt: number;
    payload: unknown;
}
export declare const useMinecraftStore: import("pinia").StoreDefinition<"minecraft", Pick<{
    latestRuntimeContextText: import("vue").Ref<string, string>;
    lastRuntimeContextAt: import("vue").Ref<number, number>;
    trafficEntries: import("vue").Ref<{
        id: string;
        type: "context:update" | "spark:command";
        summary: string;
        source: string;
        receivedAt: number;
        payload: unknown;
    }[], MinecraftTrafficEntry[] | {
        id: string;
        type: "context:update" | "spark:command";
        summary: string;
        source: string;
        receivedAt: number;
        payload: unknown;
    }[]>;
    configured: import("vue").ComputedRef<boolean>;
    serviceConnected: import("vue").ComputedRef<boolean>;
    runtimeContextAgeMs: import("vue").ComputedRef<number>;
    initialize: () => void;
    dispose: () => void;
    resetState: () => void;
    _handleRuntimeContextUpdate: (event: WebSocketBaseEvent<"context:update", WebSocketEvents["context:update"]>) => void;
}, "latestRuntimeContextText" | "lastRuntimeContextAt" | "trafficEntries">, Pick<{
    latestRuntimeContextText: import("vue").Ref<string, string>;
    lastRuntimeContextAt: import("vue").Ref<number, number>;
    trafficEntries: import("vue").Ref<{
        id: string;
        type: "context:update" | "spark:command";
        summary: string;
        source: string;
        receivedAt: number;
        payload: unknown;
    }[], MinecraftTrafficEntry[] | {
        id: string;
        type: "context:update" | "spark:command";
        summary: string;
        source: string;
        receivedAt: number;
        payload: unknown;
    }[]>;
    configured: import("vue").ComputedRef<boolean>;
    serviceConnected: import("vue").ComputedRef<boolean>;
    runtimeContextAgeMs: import("vue").ComputedRef<number>;
    initialize: () => void;
    dispose: () => void;
    resetState: () => void;
    _handleRuntimeContextUpdate: (event: WebSocketBaseEvent<"context:update", WebSocketEvents["context:update"]>) => void;
}, "configured" | "serviceConnected" | "runtimeContextAgeMs">, Pick<{
    latestRuntimeContextText: import("vue").Ref<string, string>;
    lastRuntimeContextAt: import("vue").Ref<number, number>;
    trafficEntries: import("vue").Ref<{
        id: string;
        type: "context:update" | "spark:command";
        summary: string;
        source: string;
        receivedAt: number;
        payload: unknown;
    }[], MinecraftTrafficEntry[] | {
        id: string;
        type: "context:update" | "spark:command";
        summary: string;
        source: string;
        receivedAt: number;
        payload: unknown;
    }[]>;
    configured: import("vue").ComputedRef<boolean>;
    serviceConnected: import("vue").ComputedRef<boolean>;
    runtimeContextAgeMs: import("vue").ComputedRef<number>;
    initialize: () => void;
    dispose: () => void;
    resetState: () => void;
    _handleRuntimeContextUpdate: (event: WebSocketBaseEvent<"context:update", WebSocketEvents["context:update"]>) => void;
}, "dispose" | "initialize" | "resetState" | "_handleRuntimeContextUpdate">>;
