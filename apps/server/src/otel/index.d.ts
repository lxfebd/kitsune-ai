import type { Counter, Histogram, ObservableGauge } from '@opentelemetry/api';
import type { Env } from '../libs/env';
export interface AuthMetrics {
    attempts: Counter;
    failures: Counter;
    userRegistered: Counter;
    userLogin: Counter;
    /**
     * Pull-based gauge for total registered users.
     *
     * Use when:
     * - Reporting current account-base size. Pair with
     *   {@link AuthMetrics.userRegistered} for signup deltas over a time window.
     *
     * Expects:
     * - Backed by `SELECT COUNT(*) FROM "user"`. Same cluster-wide truth as the
     *   other DB-backed gauges; dashboards MUST aggregate with `max()`/`avg()`,
     *   not `sum()`.
     */
    totalUsers: ObservableGauge;
    /**
     * Cluster-wide active session count, sourced from Postgres (Better Auth
     * `session` table where `expires_at > NOW()`).
     *
     * Why ObservableGauge instead of UpDownCounter:
     * - UpDownCounter drifts: TTL expiration never fires a -1, and multi-
     *   replica deploys split +1 / -1 across instances (signin on A, signout
     *   on B). The previous implementation went unboundedly positive.
     * - Reading from the source-of-truth DB at scrape time makes the metric
     *   self-correcting.
     *
     * Multi-replica note:
     * - Every replica reads the same DB and reports the same value, so the
     *   dashboard MUST aggregate with `max()` (or `avg()`), NOT `sum()`.
     *   Using sum() would multiply the real count by the replica count.
     * - See `apps/server/docs/ai-context/observability-conventions.md`,
     *   "Multi-Replica Considerations".
     */
    activeSessions: ObservableGauge;
    /**
     * Pull-based gauge for distinct users with ≥1 non-expired session.
     *
     * Use when:
     * - Querying real "active users" — not session rows. Better Auth creates a
     *   new `session` row per sign-in and per OIDC token refresh, and never
     *   GCs expired rows, so {@link AuthMetrics.activeSessions} drifts up
     *   over time even when the actual user base is small.
     *
     * Expects:
     * - Backed by `SELECT COUNT(DISTINCT user_id) FROM session WHERE expires_at > now()`.
     *   Same cluster-wide truth as `activeSessions`; dashboards MUST aggregate
     *   with `avg()`, not `sum()` — see observability-conventions.md.
     */
    distinctActiveUsers: ObservableGauge;
    /**
     * Pull-based gauge for rolling-window distinct active users (DAU / WAU /
     * MAU).
     *
     * Use when:
     * - Reporting "how many users were active in the last 24h / 7d / 30d" —
     *   the standard product-engagement funnel, distinct from
     *   {@link AuthMetrics.distinctActiveUsers} which only counts users with a
     *   currently-live session.
     *
     * Expects:
     * - Backed by `COUNT(*) FILTER (WHERE last_seen_at > now() - window)` over
     *   the `user` table. `last_seen_at` is touched on sign-in and on every
     *   OIDC access-token refresh (~hourly), so it is a per-user last-activity
     *   timestamp (see the `user.lastSeenAt` schema note).
     * - Observed once per window with a `window` attribute (`24h` / `7d` /
     *   `30d`). Same cluster-wide truth as the other DB-backed gauges;
     *   dashboards MUST aggregate with `max()`/`avg()`, not `sum()`.
     */
    rollingActiveUsers: ObservableGauge;
}
export interface EngagementMetrics {
    chatMessages: Counter;
    characterCreated: Counter;
    characterDeleted: Counter;
    characterEngagement: Counter;
    /**
     * Pull-based gauge for active WebSocket connections.
     *
     * Use when:
     * - Querying current concurrent WS connections in Grafana / alerts.
     *
     * Why ObservableGauge instead of UpDownCounter:
     * - UpDownCounter is delta-based (+1 / -1) and drifts when disconnect
     *   handlers miss (process crash, SIGKILL, TCP RST, network blackhole).
     * - ObservableGauge runs a callback at every export interval and reports
     *   the live registry size, so a missed -1 self-corrects on the next
     *   scrape instead of leaking forever.
     *
     * Expects:
     * - Caller (`createChatWsHandlers`) registers exactly one callback via
     *   `addCallback`. Multiple callbacks would double-count.
     */
    wsConnectionsActive: ObservableGauge;
    wsMessagesSent: Counter;
    wsMessagesReceived: Counter;
}
export interface RevenueMetrics {
    stripeCheckoutCreated: Counter;
    stripeCheckoutCompleted: Counter;
    stripePaymentFailed: Counter;
    stripeSubscriptionEvent: Counter;
    stripeEvents: Counter;
    stripeRevenue: Counter;
    fluxInsufficientBalance: Counter;
    fluxCredited: Counter;
    /**
     * Flux value that the LLM proxy could not collect from the user. Fires from
     * both the streaming and non-streaming completion paths.
     *
     * Use when:
     * - Tracking real revenue leak in the LLM proxy.
     *
     * Labels (`reason`):
     * - `debit_failed` — `consumeFluxForLLM` threw (DB error, or `balance <= 0`
     *   after a race lost). Counter records the *full* requested amount.
     * - `partial_debit_drained` — user had `0 < balance < requested`, so we
     *   drained the balance to zero and charged what we could. Counter records
     *   `requested - charged` (the unbilled remainder only).
     *
     * Why this needs its own metric:
     * - The streaming response is already sent (HTTP 200, tokens delivered) by
     *   the time we discover we can't collect in full. DB latency / HTTP 5xx
     *   alerts do NOT fire on this path — the failure is silent at the
     *   transport layer. This counter is the only signal that ties Flux value
     *   owed to a missed debit.
     * - Recommended alert: `increase(airi_billing_flux_unbilled_total[5m]) > 0`
     *   pages on-call immediately on any sustained leak.
     */
    fluxUnbilled: Counter;
    ttsChars: Counter;
    ttsPreflightRejections: Counter;
}
export interface GenAiMetrics {
    operationDuration: Histogram;
    operationCount: Counter;
    tokenUsageInput: Counter;
    tokenUsageOutput: Counter;
    fluxConsumed: Counter;
    firstTokenDuration: Histogram;
    streamInterrupted: Counter;
}
export interface GatewayMetrics {
    /**
     * Per-attempt fallback event. Increments once per failing key try when the
     * router moves on to the next key/upstream. Recommended labels:
     * `provider`, `from_key`, `reason`.
     */
    fallbackCount: Counter;
    /**
     * Upstream error responses received during fallback iteration. Recommended
     * labels: `provider`, `status_code`.
     */
    upstreamErrors: Counter;
    /**
     * All keys (across all upstreams) failed in a single request — the user gets
     * a 5xx. Primary alert source for user-facing degradation.
     * Recommended label: `provider`.
     *
     * Recommended alert:
     *   `increase(airi_gen_ai_gateway_key_exhausted_total[5m]) > 0` → page on-call.
     */
    keyExhaustedCount: Counter;
    /**
     * All keys in one request failed with the *same* upstream status code.
     * Strong signal of account-level (shared-backend) rate limiting that
     * per-key fallback cannot recover from — see plan D33 risk-acceptance
     * and the adversarial finding ADV-PLAN-006.
     * Recommended labels: `provider`, `status_code`.
     *
     * Recommended alert:
     *   `rate(airi_gen_ai_gateway_same_status_exhaustion_total[15m]) / rate(...request_count[15m]) > 0.05`
     */
    sameStatusExhaustion: Counter;
    /**
     * Local in-memory configKV cache reloaded (router config). Labels: `source`
     * (`pubsub` | `ttl` | `manual`), `service_instance_id`.
     */
    configReload: Counter;
    /**
     * Envelope-crypto decryption auth-tag failures. Any >0 sample indicates
     * config corruption or a master-key rotation misstep — investigate.
     * Recommended labels: `provider`, `key_entry_id`.
     */
    decryptFailures: Counter;
    /**
     * Pub/Sub subscriber lifecycle transitions (`subscribed` |
     * `reconnecting` | `error` | `closed`). Watch for sustained
     * `reconnecting` — the TTL self-heal stops being ≤5s once the subscriber
     * is dead.
     */
    subscriberState: Counter;
    /**
     * Admin endpoint write events for `LLM_ROUTER_CONFIG`. Labels: `result`
     * (`success` | `4xx` | `5xx`), `actor_email`. Audit-trail surrogate
     * given v1 keeps the flat-admin-role permission model (R16a known
     * limitation).
     */
    configWrite: Counter;
    /**
     * Pub/Sub invalidation messages dropped because the HMAC did not verify.
     * >0 = forged or replayed message — investigate Redis access boundary.
     */
    configInvalidHmac: Counter;
    /**
     * Capacity-aware TTS routing skipped a pool because its app_id was already at
     * the concurrency cap (the pre-read said free but the atomic acquire lost the
     * race, or every pool was full). Labels: `provider`, `app_id`.
     *
     * Recommended alert: sustained rate relative to TTS request volume means the
     *pool is undersized — add app_ids or raise the cap.
     */
    poolSlotRejected: Counter;
    /**
     * Apool was circuit-broken after exhausting with a 429 (app_id concurrency
     * exceeded upstream-side). Labels: `provider`, `app_id`. A pool with a high
     * mark rate is being driven past its real upstream limit.
     */
    poolSaturationMarked: Counter;
    /**
     * Cluster-wide gauge of current in-flight requests per pool, sourced from
     * Redis. Label: `app_id`. Every replica reports the same value — dashboards
     * MUST aggregate with `avg()`, NOT `sum()` (see observability-conventions.md).
     */
    poolInflight: ObservableGauge;
}
export interface EmailMetrics {
    send: Counter;
    failures: Counter;
    duration: Histogram;
}
export interface RateLimitMetrics {
    blocked: Counter;
}
export interface ObservabilityMetrics {
    /**
     * Counts failures inside metric-pipeline callbacks (e.g. a DB-backed
     * ObservableGauge that couldn't read from Postgres). Use for self-monitoring
     * — when this is rising, treat the affected gauge's reported value as
     * potentially stale.
     *
     * Labels: `metric` (the failing gauge's logical name).
     */
    metricReadErrors: Counter;
}
export interface ProductMetrics {
    /**
     * Low-cardinality product event counter.
     *
     * Use when:
     * - Reporting feature/event volume in Prometheus and Grafana.
     *
     * Expects:
     * - Labels stay bounded (`feature`, `action`, `status`, optional
     *   `source`). Never attach `user_id`, `session_id`, request ids, models
     *   with unbounded aliases, or free-form error messages here.
     */
    events: Counter;
}
export interface OtelInstance {
    auth: AuthMetrics;
    engagement: EngagementMetrics;
    revenue: RevenueMetrics;
    genAi: GenAiMetrics;
    gateway: GatewayMetrics;
    email: EmailMetrics;
    rateLimit: RateLimitMetrics;
    observability: ObservabilityMetrics;
    product: ProductMetrics;
}
/**
 * Build the structured metric-handle bundle used across the app.
 *
 * Use when:
 * - DI assembly in `apps/server/src/app.ts`. Returns `null` when OTel is
 *   disabled (no OTLP endpoint), so callers can skip wiring `metrics?.…`.
 *
 * Expects:
 * - `instrumentation.ts` has already started NodeSDK (loaded via
 *   `tsx --import ./instrumentation.ts`). This function does NOT start the
 *   SDK — it only consumes the global MeterProvider that the preload set up.
 *   Calling it before the preload runs would yield NoopMeter for everything.
 *
 * Returns:
 * - Metric bundle with primed counters (so low-traffic series show up in
 *   Prometheus from boot), or `null` when OTel is disabled.
 */
export declare function initOtel(env: Env): OtelInstance | null;
/**
 * Emit a log record to OpenTelemetry.
 * Automatically attaches the active span's traceId/spanId when available.
 */
export declare function emitOtelLog(level: string, context: string, message: string, attributes?: Record<string, string | number | boolean>): void;
