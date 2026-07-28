import type { DuckDBWasmDrizzleDatabase } from '@proj-airi/drizzle-duckdb-wasm';
export declare function useDuckDb(): {
    db: import("vue").ShallowRef<DuckDBWasmDrizzleDatabase<Record<string, never>, Promise<import("@proj-airi/drizzle-duckdb-wasm").DuckDBWasmClient<any, any, Record<string, unknown>>>> | null, DuckDBWasmDrizzleDatabase<Record<string, never>, Promise<import("@proj-airi/drizzle-duckdb-wasm").DuckDBWasmClient<any, any, Record<string, unknown>>>> | null>;
    getDb: () => Promise<import("vue").ShallowRef<DuckDBWasmDrizzleDatabase<Record<string, never>, Promise<import("@proj-airi/drizzle-duckdb-wasm").DuckDBWasmClient<any, any, Record<string, unknown>>>> | null, DuckDBWasmDrizzleDatabase<Record<string, never>, Promise<import("@proj-airi/drizzle-duckdb-wasm").DuckDBWasmClient<any, any, Record<string, unknown>>>> | null>>;
    closeDb: () => Promise<void>;
};
