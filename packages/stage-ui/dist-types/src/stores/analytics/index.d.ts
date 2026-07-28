import type { AboutBuildInfo } from '../../components/scenarios/about/types';
export * from './posthog';
export * from './privacy-policy';
export declare const useSharedAnalyticsStore: import("pinia").StoreDefinition<"analytics-shared", Pick<{
    buildInfo: import("vue").Ref<{
        branch?: string | undefined;
        commit?: string | undefined;
        builtOn?: string | undefined;
        version?: string | undefined;
    }, AboutBuildInfo | {
        branch?: string | undefined;
        commit?: string | undefined;
        builtOn?: string | undefined;
        version?: string | undefined;
    }>;
    appStartTime: import("vue").Ref<number | null, number | null>;
    firstMessageTracked: import("vue").Ref<boolean, boolean>;
    initialize: () => void;
    markFirstMessageTracked: () => void;
}, "buildInfo" | "appStartTime" | "firstMessageTracked">, Pick<{
    buildInfo: import("vue").Ref<{
        branch?: string | undefined;
        commit?: string | undefined;
        builtOn?: string | undefined;
        version?: string | undefined;
    }, AboutBuildInfo | {
        branch?: string | undefined;
        commit?: string | undefined;
        builtOn?: string | undefined;
        version?: string | undefined;
    }>;
    appStartTime: import("vue").Ref<number | null, number | null>;
    firstMessageTracked: import("vue").Ref<boolean, boolean>;
    initialize: () => void;
    markFirstMessageTracked: () => void;
}, never>, Pick<{
    buildInfo: import("vue").Ref<{
        branch?: string | undefined;
        commit?: string | undefined;
        builtOn?: string | undefined;
        version?: string | undefined;
    }, AboutBuildInfo | {
        branch?: string | undefined;
        commit?: string | undefined;
        builtOn?: string | undefined;
        version?: string | undefined;
    }>;
    appStartTime: import("vue").Ref<number | null, number | null>;
    firstMessageTracked: import("vue").Ref<boolean, boolean>;
    initialize: () => void;
    markFirstMessageTracked: () => void;
}, "initialize" | "markFirstMessageTracked">>;
