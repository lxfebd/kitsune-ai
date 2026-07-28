type RedisKeyPart = string | number;
export declare function redisKeyFrom(...parts: RedisKeyPart[]): string;
export declare function configRedisKey(key: string): string;
export declare function userFluxRedisKey(userId: string): string;
export declare function userFluxMeterDebtRedisKey(userId: string, meterName: string): string;
export declare function userChatBroadcastRedisKey(userId: string): string;
export declare function lockRedisKey(domain: string, ...identifiers: RedisKeyPart[]): string;
/**
 * In-flight request counter for one TTSpool (per app_id concurrency pool).
 * `poolId` is the upstream's `adapterParams.appid` (or baseURL fallback). The
 * counter is INCR'd on slot acquire and DECR'd on release; a short TTL bounds
 * leakage if a replica crashes between acquire and release.
 */
export declare function ttsPoolInflightRedisKey(poolId: string): string;
/**
 * Short-TTL saturation flag for one TTSpool. Set when an upstream exhausts with
 * a 429 (app_id concurrency exceeded) so capacity-aware routing skips that pool
 * for a cool-down window instead of repeatedly hammering a known-full pool.
 */
export declare function ttsPoolSaturatedRedisKey(poolId: string): string;
/**
 * Set of everypool id the router has acquired a slot on. The pool watermark
 * gauge reads this set's members, then MGETs each inflight counter — avoids
 * parsing LLM_ROUTER_CONFIG inside the metric callback.
 */
export declare function ttsPoolKnownRedisKey(): string;

