export declare const CreateChatSchema: import("valibot").ObjectSchema<{
    readonly id: import("valibot").OptionalSchema<import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").MinLengthAction<string, 1, undefined>, import("valibot").MaxLengthAction<string, 30, undefined>]>, undefined>;
    readonly type: import("valibot").OptionalSchema<import("valibot").UnionSchema<[import("valibot").LiteralSchema<"private", undefined>, import("valibot").LiteralSchema<"bot", undefined>, import("valibot").LiteralSchema<"group", undefined>, import("valibot").LiteralSchema<"channel", undefined>], undefined>, undefined>;
    readonly title: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
    readonly members: import("valibot").OptionalSchema<import("valibot").ArraySchema<import("valibot").ObjectSchema<{
        readonly type: import("valibot").UnionSchema<[import("valibot").LiteralSchema<"user", undefined>, import("valibot").LiteralSchema<"character", undefined>, import("valibot").LiteralSchema<"bot", undefined>], undefined>;
        readonly userId: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
        readonly characterId: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
    }, undefined>, undefined>, undefined>;
}, undefined>;
export declare const UpdateChatSchema: import("valibot").ObjectSchema<{
    readonly title: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
}, undefined>;
export declare const AddMemberSchema: import("valibot").ObjectSchema<{
    readonly type: import("valibot").UnionSchema<[import("valibot").LiteralSchema<"user", undefined>, import("valibot").LiteralSchema<"character", undefined>, import("valibot").LiteralSchema<"bot", undefined>], undefined>;
    readonly userId: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
    readonly characterId: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
}, undefined>;
