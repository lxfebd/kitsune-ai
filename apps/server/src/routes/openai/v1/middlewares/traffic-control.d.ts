import type { RateLimitMetrics } from '../../../../otel';
import type { GatewayMiddleware } from '../gateway';
export declare function chatCompletionsRateLimit(input: {
    metrics?: RateLimitMetrics | null;
}): GatewayMiddleware<'chat.completions'>;
