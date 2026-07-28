export declare const client: {
    index: import("hono/client").ClientRequest<string, "/", {
        $get: {
            input: {};
            output: {
                service: string;
                message: string;
            };
            outputFormat: "json";
            status: import("hono/utils/http-status").ContentfulStatusCode;
        };
    }>;
} & {
    livez: import("hono/client").ClientRequest<string, "/livez", {
        $get: {
            input: {};
            output: {
                status: string;
            };
            outputFormat: "json";
            status: import("hono/utils/http-status").ContentfulStatusCode;
        };
    }>;
} & {
    readyz: import("hono/client").ClientRequest<string, "/readyz", {
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
    }>;
} & {
    api: {
        v1: {
            characters: import("hono/client").ClientRequest<string, "/api/v1/characters", {
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
                            type: keyof import("../../../../apps/server/src/types/character-capability").CharacterCapabilityConfig;
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
            }>;
        };
    };
} & {
    api: {
        v1: {
            characters: {
                ":id": import("hono/client").ClientRequest<string, "/api/v1/characters/:id", {
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
                                type: keyof import("../../../../apps/server/src/types/character-capability").CharacterCapabilityConfig;
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
                                type: keyof import("../../../../apps/server/src/types/character-avatar-model").AvatarModelConfig;
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
                }>;
            };
        };
    };
} & {
    api: {
        v1: {
            characters: {
                ":id": {
                    like: import("hono/client").ClientRequest<string, "/api/v1/characters/:id/like", {
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
                    }>;
                };
            };
        };
    };
} & {
    api: {
        v1: {
            characters: {
                ":id": {
                    bookmark: import("hono/client").ClientRequest<string, "/api/v1/characters/:id/bookmark", {
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
                    }>;
                };
            };
        };
    };
} & {
    api: {
        v1: {
            providers: import("hono/client").ClientRequest<string, "/api/v1/providers", {
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
            }>;
        };
    };
} & {
    api: {
        v1: {
            providers: {
                ":id": import("hono/client").ClientRequest<string, "/api/v1/providers/:id", {
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
                }>;
            };
        };
    };
} & {
    api: {
        v1: {
            "voice-packs": import("hono/client").ClientRequest<string, "/api/v1/voice-packs", {
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
            }>;
        };
    };
} & {
    api: {
        v1: {
            chats: import("hono/client").ClientRequest<string, "/api/v1/chats", {
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
            }>;
        };
    };
} & {
    api: {
        v1: {
            chats: {
                ":id": import("hono/client").ClientRequest<string, "/api/v1/chats/:id", {
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
                }>;
            };
        };
    };
} & {
    api: {
        v1: {
            chats: {
                ":id": {
                    members: import("hono/client").ClientRequest<string, "/api/v1/chats/:id/members", {
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
                    }>;
                };
            };
        };
    };
} & {
    api: {
        v1: {
            chats: {
                ":id": {
                    members: {
                        ":memberId": import("hono/client").ClientRequest<string, "/api/v1/chats/:id/members/:memberId", {
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
                        }>;
                    };
                };
            };
        };
    };
} & {
    api: {
        v1: {
            flux: import("hono/client").ClientRequest<string, "/api/v1/flux", {
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
            }>;
        };
    };
} & {
    api: {
        v1: {
            flux: {
                stats: import("hono/client").ClientRequest<string, "/api/v1/flux/stats", {
                    $get: {
                        input: {};
                        output: {
                            capacity: number;
                        };
                        outputFormat: "json";
                        status: import("hono/utils/http-status").ContentfulStatusCode;
                    };
                }>;
            };
        };
    };
} & {
    api: {
        v1: {
            flux: {
                history: import("hono/client").ClientRequest<string, "/api/v1/flux/history", {
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
                }>;
            };
        };
    };
};
export type StageApiClient = typeof client;
