import type { useLogger } from '@guiiai/logg';
import type Redis from 'ioredis';
import type { GatewayMetrics } from '../../../otel';
import type { LlmRouterService } from './router';
/**
 * Dependencies needed to wire the cross-instance config invalidation
 * subscriber.
 */
export interface ConfigSyncSubscriberOptions {
    /**
     * Primary Redis client. The subscriber takes its own connection via
     * `.duplicate()` because ioredis forbids non-pubsub commands on a
     * connection in subscribe mode.
     */
    redis: Redis;
    /** Router service whose in-memory `LLM_ROUTER_CONFIG` cache we invalidate. */
    llmRouter: LlmRouterService;
    /**
     * OTel gateway metric bundle. `null` when OTel is disabled — emit calls
     * become no-ops.
     */
    gatewayMetrics: GatewayMetrics | null;
    /** Value attached to the `service_instance_id` label on emitted metrics. */
    instanceId: string;
    /** Logger handle. Caller supplies a scoped logger so namespacing is theirs. */
    logger: ReturnType<typeof useLogger>;
}
/**
 * Per-call shape returned to the caller. Kept narrow so the caller can hold
 * the subscriber handle for graceful shutdown or tests without leaking the
 * internal emit closure.
 */
export interface ConfigSyncSubscriber {
    /** Underlying ioredis subscriber connection. */
    subscriber: Redis;
}
/**
 * Wires the cross-instance `configkv:invalidate` subscriber to the router's
 * cache and OTel gateway metrics.
 *
 * Use when:
 * - Booting a server replica that has a live `LlmRouterService` and needs
 *   to react to peer-instance config writes within the Pub/Sub propagation
 *   window (R16 / KTD-4, ≤5s under healthy Redis).
 *
 * Expects:
 * - `redis` is the application's primary client. We `.duplicate()` it here
 *   because ioredis forbids non-pubsub commands on a subscribed connection.
 * - `llmRouter` is already constructed. The caller owns its lifecycle.
 *
 * Returns:
 * - `subscriber` — the dedicated ioredis subscriber connection, so the
 *   caller can `await subscriber.quit()` during graceful shutdown.
 *
 * Emits the following `kitsune.gen_ai.gateway.*` metrics:
 * - `config_reload` (source = `pubsub`) once per accepted invalidation msg
 * - `subscriber_state` with `state` = `connected` / `error` / `reconnecting`
 *
 * The router's in-memory cache reloads on either a pub/sub message OR the
 * `configCacheTtlMs` fallback (default 5s); a silently-disconnected
 * subscriber means the instance drifts inside that window. `subscriber_state`
 * is the only direct signal for that drift.
 */
export declare function createConfigSyncSubscriber(opts: ConfigSyncSubscriberOptions): ConfigSyncSubscriber;
