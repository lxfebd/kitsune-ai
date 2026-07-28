/**
 * Forwards `speechIntent*` lifecycle events from the cross-window speech
 * bus into PostHog `tts_intent_started/ended/cancelled`.
 *
 * Use when:
 * - Each app shell boots. Mount exactly once per window — the bus is a
 *   module singleton, so duplicate mounts double-count.
 *
 * Expects:
 * - Called inside a Vue effect scope so `onScopeDispose` can clean up.
 *
 * Per-token events (`literal` / `special` / `flush`) are deliberately
 * skipped: hot path, no analytical value, would torch PostHog quota.
 */
export declare function useSpeechPipelineAnalytics(): void;
