import type { HonoEnv } from '../../../types/hono';
import type { LlmTracingDeps, V1RouteDeps } from './types';
export interface CreateV1RoutesDeps extends Omit<V1RouteDeps, 'llmTracing'> {
    llmTracing?: LlmTracingDeps;
}
export declare function createV1Routes(input: CreateV1RoutesDeps): {
    openaiRoutes: import("hono").Hono<HonoEnv, import("hono/types").BlankSchema, "/">;
    audioRoutes: import("hono").Hono<HonoEnv, import("hono/types").BlankSchema, "/">;
};
