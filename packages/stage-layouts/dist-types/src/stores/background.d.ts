import type { BackgroundOption } from '@kitsune/stage-ui/components';
import type { Ref } from 'vue';
export declare enum BackgroundKind {
    Wave = "wave",
    Image = "image",
    Transparent = "transparent"
}
export interface BackgroundItem extends BackgroundOption {
    kind: BackgroundKind;
    importedAt?: number;
}
export declare const useBackgroundStore: import("pinia").StoreDefinition<"background", Pick<{
    options: import("vue").ComputedRef<BackgroundItem[]>;
    selectedId: import("vue").WritableComputedRef<string, string>;
    selectedOption: import("vue").ComputedRef<BackgroundItem>;
    sampledColor: import("@vueuse/shared").RemovableRef<string>;
    loading: Ref<boolean, boolean>;
    loadFromIndexedDb: () => Promise<void>;
    addOption: (option: BackgroundItem) => Promise<BackgroundItem>;
    removeOption: (optionId: string) => Promise<void>;
    setSelection: (option: BackgroundItem, color?: string) => void;
    applyPickerSelection: (payload: {
        option: BackgroundOption;
        color?: string;
    }) => Promise<BackgroundItem>;
    setSampledColor: (color?: string) => void;
}, "loading" | "sampledColor">, Pick<{
    options: import("vue").ComputedRef<BackgroundItem[]>;
    selectedId: import("vue").WritableComputedRef<string, string>;
    selectedOption: import("vue").ComputedRef<BackgroundItem>;
    sampledColor: import("@vueuse/shared").RemovableRef<string>;
    loading: Ref<boolean, boolean>;
    loadFromIndexedDb: () => Promise<void>;
    addOption: (option: BackgroundItem) => Promise<BackgroundItem>;
    removeOption: (optionId: string) => Promise<void>;
    setSelection: (option: BackgroundItem, color?: string) => void;
    applyPickerSelection: (payload: {
        option: BackgroundOption;
        color?: string;
    }) => Promise<BackgroundItem>;
    setSampledColor: (color?: string) => void;
}, "options" | "selectedId" | "selectedOption">, Pick<{
    options: import("vue").ComputedRef<BackgroundItem[]>;
    selectedId: import("vue").WritableComputedRef<string, string>;
    selectedOption: import("vue").ComputedRef<BackgroundItem>;
    sampledColor: import("@vueuse/shared").RemovableRef<string>;
    loading: Ref<boolean, boolean>;
    loadFromIndexedDb: () => Promise<void>;
    addOption: (option: BackgroundItem) => Promise<BackgroundItem>;
    removeOption: (optionId: string) => Promise<void>;
    setSelection: (option: BackgroundItem, color?: string) => void;
    applyPickerSelection: (payload: {
        option: BackgroundOption;
        color?: string;
    }) => Promise<BackgroundItem>;
    setSampledColor: (color?: string) => void;
}, "loadFromIndexedDb" | "addOption" | "removeOption" | "setSelection" | "applyPickerSelection" | "setSampledColor">>;
