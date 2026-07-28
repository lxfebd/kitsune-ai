type PerfTracerMode = 'forward' | 'receive';
type PerfTracerState = 'idle' | PerfTracerMode;
export declare const usePerfTracerBridgeStore: import("pinia").StoreDefinition<"perfTracerBridge", Pick<{
    requestEnable: (token?: string, mode?: PerfTracerMode, localState?: PerfTracerState) => void;
    requestDisable: (token?: string) => void;
    enableLocal: (token?: string) => void;
    disableLocal: () => void;
    startForwarding: () => void;
    stopForwarding: () => void;
}, never>, Pick<{
    requestEnable: (token?: string, mode?: PerfTracerMode, localState?: PerfTracerState) => void;
    requestDisable: (token?: string) => void;
    enableLocal: (token?: string) => void;
    disableLocal: () => void;
    startForwarding: () => void;
    stopForwarding: () => void;
}, never>, Pick<{
    requestEnable: (token?: string, mode?: PerfTracerMode, localState?: PerfTracerState) => void;
    requestDisable: (token?: string) => void;
    enableLocal: (token?: string) => void;
    disableLocal: () => void;
    startForwarding: () => void;
    stopForwarding: () => void;
}, "requestEnable" | "requestDisable" | "enableLocal" | "disableLocal" | "startForwarding" | "stopForwarding">>;

