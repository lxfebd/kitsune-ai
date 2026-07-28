import type { InferOutput } from 'valibot';
export declare const AvatarModelConfigSchema: import("valibot").ObjectSchema<{
    readonly vrm: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
        readonly urls: import("valibot").ArraySchema<import("valibot").StringSchema<undefined>, undefined>;
    }, undefined>, undefined>;
    readonly live2d: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
        readonly urls: import("valibot").ArraySchema<import("valibot").StringSchema<undefined>, undefined>;
    }, undefined>, undefined>;
    readonly spine: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
        readonly urls: import("valibot").ArraySchema<import("valibot").StringSchema<undefined>, undefined>;
    }, undefined>, undefined>;
}, undefined>;
export declare const CharacterCapabilityConfigSchema: import("valibot").ObjectSchema<{
    readonly apiKey: import("valibot").StringSchema<undefined>;
    readonly apiBaseUrl: import("valibot").StringSchema<undefined>;
    readonly llm: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
        readonly temperature: import("valibot").NumberSchema<undefined>;
        readonly model: import("valibot").StringSchema<undefined>;
    }, undefined>, undefined>;
    readonly tts: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
        readonly ssml: import("valibot").StringSchema<undefined>;
        readonly voiceId: import("valibot").StringSchema<undefined>;
        readonly speed: import("valibot").NumberSchema<undefined>;
        readonly pitch: import("valibot").NumberSchema<undefined>;
    }, undefined>, undefined>;
    readonly vlm: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
        readonly image: import("valibot").StringSchema<undefined>;
    }, undefined>, undefined>;
    readonly asr: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
        readonly audio: import("valibot").StringSchema<undefined>;
    }, undefined>, undefined>;
}, undefined>;
export declare const CharacterBaseSchema: import("valibot").ObjectSchema<{
    readonly id: import("valibot").StringSchema<undefined>;
    readonly version: import("valibot").StringSchema<undefined>;
    readonly coverUrl: import("valibot").StringSchema<undefined>;
    readonly avatarUrl: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
    readonly characterAvatarUrl: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
    readonly coverBackgroundUrl: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
    readonly creatorRole: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
    readonly priceCredit: import("valibot").StringSchema<undefined>;
    readonly likesCount: import("valibot").NumberSchema<undefined>;
    readonly bookmarksCount: import("valibot").NumberSchema<undefined>;
    readonly interactionsCount: import("valibot").NumberSchema<undefined>;
    readonly forksCount: import("valibot").NumberSchema<undefined>;
    readonly creatorId: import("valibot").StringSchema<undefined>;
    readonly ownerId: import("valibot").StringSchema<undefined>;
    readonly characterId: import("valibot").StringSchema<undefined>;
    readonly createdAt: import("valibot").SchemaWithPipe<readonly [import("valibot").UnionSchema<[import("valibot").StringSchema<undefined>, import("valibot").DateSchema<undefined>], undefined>, import("valibot").TransformAction<string | Date, Date>]>;
    readonly updatedAt: import("valibot").SchemaWithPipe<readonly [import("valibot").UnionSchema<[import("valibot").StringSchema<undefined>, import("valibot").DateSchema<undefined>], undefined>, import("valibot").TransformAction<string | Date, Date>]>;
    readonly deletedAt: import("valibot").OptionalSchema<import("valibot").SchemaWithPipe<readonly [import("valibot").UnionSchema<[import("valibot").StringSchema<undefined>, import("valibot").DateSchema<undefined>], undefined>, import("valibot").TransformAction<string | Date, Date>]>, undefined>;
}, undefined>;
export declare const CharacterCapabilitySchema: import("valibot").ObjectSchema<{
    readonly id: import("valibot").StringSchema<undefined>;
    readonly characterId: import("valibot").StringSchema<undefined>;
    readonly type: import("valibot").UnionSchema<[import("valibot").LiteralSchema<"llm", undefined>, import("valibot").LiteralSchema<"tts", undefined>, import("valibot").LiteralSchema<"vlm", undefined>, import("valibot").LiteralSchema<"asr", undefined>], undefined>;
    readonly config: import("valibot").ObjectSchema<{
        readonly apiKey: import("valibot").StringSchema<undefined>;
        readonly apiBaseUrl: import("valibot").StringSchema<undefined>;
        readonly llm: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
            readonly temperature: import("valibot").NumberSchema<undefined>;
            readonly model: import("valibot").StringSchema<undefined>;
        }, undefined>, undefined>;
        readonly tts: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
            readonly ssml: import("valibot").StringSchema<undefined>;
            readonly voiceId: import("valibot").StringSchema<undefined>;
            readonly speed: import("valibot").NumberSchema<undefined>;
            readonly pitch: import("valibot").NumberSchema<undefined>;
        }, undefined>, undefined>;
        readonly vlm: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
            readonly image: import("valibot").StringSchema<undefined>;
        }, undefined>, undefined>;
        readonly asr: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
            readonly audio: import("valibot").StringSchema<undefined>;
        }, undefined>, undefined>;
    }, undefined>;
}, undefined>;
export declare const AvatarModelSchema: import("valibot").ObjectSchema<{
    readonly id: import("valibot").StringSchema<undefined>;
    readonly characterId: import("valibot").StringSchema<undefined>;
    readonly name: import("valibot").StringSchema<undefined>;
    readonly type: import("valibot").UnionSchema<[import("valibot").LiteralSchema<"vrm", undefined>, import("valibot").LiteralSchema<"live2d", undefined>, import("valibot").LiteralSchema<"spine", undefined>], undefined>;
    readonly description: import("valibot").StringSchema<undefined>;
    readonly config: import("valibot").ObjectSchema<{
        readonly vrm: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
            readonly urls: import("valibot").ArraySchema<import("valibot").StringSchema<undefined>, undefined>;
        }, undefined>, undefined>;
        readonly live2d: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
            readonly urls: import("valibot").ArraySchema<import("valibot").StringSchema<undefined>, undefined>;
        }, undefined>, undefined>;
        readonly spine: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
            readonly urls: import("valibot").ArraySchema<import("valibot").StringSchema<undefined>, undefined>;
        }, undefined>, undefined>;
    }, undefined>;
    readonly createdAt: import("valibot").SchemaWithPipe<readonly [import("valibot").UnionSchema<[import("valibot").StringSchema<undefined>, import("valibot").DateSchema<undefined>], undefined>, import("valibot").TransformAction<string | Date, Date>]>;
    readonly updatedAt: import("valibot").SchemaWithPipe<readonly [import("valibot").UnionSchema<[import("valibot").StringSchema<undefined>, import("valibot").DateSchema<undefined>], undefined>, import("valibot").TransformAction<string | Date, Date>]>;
}, undefined>;
export declare const CharacterI18nSchema: import("valibot").ObjectSchema<{
    readonly id: import("valibot").StringSchema<undefined>;
    readonly characterId: import("valibot").StringSchema<undefined>;
    readonly language: import("valibot").StringSchema<undefined>;
    readonly name: import("valibot").StringSchema<undefined>;
    readonly tagline: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
    readonly description: import("valibot").StringSchema<undefined>;
    readonly tags: import("valibot").ArraySchema<import("valibot").StringSchema<undefined>, undefined>;
    readonly createdAt: import("valibot").SchemaWithPipe<readonly [import("valibot").UnionSchema<[import("valibot").StringSchema<undefined>, import("valibot").DateSchema<undefined>], undefined>, import("valibot").TransformAction<string | Date, Date>]>;
    readonly updatedAt: import("valibot").SchemaWithPipe<readonly [import("valibot").UnionSchema<[import("valibot").StringSchema<undefined>, import("valibot").DateSchema<undefined>], undefined>, import("valibot").TransformAction<string | Date, Date>]>;
}, undefined>;
export declare const CharacterPromptSchema: import("valibot").ObjectSchema<{
    readonly id: import("valibot").StringSchema<undefined>;
    readonly characterId: import("valibot").StringSchema<undefined>;
    readonly language: import("valibot").StringSchema<undefined>;
    readonly type: import("valibot").UnionSchema<[import("valibot").LiteralSchema<"system", undefined>, import("valibot").LiteralSchema<"personality", undefined>, import("valibot").LiteralSchema<"greetings", undefined>], undefined>;
    readonly content: import("valibot").StringSchema<undefined>;
}, undefined>;
export declare const CharacterWithRelationsSchema: import("valibot").ObjectSchema<{
    readonly capabilities: import("valibot").OptionalSchema<import("valibot").ArraySchema<import("valibot").ObjectSchema<{
        readonly id: import("valibot").StringSchema<undefined>;
        readonly characterId: import("valibot").StringSchema<undefined>;
        readonly type: import("valibot").UnionSchema<[import("valibot").LiteralSchema<"llm", undefined>, import("valibot").LiteralSchema<"tts", undefined>, import("valibot").LiteralSchema<"vlm", undefined>, import("valibot").LiteralSchema<"asr", undefined>], undefined>;
        readonly config: import("valibot").ObjectSchema<{
            readonly apiKey: import("valibot").StringSchema<undefined>;
            readonly apiBaseUrl: import("valibot").StringSchema<undefined>;
            readonly llm: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
                readonly temperature: import("valibot").NumberSchema<undefined>;
                readonly model: import("valibot").StringSchema<undefined>;
            }, undefined>, undefined>;
            readonly tts: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
                readonly ssml: import("valibot").StringSchema<undefined>;
                readonly voiceId: import("valibot").StringSchema<undefined>;
                readonly speed: import("valibot").NumberSchema<undefined>;
                readonly pitch: import("valibot").NumberSchema<undefined>;
            }, undefined>, undefined>;
            readonly vlm: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
                readonly image: import("valibot").StringSchema<undefined>;
            }, undefined>, undefined>;
            readonly asr: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
                readonly audio: import("valibot").StringSchema<undefined>;
            }, undefined>, undefined>;
        }, undefined>;
    }, undefined>, undefined>, undefined>;
    readonly avatarModels: import("valibot").OptionalSchema<import("valibot").ArraySchema<import("valibot").ObjectSchema<{
        readonly id: import("valibot").StringSchema<undefined>;
        readonly characterId: import("valibot").StringSchema<undefined>;
        readonly name: import("valibot").StringSchema<undefined>;
        readonly type: import("valibot").UnionSchema<[import("valibot").LiteralSchema<"vrm", undefined>, import("valibot").LiteralSchema<"live2d", undefined>, import("valibot").LiteralSchema<"spine", undefined>], undefined>;
        readonly description: import("valibot").StringSchema<undefined>;
        readonly config: import("valibot").ObjectSchema<{
            readonly vrm: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
                readonly urls: import("valibot").ArraySchema<import("valibot").StringSchema<undefined>, undefined>;
            }, undefined>, undefined>;
            readonly live2d: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
                readonly urls: import("valibot").ArraySchema<import("valibot").StringSchema<undefined>, undefined>;
            }, undefined>, undefined>;
            readonly spine: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
                readonly urls: import("valibot").ArraySchema<import("valibot").StringSchema<undefined>, undefined>;
            }, undefined>, undefined>;
        }, undefined>;
        readonly createdAt: import("valibot").SchemaWithPipe<readonly [import("valibot").UnionSchema<[import("valibot").StringSchema<undefined>, import("valibot").DateSchema<undefined>], undefined>, import("valibot").TransformAction<string | Date, Date>]>;
        readonly updatedAt: import("valibot").SchemaWithPipe<readonly [import("valibot").UnionSchema<[import("valibot").StringSchema<undefined>, import("valibot").DateSchema<undefined>], undefined>, import("valibot").TransformAction<string | Date, Date>]>;
    }, undefined>, undefined>, undefined>;
    readonly i18n: import("valibot").OptionalSchema<import("valibot").ArraySchema<import("valibot").ObjectSchema<{
        readonly id: import("valibot").StringSchema<undefined>;
        readonly characterId: import("valibot").StringSchema<undefined>;
        readonly language: import("valibot").StringSchema<undefined>;
        readonly name: import("valibot").StringSchema<undefined>;
        readonly tagline: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
        readonly description: import("valibot").StringSchema<undefined>;
        readonly tags: import("valibot").ArraySchema<import("valibot").StringSchema<undefined>, undefined>;
        readonly createdAt: import("valibot").SchemaWithPipe<readonly [import("valibot").UnionSchema<[import("valibot").StringSchema<undefined>, import("valibot").DateSchema<undefined>], undefined>, import("valibot").TransformAction<string | Date, Date>]>;
        readonly updatedAt: import("valibot").SchemaWithPipe<readonly [import("valibot").UnionSchema<[import("valibot").StringSchema<undefined>, import("valibot").DateSchema<undefined>], undefined>, import("valibot").TransformAction<string | Date, Date>]>;
    }, undefined>, undefined>, undefined>;
    readonly prompts: import("valibot").OptionalSchema<import("valibot").ArraySchema<import("valibot").ObjectSchema<{
        readonly id: import("valibot").StringSchema<undefined>;
        readonly characterId: import("valibot").StringSchema<undefined>;
        readonly language: import("valibot").StringSchema<undefined>;
        readonly type: import("valibot").UnionSchema<[import("valibot").LiteralSchema<"system", undefined>, import("valibot").LiteralSchema<"personality", undefined>, import("valibot").LiteralSchema<"greetings", undefined>], undefined>;
        readonly content: import("valibot").StringSchema<undefined>;
    }, undefined>, undefined>, undefined>;
    readonly likes: import("valibot").OptionalSchema<import("valibot").ArraySchema<import("valibot").ObjectSchema<{
        readonly userId: import("valibot").StringSchema<undefined>;
        readonly characterId: import("valibot").StringSchema<undefined>;
    }, undefined>, undefined>, undefined>;
    readonly bookmarks: import("valibot").OptionalSchema<import("valibot").ArraySchema<import("valibot").ObjectSchema<{
        readonly userId: import("valibot").StringSchema<undefined>;
        readonly characterId: import("valibot").StringSchema<undefined>;
    }, undefined>, undefined>, undefined>;
    readonly id: import("valibot").StringSchema<undefined>;
    readonly version: import("valibot").StringSchema<undefined>;
    readonly coverUrl: import("valibot").StringSchema<undefined>;
    readonly avatarUrl: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
    readonly characterAvatarUrl: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
    readonly coverBackgroundUrl: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
    readonly creatorRole: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
    readonly priceCredit: import("valibot").StringSchema<undefined>;
    readonly likesCount: import("valibot").NumberSchema<undefined>;
    readonly bookmarksCount: import("valibot").NumberSchema<undefined>;
    readonly interactionsCount: import("valibot").NumberSchema<undefined>;
    readonly forksCount: import("valibot").NumberSchema<undefined>;
    readonly creatorId: import("valibot").StringSchema<undefined>;
    readonly ownerId: import("valibot").StringSchema<undefined>;
    readonly characterId: import("valibot").StringSchema<undefined>;
    readonly createdAt: import("valibot").SchemaWithPipe<readonly [import("valibot").UnionSchema<[import("valibot").StringSchema<undefined>, import("valibot").DateSchema<undefined>], undefined>, import("valibot").TransformAction<string | Date, Date>]>;
    readonly updatedAt: import("valibot").SchemaWithPipe<readonly [import("valibot").UnionSchema<[import("valibot").StringSchema<undefined>, import("valibot").DateSchema<undefined>], undefined>, import("valibot").TransformAction<string | Date, Date>]>;
    readonly deletedAt: import("valibot").OptionalSchema<import("valibot").SchemaWithPipe<readonly [import("valibot").UnionSchema<[import("valibot").StringSchema<undefined>, import("valibot").DateSchema<undefined>], undefined>, import("valibot").TransformAction<string | Date, Date>]>, undefined>;
}, undefined>;
export declare const CreateCharacterSchema: import("valibot").ObjectSchema<{
    readonly character: import("valibot").ObjectSchema<{
        readonly id: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
        readonly version: import("valibot").StringSchema<undefined>;
        readonly coverUrl: import("valibot").StringSchema<undefined>;
        readonly characterId: import("valibot").StringSchema<undefined>;
    }, undefined>;
    readonly capabilities: import("valibot").OptionalSchema<import("valibot").ArraySchema<import("valibot").ObjectSchema<{
        readonly type: import("valibot").UnionSchema<[import("valibot").LiteralSchema<"llm", undefined>, import("valibot").LiteralSchema<"tts", undefined>, import("valibot").LiteralSchema<"vlm", undefined>, import("valibot").LiteralSchema<"asr", undefined>], undefined>;
        readonly config: import("valibot").ObjectSchema<{
            readonly apiKey: import("valibot").StringSchema<undefined>;
            readonly apiBaseUrl: import("valibot").StringSchema<undefined>;
            readonly llm: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
                readonly temperature: import("valibot").NumberSchema<undefined>;
                readonly model: import("valibot").StringSchema<undefined>;
            }, undefined>, undefined>;
            readonly tts: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
                readonly ssml: import("valibot").StringSchema<undefined>;
                readonly voiceId: import("valibot").StringSchema<undefined>;
                readonly speed: import("valibot").NumberSchema<undefined>;
                readonly pitch: import("valibot").NumberSchema<undefined>;
            }, undefined>, undefined>;
            readonly vlm: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
                readonly image: import("valibot").StringSchema<undefined>;
            }, undefined>, undefined>;
            readonly asr: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
                readonly audio: import("valibot").StringSchema<undefined>;
            }, undefined>, undefined>;
        }, undefined>;
    }, undefined>, undefined>, undefined>;
    readonly avatarModels: import("valibot").OptionalSchema<import("valibot").ArraySchema<import("valibot").ObjectSchema<{
        readonly name: import("valibot").StringSchema<undefined>;
        readonly type: import("valibot").UnionSchema<[import("valibot").LiteralSchema<"vrm", undefined>, import("valibot").LiteralSchema<"live2d", undefined>, import("valibot").LiteralSchema<"spine", undefined>], undefined>;
        readonly description: import("valibot").StringSchema<undefined>;
        readonly config: import("valibot").ObjectSchema<{
            readonly vrm: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
                readonly urls: import("valibot").ArraySchema<import("valibot").StringSchema<undefined>, undefined>;
            }, undefined>, undefined>;
            readonly live2d: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
                readonly urls: import("valibot").ArraySchema<import("valibot").StringSchema<undefined>, undefined>;
            }, undefined>, undefined>;
            readonly spine: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
                readonly urls: import("valibot").ArraySchema<import("valibot").StringSchema<undefined>, undefined>;
            }, undefined>, undefined>;
        }, undefined>;
    }, undefined>, undefined>, undefined>;
    readonly i18n: import("valibot").OptionalSchema<import("valibot").ArraySchema<import("valibot").ObjectSchema<{
        readonly language: import("valibot").StringSchema<undefined>;
        readonly name: import("valibot").StringSchema<undefined>;
        readonly description: import("valibot").StringSchema<undefined>;
        readonly tags: import("valibot").ArraySchema<import("valibot").StringSchema<undefined>, undefined>;
    }, undefined>, undefined>, undefined>;
    readonly prompts: import("valibot").OptionalSchema<import("valibot").ArraySchema<import("valibot").ObjectSchema<{
        readonly language: import("valibot").StringSchema<undefined>;
        readonly type: import("valibot").UnionSchema<[import("valibot").LiteralSchema<"system", undefined>, import("valibot").LiteralSchema<"personality", undefined>, import("valibot").LiteralSchema<"greetings", undefined>], undefined>;
        readonly content: import("valibot").StringSchema<undefined>;
    }, undefined>, undefined>, undefined>;
}, undefined>;
export declare const UpdateCharacterSchema: import("valibot").ObjectSchema<{
    readonly version: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
    readonly coverUrl: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
    readonly characterId: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
}, undefined>;
export type Character = InferOutput<typeof CharacterWithRelationsSchema>;
export type CharacterBase = InferOutput<typeof CharacterBaseSchema>;
export type CharacterCapability = InferOutput<typeof CharacterCapabilitySchema>;
export type AvatarModel = InferOutput<typeof AvatarModelSchema>;
export type CharacterI18n = InferOutput<typeof CharacterI18nSchema>;
export type CharacterPrompt = InferOutput<typeof CharacterPromptSchema>;
export type CreateCharacterPayload = InferOutput<typeof CreateCharacterSchema>;
export type UpdateCharacterPayload = InferOutput<typeof UpdateCharacterSchema>;
