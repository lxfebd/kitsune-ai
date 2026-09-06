import type { InferOutput } from 'valibot';
import { Buffer } from 'node:buffer';
import { env } from 'node:process';
/**
 * Parses `ADDITIONAL_TRUSTED_ORIGINS`: comma-separated absolute origins used for
 * CORS (`/api/*`) and request-derived trusted bases (e.g. Stripe return URLs).
 * Each segment is normalized via `URL.origin` so trailing slashes are stripped.
 *
 * Before:
 * - `" https://10.0.0.129:5273/ , https://198.18.0.1:5273 "`
 *
 * After:
 * - `["https://10.0.0.129:5273", "https://198.18.0.1:5273"]`
 */
export declare function parseAdditionalTrustedOriginsEnv(raw: string): string[];
declare const EnvSchema: import("valibot").ObjectSchema<{
    readonly HOST: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, "0.0.0.0">;
    readonly PORT: import("valibot").OptionalSchema<import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, `${string} must not be empty`>, import("valibot").TransformAction<string, number>, import("valibot").IntegerAction<number, `${string} must be an integer`>, import("valibot").MinValueAction<number, number, `${string} must be at least ${number}`>]>, string>;
    readonly API_SERVER_URL: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, "http://localhost:3000">;
    readonly AUTH_UI_URL: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, "">;
    readonly ADMIN_UI_URL: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, "">;
    readonly WEB_APP_URL: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, "">;
    readonly ADDITIONAL_TRUSTED_ORIGINS: import("valibot").OptionalSchema<import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").TransformAction<string, string[]>]>, "">;
    readonly DATABASE_URL: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "DATABASE_URL is required">]>;
    readonly REDIS_URL: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "REDIS_URL is required">]>;
    readonly BETTER_AUTH_SECRET: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "BETTER_AUTH_SECRET is required">]>;
    readonly AUTH_GOOGLE_CLIENT_ID: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "AUTH_GOOGLE_CLIENT_ID is required">]>;
    readonly AUTH_GOOGLE_CLIENT_SECRET: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "AUTH_GOOGLE_CLIENT_SECRET is required">]>;
    readonly AUTH_GITHUB_CLIENT_ID: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "AUTH_GITHUB_CLIENT_ID is required">]>;
    readonly AUTH_GITHUB_CLIENT_SECRET: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "AUTH_GITHUB_CLIENT_SECRET is required">]>;
    readonly TEST_AUTH_TOKEN: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, "">;
    readonly TEST_AUTH_USER_ID: import("valibot").OptionalSchema<import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "TEST_AUTH_USER_ID must not be empty when set">]>, "test-user">;
    readonly TEST_AUTH_USER_EMAIL: import("valibot").OptionalSchema<import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "TEST_AUTH_USER_EMAIL must not be empty when set">]>, "test@example.com">;
    readonly TEST_AUTH_USER_NAME: import("valibot").OptionalSchema<import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "TEST_AUTH_USER_NAME must not be empty when set">]>, "Test User">;
    readonly TEST_AUTH_USER_ROLE: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, "">;
    readonly RESEND_API_KEY: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, "">;
    readonly RESEND_FROM_EMAIL: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, "">;
    readonly RESEND_FROM_NAME: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, "Kitsune AI">;
    readonly STRIPE_SECRET_KEY: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
    readonly STRIPE_WEBHOOK_SECRET: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
    readonly LLM_ROUTER_MASTER_KEY: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "LLM_ROUTER_MASTER_KEY is required">, import("valibot").TransformAction<string, Buffer<ArrayBuffer>>, import("valibot").CheckAction<Buffer<ArrayBuffer>, "LLM_ROUTER_MASTER_KEY must decode to exactly 32 bytes (base64-encoded 32-byte random)">]>;
    readonly LLM_ROUTER_MASTER_KEY_PREVIOUS: import("valibot").OptionalSchema<import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "LLM_ROUTER_MASTER_KEY_PREVIOUS must not be empty when set">, import("valibot").TransformAction<string, Buffer<ArrayBuffer>>, import("valibot").CheckAction<Buffer<ArrayBuffer>, "LLM_ROUTER_MASTER_KEY_PREVIOUS must decode to exactly 32 bytes when set">]>, undefined>;
    readonly DB_POOL_MAX: import("valibot").OptionalSchema<import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, `${string} must not be empty`>, import("valibot").TransformAction<string, number>, import("valibot").IntegerAction<number, `${string} must be an integer`>, import("valibot").MinValueAction<number, number, `${string} must be at least ${number}`>]>, string>;
    readonly DB_POOL_IDLE_TIMEOUT_MS: import("valibot").OptionalSchema<import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, `${string} must not be empty`>, import("valibot").TransformAction<string, number>, import("valibot").IntegerAction<number, `${string} must be an integer`>, import("valibot").MinValueAction<number, number, `${string} must be at least ${number}`>]>, string>;
    readonly DB_POOL_CONNECTION_TIMEOUT_MS: import("valibot").OptionalSchema<import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, `${string} must not be empty`>, import("valibot").TransformAction<string, number>, import("valibot").IntegerAction<number, `${string} must be an integer`>, import("valibot").MinValueAction<number, number, `${string} must be at least ${number}`>]>, string>;
    readonly DB_POOL_KEEPALIVE_INITIAL_DELAY_MS: import("valibot").OptionalSchema<import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, `${string} must not be empty`>, import("valibot").TransformAction<string, number>, import("valibot").IntegerAction<number, `${string} must be an integer`>, import("valibot").MinValueAction<number, number, `${string} must be at least ${number}`>]>, string>;
    readonly OTEL_SERVICE_NAMESPACE: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, "kitsune">;
    readonly OTEL_SERVICE_NAME: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, "server">;
    readonly OTEL_TRACES_SAMPLING_RATIO: import("valibot").OptionalSchema<import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, `${string} must not be empty`>, import("valibot").TransformAction<string, number>, import("valibot").MinValueAction<number, number, `${string} must be at least ${number}`>, import("valibot").MaxValueAction<number, number, `${string} must be at most ${number}`>]>, string>;
    readonly OTEL_EXPORTER_OTLP_ENDPOINT: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
    readonly OTEL_EXPORTER_OTLP_HEADERS: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
    readonly OTEL_DEBUG: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
    readonly ADMIN_EMAILS: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, "">;
}, undefined>;
export type Env = InferOutput<typeof EnvSchema>;
export declare function parseEnv(inputEnv: Record<string, string> | typeof env): Env;
export declare const parsedEnv: import("injeca").ProvidedKey<"env", {
    HOST: string;
    PORT: number;
    API_SERVER_URL: string;
    AUTH_UI_URL: string;
    ADMIN_UI_URL: string;
    WEB_APP_URL: string;
    ADDITIONAL_TRUSTED_ORIGINS: string[];
    DATABASE_URL: string;
    REDIS_URL: string;
    BETTER_AUTH_SECRET: string;
    AUTH_GOOGLE_CLIENT_ID: string;
    AUTH_GOOGLE_CLIENT_SECRET: string;
    AUTH_GITHUB_CLIENT_ID: string;
    AUTH_GITHUB_CLIENT_SECRET: string;
    TEST_AUTH_TOKEN: string;
    TEST_AUTH_USER_ID: string;
    TEST_AUTH_USER_EMAIL: string;
    TEST_AUTH_USER_NAME: string;
    TEST_AUTH_USER_ROLE: string;
    RESEND_API_KEY: string;
    RESEND_FROM_EMAIL: string;
    RESEND_FROM_NAME: string;
    STRIPE_SECRET_KEY?: string | undefined;
    STRIPE_WEBHOOK_SECRET?: string | undefined;
    LLM_ROUTER_MASTER_KEY: Buffer<ArrayBuffer>;
    LLM_ROUTER_MASTER_KEY_PREVIOUS?: Buffer<ArrayBuffer> | undefined;
    DB_POOL_MAX: number;
    DB_POOL_IDLE_TIMEOUT_MS: number;
    DB_POOL_CONNECTION_TIMEOUT_MS: number;
    DB_POOL_KEEPALIVE_INITIAL_DELAY_MS: number;
    OTEL_SERVICE_NAMESPACE: string;
    OTEL_SERVICE_NAME: string;
    OTEL_TRACES_SAMPLING_RATIO: number;
    OTEL_EXPORTER_OTLP_ENDPOINT?: string | undefined;
    OTEL_EXPORTER_OTLP_HEADERS?: string | undefined;
    OTEL_DEBUG?: string | undefined;
    ADMIN_EMAILS: string;
}, import("injeca").DependencyMap | undefined>;

