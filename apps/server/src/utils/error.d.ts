import type { ContentfulStatusCode } from 'hono/utils/http-status';
export declare class ApiError extends Error {
    readonly statusCode: ContentfulStatusCode;
    readonly errorCode: string;
    readonly details?: unknown | undefined;
    constructor(statusCode: ContentfulStatusCode, errorCode: string, message: string, details?: unknown | undefined);
}
/**
 * Creates an internal server error (500)
 */
export declare function createInternalError(message?: string, details?: unknown): ApiError;
/**
 * Creates a bad request error (400)
 */
export declare function createBadRequestError(message: string, errorCode?: string, details?: unknown): ApiError;
/**
 * Creates an unauthorized error (401)
 */
export declare function createUnauthorizedError(message?: string, details?: unknown): ApiError;
/**
 * Creates a forbidden error (403)
 */
export declare function createForbiddenError(message?: string, details?: unknown): ApiError;
/**
 * Creates a not found error (404)
 */
export declare function createNotFoundError(message?: string, details?: unknown): ApiError;
/**
 * Creates a payment required error (402)
 */
export declare function createPaymentRequiredError(message: string, details?: unknown): ApiError;
/**
 * Creates a conflict error (409)
 */
export declare function createConflictError(message: string, details?: unknown): ApiError;
/**
 * Creates a service unavailable error (503)
 */
export declare function createServiceUnavailableError(message?: string, errorCode?: string, details?: unknown): ApiError;
/**
 * Creates a bad gateway error (502).
 *
 * Use when:
 * - An upstream provider (LLM, TTS, third-party API) returned a fallback-
 *   triggering response (401 / 402 / 403 / 5xx) and the gateway has exhausted
 *   every retry/fallback path. The client must see a gateway-side error code,
 *   not the upstream's status, because the client did nothing wrong.
 *
 * Expects:
 * - `details` is sanitized — never include raw upstream response bodies or
 *   headers (they can leak provider-internal info like subscription IDs,
 *   region identifiers, or rate-limit metadata). Use shape
 *   `{ triedKeys?: number, triedUpstreams?: number, lastStatusCode?: number }`.
 */
export declare function createBadGatewayError(message?: string, details?: unknown): ApiError;
/**
 * Creates a gateway timeout error (504).
 *
 * Use when:
 * - The gateway aborted an upstream call (or the entire fallback chain) on a
 *   timeout boundary. Distinct from 503: 504 tells clients "retry after a
 *   delay" rather than "service is offline".
 */
export declare function createGatewayTimeoutError(message?: string, details?: unknown): ApiError;
