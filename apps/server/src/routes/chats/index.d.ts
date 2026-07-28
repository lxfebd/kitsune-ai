import type { ChatService } from '../../services/domain/chats';
import type { HonoEnv } from '../../types/hono';
export declare function createChatRoutes(chatService: ChatService): import("hono/hono-base").HonoBase<HonoEnv, {
    "/": {
        $post: {
            input: {};
            output: {
                id: string;
                type: "group" | "private" | "bot" | "channel";
                title: string | null;
                createdAt: string;
                updatedAt: string;
            };
            outputFormat: "json";
            status: 201;
        };
    };
} & {
    "/": {
        $get: {
            input: {};
            output: {
                chats: {
                    id: string;
                    type: "group" | "private" | "bot" | "channel";
                    title: string | null;
                    createdAt: string;
                    updatedAt: string;
                    deletedAt: string | null;
                }[];
            };
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
                members: {
                    id: string;
                    userId: string | null;
                    characterId: string | null;
                    chatId: string;
                    memberType: "user" | "character" | "bot";
                }[];
                type: "group" | "private" | "bot" | "channel";
                updatedAt: string;
                title: string | null;
                id: string;
                createdAt: string;
                deletedAt: string | null;
            };
            outputFormat: "json";
            status: import("hono/utils/http-status").ContentfulStatusCode;
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
                type: "group" | "private" | "bot" | "channel";
                title: string | null;
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
            output: {
                id: string;
                type: "group" | "private" | "bot" | "channel";
                title: string | null;
                createdAt: string;
                updatedAt: string;
                deletedAt: string | null;
            };
            outputFormat: "json";
            status: import("hono/utils/http-status").ContentfulStatusCode;
        };
    };
} & {
    "/:id/members": {
        $post: {
            input: {
                param: {
                    id: string;
                };
            };
            output: {
                id: string;
                userId: string | null;
                characterId: string | null;
                chatId: string;
                memberType: "user" | "character" | "bot";
            };
            outputFormat: "json";
            status: import("hono/utils/http-status").ContentfulStatusCode;
        };
    };
} & {
    "/:id/members/:memberId": {
        $delete: {
            input: {
                param: {
                    id: string;
                } & {
                    memberId: string;
                };
            };
            output: {
                id: string;
                userId: string | null;
                characterId: string | null;
                chatId: string;
                memberType: "user" | "character" | "bot";
            };
            outputFormat: "json";
            status: import("hono/utils/http-status").ContentfulStatusCode;
        };
    };
}, "/", "/:id/members/:memberId">;
