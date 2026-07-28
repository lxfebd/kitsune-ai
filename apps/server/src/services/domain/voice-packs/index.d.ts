import type { InferOutput } from 'valibot';
import type { Database } from '../../../libs/db';
import type { VoicePack } from '../../../schemas/voice-packs';
import * as schema from '../../../schemas/voice-packs';
export declare const VoicePackParamsSchema: import("valibot").RecordSchema<import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "params keys must not be empty">, import("valibot").MaxLengthAction<string, 100, undefined>]>, import("valibot").UnionSchema<[import("valibot").StringSchema<undefined>, import("valibot").NumberSchema<undefined>, import("valibot").BooleanSchema<undefined>, import("valibot").NullSchema<undefined>], undefined>, undefined>;
export declare const VoicePackCostMultiplierSchema: import("valibot").SchemaWithPipe<readonly [import("valibot").NumberSchema<undefined>, import("valibot").MinValueAction<number, 0, "costMultiplier must not be negative">]>;
export declare const CreateVoicePackInputSchema: import("valibot").ObjectSchema<{
    readonly name: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "name is required">, import("valibot").MaxLengthAction<string, 120, undefined>]>;
    readonly description: import("valibot").OptionalSchema<import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").MaxLengthAction<string, 500, undefined>]>, undefined>;
    readonly provider: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "provider is required">, import("valibot").MaxLengthAction<string, 100, undefined>]>;
    readonly model: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "model is required">, import("valibot").MaxLengthAction<string, 200, undefined>]>;
    readonly voiceId: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "voiceId is required">, import("valibot").MaxLengthAction<string, 200, undefined>]>;
    readonly ttsModelId: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "ttsModelId is required">, import("valibot").MaxLengthAction<string, 200, undefined>]>;
    readonly params: import("valibot").OptionalSchema<import("valibot").RecordSchema<import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "params keys must not be empty">, import("valibot").MaxLengthAction<string, 100, undefined>]>, import("valibot").UnionSchema<[import("valibot").StringSchema<undefined>, import("valibot").NumberSchema<undefined>, import("valibot").BooleanSchema<undefined>, import("valibot").NullSchema<undefined>], undefined>, undefined>, {}>;
    readonly costMultiplier: import("valibot").SchemaWithPipe<readonly [import("valibot").NumberSchema<undefined>, import("valibot").MinValueAction<number, 0, "costMultiplier must not be negative">]>;
    readonly enabled: import("valibot").OptionalSchema<import("valibot").BooleanSchema<undefined>, true>;
}, undefined>;
export declare const UpdateVoicePackInputSchema: import("valibot").ObjectSchema<{
    readonly name: import("valibot").OptionalSchema<import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "name must not be empty">, import("valibot").MaxLengthAction<string, 120, undefined>]>, undefined>;
    readonly description: import("valibot").OptionalSchema<import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").MaxLengthAction<string, 500, undefined>]>, undefined>;
    readonly provider: import("valibot").OptionalSchema<import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "provider must not be empty">, import("valibot").MaxLengthAction<string, 100, undefined>]>, undefined>;
    readonly model: import("valibot").OptionalSchema<import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "model must not be empty">, import("valibot").MaxLengthAction<string, 200, undefined>]>, undefined>;
    readonly voiceId: import("valibot").OptionalSchema<import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "voiceId must not be empty">, import("valibot").MaxLengthAction<string, 200, undefined>]>, undefined>;
    readonly ttsModelId: import("valibot").OptionalSchema<import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "ttsModelId must not be empty">, import("valibot").MaxLengthAction<string, 200, undefined>]>, undefined>;
    readonly params: import("valibot").OptionalSchema<import("valibot").RecordSchema<import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "params keys must not be empty">, import("valibot").MaxLengthAction<string, 100, undefined>]>, import("valibot").UnionSchema<[import("valibot").StringSchema<undefined>, import("valibot").NumberSchema<undefined>, import("valibot").BooleanSchema<undefined>, import("valibot").NullSchema<undefined>], undefined>, undefined>, undefined>;
    readonly costMultiplier: import("valibot").OptionalSchema<import("valibot").SchemaWithPipe<readonly [import("valibot").NumberSchema<undefined>, import("valibot").MinValueAction<number, 0, "costMultiplier must not be negative">]>, undefined>;
    readonly enabled: import("valibot").OptionalSchema<import("valibot").BooleanSchema<undefined>, undefined>;
}, undefined>;
/**
 * Voice Pack creation input accepted by the admin service.
 */
export type CreateVoicePackInput = InferOutput<typeof CreateVoicePackInputSchema>;
/**
 * Voice Pack update input accepted by the admin service.
 */
export type UpdateVoicePackInput = InferOutput<typeof UpdateVoicePackInputSchema>;
/**
 * Handles the curated server-side Voice Pack library.
 *
 * Use when:
 * - Admin routes create, update, disable, or list curated cloud-provider voices.
 * - Client routes need the enabled-only market list for binding.
 *
 * Expects:
 * - HTTP routes validate input with the exported Valibot schemas before calling.
 *
 * Returns:
 * - CRUD methods that preserve rows and use `enabled=false` as soft disable.
 */
export declare function createVoicePackService(db: Database): {
    create(input: CreateVoicePackInput): Promise<{
        updatedAt: Date;
        id: string;
        name: string;
        createdAt: Date;
        description: string | null;
        model: string;
        provider: string;
        voiceId: string;
        ttsModelId: string;
        params: schema.VoicePackParams;
        costMultiplier: number;
        enabled: boolean;
    }>;
    list(): Promise<{
        updatedAt: Date;
        id: string;
        name: string;
        createdAt: Date;
        description: string | null;
        model: string;
        provider: string;
        voiceId: string;
        ttsModelId: string;
        params: schema.VoicePackParams;
        costMultiplier: number;
        enabled: boolean;
    }[]>;
    listEnabled(): Promise<{
        updatedAt: Date;
        id: string;
        name: string;
        createdAt: Date;
        description: string | null;
        model: string;
        provider: string;
        voiceId: string;
        ttsModelId: string;
        params: schema.VoicePackParams;
        costMultiplier: number;
        enabled: boolean;
    }[]>;
    findById(id: string): Promise<{
        updatedAt: Date;
        id: string;
        name: string;
        createdAt: Date;
        description: string | null;
        model: string;
        provider: string;
        voiceId: string;
        ttsModelId: string;
        params: schema.VoicePackParams;
        costMultiplier: number;
        enabled: boolean;
    } | undefined>;
    update(id: string, input: UpdateVoicePackInput): Promise<VoicePack | null>;
    disable(id: string): Promise<VoicePack | null>;
};
export type VoicePackService = ReturnType<typeof createVoicePackService>;
