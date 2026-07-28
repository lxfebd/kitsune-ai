export declare const useTwitterStore: import("pinia").StoreDefinition<"twitter", Pick<{
    enabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    apiKey: import("@vueuse/shared").ManualResetRefReturn<string>;
    apiSecret: import("@vueuse/shared").ManualResetRefReturn<string>;
    accessToken: import("@vueuse/shared").ManualResetRefReturn<string>;
    accessTokenSecret: import("@vueuse/shared").ManualResetRefReturn<string>;
    configured: import("vue").ComputedRef<boolean>;
    saveSettings: () => void;
    resetState: () => void;
}, "accessToken" | "apiKey" | "enabled" | "apiSecret" | "accessTokenSecret">, Pick<{
    enabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    apiKey: import("@vueuse/shared").ManualResetRefReturn<string>;
    apiSecret: import("@vueuse/shared").ManualResetRefReturn<string>;
    accessToken: import("@vueuse/shared").ManualResetRefReturn<string>;
    accessTokenSecret: import("@vueuse/shared").ManualResetRefReturn<string>;
    configured: import("vue").ComputedRef<boolean>;
    saveSettings: () => void;
    resetState: () => void;
}, "configured">, Pick<{
    enabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    apiKey: import("@vueuse/shared").ManualResetRefReturn<string>;
    apiSecret: import("@vueuse/shared").ManualResetRefReturn<string>;
    accessToken: import("@vueuse/shared").ManualResetRefReturn<string>;
    accessTokenSecret: import("@vueuse/shared").ManualResetRefReturn<string>;
    configured: import("vue").ComputedRef<boolean>;
    saveSettings: () => void;
    resetState: () => void;
}, "resetState" | "saveSettings">>;
