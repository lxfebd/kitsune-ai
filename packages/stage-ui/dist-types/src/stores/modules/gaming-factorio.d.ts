export declare const useFactorioStore: import("pinia").StoreDefinition<string, Pick<{
    enabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    serverAddress: import("@vueuse/shared").ManualResetRefReturn<string>;
    serverPort: import("@vueuse/shared").ManualResetRefReturn<number | null>;
    username: import("@vueuse/shared").ManualResetRefReturn<string>;
    configured: import("vue").ComputedRef<boolean>;
    saveSettings: () => void;
    resetState: () => void;
}, "username" | "enabled" | "serverAddress" | "serverPort">, Pick<{
    enabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    serverAddress: import("@vueuse/shared").ManualResetRefReturn<string>;
    serverPort: import("@vueuse/shared").ManualResetRefReturn<number | null>;
    username: import("@vueuse/shared").ManualResetRefReturn<string>;
    configured: import("vue").ComputedRef<boolean>;
    saveSettings: () => void;
    resetState: () => void;
}, "configured">, Pick<{
    enabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    serverAddress: import("@vueuse/shared").ManualResetRefReturn<string>;
    serverPort: import("@vueuse/shared").ManualResetRefReturn<number | null>;
    username: import("@vueuse/shared").ManualResetRefReturn<string>;
    configured: import("vue").ComputedRef<boolean>;
    saveSettings: () => void;
    resetState: () => void;
}, "resetState" | "saveSettings">>;
