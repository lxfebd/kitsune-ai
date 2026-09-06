import type { GatewayMetrics, ObservabilityMetrics } from '..';
import type { ConcurrencyLedger } from '../../services/domain/llm-router/concurrency-ledger';
/**
 * Wire the `kitsune.gen_ai.gateway.pool.inflight` ObservableGauge to the Redis-backed
 *pool concurrency ledger, emitting one series per app_id.
 *
 * Use when:
 * - Assembling DI in `createApp()`, exactly once per process, only when OTel is
 *   enabled.
 *
 * Expects:
 * - `gauge` is the ObservableGauge handle from `initOtel`.
 * - `ledger` is the same concurrency ledger the TTS router acquires slots on.
 * - `metricReadErrors` is the shared self-monitoring counter, labelled by the
 *   originating metric name.
 *
 * Multi-replica note:
 * - Cluster-wide gauge — every replica reads the same Redis counters and reports
 *   the same per-pool value. Dashboards MUST aggregate with `avg()`, NOT `sum()`.
 *   See observability-conventions.md.
 *
 * Concurrency:
 * - Multiple OTel collection cycles can race. The in-flight promise lock keeps at
 *   most one Redis snapshot in flight per process; concurrent callbacks await the
 *   same result rather than stampeding Redis.
 *
 * Failure mode:
 * - On Redis error we increment `kitsune.observability.read_errors{metric}` and
 *   intentionally DO NOT observe — letting the gauge skip an export cycle lets
 *   Prometheus staleness expose the outage instead of masking it with a stale value.
 */
export declare function registerTtsPoolGauge(gauge: GatewayMetrics['poolInflight'], ledger: ConcurrencyLedger, metricReadErrors: ObservabilityMetrics['metricReadErrors']): void;
