import type Redis from 'ioredis';
import type { Database } from '../../libs/db';
import type { ConfigKVService } from '../adapters/config-kv';
export declare function createFluxService(db: Database, redis: Redis, configKV: ConfigKVService): {
    getFlux(userId: string): Promise<{
        updatedAt: Date;
        userId: string;
        deletedAt: Date | null;
        flux: number;
        stripeCustomerId: string | null;
    } | {
        userId: string;
        flux: number;
    }>;
    updateStripeCustomerId(userId: string, stripeCustomerId: string): Promise<{
        userId: string;
        flux: number;
        stripeCustomerId: string | null;
        updatedAt: Date;
        deletedAt: Date | null;
    }>;
    /**
     * Soft-delete the user's flux balance and drop the cached value from
     * Redis. Does NOT touch `flux_transaction` — that ledger is preserved
     * across user deletion for billing audit (and the table has no
     * `deletedAt` column by design).
     *
     * Idempotent: `WHERE deletedAt IS NULL` skips an already-stamped row,
     * `redis.del` is a no-op when the key is absent.
     */
    deleteAllForUser(userId: string): Promise<void>;
};
export type FluxService = ReturnType<typeof createFluxService>;
