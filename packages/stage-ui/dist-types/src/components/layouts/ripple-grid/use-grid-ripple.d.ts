import type { MaybeRefOrGetter } from 'vue';
export interface UseGridRippleOptions {
    cols: MaybeRefOrGetter<number>;
    originIndex: MaybeRefOrGetter<number>;
    sectionItemCounts: MaybeRefOrGetter<number[]>;
    delayPerUnit?: number;
}
export declare function useGridRipple(options: UseGridRippleOptions): {
    getDelay: (index: number) => number;
};
