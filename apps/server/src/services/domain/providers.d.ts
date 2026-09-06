import type { Database } from '../../libs/db';
import * as schema from '../../schemas/providers';
export declare function createProviderService(db: Database): {
    findAll(ownerId: string): Promise<{
        id: string;
        definitionId: string;
        name: string;
        config: unknown;
        validated: boolean;
        validationBypassed: boolean;
        createdAt: Date;
        updatedAt: Date;
        isSystem: boolean;
    }[]>;
    findUserConfigsByOwnerId(ownerId: string): Promise<{
        updatedAt: Date;
        id: string;
        name: string;
        createdAt: Date;
        ownerId: string;
        deletedAt: Date | null;
        config: unknown;
        definitionId: string;
        validated: boolean;
        validationBypassed: boolean;
    }[]>;
    findById(id: string, ownerId: string): Promise<{
        isSystem: boolean;
        updatedAt: Date;
        id: string;
        name: string;
        createdAt: Date;
        ownerId: string;
        deletedAt: Date | null;
        config: unknown;
        definitionId: string;
        validated: boolean;
        validationBypassed: boolean;
    } | {
        isSystem: boolean;
        updatedAt: Date;
        id: string;
        name: string;
        createdAt: Date;
        deletedAt: Date | null;
        config: unknown;
        definitionId: string;
        validated: boolean;
        validationBypassed: boolean;
    } | null>;
    findUserConfigById(id: string): Promise<{
        updatedAt: Date;
        id: string;
        name: string;
        createdAt: Date;
        ownerId: string;
        deletedAt: Date | null;
        config: unknown;
        definitionId: string;
        validated: boolean;
        validationBypassed: boolean;
    } | undefined>;
    createUserConfig(data: schema.NewUserProviderConfig): Promise<{
        updatedAt: Date;
        id: string;
        name: string;
        createdAt: Date;
        ownerId: string;
        deletedAt: Date | null;
        config: unknown;
        definitionId: string;
        validated: boolean;
        validationBypassed: boolean;
    }>;
    updateUserConfig(id: string, data: Partial<schema.NewUserProviderConfig>): Promise<{
        id: string;
        ownerId: string;
        definitionId: string;
        name: string;
        config: unknown;
        validated: boolean;
        validationBypassed: boolean;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }>;
    deleteUserConfig(id: string): Promise<{
        id: string;
        ownerId: string;
        definitionId: string;
        name: string;
        config: unknown;
        validated: boolean;
        validationBypassed: boolean;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }[]>;
    findSystemConfigs(): Promise<{
        updatedAt: Date;
        id: string;
        name: string;
        createdAt: Date;
        deletedAt: Date | null;
        config: unknown;
        definitionId: string;
        validated: boolean;
        validationBypassed: boolean;
    }[]>;
    findSystemConfigById(id: string): Promise<{
        updatedAt: Date;
        id: string;
        name: string;
        createdAt: Date;
        deletedAt: Date | null;
        config: unknown;
        definitionId: string;
        validated: boolean;
        validationBypassed: boolean;
    } | undefined>;
    createSystemConfig(data: schema.NewSystemProviderConfig): Promise<{
        updatedAt: Date;
        id: string;
        name: string;
        createdAt: Date;
        deletedAt: Date | null;
        config: unknown;
        definitionId: string;
        validated: boolean;
        validationBypassed: boolean;
    }>;
    updateSystemConfig(id: string, data: Partial<schema.NewSystemProviderConfig>): Promise<{
        id: string;
        definitionId: string;
        name: string;
        config: unknown;
        validated: boolean;
        validationBypassed: boolean;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }>;
    deleteSystemConfig(id: string): Promise<{
        id: string;
        definitionId: string;
        name: string;
        config: unknown;
        validated: boolean;
        validationBypassed: boolean;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }[]>;
    /**
     * Soft-delete every `user_provider_configs` row owned by the user.
     * Called from the user-deletion pipeline. System configs are not
     * touched (they are not user-scoped).
     *
     * Idempotent: `WHERE deletedAt IS NULL` skips already-stamped rows.
     */
    deleteAllForUser(userId: string): Promise<void>;
};
export type ProviderService = ReturnType<typeof createProviderService>;
