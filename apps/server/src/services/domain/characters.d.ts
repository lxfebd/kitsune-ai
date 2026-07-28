import type { Database } from '../../libs/db';
import type { EngagementMetrics } from '../../otel';
import * as schema from '../../schemas/characters';
export declare function createCharacterService(db: Database, metrics?: EngagementMetrics | null): {
    findById(id: string): Promise<{
        updatedAt: Date;
        version: string;
        id: string;
        createdAt: Date;
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
        deletedAt: Date | null;
        cover: {
            updatedAt: Date;
            id: string;
            createdAt: Date;
            characterId: string;
            deletedAt: Date | null;
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
            updatedAt: Date;
            id: string;
            name: string;
            createdAt: Date;
            description: string;
            characterId: string;
            deletedAt: Date | null;
            config: {
                urls: string[];
            } | {
                urls: string[];
            };
        }[];
        i18n: {
            updatedAt: Date;
            id: string;
            name: string;
            createdAt: Date;
            tags: string[];
            language: string;
            description: string;
            characterId: string;
            deletedAt: Date | null;
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
            createdAt: Date;
            userId: string;
            characterId: string;
            deletedAt: Date | null;
        }[];
        bookmarks: {
            createdAt: Date;
            userId: string;
            characterId: string;
            deletedAt: Date | null;
        }[];
    } | undefined>;
    findByOwnerId(ownerId: string): Promise<{
        updatedAt: Date;
        version: string;
        id: string;
        createdAt: Date;
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
        deletedAt: Date | null;
        cover: {
            updatedAt: Date;
            id: string;
            createdAt: Date;
            characterId: string;
            deletedAt: Date | null;
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
            updatedAt: Date;
            id: string;
            name: string;
            createdAt: Date;
            tags: string[];
            language: string;
            description: string;
            characterId: string;
            deletedAt: Date | null;
            tagline: string | null;
        }[];
        likes: {
            createdAt: Date;
            userId: string;
            characterId: string;
            deletedAt: Date | null;
        }[];
        bookmarks: {
            createdAt: Date;
            userId: string;
            characterId: string;
            deletedAt: Date | null;
        }[];
    }[]>;
    findAll(): Promise<{
        updatedAt: Date;
        version: string;
        id: string;
        createdAt: Date;
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
        deletedAt: Date | null;
        cover: {
            updatedAt: Date;
            id: string;
            createdAt: Date;
            characterId: string;
            deletedAt: Date | null;
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
            updatedAt: Date;
            id: string;
            name: string;
            createdAt: Date;
            tags: string[];
            language: string;
            description: string;
            characterId: string;
            deletedAt: Date | null;
            tagline: string | null;
        }[];
        likes: {
            createdAt: Date;
            userId: string;
            characterId: string;
            deletedAt: Date | null;
        }[];
        bookmarks: {
            createdAt: Date;
            userId: string;
            characterId: string;
            deletedAt: Date | null;
        }[];
    }[]>;
    like(userId: string, characterId: string): Promise<{
        liked: boolean;
    }>;
    bookmark(userId: string, characterId: string): Promise<{
        bookmarked: boolean;
    }>;
    create(data: {
        character: schema.NewCharacter;
        cover?: Omit<schema.NewCharacterCover, "characterId">;
        capabilities?: Omit<schema.NewCharacterCapability, "characterId">[];
        avatarModels?: Omit<schema.NewAvatarModel, "characterId">[];
        i18n?: Omit<schema.NewCharacterI18n, "characterId">[];
        prompts?: Omit<schema.NewCharacterPrompt, "characterId">[];
    }): Promise<{
        updatedAt: Date;
        version: string;
        id: string;
        createdAt: Date;
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
        deletedAt: Date | null;
    }>;
    update(id: string, data: Partial<schema.NewCharacter>): Promise<{
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
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }[]>;
    delete(id: string): Promise<{
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
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }[]>;
    /**
     * Soft-delete every character owned or created by the user, plus their
     * likes and bookmarks. Called from the user-deletion pipeline.
     *
     * Marks `creatorId === userId` rows too — fork attribution is tied to the
     * creator's identity, so removing the creator soft-archives the lineage
     * even if the current owner is someone else.
     *
     * Idempotent: `WHERE deletedAt IS NULL` skips already-stamped rows.
     */
    deleteAllForUser(userId: string): Promise<void>;
};
export type CharacterService = ReturnType<typeof createCharacterService>;
