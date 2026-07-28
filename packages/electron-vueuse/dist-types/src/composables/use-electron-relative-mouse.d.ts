import type { UseMouseOptions } from '@vueuse/core';
export declare function useElectronRelativeMouse(options?: UseMouseOptions): {
    x: import("vue").ComputedRef<number>;
    y: import("vue").ComputedRef<number>;
    sourceType: import("vue").ShallowRef<import("@vueuse/core").UseMouseSourceType>;
};
