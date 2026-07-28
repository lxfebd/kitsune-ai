import type { Context, Handler, MiddlewareHandler } from 'hono';
import type { HonoEnv } from '../../../types/hono';
import type { ChatCompletionsOperationRequest } from './operations/chat-completions';
import type { SpeechGenerationOperationRequest } from './operations/speech-generation';
import type { V1RouteDeps } from './types';
import { Hono } from 'hono';
export type GatewayCallback<Name extends V1GatewayOperationName> = (context: V1GatewayContext<Name>) => Promise<Response>;
export type GatewayMiddleware<Name extends V1GatewayOperationName> = (context: V1GatewayContext<Name>, next: () => Promise<Response>) => Promise<Response>;
export type V1HttpSurface = 'audio' | 'openai';
export interface V1GatewayOperationInput {
    'chat.completions': ChatCompletionsOperationRequest;
    'speech.generate': SpeechGenerationOperationRequest;
}
export type V1GatewayOperationName = keyof V1GatewayOperationInput;
export type V1GatewayPlugin = (gateway: V1GatewayRuntime) => void;
export interface V1GatewayContext<Name extends V1GatewayOperationName> {
    deps: V1RouteDeps;
    hono: Context<HonoEnv>;
    input: V1GatewayOperationInput[Name];
}
export interface V1GatewayRuntime {
    deps: V1RouteDeps;
    handler: <Name extends V1GatewayOperationName>(name: Name, parse: (hono: Context<HonoEnv>) => V1GatewayOperationInput[Name] | Promise<V1GatewayOperationInput[Name]>, callback: GatewayCallback<Name>) => Handler<HonoEnv>;
    route: (surface: V1HttpSurface) => V1GatewayRoute;
    use: {
        (plugin: V1GatewayPlugin): V1GatewayRuntime;
        <Name extends V1GatewayOperationName>(name: Name, middleware: GatewayMiddleware<Name>): V1GatewayRuntime;
    };
    useHono: (surface: V1HttpSurface | '*', path: string, middleware: MiddlewareHandler<HonoEnv>) => V1GatewayRuntime;
}
export interface V1GatewayRoute {
    deps: V1RouteDeps;
    get: (path: string, handler: Handler<HonoEnv> | V1GatewayRouteHandler) => V1GatewayRoute;
    handler: V1GatewayRuntime['handler'];
    post: (path: string, handler: Handler<HonoEnv> | V1GatewayRouteHandler) => V1GatewayRoute;
    route: Hono<HonoEnv>;
    use: <Name extends V1GatewayOperationName>(name: Name, middleware: GatewayMiddleware<Name>) => V1GatewayRoute;
    useHono: (path: string, middleware: MiddlewareHandler<HonoEnv>) => V1GatewayRoute;
}
declare const routeHandlerMarker: unique symbol;
export interface V1GatewayRouteHandler {
    (scope: Pick<V1GatewayRoute, 'deps' | 'handler'>): Handler<HonoEnv>;
    [routeHandlerMarker]: true;
}
export declare function routeHandler(handler: (scope: Pick<V1GatewayRoute, 'deps' | 'handler'>) => Handler<HonoEnv>): V1GatewayRouteHandler;
/**
 * Runs an OpenAI gateway callback through operation-scoped middleware.
 *
 * Use when:
 * - The middleware needs parsed gateway input such as user id, model, body,
 *   session id, or abort signal.
 * - The behavior is not a generic HTTP concern and should not receive Hono
 *   `Context`.
 *
 * Expects:
 * - `callback` is the concrete gateway business callback.
 * - `middlewares` are ordered from outermost to innermost.
 *
 * Returns:
 * - A response produced by the gateway callback chain.
 */
export declare function runGatewayMiddlewares<Name extends V1GatewayOperationName>(context: V1GatewayContext<Name>, callback: GatewayCallback<Name>, middlewares: GatewayMiddleware<Name>[]): Promise<Response>;
export declare function createV1Gateway(deps: V1RouteDeps): V1GatewayRuntime;

