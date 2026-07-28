import type { GenAiMetrics } from '../../../../otel';
import type { UsageInfo } from '../../../../services/domain/billing/billing';
import type { LlmRouteContext } from '../../../../services/domain/llm-router';
import type { RequestLogService } from '../../../../services/domain/request-log';
export declare const tracer: import("@opentelemetry/api").Tracer;
export type GatewaySpan = ReturnType<typeof tracer.startSpan>;
export interface OperationMetricsInput extends UsageInfo {
    model: string;
    status: number;
    type: string;
    provider: string;
    durationMs: number;
    fluxConsumed: number;
}
export interface RequestLogInput extends UsageInfo {
    userId: string;
    model: string;
    status: number;
    durationMs: number;
    fluxConsumed: number;
}
export declare function getLlmMetricAttributes(opts: {
    model: string;
    type: string;
    status: number;
    provider: string;
}): Record<string, string | number>;
export declare function newRouteContext(): LlmRouteContext;
export declare function createRouteTelemetry(deps: {
    genAi?: GenAiMetrics | null;
    requestLogService: RequestLogService;
}): {
    endSpan: (span: GatewaySpan) => void;
    failSpan: (span: GatewaySpan, message: string) => void;
    recordFirstToken: (input: {
        model: string;
        provider: string;
        startedAt: number;
        firstChunkAt: number;
    }) => void;
    recordMetrics: (opts: OperationMetricsInput) => void;
    recordRequestLog: (entry: RequestLogInput) => void;
    recordStreamInterrupted: (input: {
        model: string;
        stage: "mid_stream" | "before_first_chunk";
        span: GatewaySpan;
    }) => void;
    recordTtsBillingOnSpan: (span: GatewaySpan, fluxConsumed: number) => void;
    recordUsageOnSpan: (span: GatewaySpan, input: UsageInfo & {
        fluxConsumed: number;
    }) => void;
    runWithSpan: <T>(span: GatewaySpan, work: () => Promise<T>) => Promise<T>;
    setHttpStatus: (span: GatewaySpan, status: number) => void;
    startChatSpan: (input: {
        model: string;
        stream: boolean;
    }) => GatewaySpan;
    startTtsSpan: (input: {
        model: string;
    }) => GatewaySpan;
};
