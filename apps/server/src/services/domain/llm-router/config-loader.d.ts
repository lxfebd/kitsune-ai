import type { ConfigKVService } from '../../adapters/config-kv';
import type { LlmModel, ModelKind, RouterConfig, TtsModel } from './types';
export interface ConfigLoaderOptions {
    /** ConfigKV service used to read `LLM_ROUTER_CONFIG`. */
    configKV: ConfigKVService;
    /**
     * Cache TTL in milliseconds.
     * @default 5_000
     */
    ttlMs?: number;
    /**
     * Clock injected for tests. Defaults to `Date.now`. We do NOT mock the
     * global Date object — tests pass a stub instead.
     * @default Date.now
     */
    now?: () => number;
}
/**
 * Per-model config slice for a specific kind. Distinguished as a tagged
 * union so callers handle `llm` and `tts` shapes explicitly.
 */
export type ModelConfigSlice = {
    kind: 'llm';
    model: LlmModel;
    defaults: RouterConfig['defaults'];
} | {
    kind: 'tts';
    model: TtsModel;
    defaults: RouterConfig['defaults'];
};
/**
 * Build the in-process config loader for the router.
 *
 * Use when:
 * - The router or admin endpoint needs to resolve `LLM_ROUTER_CONFIG` and
 *   wants a single shared in-memory cache across requests.
 *
 * Expects:
 * - `configKV.getOptional('LLM_ROUTER_CONFIG')` returns either a parsed
 *   config tree or `null` when the entry is missing.
 *
 * Returns:
 * - `getModelConfig(kind, modelName)` — resolves one model slice; throws
 *   `BAD_REQUEST` for unknown models and `CONFIG_NOT_SET` (503) when the
 *   whole config entry is absent.
 * - `invalidate()` — clears the cache. Wired to Pub/Sub in U7 for cross-
 *   instance propagation; admin endpoint calls it on write.
 */
export declare function createConfigLoader(options: ConfigLoaderOptions): {
    getModelConfig: (kind: ModelKind, modelName: string) => Promise<ModelConfigSlice>;
    invalidate: () => void;
};
export type ConfigLoader = ReturnType<typeof createConfigLoader>;
