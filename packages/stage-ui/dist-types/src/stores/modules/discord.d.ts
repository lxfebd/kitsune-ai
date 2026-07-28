export declare const useDiscordStore: import("pinia").StoreDefinition<"discord", Pick<{
    enabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    token: import("@vueuse/shared").ManualResetRefReturn<string>;
    configured: import("vue").ComputedRef<boolean>;
    saveSettings: () => void;
    resetState: () => void;
}, "token" | "enabled">, Pick<{
    enabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    token: import("@vueuse/shared").ManualResetRefReturn<string>;
    configured: import("vue").ComputedRef<boolean>;
    saveSettings: () => void;
    resetState: () => void;
}, "configured">, Pick<{
    enabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    token: import("@vueuse/shared").ManualResetRefReturn<string>;
    configured: import("vue").ComputedRef<boolean>;
    saveSettings: () => void;
    resetState: () => void;
}, "resetState" | "saveSettings">>;
