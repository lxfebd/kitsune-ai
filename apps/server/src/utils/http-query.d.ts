interface QueryIntegerSchemaOptions {
    defaultValue: number;
    minimum?: number;
    maximum?: number;
}
/**
 * Parse a query-string integer with an explicit default and optional bounds.
 * Invalid, missing, or empty inputs fall back to the declared default.
 */
export declare function createQueryIntegerSchema(options: QueryIntegerSchemaOptions): import("valibot").SchemaWithFallback<import("valibot").SchemaWithPipe<readonly [import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, string>, import("valibot").TransformAction<string, string>, import("valibot").TransformAction<string, number>, import("valibot").IntegerAction<number, undefined>, import("valibot").TransformAction<number, number>]>, number>;
export declare const LimitOffsetPaginationQuerySchema: import("valibot").ObjectSchema<{
    readonly limit: import("valibot").SchemaWithFallback<import("valibot").SchemaWithPipe<readonly [import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, string>, import("valibot").TransformAction<string, string>, import("valibot").TransformAction<string, number>, import("valibot").IntegerAction<number, undefined>, import("valibot").TransformAction<number, number>]>, number>;
    readonly offset: import("valibot").SchemaWithFallback<import("valibot").SchemaWithPipe<readonly [import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, string>, import("valibot").TransformAction<string, string>, import("valibot").TransformAction<string, number>, import("valibot").IntegerAction<number, undefined>, import("valibot").TransformAction<number, number>]>, number>;
}, undefined>;

