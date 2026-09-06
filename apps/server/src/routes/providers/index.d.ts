import type { ProviderService } from '../../services/domain/providers';
import type { HonoEnv } from '../../types/hono';
export declare function createProviderRoutes(providerService: ProviderService): import("hono/hono-base").HonoBase<HonoEnv, {
    "/": {
        $get: {
            input: {};
            output: {
                id: string;
                definitionId: string;
                name: string;
                config: import("hono/utils/types").JSONValue;
                validated: boolean;
                validationBypassed: boolean;
                createdAt: string;
                updatedAt: string;
                isSystem: boolean;
            }[];
            outputFormat: "json";
            status: import("hono/utils/http-status").ContentfulStatusCode;
        };
    };
} & {
    "/:id": {
        $get: {
            input: {
                param: {
                    id: string;
                };
            };
            output: {
                isSystem: boolean;
                updatedAt: string;
                id: string;
                name: string;
                createdAt: string;
                ownerId: string;
                deletedAt: string | null;
                config: import("hono/utils/types").JSONValue;
                definitionId: string;
                validated: boolean;
                validationBypassed: boolean;
            } | {
                isSystem: boolean;
                updatedAt: string;
                id: string;
                name: string;
                createdAt: string;
                deletedAt: string | null;
                config: import("hono/utils/types").JSONValue;
                definitionId: string;
                validated: boolean;
                validationBypassed: boolean;
            };
            outputFormat: "json";
            status: import("hono/utils/http-status").ContentfulStatusCode;
        };
    };
} & {
    "/": {
        $post: {
            input: {};
            output: {
                updatedAt: string;
                id: string;
                name: string;
                createdAt: string;
                ownerId: string;
                deletedAt: string | null;
                config: import("hono/utils/types").JSONValue;
                definitionId: string;
                validated: boolean;
                validationBypassed: boolean;
            };
            outputFormat: "json";
            status: 201;
        };
    };
} & {
    "/:id": {
        $patch: {
            input: {
                param: {
                    id: string;
                };
            };
            output: {
                id: string;
                ownerId: string;
                definitionId: string;
                name: string;
                config: import("hono/utils/types").JSONValue;
                validated: boolean;
                validationBypassed: boolean;
                createdAt: string;
                updatedAt: string;
                deletedAt: string | null;
            };
            outputFormat: "json";
            status: import("hono/utils/http-status").ContentfulStatusCode;
        };
    };
} & {
    "/:id": {
        $delete: {
            input: {
                param: {
                    id: string;
                };
            };
            output: null;
            outputFormat: "body";
            status: 204;
        };
    };
}, "/", "/:id">;
