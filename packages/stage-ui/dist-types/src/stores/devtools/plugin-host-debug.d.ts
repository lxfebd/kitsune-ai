export interface PluginManifestSummary {
    extensionId: string;
    entrypoints: Record<string, string | undefined>;
    path: string;
    enabled: boolean;
    autoReload: boolean;
    loaded: boolean;
    isNew: boolean;
}
export interface PluginRegistrySnapshot {
    root: string;
    plugins: PluginManifestSummary[];
}
export interface PluginCapabilityState {
    key: string;
    state: 'announced' | 'ready' | 'degraded' | 'withdrawn';
    metadata?: Record<string, unknown>;
    updatedAt: number;
}
export interface PluginHostSessionSummary {
    id: string;
    extensionId: string;
    phase: string;
    runtime: 'electron' | 'node' | 'web';
    moduleId: string;
}
export interface PluginHostKitCapabilitySummary {
    key: string;
    actions: string[];
}
export interface PluginHostKitSummary {
    kitId: string;
    version: string;
    capabilities: PluginHostKitCapabilitySummary[];
    runtimes: Array<'electron' | 'node' | 'web'>;
}
export interface PluginHostModuleSummary {
    moduleId: string;
    ownerSessionId: string;
    ownerExtensionId: string;
    kitId: string;
    kitModuleType: string;
    state: 'announced' | 'active' | 'degraded' | 'withdrawn';
    runtime: 'electron' | 'node' | 'web';
    revision: number;
    updatedAt: number;
    config: Record<string, unknown>;
}
export interface PluginHostDebugSnapshot {
    registry: PluginRegistrySnapshot;
    sessions: PluginHostSessionSummary[];
    kits: PluginHostKitSummary[];
    modules: PluginHostModuleSummary[];
    capabilities: PluginCapabilityState[];
    refreshedAt: number;
}
interface PluginHostDebugBridge {
    list: () => Promise<PluginRegistrySnapshot>;
    setEnabled: (payload: {
        extensionId: string;
        enabled: boolean;
        path?: string;
    }) => Promise<PluginRegistrySnapshot>;
    setAutoReload: (payload: {
        extensionId: string;
        enabled: boolean;
    }) => Promise<PluginRegistrySnapshot>;
    loadEnabled: () => Promise<PluginRegistrySnapshot>;
    load: (payload: {
        extensionId: string;
    }) => Promise<PluginRegistrySnapshot>;
    unload: (payload: {
        extensionId: string;
    }) => Promise<PluginRegistrySnapshot>;
    inspect: () => Promise<PluginHostDebugSnapshot>;
}
export declare const usePluginHostInspectorStore: import("pinia").StoreDefinition<"devtools:plugin-host-debug", Pick<{
    registry: import("vue").Ref<PluginRegistrySnapshot | undefined, PluginRegistrySnapshot | undefined>;
    sessions: import("vue").Ref<{
        id: string;
        extensionId: string;
        phase: string;
        runtime: "electron" | "node" | "web";
        moduleId: string;
    }[], PluginHostSessionSummary[] | {
        id: string;
        extensionId: string;
        phase: string;
        runtime: "electron" | "node" | "web";
        moduleId: string;
    }[]>;
    kits: import("vue").Ref<{
        kitId: string;
        version: string;
        capabilities: {
            key: string;
            actions: string[];
        }[];
        runtimes: Array<"electron" | "node" | "web">;
    }[], PluginHostKitSummary[] | {
        kitId: string;
        version: string;
        capabilities: {
            key: string;
            actions: string[];
        }[];
        runtimes: Array<"electron" | "node" | "web">;
    }[]>;
    capabilities: import("vue").Ref<{
        key: string;
        state: "announced" | "ready" | "degraded" | "withdrawn";
        metadata?: Record<string, unknown> | undefined;
        updatedAt: number;
    }[], PluginCapabilityState[] | {
        key: string;
        state: "announced" | "ready" | "degraded" | "withdrawn";
        metadata?: Record<string, unknown> | undefined;
        updatedAt: number;
    }[]>;
    refreshedAt: import("vue").Ref<number | undefined, number | undefined>;
    loading: import("vue").Ref<boolean, boolean>;
    error: import("vue").Ref<string | undefined, string | undefined>;
    discoveredPlugins: import("vue").ComputedRef<PluginManifestSummary[]>;
    enabledPlugins: import("vue").ComputedRef<PluginManifestSummary[]>;
    loadedPlugins: import("vue").ComputedRef<PluginManifestSummary[]>;
    isAvailable: import("vue").ComputedRef<boolean>;
    setBridge: (nextBridge: PluginHostDebugBridge) => void;
    clearError: () => void;
    refreshRegistry: () => Promise<PluginRegistrySnapshot>;
    refreshInspection: () => Promise<PluginHostDebugSnapshot>;
    refreshAll: () => Promise<PluginHostDebugSnapshot>;
    setEnabled: (payload: {
        extensionId: string;
        enabled: boolean;
        path?: string;
    }) => Promise<PluginRegistrySnapshot>;
    setAutoReload: (payload: {
        extensionId: string;
        enabled: boolean;
    }) => Promise<PluginRegistrySnapshot>;
    loadEnabled: () => Promise<PluginRegistrySnapshot>;
    load: (payload: {
        extensionId: string;
    }) => Promise<PluginRegistrySnapshot>;
    unload: (payload: {
        extensionId: string;
    }) => Promise<PluginRegistrySnapshot>;
}, "error" | "loading" | "sessions" | "capabilities" | "registry" | "kits" | "refreshedAt">, Pick<{
    registry: import("vue").Ref<PluginRegistrySnapshot | undefined, PluginRegistrySnapshot | undefined>;
    sessions: import("vue").Ref<{
        id: string;
        extensionId: string;
        phase: string;
        runtime: "electron" | "node" | "web";
        moduleId: string;
    }[], PluginHostSessionSummary[] | {
        id: string;
        extensionId: string;
        phase: string;
        runtime: "electron" | "node" | "web";
        moduleId: string;
    }[]>;
    kits: import("vue").Ref<{
        kitId: string;
        version: string;
        capabilities: {
            key: string;
            actions: string[];
        }[];
        runtimes: Array<"electron" | "node" | "web">;
    }[], PluginHostKitSummary[] | {
        kitId: string;
        version: string;
        capabilities: {
            key: string;
            actions: string[];
        }[];
        runtimes: Array<"electron" | "node" | "web">;
    }[]>;
    capabilities: import("vue").Ref<{
        key: string;
        state: "announced" | "ready" | "degraded" | "withdrawn";
        metadata?: Record<string, unknown> | undefined;
        updatedAt: number;
    }[], PluginCapabilityState[] | {
        key: string;
        state: "announced" | "ready" | "degraded" | "withdrawn";
        metadata?: Record<string, unknown> | undefined;
        updatedAt: number;
    }[]>;
    refreshedAt: import("vue").Ref<number | undefined, number | undefined>;
    loading: import("vue").Ref<boolean, boolean>;
    error: import("vue").Ref<string | undefined, string | undefined>;
    discoveredPlugins: import("vue").ComputedRef<PluginManifestSummary[]>;
    enabledPlugins: import("vue").ComputedRef<PluginManifestSummary[]>;
    loadedPlugins: import("vue").ComputedRef<PluginManifestSummary[]>;
    isAvailable: import("vue").ComputedRef<boolean>;
    setBridge: (nextBridge: PluginHostDebugBridge) => void;
    clearError: () => void;
    refreshRegistry: () => Promise<PluginRegistrySnapshot>;
    refreshInspection: () => Promise<PluginHostDebugSnapshot>;
    refreshAll: () => Promise<PluginHostDebugSnapshot>;
    setEnabled: (payload: {
        extensionId: string;
        enabled: boolean;
        path?: string;
    }) => Promise<PluginRegistrySnapshot>;
    setAutoReload: (payload: {
        extensionId: string;
        enabled: boolean;
    }) => Promise<PluginRegistrySnapshot>;
    loadEnabled: () => Promise<PluginRegistrySnapshot>;
    load: (payload: {
        extensionId: string;
    }) => Promise<PluginRegistrySnapshot>;
    unload: (payload: {
        extensionId: string;
    }) => Promise<PluginRegistrySnapshot>;
}, "discoveredPlugins" | "enabledPlugins" | "loadedPlugins" | "isAvailable">, Pick<{
    registry: import("vue").Ref<PluginRegistrySnapshot | undefined, PluginRegistrySnapshot | undefined>;
    sessions: import("vue").Ref<{
        id: string;
        extensionId: string;
        phase: string;
        runtime: "electron" | "node" | "web";
        moduleId: string;
    }[], PluginHostSessionSummary[] | {
        id: string;
        extensionId: string;
        phase: string;
        runtime: "electron" | "node" | "web";
        moduleId: string;
    }[]>;
    kits: import("vue").Ref<{
        kitId: string;
        version: string;
        capabilities: {
            key: string;
            actions: string[];
        }[];
        runtimes: Array<"electron" | "node" | "web">;
    }[], PluginHostKitSummary[] | {
        kitId: string;
        version: string;
        capabilities: {
            key: string;
            actions: string[];
        }[];
        runtimes: Array<"electron" | "node" | "web">;
    }[]>;
    capabilities: import("vue").Ref<{
        key: string;
        state: "announced" | "ready" | "degraded" | "withdrawn";
        metadata?: Record<string, unknown> | undefined;
        updatedAt: number;
    }[], PluginCapabilityState[] | {
        key: string;
        state: "announced" | "ready" | "degraded" | "withdrawn";
        metadata?: Record<string, unknown> | undefined;
        updatedAt: number;
    }[]>;
    refreshedAt: import("vue").Ref<number | undefined, number | undefined>;
    loading: import("vue").Ref<boolean, boolean>;
    error: import("vue").Ref<string | undefined, string | undefined>;
    discoveredPlugins: import("vue").ComputedRef<PluginManifestSummary[]>;
    enabledPlugins: import("vue").ComputedRef<PluginManifestSummary[]>;
    loadedPlugins: import("vue").ComputedRef<PluginManifestSummary[]>;
    isAvailable: import("vue").ComputedRef<boolean>;
    setBridge: (nextBridge: PluginHostDebugBridge) => void;
    clearError: () => void;
    refreshRegistry: () => Promise<PluginRegistrySnapshot>;
    refreshInspection: () => Promise<PluginHostDebugSnapshot>;
    refreshAll: () => Promise<PluginHostDebugSnapshot>;
    setEnabled: (payload: {
        extensionId: string;
        enabled: boolean;
        path?: string;
    }) => Promise<PluginRegistrySnapshot>;
    setAutoReload: (payload: {
        extensionId: string;
        enabled: boolean;
    }) => Promise<PluginRegistrySnapshot>;
    loadEnabled: () => Promise<PluginRegistrySnapshot>;
    load: (payload: {
        extensionId: string;
    }) => Promise<PluginRegistrySnapshot>;
    unload: (payload: {
        extensionId: string;
    }) => Promise<PluginRegistrySnapshot>;
}, "unload" | "load" | "setBridge" | "clearError" | "refreshRegistry" | "refreshInspection" | "refreshAll" | "setEnabled" | "setAutoReload" | "loadEnabled">>;

