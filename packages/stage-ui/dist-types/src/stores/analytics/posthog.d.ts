import type { AboutBuildInfo } from '../../components/scenarios/about/types';
export declare function isPosthogAvailableInBuild(): boolean;
export declare function ensurePosthogInitialized(enabled: boolean): boolean;
export declare function syncPosthogCapture(enabled: boolean): boolean;
export declare function registerPosthogBuildInfo(buildInfo: AboutBuildInfo): void;
/**
 * Identify the current user on PostHog so server-side `payment_completed` /
 * `subscription_cancelled` events (which use the Better Auth user id as
 * `distinctId`) merge with the same person profile as the browser's
 * anonymous funnel start events. Without this call the funnel is broken
 * end-to-end: server events land on the user-id person, browser events
 * land on the anonymous device person, PostHog cannot join them.
 *
 * Expects:
 * - `userId` is the Better Auth user id (`user.id`) — must match what
 *   `apps/server/src/routes/stripe/index.ts` passes as `distinctId` in
 *   `capturePaymentCompleted`.
 */
export declare function identifyPosthogUser(userId: string): void;
/**
 * Reset PostHog's distinct id on logout so subsequent activity from this
 * device is treated as a new anonymous user (not attributed to the prior
 * logged-in user, which would corrupt cohort analysis if a second user
 * signs in on the same device).
 */
export declare function resetPosthog(): void;
interface PosthogCaptureOptions {
    send_instantly?: boolean;
    transport?: 'XHR' | 'fetch' | 'sendBeacon';
}
/**
 * Single source-of-truth wrapper for emitting events from store-layer code
 * (places that can't pull `useAnalytics()` without creating circular
 * `analytics-store → use-analytics composable → analytics-store` graphs).
 * Returns `false` when capture was skipped so callers can gate dedup flags.
 *
 * Use when:
 * - You're inside a pinia store / Vue watcher that needs to fire a PostHog
 *   event. UI components should still prefer `useAnalytics()` composable
 *   for consistency with existing call sites.
 */
export declare function capturePosthogEvent(name: string, properties: Record<string, unknown>, options?: PosthogCaptureOptions): boolean;

