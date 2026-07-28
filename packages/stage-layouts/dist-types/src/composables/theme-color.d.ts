import type { Ref } from 'vue';
import type { BackgroundProvider } from '../components/Backgrounds';
import type { BackgroundItem } from '../stores/background';
export declare function themeColorFromPropertyOf(colorFromClass: string, property: string): () => Promise<string>;
export declare function themeColorFromValue(value: string | {
    light: string;
    dark: string;
}): () => Promise<string>;
export declare function useThemeColor(colorFrom: () => string | Promise<string>): {
    updateThemeColor: () => Promise<void>;
};
export declare function useBackgroundThemeColor({ backgroundSurface, selectedOption, sampledColor, }: {
    backgroundSurface: Ref<InstanceType<typeof BackgroundProvider> | undefined | null>;
    selectedOption: Ref<BackgroundItem | undefined>;
    sampledColor: Ref<string>;
}): {
    sampledColor: Ref<string, string>;
    sampleBackgroundColor: () => Promise<void>;
    syncBackgroundTheme: () => Promise<void>;
};
