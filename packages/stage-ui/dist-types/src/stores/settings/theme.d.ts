export declare const DEFAULT_THEME_COLORS_HUE = 220.44;
export declare const useSettingsTheme: import("pinia").StoreDefinition<"settings-theme", Pick<{
    themeColorsHue: import("@vueuse/shared").ManualResetRefReturn<number>;
    themeColorsHueDynamic: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    setThemeColorsHue: (hue?: number) => void;
    applyPrimaryColorFrom: (color?: string) => void;
    isColorSelectedForPrimary: (hexColor?: string) => boolean;
    resetState: () => void;
}, "themeColorsHue" | "themeColorsHueDynamic">, Pick<{
    themeColorsHue: import("@vueuse/shared").ManualResetRefReturn<number>;
    themeColorsHueDynamic: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    setThemeColorsHue: (hue?: number) => void;
    applyPrimaryColorFrom: (color?: string) => void;
    isColorSelectedForPrimary: (hexColor?: string) => boolean;
    resetState: () => void;
}, never>, Pick<{
    themeColorsHue: import("@vueuse/shared").ManualResetRefReturn<number>;
    themeColorsHueDynamic: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    setThemeColorsHue: (hue?: number) => void;
    applyPrimaryColorFrom: (color?: string) => void;
    isColorSelectedForPrimary: (hexColor?: string) => boolean;
    resetState: () => void;
}, "resetState" | "setThemeColorsHue" | "applyPrimaryColorFrom" | "isColorSelectedForPrimary">>;
