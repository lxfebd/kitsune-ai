import type { GatewayCallback } from '../../gateway';
import type { V1RouteDeps } from '../../types';
export interface SpeechGenerationOperationRequest {
    userId: string;
    body: Record<string, unknown>;
    sessionId?: string;
    abortSignal?: AbortSignal;
}
export declare function speechGeneration(deps: V1RouteDeps): GatewayCallback<'speech.generate'>;
