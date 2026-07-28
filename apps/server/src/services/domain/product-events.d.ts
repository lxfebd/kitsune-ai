import type { Database } from '../../libs/db';
import type { ProductMetrics } from '../../otel';
import type { ProductEventMetadata } from '../../schemas/product-events';
export type ProductFeature = 'auth' | 'chat' | 'gen_ai_chat' | 'tts' | 'billing' | 'voice_pack';
export type ProductEventStatus = 'started' | 'succeeded' | 'failed' | 'blocked';
export type ProductAction = 'user_signed_up' | 'session_started' | 'message_pushed' | 'completion_requested' | 'completion_succeeded' | 'completion_failed' | 'speech_requested' | 'speech_succeeded' | 'speech_failed' | 'speech_blocked' | 'voice_pack_created' | 'voice_pack_updated' | 'voice_pack_disabled' | 'checkout_started' | 'payment_completed';
/**
 * Product event fact written to Kitsune's own Postgres analytics table.
 */
export interface ProductEventInput {
    /** Better Auth user id. Kept in Postgres only; never emitted as a Prometheus label. */
    userId: string;
    /** Bounded product area used for product dashboards and funnels. */
    feature: ProductFeature;
    /** Bounded user/business action within the feature. */
    action: ProductAction;
    /** Lifecycle state for the action. */
    status: ProductEventStatus;
    /** Optional bounded route/surface label such as `openai.chat.completions`. */
    source?: string;
    /** Optional model alias for DB-side drilldown. Do not expose as a Prometheus label. */
    model?: string;
    /** Optional provider name for DB-side drilldown. */
    provider?: string;
    /** Optional bounded failure reason or business outcome. */
    reason?: string;
    /** Optional primitive metadata for product analysis. Avoid PII and raw prompts. */
    metadata?: ProductEventMetadata;
    /** Override for tests/backfills. Defaults to database/server current time. */
    createdAt?: Date;
}
export interface ProductEventAggregateInput {
    /** Inclusive lower time bound. */
    from: Date;
    /** Exclusive upper time bound. Omit for open-ended queries. */
    to?: Date;
}
export interface ProductEventAggregateRow {
    feature: string;
    action: string;
    status: string;
    eventCount: number;
    distinctUsers: number;
}
/**
 * Creates Kitsune's first-party product analytics event writer.
 *
 * Use when:
 * - Server-side product behavior has a user id and should be queryable by
 *   distinct users, funnels, or retention windows.
 * - Grafana needs low-cardinality event volume while Postgres keeps user-level
 *   detail.
 *
 * Expects:
 * - Callers pass only bounded `feature` / `action` / `status` values.
 * - PII, prompts, request ids, sessions, and user ids are not written into
 *   Prometheus labels. User id is stored only in the DB row.
 *
 * Returns:
 * - Best-effort event writer plus a DB aggregation helper for analytics jobs.
 */
export declare function createProductEventService(db: Database, metrics?: ProductMetrics | null): {
    track(input: ProductEventInput): Promise<void>;
    countDistinctUsersByFeature(input: ProductEventAggregateInput): Promise<ProductEventAggregateRow[]>;
};
export type ProductEventService = ReturnType<typeof createProductEventService>;
