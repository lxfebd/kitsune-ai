import type { MiddlewareHandler } from 'hono';
import type { ConfigKVService } from '../services/adapters/config-kv';
import type { HonoEnv } from '../types/hono';
/**
 * Middleware factory that checks required config keys exist in Redis.
 * Returns 503 if any key is missing.
 */
export declare function configGuard(configKV: ConfigKVService, keys: Parameters<ConfigKVService['getOrThrow']>[0][], message?: string): MiddlewareHandler<HonoEnv>;
