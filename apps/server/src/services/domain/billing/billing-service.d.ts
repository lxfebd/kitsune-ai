import type Redis from 'ioredis';
import type { Database } from '../../../libs/db';
import type { RevenueMetrics } from '../../../otel';
import type { ConfigKVService } from '../../adapters/config-kv';
export declare function createBillingService(db: Database, redis: Redis, _configKV: ConfigKVService, metrics?: RevenueMetrics | null): {
    /**
     * Debit flux for an LLM API request (chat, TTS).
     * Token usage is persisted in the `flux_transaction.metadata` column so
     * the existing transaction-history UI can render per-request token counts.
     */
    consumeFluxForLLM(input: {
        userId: string;
        amount: number;
        requestId?: string;
        description?: string;
        model?: string;
        promptTokens?: number;
        completionTokens?: number;
    }): Promise<{
        userId: string;
        flux: number;
        charged: number;
        requested: number;
    }>;
    /**
     * Credit flux to a user's balance within a DB transaction.
     * Generic credit method for non-Stripe flows (e.g. admin grants).
     *
     * Idempotency:
     * When `requestId` is provided, the call is idempotent across crash /
     * retry boundaries. If a `flux_transaction` row with the same
     * `(user_id, request_id)` already exists, this method returns that
     * existing row's balance + id without re-crediting the user, without
     * touching `user_flux`, and without re-emitting the Redis cache write.
     *
     * This guards against the worker crash window where:
     * 1. `creditFlux` commits the credit
     * 2. caller crashes before marking its own state (e.g. recipient row) granted
     * 3. on restart, caller sees pending state and calls `creditFlux` again with same requestId
     *
     * Without idempotency, step 3 would hit the `(user_id, request_id)`
     * unique index and throw — causing the caller to mark the work failed
     * even though the user was already credited.
     */
    creditFlux(input: {
        userId: string;
        amount: number;
        requestId?: string;
        description: string;
        source: string;
        /**
         * Ledger row `type`. Defaults to `'credit'` for backward compatibility
         * with existing callers (Stripe top-up). Admin promo grants pass
         * `'promo'` so reports / dashboards can distinguish them.
         */
        type?: "credit" | "promo";
        auditMetadata?: Record<string, unknown>;
    }): Promise<{
        balanceBefore: number;
        balanceAfter: number;
        fluxTransactionId: string;
        idempotent: boolean;
    }>;
    /**
     * Set a user's flux balance to an absolute value within a DB transaction.
     *
     * Use when:
     * - An admin overrides a balance directly (e.g. zeroing it out for
     *   testing). Unlike credit/debit this is not request-driven and carries
     *   no idempotency key — every call rewrites the balance to `balance` and
     *   appends one `admin_set` ledger row recording the before/after.
     *
     * Expects:
     * - `balance` is a non-negative integer. The route layer validates this.
     *
     * Returns:
     * - The balance before and after, plus the appended ledger row id. The
     *   ledger `amount` is the absolute delta magnitude; direction lives in
     *   `metadata.direction` since a set can move the balance either way.
     */
    setFlux(input: {
        userId: string;
        balance: number;
        description: string;
        issuedByUserId: string;
    }): Promise<{
        balanceBefore: number;
        balanceAfter: number;
        fluxTransactionId: string;
    }>;
    /**
     * Credit flux from a Stripe checkout session (one-time payment).
     * Idempotent: claims the checkout session row by flipping `fluxCredited`
     * from false to true; replays of the same Stripe event observe the row
     * already claimed and apply nothing.
     */
    creditFluxFromStripeCheckout(input: {
        stripeEventId: string;
        userId: string;
        stripeSessionId: string;
        amountTotal: number;
        currency: string | null;
        fluxAmount: number;
    }): Promise<{
        applied: boolean;
        balanceAfter?: number;
    }>;
    /**
     * Credit flux from a Stripe invoice payment (subscription).
     * Idempotent: claims the invoice row by flipping `fluxCredited`
     * from false to true; replays observe it already claimed and apply nothing.
     */
    creditFluxFromInvoice(input: {
        stripeEventId: string;
        userId: string;
        stripeInvoiceId: string;
        amountPaid: number;
        currency: string;
        fluxAmount: number;
    }): Promise<{
        applied: boolean;
        balanceAfter?: number;
    }>;
};
export type BillingService = ReturnType<typeof createBillingService>;
