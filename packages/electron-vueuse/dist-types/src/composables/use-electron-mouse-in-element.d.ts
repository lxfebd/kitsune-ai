import type { MaybeElementRef, MouseInElementOptions } from '@vueuse/core';
/**
 * Reactive mouse position related to an element.
 *
 * @see https://vueuse.org/useMouseInElement
 * @param target
 * @param options
 */
export declare function useElectronMouseInElement(target?: MaybeElementRef, options?: MouseInElementOptions): {
    x: import("vue").ComputedRef<number>;
    y: import("vue").ComputedRef<number>;
    sourceType: import("vue").ShallowRef<import("@vueuse/core").UseMouseSourceType>;
    elementX: import("vue").ShallowRef<number, number>;
    elementY: import("vue").ShallowRef<number, number>;
    elementPositionX: import("vue").ShallowRef<number, number>;
    elementPositionY: import("vue").ShallowRef<number, number>;
    elementHeight: import("vue").ShallowRef<number, number>;
    elementWidth: import("vue").ShallowRef<number, number>;
    isOutside: import("vue").ShallowRef<boolean, boolean>;
    stop: () => void;
};
export type UseMouseInElementReturn = ReturnType<typeof useElectronMouseInElement>;
