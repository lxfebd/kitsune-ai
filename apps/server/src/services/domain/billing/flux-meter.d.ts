import type Redis from 'ioredis';
import type { RevenueMetrics } from '../../../otel';
import type { BillingService } from './billing-service';
interface FluxMeterRuntime {
    /** How many small units equal one Flux. */
    unitsPerFlux: number;
    /** Debt key TTL. Residual debt below unitsPerFlux is forgiven on expiry. */
    debtTtlSeconds: number;
}
interface FluxMeterConfig {
    /** Meter identifier, used as Redis key segment and billing description prefix. */
    name: string;
    /**
     * Resolves runtime pricing/TTL per call. Reads from Redis-backed configKV,
     * so every instance sees config changes immediately. Called lazily so a
     * missing pricing config surfaces as a per-request 503 (handled by the
     * route's configGuard), not as a server-wide startup failure.
     *
     * NOTICE: Do NOT memoise across calls. Multi-instance deploys would then
     * disagree on billing rate during config rollout windows.
     */
    resolveRuntime: () => Promise<FluxMeterRuntime>;
}
interface AccumulateInput {
    userId: string;
    units: number;
    currentBalance: number;
    requestId: string;
    metadata?: Record<string, unknown>;
}
interface AccumulateResult {
    /** Actual flux charged to the user (== amount we are sure was billed). */
    fluxDebited: number;
    /** Residual debt left in Redis after this call. Includes unbilled units restored on partial drain. */
    debtAfter: number;
    /** User's flux balance after this call. */
    balanceAfter: number;
    /**
     * Flux that crossed the meter threshold but couldn't be charged because the
     * user's balance was lower than what the request required. > 0 means the
     * user received service they only partially paid for. Reflects the gap
     * between `requested` and `charged` returned by `billingService.consumeFluxForLLM`.
     */
    unbilledFlux: number;
}
/**
 * Creates a metered Flux consumer for services that charge in small units
 * (TTS chars, STT seconds, embedding tokens). Accumulates usage in Redis and
 * only triggers a Flux debit when accumulated units cross the integer boundary.
 *
 * @see docs/ai-context/flux-meter.md
 */
export declare function createFluxMeter(redis: Redis, billingService: BillingService, config: FluxMeterConfig, metrics?: RevenueMetrics | null): {
    assertCanAfford: (userId: string, newUnits: number, currentBalance: number) => Promise<void>;
    accumulate: (input: AccumulateInput) => Promise<AccumulateResult>;
    peekDebt: (userId: string) => Promise<number>;
    config: FluxMeterConfig;
};
export type FluxMeter = ReturnType<typeof createFluxMeter>;

