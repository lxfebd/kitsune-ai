export interface UseElectronMouseAroundWindowBorderOptions {
    /** Pixel distance from the window edge to consider as "near". */
    threshold?: number;
    /** Allow a small overshoot outside the window and still count as near. Defaults to threshold. */
    overshoot?: number;
}
/**
 * Detect when the cursor is near the window border using window-relative mouse coords.
 * Fast path: no extra listeners; reuses existing mouse and window bounds streams.
 */
export declare function useElectronMouseAroundWindowBorder(options?: UseElectronMouseAroundWindowBorderOptions): {
    x: import("vue").ComputedRef<number>;
    y: import("vue").ComputedRef<number>;
    width: import("vue").Ref<number, number>;
    height: import("vue").Ref<number, number>;
    nearLeft: import("vue").ComputedRef<boolean>;
    nearRight: import("vue").ComputedRef<boolean>;
    nearTop: import("vue").ComputedRef<boolean>;
    nearBottom: import("vue").ComputedRef<boolean>;
    nearTopLeft: import("vue").ComputedRef<boolean>;
    nearTopRight: import("vue").ComputedRef<boolean>;
    nearBottomLeft: import("vue").ComputedRef<boolean>;
    nearBottomRight: import("vue").ComputedRef<boolean>;
    isNearAnyBorder: import("vue").ComputedRef<boolean>;
};
export type UseElectronMouseAroundWindowBorderReturn = ReturnType<typeof useElectronMouseAroundWindowBorder>;
