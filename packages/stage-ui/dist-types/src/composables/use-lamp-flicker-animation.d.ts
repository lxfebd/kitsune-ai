import type { MaybeRefOrGetter } from 'vue';
import { lampFlickerAnimationClass } from '@kitsune/ui';
export { lampFlickerAnimationClass };
/**
 * Drives randomized keyframe timing for `.lamp-flicker-animation` from `@kitsune/ui/main.css` while `flickerActive` is true.
 * Import `@kitsune/ui/main.css` from the app global stylesheet (e.g. `styles/main.css`). When inactive, delay resets to 0s.
 */
export declare function useLampFlickerAnimation(flickerActive: MaybeRefOrGetter<boolean>): {
    flickerStyle: import("vue").ComputedRef<Record<string, string> | undefined>;
    onAnimationIteration: () => void;
};
