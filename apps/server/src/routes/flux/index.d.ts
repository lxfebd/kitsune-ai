import type { FluxService } from '../../services/domain/flux';
import type { FluxTransactionService } from '../../services/domain/flux-transaction';
import type { HonoEnv } from '../../types/hono';
export declare function createFluxRoutes(fluxService: FluxService, fluxTransactionService: FluxTransactionService): import("hono/hono-base").HonoBase<HonoEnv, {
    "/": {
        $get: {
            input: {};
            output: {
                updatedAt: string;
                userId: string;
                deletedAt: string | null;
                flux: number;
                stripeCustomerId: string | null;
            } | {
                userId: string;
                flux: number;
            };
            outputFormat: "json";
            status: import("hono/utils/http-status").ContentfulStatusCode;
        };
    };
} & {
    "/stats": {
        $get: {
            input: {};
            output: {
                capacity: number;
            };
            outputFormat: "json";
            status: import("hono/utils/http-status").ContentfulStatusCode;
        };
    };
} & {
    "/history": {
        $get: {
            input: {};
            output: {
                records: {
                    id: string;
                    type: string;
                    amount: number;
                    description: string;
                    metadata: import("hono/utils/types").JSONValue;
                    createdAt: string;
                }[];
                hasMore: boolean;
            };
            outputFormat: "json";
            status: import("hono/utils/http-status").ContentfulStatusCode;
        };
    };
}, "/", "/history">;
