import type Redis from 'ioredis';
import type { Database } from './libs/db';
import type { Env } from './libs/env';
import type { OtelInstance } from './otel';
import type { ConfigKVService } from './services/adapters/config-kv';
import type { CharacterService } from './services/domain/characters';
import type { ChatService } from './services/domain/chats';
import type { FluxService } from './services/domain/flux';
import type { FluxTransactionService } from './services/domain/flux-transaction';
import type { LlmRouterService } from './services/domain/llm-router';
import type { ProductEventService } from './services/domain/product-events';
import type { ProviderService } from './services/domain/providers';
import type { RequestLogService } from './services/domain/request-log';
import type { VoicePackService } from './services/domain/voice-packs';
import type { HonoEnv } from './types/hono';
import type { EnvelopeCrypto } from './utils/envelope-crypto';
interface AppDeps {
    db: Database;
    characterService: CharacterService;
    chatService: ChatService;
    providerService: ProviderService;
    fluxService: FluxService;
    fluxTransactionService: FluxTransactionService;
    requestLogService: RequestLogService;
    voicePackService: VoicePackService;
    productEventService: ProductEventService;
    configKV: ConfigKVService;
    envelopeCrypto: EnvelopeCrypto;
    redis: Redis;
    env: Env;
    otel: OtelInstance | null;
    llmRouter: LlmRouterService;
}
export declare function buildApp(deps: AppDeps): Promise<{
    app: import("hono/hono-base").HonoBase<HonoEnv, ({
        "/livez": {
            $get: {
                input: {};
                output: {
                    status: string;
                };
                outputFormat: "json";
                status: import("hono/utils/http-status").ContentfulStatusCode;
            };
        };
    } & {
        "/readyz": {
            $get: {
                input: {};
                output: {
                    status: string;
                    checks: {
                        db: string;
                        redis: string;
                    };
                };
                outputFormat: "json";
                status: 200 | 503;
            };
        };
    } & {
        "/": {
            $get: {
                input: {};
                output: {
                    service: string;
                    message: string;
                };
                outputFormat: "json";
                status: import("hono/utils/http-status").ContentfulStatusCode;
            };
        };
    }) | import("hono/types").MergeSchemaPath<{
        "/": {
            $get: {
                input: {};
                output: {
                    updatedAt: string;
                    version: string;
                    id: string;
                    createdAt: string;
                    coverUrl: string;
                    creatorId: string;
                    ownerId: string;
                    characterId: string;
                    avatarUrl: string | null;
                    creatorRole: string | null;
                    priceCredit: string;
                    likesCount: number;
                    bookmarksCount: number;
                    interactionsCount: number;
                    forksCount: number;
                    deletedAt: string | null;
                    cover: {
                        updatedAt: string;
                        id: string;
                        createdAt: string;
                        characterId: string;
                        deletedAt: string | null;
                        foregroundUrl: string;
                        backgroundUrl: string;
                    };
                    capabilities: {
                        type: keyof import("./types/character-capability").CharacterCapabilityConfig;
                        id: string;
                        characterId: string;
                        config: string | {
                            temperature: number;
                            model: string;
                        } | {
                            ssml: string;
                            voiceId: string;
                            speed: number;
                            pitch: number;
                        } | {
                            image: string;
                        } | {
                            audio: string;
                        };
                    }[];
                    i18n: {
                        updatedAt: string;
                        id: string;
                        name: string;
                        createdAt: string;
                        tags: string[];
                        language: string;
                        description: string;
                        characterId: string;
                        deletedAt: string | null;
                        tagline: string | null;
                    }[];
                    likes: {
                        createdAt: string;
                        userId: string;
                        characterId: string;
                        deletedAt: string | null;
                    }[];
                    bookmarks: {
                        createdAt: string;
                        userId: string;
                        characterId: string;
                        deletedAt: string | null;
                    }[];
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
                    updatedAt: string;
                    version: string;
                    id: string;
                    createdAt: string;
                    coverUrl: string;
                    creatorId: string;
                    ownerId: string;
                    characterId: string;
                    avatarUrl: string | null;
                    creatorRole: string | null;
                    priceCredit: string;
                    likesCount: number;
                    bookmarksCount: number;
                    interactionsCount: number;
                    forksCount: number;
                    deletedAt: string | null;
                    cover: {
                        updatedAt: string;
                        id: string;
                        createdAt: string;
                        characterId: string;
                        deletedAt: string | null;
                        foregroundUrl: string;
                        backgroundUrl: string;
                    };
                    capabilities: {
                        type: keyof import("./types/character-capability").CharacterCapabilityConfig;
                        id: string;
                        characterId: string;
                        config: string | {
                            temperature: number;
                            model: string;
                        } | {
                            ssml: string;
                            voiceId: string;
                            speed: number;
                            pitch: number;
                        } | {
                            image: string;
                        } | {
                            audio: string;
                        };
                    }[];
                    avatarModels: {
                        type: keyof import("./types/character-avatar-model").AvatarModelConfig;
                        updatedAt: string;
                        id: string;
                        name: string;
                        createdAt: string;
                        description: string;
                        characterId: string;
                        deletedAt: string | null;
                        config: {
                            urls: string[];
                        } | {
                            urls: string[];
                        };
                    }[];
                    i18n: {
                        updatedAt: string;
                        id: string;
                        name: string;
                        createdAt: string;
                        tags: string[];
                        language: string;
                        description: string;
                        characterId: string;
                        deletedAt: string | null;
                        tagline: string | null;
                    }[];
                    prompts: {
                        type: "system" | "personality" | "greetings";
                        id: string;
                        content: string;
                        language: string;
                        characterId: string;
                    }[];
                    likes: {
                        createdAt: string;
                        userId: string;
                        characterId: string;
                        deletedAt: string | null;
                    }[];
                    bookmarks: {
                        createdAt: string;
                        userId: string;
                        characterId: string;
                        deletedAt: string | null;
                    }[];
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
                    version: string;
                    id: string;
                    createdAt: string;
                    coverUrl: string;
                    creatorId: string;
                    ownerId: string;
                    characterId: string;
                    avatarUrl: string | null;
                    creatorRole: string | null;
                    priceCredit: string;
                    likesCount: number;
                    bookmarksCount: number;
                    interactionsCount: number;
                    forksCount: number;
                    deletedAt: string | null;
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
                    version: string;
                    coverUrl: string;
                    creatorId: string;
                    ownerId: string;
                    characterId: string;
                    avatarUrl: string | null;
                    creatorRole: string | null;
                    priceCredit: string;
                    likesCount: number;
                    bookmarksCount: number;
                    interactionsCount: number;
                    forksCount: number;
                    createdAt: string;
                    updatedAt: string;
                    deletedAt: string | null;
                }[];
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
    } & {
        "/:id/like": {
            $post: {
                input: {
                    param: {
                        id: string;
                    };
                };
                output: {
                    liked: boolean;
                };
                outputFormat: "json";
                status: import("hono/utils/http-status").ContentfulStatusCode;
            };
        };
    } & {
        "/:id/bookmark": {
            $post: {
                input: {
                    param: {
                        id: string;
                    };
                };
                output: {
                    bookmarked: boolean;
                };
                outputFormat: "json";
                status: import("hono/utils/http-status").ContentfulStatusCode;
            };
        };
    }, "/api/v1/characters"> | import("hono/types").MergeSchemaPath<{
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
    }, "/api/v1/providers"> | import("hono/types").MergeSchemaPath<{
        "/": {
            $get: {
                input: {};
                output: {
                    updatedAt: string;
                    id: string;
                    name: string;
                    createdAt: string;
                    description: string | null;
                    model: string;
                    provider: string;
                    voiceId: string;
                    ttsModelId: string;
                    params: {
                        [x: string]: string | number | boolean | null;
                    };
                    costMultiplier: number;
                    enabled: boolean;
                }[];
                outputFormat: "json";
                status: import("hono/utils/http-status").ContentfulStatusCode;
            };
        };
    }, "/api/v1/voice-packs"> | import("hono/types").MergeSchemaPath<{
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
    }, "/api/v1/chats"> | import("hono/types").MergeSchemaPath<import("hono/types").BlankSchema, "/api/v1/openai"> | import("hono/types").MergeSchemaPath<import("hono/types").BlankSchema, "/api/v1/audio"> | import("hono/types").MergeSchemaPath<{
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
    }, "/api/v1/flux">, "/", "/">;
    injectWebSocket: (server: import("http").Server | import("http2").Http2Server | import("http2").Http2SecureServer) => void;
}>;
export type AppType = Awaited<ReturnType<typeof buildApp>>['app'];
export declare function createApp(): Promise<{
    app: import("hono/hono-base").HonoBase<HonoEnv, ({
        "/livez": {
            $get: {
                input: {};
                output: {
                    status: string;
                };
                outputFormat: "json";
                status: import("hono/utils/http-status").ContentfulStatusCode;
            };
        };
    } & {
        "/readyz": {
            $get: {
                input: {};
                output: {
                    status: string;
                    checks: {
                        db: string;
                        redis: string;
                    };
                };
                outputFormat: "json";
                status: 200 | 503;
            };
        };
    } & {
        "/": {
            $get: {
                input: {};
                output: {
                    service: string;
                    message: string;
                };
                outputFormat: "json";
                status: import("hono/utils/http-status").ContentfulStatusCode;
            };
        };
    }) | import("hono/types").MergeSchemaPath<{
        "/": {
            $get: {
                input: {};
                output: {
                    updatedAt: string;
                    version: string;
                    id: string;
                    createdAt: string;
                    coverUrl: string;
                    creatorId: string;
                    ownerId: string;
                    characterId: string;
                    avatarUrl: string | null;
                    creatorRole: string | null;
                    priceCredit: string;
                    likesCount: number;
                    bookmarksCount: number;
                    interactionsCount: number;
                    forksCount: number;
                    deletedAt: string | null;
                    cover: {
                        updatedAt: string;
                        id: string;
                        createdAt: string;
                        characterId: string;
                        deletedAt: string | null;
                        foregroundUrl: string;
                        backgroundUrl: string;
                    };
                    capabilities: {
                        type: keyof import("./types/character-capability").CharacterCapabilityConfig;
                        id: string;
                        characterId: string;
                        config: string | {
                            temperature: number;
                            model: string;
                        } | {
                            ssml: string;
                            voiceId: string;
                            speed: number;
                            pitch: number;
                        } | {
                            image: string;
                        } | {
                            audio: string;
                        };
                    }[];
                    i18n: {
                        updatedAt: string;
                        id: string;
                        name: string;
                        createdAt: string;
                        tags: string[];
                        language: string;
                        description: string;
                        characterId: string;
                        deletedAt: string | null;
                        tagline: string | null;
                    }[];
                    likes: {
                        createdAt: string;
                        userId: string;
                        characterId: string;
                        deletedAt: string | null;
                    }[];
                    bookmarks: {
                        createdAt: string;
                        userId: string;
                        characterId: string;
                        deletedAt: string | null;
                    }[];
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
                    updatedAt: string;
                    version: string;
                    id: string;
                    createdAt: string;
                    coverUrl: string;
                    creatorId: string;
                    ownerId: string;
                    characterId: string;
                    avatarUrl: string | null;
                    creatorRole: string | null;
                    priceCredit: string;
                    likesCount: number;
                    bookmarksCount: number;
                    interactionsCount: number;
                    forksCount: number;
                    deletedAt: string | null;
                    cover: {
                        updatedAt: string;
                        id: string;
                        createdAt: string;
                        characterId: string;
                        deletedAt: string | null;
                        foregroundUrl: string;
                        backgroundUrl: string;
                    };
                    capabilities: {
                        type: keyof import("./types/character-capability").CharacterCapabilityConfig;
                        id: string;
                        characterId: string;
                        config: string | {
                            temperature: number;
                            model: string;
                        } | {
                            ssml: string;
                            voiceId: string;
                            speed: number;
                            pitch: number;
                        } | {
                            image: string;
                        } | {
                            audio: string;
                        };
                    }[];
                    avatarModels: {
                        type: keyof import("./types/character-avatar-model").AvatarModelConfig;
                        updatedAt: string;
                        id: string;
                        name: string;
                        createdAt: string;
                        description: string;
                        characterId: string;
                        deletedAt: string | null;
                        config: {
                            urls: string[];
                        } | {
                            urls: string[];
                        };
                    }[];
                    i18n: {
                        updatedAt: string;
                        id: string;
                        name: string;
                        createdAt: string;
                        tags: string[];
                        language: string;
                        description: string;
                        characterId: string;
                        deletedAt: string | null;
                        tagline: string | null;
                    }[];
                    prompts: {
                        type: "system" | "personality" | "greetings";
                        id: string;
                        content: string;
                        language: string;
                        characterId: string;
                    }[];
                    likes: {
                        createdAt: string;
                        userId: string;
                        characterId: string;
                        deletedAt: string | null;
                    }[];
                    bookmarks: {
                        createdAt: string;
                        userId: string;
                        characterId: string;
                        deletedAt: string | null;
                    }[];
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
                    version: string;
                    id: string;
                    createdAt: string;
                    coverUrl: string;
                    creatorId: string;
                    ownerId: string;
                    characterId: string;
                    avatarUrl: string | null;
                    creatorRole: string | null;
                    priceCredit: string;
                    likesCount: number;
                    bookmarksCount: number;
                    interactionsCount: number;
                    forksCount: number;
                    deletedAt: string | null;
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
                    version: string;
                    coverUrl: string;
                    creatorId: string;
                    ownerId: string;
                    characterId: string;
                    avatarUrl: string | null;
                    creatorRole: string | null;
                    priceCredit: string;
                    likesCount: number;
                    bookmarksCount: number;
                    interactionsCount: number;
                    forksCount: number;
                    createdAt: string;
                    updatedAt: string;
                    deletedAt: string | null;
                }[];
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
    } & {
        "/:id/like": {
            $post: {
                input: {
                    param: {
                        id: string;
                    };
                };
                output: {
                    liked: boolean;
                };
                outputFormat: "json";
                status: import("hono/utils/http-status").ContentfulStatusCode;
            };
        };
    } & {
        "/:id/bookmark": {
            $post: {
                input: {
                    param: {
                        id: string;
                    };
                };
                output: {
                    bookmarked: boolean;
                };
                outputFormat: "json";
                status: import("hono/utils/http-status").ContentfulStatusCode;
            };
        };
    }, "/api/v1/characters"> | import("hono/types").MergeSchemaPath<{
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
    }, "/api/v1/providers"> | import("hono/types").MergeSchemaPath<{
        "/": {
            $get: {
                input: {};
                output: {
                    updatedAt: string;
                    id: string;
                    name: string;
                    createdAt: string;
                    description: string | null;
                    model: string;
                    provider: string;
                    voiceId: string;
                    ttsModelId: string;
                    params: {
                        [x: string]: string | number | boolean | null;
                    };
                    costMultiplier: number;
                    enabled: boolean;
                }[];
                outputFormat: "json";
                status: import("hono/utils/http-status").ContentfulStatusCode;
            };
        };
    }, "/api/v1/voice-packs"> | import("hono/types").MergeSchemaPath<{
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
    }, "/api/v1/chats"> | import("hono/types").MergeSchemaPath<import("hono/types").BlankSchema, "/api/v1/openai"> | import("hono/types").MergeSchemaPath<import("hono/types").BlankSchema, "/api/v1/audio"> | import("hono/types").MergeSchemaPath<{
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
    }, "/api/v1/flux">, "/", "/">;
    injectWebSocket: (server: import("http").Server | import("http2").Http2Server | import("http2").Http2SecureServer) => void;
    port: number;
    hostname: string;
}>;
export declare function runApiServer(): Promise<void>;

