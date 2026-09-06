import type Redis from 'ioredis';
/**
 * Tracks per-pool in-flight concurrency in Redis so the TTS router can spread
 * load across multiple app_ids without overshooting any one app_id's cap.
 *
 * Use when:
 * - Building the LLM/TTS router service (`createLlmRouterService`), which
 *   acquires a slot before dispatching to a capacity-capped upstream and
 *   releases it once the attempt finishes.
 *
 * Expects:
 * - `redis` is the shared cluster Redis (the same instance the flux meter and
 *   config cache use). Counts are cluster-wide, not per-process.
 *
 * Returns:
 * - An acquire/release/saturation API. `tryAcquire` is the only capacity
 *   decision; everything else is bookkeeping the router and the watermark
 *   gauge read.
 */
export declare function createConcurrencyLedger(redis: Redis, options?: {
    /**
     * TTL (seconds) on the in-flight counter. Bounds leakage when a replica
     * crashes between acquire and release. Should comfortably exceed the longest
     * single TTS attempt so a live request is never evicted mid-flight.
     * @default 60
     */
    inflightTtlSeconds?: number;
}): {
    tryAcquire: (poolId: string, maxConcurrency: number) => Promise<boolean>;
    release: (poolId: string) => Promise<void>;
    markSaturated: (poolId: string, ttlSeconds: number) => Promise<void>;
    isSaturated: (poolId: string) => Promise<boolean>;
    currentInflight: (poolId: string) => Promise<number>;
    snapshot: () => Promise<Array<{
        poolId: string;
        inflight: number;
    }>>;
};
export type ConcurrencyLedger = ReturnType<typeof createConcurrencyLedger>;
