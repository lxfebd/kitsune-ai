import type Redis from 'ioredis';
import type { GatewayMetrics } from '../../../otel';
import type { EnvelopeCrypto } from '../../../utils/envelope-crypto';
import type { ConfigKVService } from '../../adapters/config-kv';
import type { TtsInput } from '../../adapters/tts/types';
import type { ConcurrencyLedger } from './concurrency-ledger';
import type { LlmRouteContext, LlmRouteRequest } from './types';
export interface CreateLlmRouterServiceOptions {
    /** ConfigKV used to read `LLM_ROUTER_CONFIG`. */
    configKV: ConfigKVService;
    /** Envelope crypto used to decrypt at-rest keys. */
    envelopeCrypto: EnvelopeCrypto;
    /** OTel gateway metric bundle. `null` when OTel is disabled. */
    gatewayMetrics: GatewayMetrics | null;
    /**
     * Redis client used as the TTS voice catalog cache. Live catalogs (Azure)
     * are stable but heavy; caching avoids hammering Microsoft on every voice
     * picker open while keeping freshness within {@link TTS_VOICES_CACHE_TTL_S}.
     */
    redis: Redis;
    /**
     * Per-pool concurrency ledger backing capacity-aware TTS routing. When a TTS
     * model has any upstream with `maxConcurrency` set, the router acquires a slot
     * here before dispatching and releases it after, spreading load across app_ids
     * instead of hammering the first upstream.
     */
    concurrencyLedger: ConcurrencyLedger;
    /**
     * Cool-down (seconds) a pool is skipped after exhausting with a 429 (app_id
     * concurrency exceeded upstream-side). Separate from the ledger's in-flight
     * TTL: this is a reactive circuit-breaker window, not a leak bound.
     * @default 15
     */
    ttsPoolSaturationTtlSeconds?: number;
    /**
     * Fetch implementation. Defaults to `globalThis.fetch`. Tests inject a
     * `vi.fn` so we never touch the real network.
     * @default globalThis.fetch
     */
    fetchImpl?: typeof fetch;
    /**
     * Config cache TTL in milliseconds.
     * @default 5_000
     */
    configCacheTtlMs?: number;
    /**
     * TTL for the Redis voice catalog cache in seconds.
     * @default 21_600 (6h)
     */
    ttsVoiceCacheTtlSeconds?: number;
}
/**
 * Build the in-process LLM router service.
 *
 * Use when:
 * - The chat-completions route (U4) needs to dispatch a request to an
 *   upstream with per-key multi-upstream fallback.
 *
 * Expects:
 * - `configKV` already has `LLM_ROUTER_CONFIG` populated (otherwise
 *   `route()` throws CONFIG_NOT_SET).
 * - `envelopeCrypto` was built from the same master key that produced the
 *   stored ciphertexts.
 *
 * Returns:
 * - `route(req)` — picks an upstream + key, fetches the upstream, walks
 *   fallback on non-2xx until one succeeds or every (upstream, key) has
 *   been tried. Returns a `Response` on the first 2xx; throws `ApiError`
 *   per KTD-1 mapping on full exhaustion.
 *
 * The router does NOT open its own OTel span — the route handler in U4
 * owns the span. The router only enriches the *active* span with
 * `kitsune.gen_ai.gateway.*` attrs.
 */
export declare function createLlmRouterService(options: CreateLlmRouterServiceOptions): {
    route: (req: LlmRouteRequest, ctx?: LlmRouteContext) => Promise<Response>;
    routeTts: (req: {
        modelName: string;
        input: TtsInput;
        abortSignal?: AbortSignal;
    }, ctx?: LlmRouteContext) => Promise<Response>;
    listTtsVoices: (modelName: string) => Promise<any[]>;
    /**
     * Expose the loader's invalidate hook so U7's Pub/Sub subscriber and
     * the admin endpoint (U9) can flush the cache without a separate
     * service wrapper.
     */
    invalidateConfig: () => void;
    /**
     * Flush the Redis voice catalog cache. The config-sync subscriber calls
     * this when LLM_ROUTER_CONFIG or UNSPEECH_UPSTREAM is rotated; admin
     * writes invalidate it directly so the next voice-picker fetch repopulates.
     */
    invalidateTtsVoicesCache: () => Promise<void>;
};
export type LlmRouterService = ReturnType<typeof createLlmRouterService>;
