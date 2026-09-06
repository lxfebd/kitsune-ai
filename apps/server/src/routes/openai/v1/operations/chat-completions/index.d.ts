import type { GatewayCallback } from '../../gateway';
import type { V1RouteDeps } from '../../types';
export interface ChatCompletionsOperationRequest {
    userId: string;
    body: Record<string, unknown>;
    sessionId?: string;
    abortSignal?: AbortSignal;
}
export declare function chatCompletions(deps: V1RouteDeps): GatewayCallback<'chat.completions'>;
