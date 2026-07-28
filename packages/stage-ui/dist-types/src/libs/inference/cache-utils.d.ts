/**
 * Model cache utilities.
 *
 * `@huggingface/transformers` and `kokoro-js` cache downloaded model
 * files via the browser Cache API automatically. This module provides
 * query and management functions for that cache, intended for settings
 * UI ("Cached 512 MB", "Clear model cache" button).
 */
/**
 * Get the total size of cached model files in bytes.
 * Returns 0 if the Cache API is unavailable or the cache is empty.
 */
export declare function getModelCacheSize(): Promise<number>;
/**
 * Clear all cached model files.
 */
export declare function clearModelCache(): Promise<void>;
/**
 * Check whether a specific model has cached files.
 * Matches by looking for cache entries whose URL contains the model ID.
 */
export declare function isModelCached(modelId: string): Promise<boolean>;
/**
 * Format bytes into a human-readable string (e.g. "512 MB").
 */
export declare function formatBytes(bytes: number): string;
