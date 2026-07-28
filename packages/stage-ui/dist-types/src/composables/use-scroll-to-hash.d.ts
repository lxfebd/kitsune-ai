import type { Ref } from 'vue';
export interface UseScrollToHashOptions {
    /**
     * Distance (in px) between the target element and the top of the viewport.
     */
    offset?: number;
    /**
     * Smooth scroll animation.
     */
    behavior?: ScrollBehavior;
    /**
     * Number of times to retry if element is not yet found.
     */
    maxRetries?: number;
    /**
     * Delay (ms) between retries.
     */
    retryDelay?: number;
    /**
     * Custom scroll container — defaults to `window`.
     */
    scrollContainer?: HTMLElement | string | null;
    /**
     * Whether to auto-scroll when `hashRef` changes.
     */
    auto?: boolean;
}
/**
 * A cross-platform composable for smooth scrolling to hash anchors.
 *
 * You can use it with or without Vue Router.
 *
 * Example:
 * ```ts
 * const { scrollToHash } = useScrollToHash({ offset: 16 })
 * scrollToHash('#chat')
 * ```
 *
 * Or:
 * ```ts
 * const route = useRoute()
 * useScrollToHash(() => route.hash, { auto: true })
 * ```
 *
 * Notes:
 * - Automatically retries if the target element isn’t found yet.
 * - Automatically cancels previous retry loops when a new scroll starts.
 * - `onMounted` is not needed since `{ immediate: true }` on the watcher handles the initial scroll.
 */
export declare function useScrollToHash(hashRef?: Ref<string | undefined> | (() => string | undefined), options?: UseScrollToHashOptions): {
    scrollToHash: (hash?: string, attempt?: number) => void;
};
