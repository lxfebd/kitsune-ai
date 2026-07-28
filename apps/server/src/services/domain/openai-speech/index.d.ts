import type { GenAiMetrics } from '../../../otel';
import type { ConfigKVService } from '../../adapters/config-kv';
import type { FluxMeter } from '../billing/flux-meter';
import type { FluxService } from '../flux';
import type { LlmRouterService } from '../llm-router';
import type { startTtsGeneration, TtsGenerationTrace } from '../llm-tracing';
import type { ProductEventService } from '../product-events';
import type { RequestLogService } from '../request-log';
import type { VoicePackService } from '../voice-packs';
export interface OpenAiSpeechServiceDeps {
    fluxService: FluxService;
    configKV: ConfigKVService;
    requestLogService: RequestLogService;
    ttsMeter: FluxMeter;
    llmRouter: LlmRouterService;
    voicePackService: VoicePackService;
    productEventService: ProductEventService;
    genAi?: GenAiMetrics | null;
    llmTracing: {
        startTtsGeneration: (input: Parameters<typeof startTtsGeneration>[0]) => TtsGenerationTrace;
    };
}
export interface OpenAiSpeechRequest {
    userId: string;
    body: Record<string, unknown>;
    sessionId?: string;
    abortSignal?: AbortSignal;
}
/**
 * Runs the OpenAI-shaped text-to-speech gateway flow.
 *
 * Use when:
 * - The HTTP route has parsed an authenticated `/audio/speech` request and
 *   needs domain orchestration for billing, routing, tracing, and logging.
 *
 * Expects:
 * - `body` is the parsed JSON request body.
 * - Auth and route guards have already run.
 *
 * Returns:
 * - A gateway `Response` with safe upstream headers and audio body.
 */
export declare function createOpenAiSpeechService(deps: OpenAiSpeechServiceDeps): {
    handleSpeechRequest: (input: OpenAiSpeechRequest) => Promise<Response>;
};
