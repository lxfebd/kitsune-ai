import type { CharacterService } from '../../services/domain/characters';
import type { HonoEnv } from '../../types/hono';
export declare function createCharacterRoutes(characterService: CharacterService): import("hono/hono-base").HonoBase<HonoEnv, {
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
                    type: keyof import("../../types/character-capability").CharacterCapabilityConfig;
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
                    type: keyof import("../../types/character-capability").CharacterCapabilityConfig;
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
                    type: keyof import("../../types/character-avatar-model").AvatarModelConfig;
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
}, "/", "/:id/bookmark">;
